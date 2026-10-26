"""ffmpeg processing with frame accounting; optional operator-supplied vision models."""
import json, math, subprocess, os
from pathlib import Path
from fractions import Fraction
import cv2, numpy as np
from PIL import Image, ImageOps
from . import config as c

def run(args):
    p=subprocess.run(args,capture_output=True,timeout=max(c.TIMEOUT,120))
    if p.returncode: raise ValueError('Media processing failed. Try an intact JPG, PNG, MP4 or MOV file.')
    return p.stdout

def probe(path):
    j=json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(path)]))
    v=next((s for s in j['streams'] if s['codec_type']=='video'),None)
    if not v: raise ValueError('No video stream was found.')
    fps=float(Fraction(v.get('avg_frame_rate','0/1'))); nominal=float(Fraction(v.get('r_frame_rate','0/1')))
    rotation=int(v.get('tags',{}).get('rotate',0))
    for side in v.get('side_data_list',[]): rotation=int(side.get('rotation',rotation))
    duration=float(v.get('duration') or j['format']['duration'])
    frames=int(v.get('nb_read_frames') or v.get('nb_frames') or round(duration*fps))
    # Time stamps distinguish VFR even when average and nominal happen to agree.
    times=json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',str(path)]))
    ts=[float(x['best_effort_timestamp_time']) for x in times.get('frames',[]) if 'best_effort_timestamp_time' in x]
    dt=np.diff(ts); vfr=bool(len(dt)>2 and np.max(dt)-np.min(dt)>max(.001, .05/max(fps,1)))
    return {'duration':duration,'fps':fps,'fpsRational':v.get('avg_frame_rate'),'frameCount':frames,'width':v['width'],'height':v['height'],'rotation':rotation,'hasAudio':any(x['codec_type']=='audio' for x in j['streams']),'variableFrameRate':vfr,'codec':v.get('codec_name'),'nominalFps':nominal}

def compare(a,b):
    tolerance=1/max(a['fps'],1)
    return {'input':a,'output':b,'durationMatch':abs(a['duration']-b['duration'])<=tolerance+.001,'frameCountMatch':abs(a['frameCount']-b['frameCount'])<=1,'fpsMatch':abs(a['fps']-b['fps'])*a['duration']<=1.001,'retimed':False}

def normalize_rotation(src,dst):
    # ffmpeg autorotates before filters; no frame-rate conversion.
    run(['ffmpeg','-y','-i',str(src),'-map','0:v:0','-map','0:a?','-c:v','libx264','-crf','18','-fps_mode','passthrough','-c:a','copy','-metadata:s:v:0','rotate=0',str(dst)])
    return probe(dst)

def validate_image(path):
    with Image.open(path) as im:
        if im.format not in ('JPEG','PNG'): raise ValueError('Only genuine JPG or PNG images are supported.')
        im.verify()
    with Image.open(path) as im:
        im=ImageOps.exif_transpose(im); w,h=im.size
        if min(w,h)<c.MIN_PIXELS or max(w,h)>c.MAX_PIXELS: raise ValueError(f'Image dimensions must be {c.MIN_PIXELS}–{c.MAX_PIXELS} pixels on each side.')
        if not .4<=w/h<=2.5: raise ValueError('Image ratio must be between 0.4 and 2.5.')
        return {'width':w,'height':h,'faces':analyze_faces(np.array(im.convert('RGB'))[:,:,::-1])}

def validate_video_signature(path):
    with open(path,'rb') as f: header=f.read(64)
    if len(header)<12 or header[4:8]!=b'ftyp': raise ValueError('Only genuine MP4 or MOV containers are supported.')

def detector(image):
    model=os.getenv('FACE_DETECTOR_ONNX','')
    if model and Path(model).exists():
        d=cv2.FaceDetectorYN.create(model,'',(image.shape[1],image.shape[0]),.7,.3,5000)
        _,faces=d.detect(image)
        return [(f[:4].astype(int).tolist(),f[4:14].reshape(5,2),float(f[-1])) for f in faces] if faces is not None else []
    d=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_frontalface_default.xml')
    return [(list(map(int,b)),None,.5) for b in d.detectMultiScale(cv2.cvtColor(image,cv2.COLOR_BGR2GRAY),1.1,5)]

