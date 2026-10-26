import json,time,uuid,hashlib,shutil,os
from pathlib import Path
from collections import defaultdict,deque
from contextlib import asynccontextmanager
from fastapi import FastAPI,UploadFile,File,Header,HTTPException,Depends,Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,Field
from typing import Literal
from sqlalchemy import select,delete,text
from sqlalchemy.exc import IntegrityError
from . import config as c
from .db import Session,Job,Asset,Segment,FaceCheck,SpendReservation,init
from .media import validate_image,validate_video_signature,probe,people_preview,plan_segments
from .providers import final_prompt,ERRORS
from .storage import media_url,check,delete_prefix
from .worker import dispatch,recover,TERMINAL
from .webhooks import verify

@asynccontextmanager
async def lifespan(app):
    if os.getenv("APP_ENV")=="production" and len(os.getenv("MEDIA_SIGNING_SECRET",""))<32:
        raise ValueError("Production requires a random MEDIA_SIGNING_SECRET of at least 32 characters.")
    init()
    if not c.REDIS_URL:recover()
    yield
app=FastAPI(title='Motion Studio API',lifespan=lifespan)
_windows=defaultdict(deque)

def auth(authorization:str|None=Header(None)):
    if c.AUTH_TOKEN:
        import hmac
        if not authorization or not hmac.compare_digest(authorization,'Bearer '+c.AUTH_TOKEN):raise HTTPException(401,'Sign in to this private studio.')
    elif os.getenv('APP_ENV','development')=='production':
        raise HTTPException(503,'Configure APP_AUTH_TOKEN before exposing the API.')
    return 'single-user'

def rate(request:Request,user=Depends(auth)):
    for key,limit in [(f'user:{user}',30),(f'ip:{request.client.host}',40)]:
        if c.REDIS_URL:
            from redis import Redis
            r=Redis.from_url(c.REDIS_URL); bucket=f'rate:{key}:{int(time.time()//60)}';n=r.incr(bucket)
            if n==1:r.expire(bucket,65)
            if n>limit:raise HTTPException(429,'Too many requests. Wait a minute and retry.')
        else:
            q=_windows[key]
            while q and q[0]<time.time()-60:q.popleft()
            if len(q)>=limit:raise HTTPException(429,'Too many requests. Wait a minute and retry.')
            q.append(time.time())
    return user

def asset_json(a):return {'id':a.id,'name':a.name,'kind':a.kind,'metadata':json.loads(a.meta),'url':media_url(a.id)}
def job_json(j,s):
    settings=json.loads(j.settings);report=json.loads(j.report) if j.report else None
    if report:
        report['outputUrl']=media_url(report['outputId'])
        for f in report['face'].get('weakFrames',[]):f['url']=media_url(f['assetId'])
    return {'id':j.id,'state':j.state,'settings':settings,'error':j.error,'report':report,'created':j.created,'updated':j.updated,'estimatedCost':j.estimate,'thumbnail':media_url(settings['imageId']),'elapsedSeconds':round((j.updated if j.state in TERMINAL else time.time())-j.created)}

@app.get('/api/health')
def health():return {'ok':True,'provider':c.PROVIDER}
@app.get('/api/config')
def config(user=Depends(auth)):
    with Session() as s:
        completed=list(s.scalars(select(Job).where(Job.user_id==user,Job.state=='Done')))
    import statistics
    samples=[{'tier':json.loads(j.settings)['tier'],'duration':json.loads(j.settings).get('inputDuration',0),'seconds':j.updated-j.created} for j in completed]
    return {'provider':c.PROVIDER,'capabilities':c.CAPABILITIES,'prices':c.PRICES,'limits':{'imageBytes':c.IMAGE_BYTES,'videoBytes':c.VIDEO_BYTES,'minPixels':c.MIN_PIXELS,'maxPixels':c.MAX_PIXELS},'retentionDays':c.RETENTION_DAYS,'spendCap':c.SPEND_CAP,'etaSamples':samples[-100:],'mattingAvailable':bool(os.getenv('RVM_ONNX')),'outpaintingAvailable':False,'identityScoringAvailable':bool(os.getenv('FACE_EMBEDDING_ONNX')) and os.getenv('FACE_MODEL_LICENSE_CONFIRMED')=='true'}

