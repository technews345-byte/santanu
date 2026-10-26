import json,time,uuid,shutil,os
from pathlib import Path
import httpx
from sqlalchemy import select,update
from . import config as c
from .db import Session,Job,Segment,Asset,FaceCheck,init
from .providers import provider,final_prompt,ProviderError
from .media import probe,compare,crop_image,normalize_rotation,matte_video,plan_segments,motion_energy,split_video,stitch,face_check
from .storage import upload_signed
TERMINAL={'Done','Failed','Cancelled','Needs review'}
class Cancelled(Exception):pass

def stage(job_id,state):
    with Session.begin() as s:
        j=s.get(Job,job_id)
        if j.state=='Cancelled':raise Cancelled()
        j.state=state;j.updated=time.time()

def add_output(s,j,path,kind='output',meta=None):
    a=Asset(user_id=j.user_id,job_id=j.id,kind=kind,name=path.name,path=str(path),meta=json.dumps(meta or {}));s.add(a);s.flush();return a.id

def safe_download(url,dst):
    # Result is from provider, not an end-user URL. Reject private/IP hosts and recheck redirects.
    import ipaddress,socket
    from urllib.parse import urlparse
    for _ in range(5):
        p=urlparse(url)
        if p.scheme!='https' or not p.hostname:raise ValueError('Provider returned an unsafe result URL.')
        for a in socket.getaddrinfo(p.hostname,443):
            if not ipaddress.ip_address(a[4][0]).is_global:raise ValueError('Provider returned an unsafe result host.')
        with httpx.stream('GET',url,timeout=90,follow_redirects=False) as r:
            if r.is_redirect:
                from urllib.parse import urljoin
                url=urljoin(url,r.headers['location']);continue
            r.raise_for_status();total=0
            with open(dst,'wb') as f:
                for chunk in r.iter_bytes():
                    total+=len(chunk)
                    if total>1024**3:raise ValueError('Provider output exceeded the download limit.')
                    f.write(chunk)
            return
    raise ValueError('Too many result redirects.')

