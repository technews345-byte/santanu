import os,tempfile
os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='motion-test-')
os.environ['DATABASE_URL']='sqlite:///'+os.environ['DATA_DIR']+'/test.sqlite'
os.environ['MOTION_PROVIDER']='mock'
os.environ['MOCK_DELAY_SECONDS']='0.02'
os.environ['POLL_INTERVAL_SECONDS']='0.02'
os.environ['APP_ENV']='development'
os.environ['REDIS_URL']=''
os.environ['FAL_KEY']=''
