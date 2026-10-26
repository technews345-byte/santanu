import io,json,time,uuid,subprocess,os
from pathlib import Path
import pytest,numpy as np,cv2
from PIL import Image
from fastapi.testclient import TestClient
from backend.app import config as c
from backend.app.main import app
from backend.app.db import init,Session,Job,Segment,Asset
from backend.app.media import probe,plan_segments,compare,summarize_scores,analyze_faces,matte_video
from backend.app.providers import FalProvider,MockProvider,ProviderError,final_prompt
from backend.app.webhooks import verify
from sqlalchemy import select

@pytest.fixture(scope='module')
def client():
    with TestClient(app) as client:yield client
@pytest.fixture(scope='module')
def clips(tmp_path_factory):
    folder=tmp_path_factory.mktemp('clips');paths={}
    for seconds in [8,12,45]:
        p=folder/f'{seconds}.mp4'
        subprocess.run(['ffmpeg','-y','-f','lavfi','-i','testsrc2=size=360x640:rate=24','-t',str(seconds),'-c:v','libx264','-preset','ultrafast','-threads','1','-pix_fmt','yuv420p',str(p)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
        paths[seconds]=p
    return paths
@pytest.fixture(scope='module')
def inputs(client,clips):
    img=io.BytesIO();Image.new('RGB',(720,1280),(100,120,140)).save(img,format='PNG')
    image=client.post('/api/assets?kind=image',headers={'X-Consent':'true'},files={'file':('character.png',img.getvalue(),'image/png')});assert image.status_code==200,image.text
    ids={'image':image.json()['id']}
    for seconds,path in clips.items():
        r=client.post('/api/assets?kind=video',headers={'X-Consent':'true'},files={'file':('motion.mp4',path.read_bytes(),'video/mp4')});assert r.status_code==200,r.text;ids[seconds]=r.json()['id']
    return ids

def settings(ids,seconds=8,**changes):return {'imageId':ids['image'],'videoId':ids[seconds],'orientation':'video','tier':'1080p','ratio':'9:16','environment':'sunlit room','cleanBackground':True,'consent':True,**changes}
def submit(client,body,key=None):return client.post('/api/jobs',json=body,headers={'Idempotency-Key':key or uuid.uuid4().hex})
def wait(client,jid):
    deadline=time.time()+90
    while time.time()<deadline:
        j=client.get('/api/jobs/'+jid).json()
        if j['state'] in ('Done','Failed','Cancelled','Needs review'):return j
        time.sleep(.05)
    pytest.fail('Job did not finish in 90 seconds')

def test_8s_video_end_to_end(client,inputs):
    r=submit(client,settings(inputs));assert r.status_code==200,r.text
    j=wait(client,r.json()['id']);assert j['state']=='Done',j
    q=j['report']['comparison'];assert q['durationMatch'] and q['fpsMatch'] and q['frameCountMatch'];assert q['input']['duration']==8;assert q['output']['frameCount']==192
    output=client.get(j['report']['outputUrl']);assert output.status_code==200 and output.content[4:8]==b'ftyp'
    assert j['report']['face']['label']=='Review' and not j['report']['face']['available']

def test_8s_image_mode_does_not_bind(client,inputs):
    r=submit(client,settings(inputs,orientation='image'));j=wait(client,r.json()['id']);assert j['state']=='Done',j
    assert j['report']['bindingReference'] is None;assert '@Element1' not in j['report']['prompt']

def test_12s_image_block_and_options(client,inputs):
    r=submit(client,settings(inputs,12,orientation='image'));assert r.status_code==422;assert r.json()['detail']['canSwitch'];assert r.json()['detail']['canSplit']

def test_45s_split_stitch_exact_timing(client,inputs):
    r=submit(client,settings(inputs,45));assert r.status_code==422
    r=submit(client,settings(inputs,45,splitApproved=True));assert r.status_code==200,r.text
    j=wait(client,r.json()['id']);assert j['state']=='Done',j;assert j['report']['segments']==2
    q=j['report']['comparison'];assert q['frameCountMatch'] and q['fpsMatch'] and q['durationMatch'];assert q['output']['frameCount']==1080

def test_idempotency_failure_retry(client,inputs):
    key=uuid.uuid4().hex;body=settings(inputs,mockFailure='safety');one=submit(client,body,key);two=submit(client,body,key)
    assert one.status_code==two.status_code==200;assert one.json()['id']==two.json()['id']
    j=wait(client,one.json()['id']);assert j['state']=='Failed';assert 'safety checker rejected' in j['error']
    with Session() as s:assert len(list(s.scalars(select(Segment).where(Segment.job_id==j['id']))))==1
    retried=wait(client,submit(client,settings(inputs)).json()['id']);assert retried['state']=='Done'
    assert submit(client,settings(inputs,orientation='image'),key).status_code==409

@pytest.mark.parametrize('kind',['invalid','quota','timeout','server','network'])
def test_failure_messages(kind):
    p=MockProvider();h=p.submit({'_mock_failure':kind});time.sleep(.03)
    with pytest.raises(ProviderError) as e:p.status(h)
    assert e.value.kind==kind

def test_no_negative_prompt_and_schema_validation(monkeypatch):
    monkeypatch.setattr(c,'FAL_KEY','unit-test-placeholder')
    p=FalProvider();captured={}
    def call(method,url,**kw):captured.update(kw['json']);return {'request_id':'unit','status':'IN_QUEUE'}
    monkeypatch.setattr(p,'call',call)
    prompt,_=final_prompt('sunlit room','video',False,p.capabilities)
    p.submit({'image_url':'https://example.com/i.png','video_url':'https://example.com/v.mp4','character_orientation':'video','enable_safety_checker':True,'prompt':prompt,'elements':[{'frontal_image_url':'https://example.com/f.png','reference_image_urls':['https://example.com/f.png']}]})
    assert 'negative_prompt' not in captured;assert 'Static camera' in captured['prompt'];assert captured['enable_safety_checker'] is True
    with pytest.raises(Exception):p.submit({'image_url':'a','video_url':'b','character_orientation':'video','fps':24})

def test_segments_low_motion_and_bounds():
    m={'duration':45,'fps':24,'frameCount':1080};cuts=plan_segments(m,30,[(540,99),(539,.1)])
    assert cuts==[(0,539),(539,1080)];assert all(72<=b-a<=28*24 for a,b in cuts)
    assert plan_segments({'duration':30,'fps':24,'frameCount':720},30)==[(0,720)]

def test_face_aggregation_excludes_missing_and_flags_wrong():
    good=summarize_scores([{'time':0,'score':.8}], [1,2]);wrong=summarize_scores([{'time':0,'score':.1}],[])
    assert good['label']=='Pass' and good['belowThresholdPercent']==0;assert wrong['label']=='Fail';assert len(good['missingFrames'])==2

def test_face_detection_and_blur_warning():
    # Detector fixture is deterministic: tests thresholds, not model accuracy.
    from unittest.mock import patch
    frame=np.full((400,400,3),128,np.uint8)
    with patch('backend.app.media.detector',return_value=[([100,100,60,60],None,.5)]):
        warnings=analyze_faces(frame)['items'][0]['warnings'];assert any('small' in x for x in warnings);assert any('blurry' in x for x in warnings)

def test_matting_unavailable_falls_back(clips,tmp_path,monkeypatch):
    monkeypatch.delenv('RVM_ONNX',raising=False);ok,warning=matte_video(clips[8],tmp_path/'out.mp4');assert not ok and 'Original video' in warning

def test_consent_signature_and_webhook(client):
    r=client.post('/api/assets?kind=image',files={'file':('a.png',b'not png','image/png')});assert r.status_code==400
    r=client.post('/api/assets?kind=image',headers={'X-Consent':'true'},files={'file':('a.png',b'not png','image/png')});assert r.status_code==422
    assert client.get('/api/assets/no/file?expires=9999999999&signature=no').status_code==403
    assert client.post('/api/webhooks/fal',json={'request_id':'bad'}).status_code==401
    import base64,hashlib
    from nacl.signing import SigningKey
    sk=SigningKey.generate();body=b'{"request_id":"r"}';now=int(time.time());headers={'x-fal-webhook-request-id':'r','x-fal-webhook-user-id':'u','x-fal-webhook-timestamp':str(now)}
    message='\n'.join(['r','u',str(now),hashlib.sha256(body).hexdigest()]).encode();headers['x-fal-webhook-signature']=sk.sign(message).signature.hex()
    keys=[{'x':base64.urlsafe_b64encode(bytes(sk.verify_key)).decode().rstrip('=')}]
    assert verify(headers,body,keys,now);assert not verify(headers,body+b'x',keys,now);assert not verify(headers,body,keys,now+301)