def process(job_id):
    claim=uuid.uuid4().hex
    with Session.begin() as s:
        claimed=s.execute(update(Job).where(Job.id==job_id,Job.claim.is_(None),Job.state.not_in(TERMINAL)).values(claim=claim)).rowcount
        if not claimed:return
        j=s.get(Job,job_id);settings=json.loads(j.settings);input_ids=[settings['imageId'],settings['videoId'],*settings.get('referenceIds',[])];assets={a.id:a for a in s.scalars(select(Asset).where(Asset.id.in_(input_ids),Asset.user_id==j.user_id))}
    folder=c.DATA/job_id;folder.mkdir(exist_ok=True);warnings=[];p=None
    try:
        stage(job_id,'Validating');image=Path(assets[settings['imageId']].path);original=Path(assets[settings['videoId']].path);refs=[image]+[Path(assets[x].path) for x in settings.get('referenceIds',[])]
        meta=probe(original);cap=c.CAPABILITIES;limit=cap['maxSecondsVideoMode' if settings['orientation']=='video' else 'maxSecondsImageMode']
        stage(job_id,'Preparing video');motion=original
        if meta['rotation']:
            motion=folder/'rotated.mp4';normalize_rotation(original,motion)
            if not compare(meta,probe(motion))['frameCountMatch']:raise ValueError('Rotation changed the frame count; generation stopped.')
        if settings.get('cleanBackground') and not settings.get('copyCamera'):
            clean=folder/'cleaned.mp4';ok,warning=matte_video(motion,clean,settings.get('personBox'))
            if warning:warnings.append(warning)
            if settings.get('personBox') and not ok:raise ValueError('Selected person could not be isolated. Use a single-person driving video.')
            if ok:
                motion=clean
                with Session.begin() as s:add_output(s,s.get(Job,job_id),clean,'cleaned',probe(clean))
        stage(job_id,'Preparing image');prepared=folder/'prepared.png';crop_image(image,prepared,settings['ratio'],settings.get('crop',{}))
        binding=None
        # Choose a sharp frontal view using measured rank; all refs remain in post-check.
        def rank(a):
            data=json.loads(a.meta).get('faces',{}).get('items',[])
            return max((f['rank'] for f in data),default=0)
        candidates=[assets[x] for x in [settings['imageId'],*settings.get('referenceIds',[])]];candidates.sort(key=rank,reverse=True)
        if cap['supportsElementBinding'] and settings['orientation']=='video':binding=candidates[0]
        prompt,removed=final_prompt(settings.get('environment',''),settings['orientation'],settings.get('copyCamera',False),cap,bool(binding))
        if removed:warnings.append('Removed unsupported appearance changes: '+'. '.join(removed))
        p=provider(settings['tier']);stage(job_id,'Uploading')
        image_url=upload_signed(prepared,f'{job_id}/image.png') if c.PROVIDER!='mock' else str(prepared)
        face_element=None
        if binding:
            def face_url(a):return upload_signed(Path(a.path),f'{job_id}/refs/{a.id}.png') if c.PROVIDER!='mock' else a.path
            frontal=face_url(binding);angles=[face_url(x) for x in candidates[1:4]] or [frontal]
            face_element={'frontal_image_url':frontal,'reference_image_urls':angles}
        with Session.begin() as s:
            segments=list(s.scalars(select(Segment).where(Segment.job_id==job_id).order_by(Segment.idx)))
            if not segments:
                cuts=plan_segments(meta,limit,motion_energy(motion) if meta['duration']>limit else None)
                for i,(start,end) in enumerate(cuts):s.add(Segment(id=f'{job_id}-{i}',job_id=job_id,idx=i,start=start,end=end))
            else:cuts=[(int(x.start),int(x.end)) for x in segments]
        outputs=[];checks=[]
        for i,(start,end) in enumerate(cuts):
            segment_id=f'{job_id}-{i}';src=motion
            if len(cuts)>1:
                src=folder/f'input-{i}.mp4';split_video(motion,src,start,end)
            with Session() as s:seg=s.get(Segment,segment_id);handle=json.loads(seg.handle) if seg.handle else None;existing=seg.output;oldstate=seg.state
            dst=folder/f'result-{i}.mp4'
            if oldstate=='Done' and existing and Path(existing).exists():outputs.append(Path(existing));continue
            if oldstate=='Submitting' and not handle:raise ProviderError('ambiguous')
            if not handle:
                video_url=upload_signed(src,f'{job_id}/input-{i}.mp4') if c.PROVIDER!='mock' else str(src)
                payload={'image_url':image_url,'video_url':video_url,'character_orientation':settings['orientation'],'keep_original_sound':settings.get('keepSound',False),'enable_safety_checker':True,'prompt':prompt,'_mock_source':str(src),'_mock_failure':settings.get('mockFailure')}
                if face_element:payload['elements']=[face_element]
                if cap['supportsNegativePrompt']:
                    from .providers import NEGATIVE
                    payload['negative_prompt']=NEGATIVE
                # Persist intent before submit. On crash here we stop for operator reconciliation, never pay twice.
                with Session.begin() as s:seg=s.get(Segment,segment_id);seg.state='Submitting';seg.submitted=time.time()
                stage(job_id,'Queued');handle=p.submit(payload)
                with Session.begin() as s:seg=s.get(Segment,segment_id);seg.request_id=handle['request_id'];seg.handle=json.dumps(handle);seg.state='Queued'
            with Session() as s:submitted=s.get(Segment,segment_id).submitted or time.time()
            while True:
                with Session() as s:
                    if s.get(Job,job_id).state=='Cancelled':
                        p.cancel(handle);raise Cancelled()
                if time.time()-submitted>c.TIMEOUT:raise ProviderError('timeout')
                status=p.status(handle)['status']
                if status=='COMPLETED':break
                stage(job_id,'Queued' if status=='IN_QUEUE' else 'Generating');time.sleep(float(os.getenv('POLL_INTERVAL_SECONDS','2')))
            stage(job_id,'Downloading');result=p.result(handle)
            if c.PROVIDER=='mock':shutil.copyfile(result['video']['url'],dst)
            else:safe_download(result['video']['url'],dst)
            with Session.begin() as s:seg=s.get(Segment,segment_id);seg.output=str(dst);seg.state='Done'
            outputs.append(dst);stage(job_id,'Checking face');check=face_check(dst,refs,folder);checks.append(check)
            with Session.begin() as s:s.add(FaceCheck(job_id=job_id,segment_id=segment_id,report=json.dumps(check)))
        stage(job_id,'Downloading');output=folder/'motion-studio.mp4';stitch(outputs,original,output,settings.get('keepSound',False),settings.get('watermark',False))
        stage(job_id,'Checking face');comparison=compare(meta,probe(output));face=face_check(output,refs,folder)
        # Register weak-frame assets so they are served by signed, authorized URLs.
        with Session.begin() as s:
            j=s.get(Job,job_id)
            for frame in face.get('weakFrames',[]):frame['assetId']=add_output(s,j,folder/frame['file'],'weak-frame')
            output_id=add_output(s,j,output,'output',comparison['output'])
            if not all(comparison[k] for k in ['durationMatch','fpsMatch','frameCountMatch']):warnings.append('Output timing differs from the input by more than one frame. It was not retimed.')
            if len(cuts)>1:warnings.append('Hard-cut segments may have visible pose jumps. Automated pose seam scoring is unavailable.')
            report={'mock':c.PROVIDER=='mock','comparison':comparison,'face':face,'segments':len(cuts),'segmentFaceChecks':checks,'warnings':warnings,'prompt':prompt,'bindingReference':binding.name if binding else None,'outputId':output_id,'seamCheck':{'available':False,'reason':'Pose seam model not configured.'}}
            j.report=json.dumps(report);j.state='Done';j.updated=time.time();s.add(FaceCheck(job_id=j.id,report=json.dumps(face)))
    except Cancelled:pass
    except Exception as exc:
        with Session.begin() as s:
            j=s.get(Job,job_id)
            if j and j.state!='Cancelled':j.state='Needs review' if isinstance(exc,ProviderError) and exc.kind=='ambiguous' else 'Failed';j.error=str(exc) if isinstance(exc,(ProviderError,ValueError)) else 'Processing failed. Check server diagnostics and retry.';j.updated=time.time()
    finally:
        with Session.begin() as s:
            j=s.get(Job,job_id)
            if j:j.claim=None

def recover():
    # Invoke only on worker startup with one worker deployment. RQ uses persistent job IDs.
    with Session.begin() as s:
        jobs=list(s.scalars(select(Job).where(Job.state.not_in(TERMINAL))))
        for j in jobs:j.claim=None
    for j in jobs:dispatch(j.id)

def dispatch(job_id):
    if c.REDIS_URL:
        from redis import Redis
        from rq import Queue
        Queue('motion',connection=Redis.from_url(c.REDIS_URL)).enqueue('backend.app.worker.process',job_id,job_id=job_id,job_timeout=max(3600,c.TIMEOUT*20))
    else:
        from threading import Thread
        Thread(target=process,args=(job_id,),daemon=True).start()

if __name__=='__main__':
    init()
    from redis import Redis
    from rq import Queue,Worker
    conn=Redis.from_url(c.REDIS_URL);recover();Worker([Queue('motion',connection=conn)],connection=conn).work()
