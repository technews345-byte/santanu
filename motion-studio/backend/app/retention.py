"""Daily lifecycle sweep. Also configure the same retention on the S3 bucket."""
import time,json
from pathlib import Path
from sqlalchemy import select
from . import config as c
from .db import Session,Job,Asset,init
from .main import remove
from .worker import TERMINAL

def sweep():
    cutoff=time.time()-c.RETENTION_DAYS*86400
    with Session() as s:jobs=list(s.scalars(select(Job).where(Job.created<cutoff,Job.state.in_(TERMINAL))))
    for j in jobs:remove(j.id,j.user_id)
    with Session.begin() as s:
        used={x for j in s.scalars(select(Job)) for x in [json.loads(j.settings)['imageId'],json.loads(j.settings)['videoId'],*json.loads(j.settings).get('referenceIds',[])]}
        for a in s.scalars(select(Asset).where(Asset.created<cutoff,Asset.job_id.is_(None))):
            if a.id not in used:Path(a.path).unlink(missing_ok=True);s.delete(a)
if __name__=='__main__':
    init()
    while True:
        sweep();time.sleep(3600)
