"""Schema-validated hosted provider. No video model runs in this application."""
import json, time, uuid, os
from typing import Protocol
from dataclasses import dataclass
import httpx
from jsonschema import Draft202012Validator
from . import config as c
NEGATIVE='no background from reference video, no scene change, no camera movement, no face distortion, no identity change, no altered facial features, no face swap, no beautification, no skin smoothing, no changed eye color, no morphing face.'
ERRORS={'safety':'The provider safety checker rejected this request. Review your inputs before retrying.','invalid':'The provider could not use these inputs. Check the image and video requirements.','quota':'Provider credits or quota are exhausted. Check your account balance.','timeout':'Generation exceeded the wait limit. Check the provider before retrying; a job may still be running.','server':'The provider is temporarily unavailable. Please retry.','network':'The connection was interrupted. Status checks will retry.','ambiguous':'Submission was interrupted before a request ID was received. Check the provider dashboard before retrying to avoid a second charge.'}
class ProviderError(Exception):
    def __init__(self,kind): self.kind=kind; super().__init__(ERRORS.get(kind,ERRORS['server']))
class MotionProvider(Protocol):
    capabilities:dict
    def submit(self,job:dict)->dict: ...
    def status(self,handle:dict)->dict: ...
    def result(self,handle:dict)->dict: ...
    def cancel(self,handle:dict)->None: ...
def final_prompt(environment,orientation,camera,capabilities,bind=True):
    import re
    clauses=re.split(r'[.;\n]+',environment)
    blocked=r'\b(younger|older|slim|beautif\w*|different hair|change (?:the )?(?:face|hair|body)|bigger (?:body|bust)|smooth skin)\b'
    removed=[s.strip() for s in clauses if re.search(blocked,s,re.I)]
    clean='. '.join(s.strip() for s in clauses if s.strip() and s.strip() not in removed)
    parts=[clean]
    if c.IDENTITY_CLAUSE: parts.append('Keep the face, hair, clothing and art style exactly as in the reference image. Apply only the expressions and head movements from the driving video.')
    if bind and orientation=='video' and capabilities['supportsElementBinding']: parts.append('Facial identity from @Element1.')
    parts.append('Preserve the reference image scene and natural facial texture.' if not clean else 'Use only the described environment and preserve natural facial texture.')
    if not camera: parts.append('Static camera, stable background.')
    prompt=' '.join(p for p in parts if p)
    if len(prompt)>capabilities['maxPromptLength']: raise ValueError('The final prompt is too long. Shorten the environment description.')
    return prompt,removed
class FalProvider:
    capabilities=c.CAPABILITIES
    def __init__(self,tier='1080p'):
        if not c.FAL_KEY: raise ValueError('FAL_KEY is required for live generation.')
        self.model=c.MODELS[tier]
        schema_file='fal-pro.json' if tier=='1080p' else 'fal-standard.json'
        schema=json.loads((c.ROOT/'provider-schema'/schema_file).read_text())
        inp=next(s for s in schema['components']['schemas'].values() if s.get('title','').startswith('MotionControlV3') and 'image_url' in s.get('properties',{}))
        self.validator=Draft202012Validator({**inp,'components':schema['components'],'additionalProperties':False})
        self.client=httpx.Client(timeout=45,headers={'Authorization':f'Key {c.FAL_KEY}'})
    def call(self,method,url,**kwargs):
        # Only trusted queue URLs may receive provider credentials.
        if not url.startswith('https://queue.fal.run/'): raise ProviderError('invalid')
        for attempt in range(4):
            try:
                r=self.client.request(method,url,**kwargs)
            except (httpx.TransportError,httpx.TimeoutException):
                # POST delivery is ambiguous: do not risk duplicate paid submissions.
                if method=='POST': raise ProviderError('ambiguous')
                if attempt==3: raise ProviderError('network')
                time.sleep(2**attempt); continue
            if r.status_code>=500 and attempt<3:
                if method=='POST': raise ProviderError('ambiguous')
                time.sleep(2**attempt); continue
            if r.status_code>=400:
                text=r.text.lower()
                kind='safety' if any(x in text for x in ['safety','content_policy','nsfw']) else 'quota' if r.status_code in (402,429) else 'invalid' if r.status_code in (400,422) else 'server'
                raise ProviderError(kind)
            return r.json()
    def submit(self,job):
        payload={k:v for k,v in job.items() if k not in ('_mock_failure','_mock_source')}
        self.validator.validate(payload)
        response=self.call('POST',f'https://queue.fal.run/{self.model}',json=payload,params={'fal_webhook':c.WEBHOOK} if c.WEBHOOK else {})
        return {**response,'model':self.model}
    def url(self,h,key,suffix=''):
        # Returned URLs are authoritative; derive a model-scoped URL only as fallback.
        return h.get(key) or f"https://queue.fal.run/{h['model']}/requests/{h['request_id']}{suffix}"
    def status(self,h): return self.call('GET',self.url(h,'status_url','/status'),params={'logs':1})
    def result(self,h): return self.call('GET',self.url(h,'response_url'))
    def cancel(self,h): self.call('PUT',self.url(h,'cancel_url','/cancel'))
class MockProvider:
    capabilities=c.CAPABILITIES
    def __init__(self,tier='1080p'): pass
    def submit(self,job): return {'request_id':'mock-'+uuid.uuid4().hex,'created':time.time(),'source':job.get('_mock_source'),'failure':job.get('_mock_failure')}
    def status(self,h):
        age=time.time()-h['created']; delay=float(os.getenv('MOCK_DELAY_SECONDS','6'))
        if age>delay/2 and h.get('failure'): raise ProviderError(h['failure'])
        return {'status':'COMPLETED' if age>=delay else 'IN_PROGRESS' if age>delay/3 else 'IN_QUEUE','logs':[]}
    def result(self,h): return {'video':{'url':h['source']},'mock':True}
    def cancel(self,h): return None
def provider(tier='1080p'): return MockProvider(tier) if c.PROVIDER=='mock' else FalProvider(tier)
