import os
from pathlib import Path
from dotenv import load_dotenv
from backend.utils.log import logger

load_dotenv()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai").lower()
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AVALAI_API_KEY = os.getenv("AVALAI_API_KEY", "")
AVALAI_BASE_URL = os.getenv("AVALAI_BASE_URL", "https://api.avalai.ir/v1")

MIMO_API_KEY = os.getenv("MIMO_API_KEY", "")
MIMO_BASE_URL = os.getenv("MIMO_BASE_URL", "https://api.xiaomimimo.com/v1")

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "dev-admin-key")
ANALYSIS_API_KEY = os.getenv("ANALYSIS_API_KEY", "")

_cors_raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
if _cors_raw.strip():
    CORS_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]
elif IS_PRODUCTION:
    CORS_ORIGINS = ["*"]
else:
    CORS_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

_raw_db = os.getenv("DATABASE_URL", "").strip()
if _raw_db and _raw_db.startswith("postgresql://"):
    DATABASE_URL = _raw_db.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _raw_db and _raw_db.startswith("postgres://"):
    DATABASE_URL = _raw_db.replace("postgres://", "postgresql+asyncpg://", 1)
elif _raw_db:
    DATABASE_URL = _raw_db
else:
    DATABASE_URL = "sqlite+aiosqlite:///./talent_pool.db"
PORT = int(os.getenv("PORT", "8000"))
TALENT_POOL_ROOT = os.getenv("TALENT_POOL_ROOT", "./talent-pool")
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
SENTRY_SEND_PII = os.getenv("SENTRY_SEND_PII", "false").lower() == "true"

TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "")

_PROMPT_PATH = Path(__file__).parent / "system_prompt.txt"
_cached_prompt: str | None = None


def load_system_prompt() -> str:
    global _cached_prompt
    if _cached_prompt is None:
        try:
            _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
            logger.debug(f"System prompt loaded ({len(_cached_prompt)} chars)")
        except FileNotFoundError:
            logger.error(f"system_prompt.txt not found at {_PROMPT_PATH}")
            _cached_prompt = "You are a resume analyst."
    return _cached_prompt


def reload_system_prompt() -> str:
    global _cached_prompt
    try:
        _cached_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
        logger.info(f"System prompt reloaded ({len(_cached_prompt)} chars)")
    except FileNotFoundError:
        logger.error(f"system_prompt.txt not found at {_PROMPT_PATH}")
    return _cached_prompt


def validate_config():
    errors = []
    if LLM_PROVIDER == "gemini" and not GEMINI_API_KEY:
        errors.append("GEMINI_API_KEY is not set")
    if LLM_PROVIDER == "openai" and not OPENAI_API_KEY:
        errors.append("OPENAI_API_KEY is not set")
    if LLM_PROVIDER == "anthropic" and not ANTHROPIC_API_KEY:
        errors.append("ANTHROPIC_API_KEY is not set")
    if LLM_PROVIDER == "avalai" and not AVALAI_API_KEY:
        errors.append("AVALAI_API_KEY is not set")
    if LLM_PROVIDER == "mimo" and not MIMO_API_KEY:
        errors.append("MIMO_API_KEY is not set")
    if IS_PRODUCTION and not CORS_ORIGINS:
        errors.append("CORS_ALLOWED_ORIGINS must be set in production")
    if IS_PRODUCTION and ADMIN_API_KEY == "dev-admin-key":
        errors.append("ADMIN_API_KEY must be changed in production")
    if errors:
        for e in errors:
            logger.error(f"Config error: {e}")
        raise RuntimeError(f"Config validation failed: {errors}")
    logger.info(f"Config OK — provider={LLM_PROVIDER} model={LLM_MODEL} env={ENVIRONMENT}")