@app.post('/api/assets')
async def upload(file:UploadFile=File(...),kind:Literal['image','reference','video']='image',x_consent:str|None=Header(None),user=Depends(rate)):
    if x_consent!='true':raise HTTPException(400,'Accept the permission and responsible-use statement before uploading.')
    aid=uuid.uuid4().hex;folder=c.DATA/'uploads';folder.mkdir(exist_ok=True);path=folder/aid
    size=0;limit=c.VIDEO_BYTES if kind=='video' else c.IMAGE_BYTES
    try:
        with open(path,'wb') as out:
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>limit:raise ValueError(f'File exceeds the {limit//1048576} MB limit.')
                out.write(chunk)
        if kind=='video':
            validate_video_signature(path);meta=probe(path)
            if min(meta['width'],meta['height'])<340 or max(meta['width'],meta['height'])>3850:raise ValueError('Video dimensions must be 340–3850 pixels on each side.')
            preview=c.DATA/aid;preview.mkdir(exist_ok=True);meta['people']=people_preview(path,preview)
            with Session.begin() as s:
                if (preview/'preview.jpg').exists():
                    thumb=Asset(user_id=user,kind='preview',name='preview.jpg',path=str(preview/'preview.jpg'),meta='{}');s.add(thumb);s.flush();meta['previewId']=thumb.id
        else:meta=validate_image(path)
        meta['size']=size
        with Session.begin() as s:
            a=Asset(id=aid,user_id=user,kind=kind,name=Path(file.filename or kind).name,path=str(path),meta=json.dumps(meta));s.add(a)
        return asset_json(a)
    except ValueError as e:path.unlink(missing_ok=True);raise HTTPException(422,str(e))
    except Exception:path.unlink(missing_ok=True);raise HTTPException(422,'Could not read this file. Upload an intact JPG, PNG, MP4 or MOV.')

@app.get('/api/assets/{aid}/file')
def serve(aid:str,expires:int,signature:str):
    if not check(aid,expires,signature):raise HTTPException(403,'This private media link expired. Refresh the page.')
    with Session() as s:a=s.get(Asset,aid)
    if not a or not Path(a.path).exists():raise HTTPException(404,'File no longer available.')
    kind='video/mp4' if a.kind in ('video','output','cleaned') else 'image/png' if Path(a.path).suffix=='.png' else 'image/jpeg'
    return FileResponse(a.path,media_type=kind,filename=a.name,headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})

class Settings(BaseModel):
    imageId:str
    videoId:str
    referenceIds:list[str]=Field(default_factory=list,max_length=4)
    orientation:Literal['image','video']='video'
    tier:Literal['720p','1080p']='1080p'
    ratio:Literal['9:16','16:9','1:1']='9:16'
    environment:str=Field(default='',max_length=2500)
    crop:dict[str,float]=Field(default_factory=lambda:{'x':.5,'y':.5})
    cleanBackground:bool=True
    copyCamera:bool=False
    keepSound:bool=False
    watermark:bool=False
    splitApproved:bool=False
    consent:bool=False
    personBox:list[int]|None=None
    mockFailure:Literal['safety','invalid','quota','timeout','server','network']|None=None

