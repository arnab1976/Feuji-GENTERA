"""Database setup — SQLAlchemy async engine with pgvector support."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_ENV == "development",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Create all tables on startup."""
    # Register models on Base.metadata before create_all
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        # Enable pgvector extension (SQLAlchemy 2 requires text())
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        # Additive columns for invitation archive / decommission (create_all won't alter)
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS decommissioned BOOLEAN DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS intake_data JSONB NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS pending_intake_data JSONB NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS provider_notes TEXT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS review_message TEXT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS last_edited_by VARCHAR(40) NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS last_review_decision VARCHAR(20) NULL"
        ))
        # Project Intake — approval workflow columns (create_all won't alter existing tables)
        await conn.execute(text(
            "ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(200) NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS submitted_by_role VARCHAR(40) NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS approved_by VARCHAR(200) NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS review_notes TEXT NULL"
        ))


async def get_db():
    """Dependency injection — provides DB session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
