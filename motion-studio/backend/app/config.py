"""Server configuration; never serialized wholesale to the browser."""
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.getenv('DATA_DIR', ROOT / '.data')); DATA.mkdir(parents=True, exist_ok=True)
PROVIDER = os.getenv('MOTION_PROVIDER', 'mock')
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{DATA}/motion.sqlite')
REDIS_URL = os.getenv('REDIS_URL', '')
FAL_KEY = os.getenv('FAL_KEY', '')
MODELS = {'720p': os.getenv('FAL_MODEL_STD', 'fal-ai/kling-video/v3/standard/motion-control'), '1080p': os.getenv('FAL_MODEL_PRO', 'fal-ai/kling-video/v3/pro/motion-control')}
PRICES = {'720p': float(os.getenv('PRICE_STD_PER_SECOND','0.126')), '1080p':float(os.getenv('PRICE_PRO_PER_SECOND','0.168'))}
IMAGE_BYTES=int(os.getenv('MAX_IMAGE_BYTES',10485760)); VIDEO_BYTES=int(os.getenv('MAX_VIDEO_BYTES',104857600))
MIN_PIXELS=int(os.getenv('MIN_IMAGE_DIMENSION',340)); MAX_PIXELS=int(os.getenv('MAX_IMAGE_DIMENSION',3850))
FACE_MIN=int(os.getenv('FACE_MIN_PX',128)); FACE_BLUR=float(os.getenv('FACE_BLUR_THRESHOLD',70)); FACE_YAW=float(os.getenv('FACE_MAX_YAW',45))
FACE_THRESHOLD=float(os.getenv('FACE_SIMILARITY_THRESHOLD',.45)); FACE_INTERVAL=float(os.getenv('FACE_SAMPLE_INTERVAL',.5)); FACE_MAX_SAMPLES=int(os.getenv('FACE_MAX_SAMPLES',60))
SEGMENT_CAP=float(os.getenv('SEGMENT_HARD_CAP',28)); TIMEOUT=int(os.getenv('SEGMENT_TIMEOUT_SECONDS',600))
RETENTION_DAYS=int(os.getenv('RETENTION_DAYS',30)); SPEND_CAP=float(os.getenv('USER_SPEND_CAP_USD',20))
AUTH_TOKEN=os.getenv('APP_AUTH_TOKEN',''); WEBHOOK=os.getenv('PUBLIC_WEBHOOK_URL','')
S3_BUCKET=os.getenv('S3_BUCKET',''); S3_ENDPOINT=os.getenv('S3_ENDPOINT_URL',''); S3_REGION=os.getenv('S3_REGION','us-east-1')
PUBLIC_BASE=os.getenv('PUBLIC_API_BASE','http://localhost:8000')
SIGNED_URL_SECONDS=int(os.getenv('SIGNED_URL_SECONDS',14400))
IDENTITY_CLAUSE=os.getenv('IDENTITY_CLAUSE_ENABLED','true').lower()=='true'
CAPABILITIES={'supportsNegativePrompt':False,'supportsElementBinding':True,'supportsKeepSound':True,'maxSecondsImageMode':10,'maxSecondsVideoMode':30,'minSeconds':3,'maxPromptLength':2500,'elementReferences':3}