@app.post('/api/jobs')
def submit(body:Settings,idempotency_key:str=Header(...,min_length=8,max_length=128),user=Depends(rate)):
    if not body.consent:raise HTTPException(400,'Permission confirmation is required.')
    if c.PROVIDER!='mock' and body.mockFailure:raise HTTPException(400,'Failure simulation is available in mock mode only.')
    if not all(0<=float(v)<=1 for v in body.crop.values()):raise HTTPException(422,'Crop position must be between 0 and 1.')
    raw=body.model_dump();fingerprint=hashlib.sha256(json.dumps(raw,sort_keys=True).encode()).hexdigest()
    with Session() as s:
        # Serialize budget reservations, including simultaneous requests with different keys.
        if c.DATABASE_URL.startswith('sqlite'):s.execute(text('BEGIN IMMEDIATE'))
        else:s.execute(text('SELECT pg_advisory_xact_lock(:key)'),{'key':int.from_bytes(hashlib.sha256(user.encode()).digest()[:7],'big')})
        old=s.scalar(select(Job).where(Job.user_id==user,Job.idempotency_key==idempotency_key))
        if old:
            if old.fingerprint!=fingerprint:raise HTTPException(409,'This submit key belongs to different settings. Start a new generation.')
            return job_json(old,s)
        selected={}
        for aid in [body.imageId,body.videoId,*body.referenceIds]:
            a=s.get(Asset,aid)
            if not a or a.user_id!=user:raise HTTPException(404,'An input file is missing. Upload it again.')
            selected[aid]=a
        if selected[body.imageId].kind!='image' or selected[body.videoId].kind!='video':raise HTTPException(422,'Choose a character image and a driving video.')
        if any(selected[x].kind not in ('image','reference') for x in body.referenceIds):raise HTTPException(422,'Face references must be images.')
        meta=json.loads(selected[body.videoId].meta);limit=c.CAPABILITIES['maxSecondsVideoMode' if body.orientation=='video' else 'maxSecondsImageMode']
        if meta['duration']<c.CAPABILITIES['minSeconds']:raise HTTPException(422,'Video is shorter than the provider minimum.')
        if meta['duration']>limit and not body.splitApproved:raise HTTPException(422,{'message':f'Video exceeds the {limit}s orientation limit. Switch to Match video when eligible, or approve splitting.','canSwitch':meta['duration']<=c.CAPABILITIES['maxSecondsVideoMode'],'canSplit':True})
        if len(meta.get('people',[]))>1 and not body.personBox:raise HTTPException(422,'Select the person to transfer before generating.')
        if body.personBox and (not os.getenv('RVM_ONNX') or body.copyCamera or not body.cleanBackground):raise HTTPException(422,'Person isolation needs a configured matting model. Use a single-person driving video.')
        try:prompt,removed=final_prompt(body.environment,body.orientation,body.copyCamera,c.CAPABILITIES);cuts=plan_segments(meta,limit)
        except ValueError as e:raise HTTPException(422,str(e))
        raw.update(inputDuration=meta['duration'],segmentCount=len(cuts));estimate=meta['duration']*c.PRICES[body.tier]
        reserved=sum(r.amount for r in s.scalars(select(SpendReservation).where(SpendReservation.user_id==user)))
        cost=0 if c.PROVIDER=='mock' else estimate
        if reserved+cost>c.SPEND_CAP:raise HTTPException(402,'This job exceeds your configured spending cap. Raise the cap in server settings if intended.')
        j=Job(user_id=user,idempotency_key=idempotency_key,fingerprint=fingerprint,settings=json.dumps(raw),consent=json.dumps({'accepted':True,'timestamp':time.time(),'text':'I own this image and video, or I have permission from the people shown. I will not use this to impersonate a real person or to mislead anyone.'}),estimate=estimate,reserved=cost)
        s.add(j);s.flush();s.add(SpendReservation(id=j.id,user_id=user,amount=cost));s.commit();response=job_json(j,s)
    dispatch(j.id);return response

@app.get('/api/jobs')
def history(user=Depends(auth)):
    with Session() as s:return [job_json(j,s) for j in s.scalars(select(Job).where(Job.user_id==user).order_by(Job.created.desc()).limit(100))]
