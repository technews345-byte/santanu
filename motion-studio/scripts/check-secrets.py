"""Check built public assets for actual environment secret values, never print them."""
import os,re
from pathlib import Path
secrets=[v for k,v in os.environ.items() if k in ('FAL_KEY','AWS_SECRET_ACCESS_KEY','MEDIA_SIGNING_SECRET','APP_AUTH_TOKEN') and len(v)>=8]
violations=[]
for path in Path('dist').rglob('*'):
    if path.is_file():
        data=path.read_bytes()
        if any(s.encode() in data for s in secrets):violations.append(str(path))
        if re.search(rb'Authorization.{0,10}Key [a-zA-Z0-9:_-]{12,}',data):violations.append(str(path))
assert not violations,'Secret-like data detected in: '+', '.join(violations)
print('PASS: no configured server secret values in frontend build.')
