import base64,hashlib,time
import httpx
from nacl.signing import VerifyKey
_cache={'time':0,'keys':[]}
def verify(headers,body,keys=None,now=None):
    try:
        values=[headers.get('x-fal-webhook-'+k) for k in ['request-id','user-id','timestamp']]
        if not all(values) or abs((now or time.time())-int(values[2]))>300:return False
        signature=bytes.fromhex(headers.get('x-fal-webhook-signature',''))
        if not signature:return False
        if keys is None:
            if time.time()-_cache['time']>3600:
                response=httpx.get('https://rest.fal.ai/.well-known/jwks.json',timeout=10);response.raise_for_status();_cache.update(time=time.time(),keys=response.json()['keys'])
            keys=_cache['keys']
        message='\n'.join([*values,hashlib.sha256(body).hexdigest()]).encode()
        for k in keys:
            try:
                x=k['x'];VerifyKey(base64.urlsafe_b64decode(x+'='*(-len(x)%4))).verify(message,signature);return True
            except Exception:continue
    except Exception:return False
    return False