@app.get('/api/jobs/{jid}')
def get_job(jid:str,user=Depends(auth)):
    with Session() as s:
        j=s.get(Job,jid)
        if not j or j.user_id!=user:raise HTTPException(404,'Job not found.')
        return job_json(j,s)
@app.post('/api/jobs/{jid}/cancel')
def cancel(jid:str,user=Depends(rate)):
    with Session.begin() as s:
        j=s.get(Job,jid)
        if not j or j.user_id!=user:raise HTTPException(404,'Job not found.')
        if j.state not in TERMINAL:j.state='Cancelled';j.updated=time.time()
    return {'state':j.state,'message':'Cancellation requested. Providers may still charge for work already started.'}
@app.delete('/api/jobs/{jid}')
def remove(jid:str,user=Depends(rate)):
    with Session.begin() as s:
        j=s.get(Job,jid)
        if not j or j.user_id!=user:raise HTTPException(404,'Job not found.')
        if j.state not in TERMINAL:raise HTTPException(409,'Cancel the running job before deleting it.')
        settings=json.loads(j.settings);other=list(s.scalars(select(Job).where(Job.user_id==user,Job.id!=jid)))
        used={a for job in other for a in [json.loads(job.settings)['imageId'],json.loads(job.settings)['videoId'],*json.loads(job.settings).get('referenceIds',[])]}
        inputs=[settings['imageId'],settings['videoId'],*settings.get('referenceIds',[])]
        assets=list(s.scalars(select(Asset).where(Asset.job_id==jid)))+[s.get(Asset,x) for x in inputs if x not in used]
        for a in assets:
            if a:
                meta=json.loads(a.meta)
                if meta.get('previewId'):
                    prev=s.get(Asset,meta['previewId'])
                    if prev:Path(prev.path).unlink(missing_ok=True);s.delete(prev)
                Path(a.path).unlink(missing_ok=True);s.delete(a)
        s.execute(delete(FaceCheck).where(FaceCheck.job_id==jid));s.execute(delete(Segment).where(Segment.job_id==jid));s.delete(j)
    shutil.rmtree(c.DATA/jid,ignore_errors=True);delete_prefix(jid+'/');return {'deleted':True}

@app.post('/api/webhooks/fal')
async def webhook(request:Request):
    body=await request.body()
    if len(body)>1024*1024 or not verify(request.headers,body):raise HTTPException(401,'Invalid webhook signature.')
    payload=json.loads(body)
    if payload.get('request_id')!=request.headers.get('x-fal-webhook-request-id'):raise HTTPException(400,'Webhook request ID mismatch.')
    # Signed callback is a wake-up signal, never an arbitrary output URL. Worker fetches authoritative queue result.
    with Session() as s:segment=s.scalar(select(Segment).where(Segment.request_id==payload['request_id']))
    if segment:dispatch(segment.job_id)
    return {'accepted':True}

@app.get('/api/jobs/{jid}/inputs')
def job_inputs(jid:str,user=Depends(auth)):
    with Session() as s:
        j=s.get(Job,jid)
        if not j or j.user_id!=user:raise HTTPException(404,'Job not found.')
        settings=json.loads(j.settings);ids=[settings['imageId'],settings['videoId'],*settings.get('referenceIds',[])]
        return [asset_json(s.get(Asset,x)) for x in ids if s.get(Asset,x)]

origins=[x.strip() for x in os.getenv('ALLOWED_ORIGINS','').split(',') if x.strip()]
if origins:
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST','DELETE'],allow_headers=['Authorization','Content-Type','Idempotency-Key','X-Consent'],allow_credentials=False)
if (c.ROOT/'dist').exists():
    app.mount('/assets',StaticFiles(directory=c.ROOT/'dist/assets'),name='frontend-assets')
    @app.get('/')
    def frontend():return FileResponse(c.ROOT/'dist/index.html')
