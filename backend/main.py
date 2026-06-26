import json
import hmac
import re
import sentry_sdk
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request, UploadFile, File, Form, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.utils.log import logger
from backend import config

import httpx

sentry_sdk.init(
    dsn=config.SENTRY_DSN or None,
    integrations=[],
    traces_sample_rate=0.1,
    environment=config.ENVIRONMENT,
    send_default_pii=config.SENTRY_SEND_PII,
)
from backend.core.parser import parse_file
from backend.core.analyzer import analyze_resume
from backend.core.schema import DIMENSION_KEYS, DIMENSION_GROUPS
from backend.db.database import init_db, get_session, engine, TalentPoolEntry
from backend.utils.file_storage import safe_save_to_folder

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.validate_config()
    await init_db()
    logger.info("Resume Analyzer API started")
    yield
    await engine.dispose()
    logger.info("Resume Analyzer API shut down")


app = FastAPI(title="Resume Analyzer API", version="0.1.0", lifespan=lifespan, docs_url="/api/docs", redoc_url="/api/redoc", openapi_url="/api/openapi.json")
app.state.limiter = limiter

app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def _verify_turnstile(token: str) -> bool:
    if not config.TURNSTILE_SECRET_KEY:
        return True
    if not token:
        return False
    async with httpx.AsyncClient() as client:
        resp = await client.post(TURNSTILE_VERIFY_URL, data={
            "secret": config.TURNSTILE_SECRET_KEY,
            "response": token,
        })
        result = resp.json()
        return result.get("success", False)


@app.get("/health")
async def health(session: AsyncSession = Depends(get_session)):
    db_healthy = False
    try:
        await session.execute(text("SELECT 1"))
        db_healthy = True
    except Exception:
        pass

    status = {
        "status": "healthy" if db_healthy else "unhealthy",
        "database": "connected" if db_healthy else "disconnected",
        "provider": config.LLM_PROVIDER,
        "model": config.LLM_MODEL,
        "version": "0.1.0",
    }

    if not db_healthy:
        raise HTTPException(status_code=503, detail=status)
    return status


def _extract_name_from_report(report_data: dict, resume_text: str, filename: str) -> str:
    name = report_data.get("candidate_name", "")
    if name and name.strip():
        return name.strip()

    lines = resume_text.strip().split("\n")[:5]
    for line in lines:
        line = line.strip()
        if not line or len(line) > 60:
            continue
        if re.match(r'^[A-ZÜÖÄ][a-züöäß]+(?:\s[A-ZÜÖÄ][a-züöäß]+){1,3}$', line):
            return line
        if re.match(r'^(Dr\.|Prof\.|Mr\.|Ms\.|Herr|Frau)\s', line):
            parts = line.split(None, 1)
            if len(parts) > 1:
                return parts[1].strip()

    return Path(filename).stem


@app.post("/analyze")
@limiter.limit("10/minute")
async def analyze(
    request: Request,
    file: UploadFile = File(...),
    seniority: str = Form("mid"),
    x_api_key: str = Header(None),
    x_turnstile_token: str = Header(None),
    session: AsyncSession = Depends(get_session),
):
    if config.ANALYSIS_API_KEY and x_api_key != config.ANALYSIS_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if not await _verify_turnstile(x_turnstile_token):
        raise HTTPException(status_code=403, detail="Security check failed. Please try again.")
    if seniority.lower() not in ("junior", "mid", "senior", "executive"):
        seniority = "mid"

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 10MB.")

    try:
        resume_text, raw_keywords, mime_type = parse_file(file_bytes, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        report = await analyze_resume(resume_text, raw_keywords, seniority)
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=502, detail="LLM analysis failed. Please try again.")

    sorted_dims = {k: report.dimensions[k] for k in DIMENSION_KEYS if k in report.dimensions}

    dim_groups = {}
    for group_key, group_info in DIMENSION_GROUPS.items():
        group_dims = {}
        for dk in group_info["keys"]:
            if dk in sorted_dims:
                v = sorted_dims[dk]
                group_dims[dk] = {
                    "code": v.code,
                    "name": v.name,
                    "priority_tier": v.priority_tier,
                    "rating": v.rating,
                    "confidence": v.confidence,
                    "summary": v.summary,
                    "issues": v.issues,
                    "fixes": v.fixes,
                    "highlight_targets": getattr(v, 'highlight_targets', []),
                }
        dim_groups[group_key] = {
            "icon": group_info["icon"],
            "label": group_info["label"],
            "dimensions": group_dims,
        }

    report_dict = {
        "extraction_status": report.extraction_status,
        "extraction_notes": report.extraction_notes,
        "header": report.header,
        "executive_summary": report.executive_summary,
        "candidate_name": report.candidate_name,
        "seniority_check": {
            "status": report.seniority_check.status,
            "detected_level": report.seniority_check.detected_level,
            "reason": report.seniority_check.reason,
        },
        "dimension_groups": dim_groups,
        "dimensions": {
            k: {
                "code": v.code,
                "name": v.name,
                "priority_tier": v.priority_tier,
                "rating": v.rating,
                "confidence": v.confidence,
                "summary": v.summary,
                "issues": v.issues,
                "fixes": v.fixes,
                "highlight_targets": getattr(v, 'highlight_targets', []),
            }
            for k, v in sorted_dims.items()
        },
        "resume_text": resume_text,
        "resume_filename": file.filename,
        "rewrites": report.rewrites,
        "priority_fixes": report.priority_fixes,
        "tier": report.tier,
        "verdict": report.verdict,
    }

    full_name = _extract_name_from_report(report_dict, resume_text, file.filename)

    folder_path = safe_save_to_folder(
        file_bytes, file.filename, full_name, seniority
    )

    entry = TalentPoolEntry(
        full_name=full_name,
        seniority_declared=seniority,
        seniority_detected=report.seniority_check.detected_level,
        seniority_match=report.seniority_check.status,
        tier=report.tier,
        original_filename=file.filename,
        file_mimetype=mime_type,
        file_blob=file_bytes,
        folder_path=folder_path,
        resume_text=resume_text,
        analysis_json=json.dumps(report_dict),
        priority_fixes_json=json.dumps(report.priority_fixes),
        verdict=report.verdict,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)

    logger.info(f"Saved candidate #{entry.id}: {full_name} ({seniority})")

    return JSONResponse(content={
        "id": entry.id,
        "analysis": report_dict,
    })


