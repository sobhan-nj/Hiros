import re
from datetime import datetime, timezone
from pathlib import Path
from backend.utils.log import logger
from backend import config


def sanitize(name: str) -> str:
    return re.sub(r"[^\w\-]", "_", name.strip())


def build_folder_path(seniority: str) -> Path:
    return Path(config.TALENT_POOL_ROOT) / seniority.lower()


def save_to_folder(markdown_text: str, full_name: str, seniority: str, created_at=None):
    if created_at is None:
        created_at = datetime.now(timezone.utc)
    folder = build_folder_path(seniority)
    folder.mkdir(parents=True, exist_ok=True)
    date_str = created_at.strftime("%Y%m%d")
    safe_name = sanitize(full_name)
    filename = f"{safe_name}_{date_str}.md"
    counter = 1
    final_path = folder / filename
    while final_path.exists():
        filename = f"{safe_name}_{date_str}_{counter}.md"
        final_path = folder / filename
        counter += 1
    final_path.write_text(markdown_text, encoding="utf-8")
    logger.info(f"Saved to talent pool: {final_path}")
    return str(final_path)


def safe_save_to_folder(*args, **kwargs):
    try:
        return save_to_folder(*args, **kwargs)
    except Exception as e:
        logger.warning(f"File storage failed (non-critical): {e}")
        return None
