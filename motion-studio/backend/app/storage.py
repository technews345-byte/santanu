import hashlib,hmac,time,os
from pathlib import Path
import boto3
from . import config as c
# Local signed media URLs are for the single-user local build. S3 is required for hosted fal access.
SECRET=os.getenv('MEDIA_SIGNING_SECRET','local-development-only-change-before-deploy').encode()
def token(asset_id,expires):return hmac.new(SECRET,f'{asset_id}:{expires}'.encode(),hashlib.sha256).hexdigest()
def media_url(asset_id):
    exp=int(time.time())+c.SIGNED_URL_SECONDS
    return f'/api/assets/{asset_id}/file?expires={exp}&signature={token(asset_id,exp)}'
def check(asset_id,expires,signature):return expires>=time.time() and hmac.compare_digest(token(asset_id,expires),signature)
def s3():return boto3.client('s3',endpoint_url=c.S3_ENDPOINT or None,region_name=c.S3_REGION)
def upload_signed(path,key):
    if not c.S3_BUCKET:raise ValueError('Configure S3 storage before live generation. Inputs are never sent as local paths.')
    client=s3();client.upload_file(str(path),c.S3_BUCKET,key)
    return client.generate_presigned_url('get_object',Params={'Bucket':c.S3_BUCKET,'Key':key},ExpiresIn=c.SIGNED_URL_SECONDS)
def delete_prefix(prefix):
    if not c.S3_BUCKET:return
    client=s3()
    for page in client.get_paginator('list_objects_v2').paginate(Bucket=c.S3_BUCKET,Prefix=prefix):
        objects=[{'Key':x['Key']} for x in page.get('Contents',[])]
        if objects:client.delete_objects(Bucket=c.S3_BUCKET,Delete={'Objects':objects})