def _verify_admin_key(x_admin_key: str = Header(None)):
    if not x_admin_key or not hmac.compare_digest(str(x_admin_key), config.ADMIN_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    return x_admin_key


@app.get("/admin/candidates")
async def list_candidates(
    admin_key: str = Depends(_verify_admin_key),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(TalentPoolEntry).order_by(TalentPoolEntry.created_at.desc())
    )
    entries = result.scalars().all()
    return {
        "count": len(entries),
        "candidates": [
            {
                "id": e.id,
                "name": e.full_name,
                "seniority": e.seniority_declared,
                "tier": e.tier,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ],
    }


@app.get("/admin/candidates/{candidate_id}")
async def get_candidate(
    candidate_id: int,
    admin_key: str = Depends(_verify_admin_key),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(TalentPoolEntry).where(TalentPoolEntry.id == candidate_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Candidate not found")

    analysis = {}
    if entry.analysis_json:
        try:
            analysis = json.loads(entry.analysis_json)
        except json.JSONDecodeError:
            pass

    return {
        "id": entry.id,
        "name": entry.full_name,
        "seniority_declared": entry.seniority_declared,
        "seniority_detected": entry.seniority_detected,
        "seniority_match": entry.seniority_match,
        "tier": entry.tier,
        "original_filename": entry.original_filename,
        "folder_path": entry.folder_path,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "analysis": analysis,
    }


@app.get("/admin/candidates/{candidate_id}/download")
async def download_candidate_cv(
    candidate_id: int,
    admin_key: str = Depends(_verify_admin_key),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(TalentPoolEntry).where(TalentPoolEntry.id == candidate_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Candidate not found")

    import io
    return FileResponse(
        io.BytesIO(entry.file_blob),
        media_type=entry.file_mimetype,
        filename=entry.original_filename,
    )


@app.get("/analysis/{candidate_id}/pdf")
async def download_analysis_pdf(
    candidate_id: int,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(TalentPoolEntry).where(TalentPoolEntry.id == candidate_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Candidate not found")

    analysis = {}
    if entry.analysis_json:
        try:
            analysis = json.loads(entry.analysis_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Invalid analysis data")

    from backend.core.pdf_generator import generate_analysis_pdf
    pdf_bytes = generate_analysis_pdf(analysis, entry.full_name)

    safe_name = entry.full_name.replace(" ", "_").replace("/", "_")
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="analysis_{safe_name}.pdf"'},
    )


@app.get("/cv/{candidate_id}")
async def serve_cv_file(
    candidate_id: int,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(TalentPoolEntry).where(TalentPoolEntry.id == candidate_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Candidate not found")

    import io
    return StreamingResponse(
        iter([entry.file_blob]),
        media_type=entry.file_mimetype,
        headers={"Content-Disposition": f'inline; filename="{entry.original_filename}"'},
    )


STATIC_DIR = Path(__file__).parent.parent / "frontend" / "dist"
if STATIC_DIR.is_dir():
    from starlette.responses import FileResponse as StarletteFileResponse

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith(("api/", "admin/", "health", "analyze", "analysis/", "cv/")):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return StarletteFileResponse(str(file_path))
        return StarletteFileResponse(str(STATIC_DIR / "index.html"))