def analyze_faces(image):
    found=detector(image); result=[]
    for box,lm,confidence in found:
        x,y,w,h=box; crop=image[max(0,y):y+h,max(0,x):x+w]; warnings=[]
        blur=float(cv2.Laplacian(cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY),cv2.CV_64F).var()) if crop.size else 0
        if min(w,h)<c.FACE_MIN: warnings.append('Face is small. Use a closer image with a face at least 128 px wide.')
        if blur<c.FACE_BLUR: warnings.append('Face looks blurry. Add a sharper reference.')
        yaw=None
        if lm is not None:
            eye_mid=(lm[0]+lm[1])/2; eye_dist=np.linalg.norm(lm[0]-lm[1]); yaw=float(np.clip((lm[2][0]-eye_mid[0])/max(eye_dist,1)*90,-90,90))
            if abs(yaw)>c.FACE_YAW: warnings.append('Head is heavily angled. Add a frontal reference.')
        result.append({'box':box,'sharpness':blur,'confidence':confidence,'yaw':yaw,'warnings':warnings,'rank':min(w,h)*confidence*math.log1p(blur)/(1+abs(yaw or 0)/45),'landmarksAvailable':lm is not None})
    return {'items':result,'warnings':[] if found else ['No face detected. Stylised characters can still be generated; identity scoring will be skipped.'],'occlusionCheck':'unavailable','landmarkCheck':'available' if os.getenv('FACE_DETECTOR_ONNX') else 'unavailable: configure a licensed YuNet detector'}

def embedding(image):
    model=os.getenv('FACE_EMBEDDING_ONNX','')
    if not model or not Path(model).exists() or os.getenv('FACE_MODEL_LICENSE_CONFIRMED','false')!='true': return None
    faces=detector(image)
    if not faces: return None
    box,lm,_=max(faces,key=lambda x:x[0][2]*x[0][3])
    if lm is None: return None
    # YuNet order: right eye, left eye, nose, right mouth, left mouth. ArcFace template uses image left first.
    lm=lm[[1,0,2,4,3]]
    template=np.array([[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]],np.float32)
    matrix,_=cv2.estimateAffinePartial2D(lm.astype(np.float32),template,method=cv2.LMEDS)
    if matrix is None:return None
    aligned=cv2.warpAffine(image,matrix,(112,112))[:,:,::-1]
    x=((aligned.astype(np.float32)-127.5)/127.5).transpose(2,0,1)[None]
    import onnxruntime as ort
    sess=ort.InferenceSession(model,providers=['CPUExecutionProvider']); v=sess.run(None,{sess.get_inputs()[0].name:x})[0].flatten()
    return v/(np.linalg.norm(v)+1e-10)

def summarize_scores(scores,missing):
    if not scores:return {'label':'Review','available':False,'reason':'No comparable detected faces. Identity could not be verified.','missingFrames':missing,'minimum':None,'mean':None,'belowThresholdPercent':None,'threshold':c.FACE_THRESHOLD,'weakFrames':[]}
    values=[x['score'] for x in scores]; pct=100*sum(x<c.FACE_THRESHOLD for x in values)/len(values)
    return {'label':'Pass' if pct==0 else 'Fail' if pct>=20 else 'Review','available':True,'minimum':min(values),'mean':float(np.mean(values)),'belowThresholdPercent':pct,'threshold':c.FACE_THRESHOLD,'missingFrames':missing,'sampleCount':len(values),'weakFrames':sorted(scores,key=lambda x:x['score'])[:4]}

