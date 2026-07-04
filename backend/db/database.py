from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, Text, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from backend.utils.log import logger
from backend import config


class Base(DeclarativeBase):
    pass


class TalentPoolEntry(Base):
    __tablename__ = "talent_pool"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    created_at          = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    full_name           = Column(String(200), nullable=False)
    seniority_declared  = Column(String(20), nullable=False)
    seniority_detected  = Column(String(20), nullable=True)
    seniority_match     = Column(String(10), nullable=True)
    tier                = Column(String(20), nullable=True)
    original_filename   = Column(String(300), nullable=False)
    folder_path         = Column(String(500), nullable=True)
    resume_text         = Column(Text, nullable=True)
    resume_markdown     = Column(Text, nullable=True)
    analysis_json       = Column(Text, nullable=True)
    priority_fixes_json = Column(Text, nullable=True)
    verdict             = Column(Text, nullable=True)
    target_country      = Column(String(50), nullable=True, default="germany")
    referral_source     = Column(String(100), nullable=True)


engine_kwargs = {"echo": False}
if config.DATABASE_URL.startswith("postgresql"):
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10

engine = create_async_engine(config.DATABASE_URL, **engine_kwargs)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with engine.begin() as conn:
        for col, typedef in [
            ("resume_markdown", "TEXT"),
            ("target_country", "VARCHAR(50) DEFAULT 'germany'"),
            ("referral_source", "VARCHAR(100)"),
        ]:
            try:
                # Check if column exists first (SQLite doesn't support IF NOT EXISTS for ADD COLUMN)
                result = await conn.execute(text(
                    f"SELECT COUNT(*) FROM pragma_table_info('talent_pool') WHERE name='{col}'"
                ))
                exists = result.scalar() > 0
                if not exists:
                    await conn.execute(text(
                        f"ALTER TABLE talent_pool ADD COLUMN {col} {typedef}"
                    ))
                    logger.info(f"Added missing column: {col}")
            except Exception as e:
                logger.debug(f"Column migration for {col}: {e}")
    logger.info("Database initialized")


async def get_session():
    async with AsyncSessionLocal() as session:
        yield session
