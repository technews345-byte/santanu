import time, uuid
from sqlalchemy import create_engine, String, Text, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import DATABASE_URL
class Base(DeclarativeBase): pass
class Job(Base):
    __tablename__='jobs'
    __table_args__=(UniqueConstraint('user_id','idempotency_key'),)
    id:Mapped[str]=mapped_column(String,primary_key=True,default=lambda:uuid.uuid4().hex)
    user_id:Mapped[str]=mapped_column(String,index=True)
    idempotency_key:Mapped[str]=mapped_column(String)
    fingerprint:Mapped[str]=mapped_column(String)
    state:Mapped[str]=mapped_column(String,default='Validating')
    settings:Mapped[str]=mapped_column(Text)
    consent:Mapped[str]=mapped_column(Text)
    estimate:Mapped[float]=mapped_column(Float)
    reserved:Mapped[float]=mapped_column(Float,default=0)
    error:Mapped[str|None]=mapped_column(Text,nullable=True)
    report:Mapped[str|None]=mapped_column(Text,nullable=True)
    created:Mapped[float]=mapped_column(Float,default=time.time)
    updated:Mapped[float]=mapped_column(Float,default=time.time)
    claim:Mapped[str|None]=mapped_column(String,nullable=True)
class Segment(Base):
    __tablename__='segments'
    id:Mapped[str]=mapped_column(String,primary_key=True)
    job_id:Mapped[str]=mapped_column(ForeignKey('jobs.id'),index=True)
    idx:Mapped[int]=mapped_column()
    start:Mapped[float]=mapped_column(Float)
    end:Mapped[float]=mapped_column(Float)
    state:Mapped[str]=mapped_column(String,default='Pending')
    request_id:Mapped[str|None]=mapped_column(String,nullable=True)
    handle:Mapped[str|None]=mapped_column(Text,nullable=True)
    submitted:Mapped[float|None]=mapped_column(Float,nullable=True)
    output:Mapped[str|None]=mapped_column(Text,nullable=True)
class Asset(Base):
    __tablename__='assets'
    id:Mapped[str]=mapped_column(String,primary_key=True,default=lambda:uuid.uuid4().hex)
    user_id:Mapped[str]=mapped_column(String,index=True)
    job_id:Mapped[str|None]=mapped_column(String,nullable=True,index=True)
    kind:Mapped[str]=mapped_column(String)
    name:Mapped[str]=mapped_column(String)
    path:Mapped[str]=mapped_column(Text)
    meta:Mapped[str]=mapped_column(Text)
    created:Mapped[float]=mapped_column(Float,default=time.time)
class FaceCheck(Base):
    __tablename__='face_checks'
    id:Mapped[str]=mapped_column(String,primary_key=True,default=lambda:uuid.uuid4().hex)
    job_id:Mapped[str]=mapped_column(ForeignKey('jobs.id'),index=True)
    segment_id:Mapped[str|None]=mapped_column(String,nullable=True)
    report:Mapped[str]=mapped_column(Text)
engine=create_engine(DATABASE_URL,connect_args={'check_same_thread':False,'timeout':30} if DATABASE_URL.startswith('sqlite') else {},pool_pre_ping=True)
Session=sessionmaker(engine,expire_on_commit=False)
def init(): Base.metadata.create_all(engine)

class SpendReservation(Base):
    __tablename__='spend_reservations'
    id:Mapped[str]=mapped_column(String,primary_key=True)
    user_id:Mapped[str]=mapped_column(String,index=True)
    amount:Mapped[float]=mapped_column(Float)
    created:Mapped[float]=mapped_column(Float,default=time.time)