def face_check(video,references,folder):
    refs=[embedding(cv2.imread(str(p))) for p in references]; refs=[x for x in refs if x is not None]
    if not refs:return {**summarize_scores([],[]),'reason':'Identity model or aligned reference face unavailable. Configure licensed detector and embedding weights; no identity score was fabricated.'}
    meta=probe(video); count=min(c.FACE_MAX_SAMPLES,max(1,math.ceil(meta['duration']/c.FACE_INTERVAL))); cap=cv2.VideoCapture(str(video)); scores=[]; missing=[]
    for t in np.linspace(0,max(0,meta['duration']-1/max(meta['fps'],1)),count):
        cap.set(cv2.CAP_PROP_POS_MSEC,float(t)*1000); ok,frame=cap.read()
        if not ok:missing.append(float(t)); continue
        e=embedding(frame)
        if e is None:missing.append(float(t)); continue
        score=max(float(e@r) for r in refs); filename=f'face-{float(t):.3f}.jpg'; cv2.imwrite(str(folder/filename),frame)
        scores.append({'time':float(t),'score':score,'file':filename})
    cap.release();return summarize_scores(scores,missing)

def people_preview(video,folder):
    cap=cv2.VideoCapture(str(video)); ok,frame=cap.read();cap.release()
    if not ok:return []
    cv2.imwrite(str(folder/'preview.jpg'),frame)
    hog=cv2.HOGDescriptor();hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    scale=min(1,720/frame.shape[0]);small=cv2.resize(frame,None,fx=scale,fy=scale)
    boxes,_=hog.detectMultiScale(small,winStride=(8,8),padding=(8,8),scale=1.05)
    return [{'id':i,'box':[int(v/scale) for v in b]} for i,b in enumerate(boxes)]

def plan_segments(meta,limit,energy=None):
    n=meta['frameCount']; fps=meta['fps']; max_frames=math.floor(min(limit,c.SEGMENT_CAP)*fps); min_frames=math.ceil(c.CAPABILITIES['minSeconds']*fps)
    if meta['duration']<=limit:return [(0,n)]
    count=math.ceil(n/max_frames)
    if n<count*min_frames:raise ValueError('Cannot split into valid segments with these limits.')
    points=[0]
    for i in range(1,count):
        ideal=round(n*i/count); lo=max(points[-1]+min_frames,n-(count-i)*max_frames,ideal-round(fps)); hi=min(points[-1]+max_frames,n-(count-i)*min_frames,ideal+round(fps))
        candidates=[(e,frame) for frame,e in (energy or []) if lo<=frame<=hi]
        cut=min(candidates)[1] if candidates else max(lo,min(hi,ideal)); points.append(cut)
    points.append(n);return list(zip(points,points[1:]))

def motion_energy(path):
    cap=cv2.VideoCapture(str(path));prev=None;result=[];i=0
    while True:
        ok,frame=cap.read()
        if not ok:break
        small=cv2.resize(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),(96,96))
        if prev is not None:result.append((i,float(cv2.absdiff(prev,small).mean())))
        prev=small;i+=1
    cap.release();return result

def split_video(src,dst,start_frame,end_frame):
    run(['ffmpeg','-y','-i',str(src),'-vf',f'trim=start_frame={start_frame}:end_frame={end_frame},setpts=PTS-STARTPTS','-an','-c:v','libx264','-crf','18','-fps_mode','passthrough',str(dst)])

def crop_image(src,dst,ratio,crop):
    with Image.open(src) as im:
        im=ImageOps.exif_transpose(im).convert('RGB');w,h=im.size;target={'9:16':9/16,'16:9':16/9,'1:1':1}[ratio]
        cw=min(w,h*target);ch=cw/target; x=float(crop.get('x',.5))*max(0,w-cw);y=float(crop.get('y',.5))*max(0,h-ch)
        box=(round(x),round(y),round(x+cw),round(y+ch))
        for face in analyze_faces(np.array(im)[:,:,::-1])['items']:
            fx,fy,fw,fh=face['box']
            if not (box[0]<=fx and box[1]<=fy and box[2]>=fx+fw and box[3]>=fy+fh):raise ValueError('Crop would cut off a detected face. Move the crop box or choose a different ratio.')
        out=im.crop(box)
        if min(out.size)<c.MIN_PIXELS:raise ValueError('The crop is too small for the provider. Choose another ratio or a larger image.')
        out.save(dst,'PNG')

