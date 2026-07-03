import os
import sys
import logging
import re
from loguru import logger

LOG_FOLDER = os.path.join(os.path.dirname(__file__), "..", "logs")
os.makedirs(LOG_FOLDER, exist_ok=True)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"
DIAGNOSE = not IS_PRODUCTION

_REDACT_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9_-]{20,}"), "sk-***"),
    (re.compile(r"(?i)(api.?key|token|secret|password)\s*[=:]\s*\S+"), r"\1=***"),
]


def _redact_filter(record):
    msg = str(record["message"])
    for pattern, replacement in _REDACT_PATTERNS:
        msg = pattern.sub(replacement, msg)
    record["message"] = msg
    return True


logger.remove()

logger.add(
    os.path.join(LOG_FOLDER, "app_{time:YYYYMMDD_HHmmss}.log"),
    rotation="10 MB",
    retention="1 week",
    level="DEBUG",
    backtrace=True,
    diagnose=DIAGNOSE,
    encoding="utf-8",
    filter=_redact_filter,
)

logger.add(
    sys.stderr,
    level="DEBUG" if not IS_PRODUCTION else "INFO",
    colorize=True,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{line}</cyan> — <level>{message}</level>",
    diagnose=DIAGNOSE,
    filter=_redact_filter,
)


class InterceptHandler(logging.Handler):
    def emit(self, record):
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        logger.opt(depth=6, exception=record.exc_info).log(level, record.getMessage())


logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi", "pdfplumber", "pdfminer"):
    logging.getLogger(name).handlers = []
    logging.getLogger(name).setLevel(logging.WARNING)


class SmartCaptureHandler:
    def __init__(self, original_stream, default_level="INFO"):
        self.original_stream = original_stream
        self.default_level = default_level
        self.level_patterns = {
            "CRITICAL": re.compile(r"(?i)\b(critical|fatal)\b"),
            "ERROR": re.compile(r"(?i)\b(error|exception|traceback|failed|failure)\b"),
            "WARNING": re.compile(r"(?i)\b(warning|warn|caution|deprecated)\b"),
            "DEBUG": re.compile(r"(?i)\b(debug|trace|verbose)\b"),
        }

    def detect_level(self, message):
        for level, pattern in self.level_patterns.items():
            if pattern.search(message):
                return level
        return self.default_level

    def write(self, message):
        if message and not message.isspace():
            level = self.detect_level(message)
            logger.opt(depth=0).log(level, message.rstrip())

    def flush(self):
        self.original_stream.flush()

    def __getattr__(self, name):
        return getattr(self.original_stream, name)


sys.stdout = SmartCaptureHandler(sys.stdout, "INFO")
sys.stderr = SmartCaptureHandler(sys.stderr, "ERROR")

__all__ = ["logger"]