def matte_video(src,dst,person=None):
    """Optional RVM ONNX recurrent model. No automatic model downloads."""
    model=os.getenv('RVM_ONNX','')
    meta=probe(src)
    if not model or not Path(model).exists():return False,'Background cleanup unavailable: configure RVM_ONNX and its licence. Original video will be used.'
    if meta['variableFrameRate']:return False,'Background cleanup skipped for VFR to preserve original timestamps.'
    import onnxruntime as ort
    sess=ort.InferenceSession(model,providers=['CPUExecutionProvider']); cap=cv2.VideoCapture(str(src))
    w,h=meta['width'],meta['height'];raw=dst.with_suffix('.raw.mp4')
    proc=subprocess.Popen(['ffmpeg','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r',meta['fpsRational'],'-i','-','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(raw)],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    recurrent=[np.zeros((1,1,1,1),np.float32) for _ in range(4)]
    try:
        while True:
            ok,frame=cap.read()
            if not ok:break
            src_array=frame[:,:,::-1].astype(np.float32).transpose(2,0,1)[None]/255
            inp={'src':src_array,'downsample_ratio':np.array([min(1,512/max(w,h))],np.float32),**{f'r{i+1}i':v for i,v in enumerate(recurrent)}}
            fgr,alpha,*recurrent=sess.run(None,inp);a=alpha[0,0]
            if person:
                # Keep the foreground component overlapping the selected person. Tracking is required for crossing people; flag limitation.
                x,y,bw,bh=person;count,labels=cv2.connectedComponents((a>.3).astype(np.uint8)); region=labels[max(0,y):y+bh,max(0,x):x+bw];ids,counts=np.unique(region[region>0],return_counts=True)
                if len(ids):a*=labels==ids[np.argmax(counts)]
                else:raise ValueError('Selected person lost during matting.')
            composite=(fgr[0].transpose(1,2,0)[:,:,::-1]*a[:,:,None]+.5*(1-a[:,:,None]))
            proc.stdin.write((np.clip(composite,0,1)*255).astype(np.uint8).tobytes())
        proc.stdin.close();proc.wait(timeout=c.TIMEOUT)
        run(['ffmpeg','-y','-i',str(raw),'-i',str(src),'-map','0:v:0','-map','1:a?','-c','copy',str(dst)])
        check=compare(meta,probe(dst))
        if not all(check[k] for k in ['durationMatch','fpsMatch','frameCountMatch']):return False,'Cleanup changed media timing. Original video will be used.'
        return True,None
    except Exception:
        if proc.poll() is None:proc.kill()
        return False,'Background cleanup failed. Original video will be used.'
    finally:
        cap.release();raw.unlink(missing_ok=True)

def stitch(parts,original,dst,keep_sound,watermark=False):
    listing=dst.with_suffix('.txt');listing.write_text('\n'.join("file '"+str(p).replace("'","'\\''")+"'" for p in parts))
    # Stream-copy hard cuts; no crossfades or retiming. Original continuous audio is used.
    cmd=['ffmpeg','-y','-f','concat','-safe','0','-i',str(listing)]
    if keep_sound:cmd+=['-i',str(original)]
    cmd+=['-map','0:v:0']+(['-map','1:a?'] if keep_sound else ['-an'])
    cmd+=['-c','copy','-metadata','comment=AI-generated with Motion Studio; motion transfer','-movflags','+faststart+use_metadata_tags',str(dst)]
    run(cmd)
    if watermark:
        marked=dst.with_name('watermarked.mp4')
        run(['ffmpeg','-y','-i',str(dst),'-vf',"drawtext=text='AI-generated':x=w-tw-20:y=h-th-20:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.5",'-c:v','libx264','-crf','18','-fps_mode','passthrough','-c:a','copy','-metadata','comment=AI-generated with Motion Studio',str(marked)])
        marked.replace(dst)
