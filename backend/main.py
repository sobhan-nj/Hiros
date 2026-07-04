import json
import hmac
import re
import sentry_sdk
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, Request, UploadFile, File, Form, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
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


@app.post("/parse")
@limiter.limit("20/minute")
async def parse_upload(
    request: Request,
    file: UploadFile = File(...),
    x_api_key: str = Header(None),
    x_turnstile_token: str = Header(None),
):
    if config.ANALYSIS_API_KEY and x_api_key != config.ANALYSIS_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if not await _verify_turnstile(x_turnstile_token):
        raise HTTPException(status_code=403, detail="Security check failed. Please try again.")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 10MB.")

    try:
        resume_text, raw_keywords, mime_type, resume_markdown = parse_file(file_bytes, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "resume_text": resume_text,
        "resume_markdown": resume_markdown,
        "raw_keywords": raw_keywords,
        "filename": file.filename,
        "mime_type": mime_type,
    }


@app.post("/analyze")
@limiter.limit("10/minute")
async def analyze(
    request: Request,
    resume_text: str = Form(...),
    resume_markdown: str = Form(""),
    raw_keywords: str = Form("[]"),
    seniority: str = Form("mid"),
    target_country: str = Form("germany"),
    referral_source: str = Form(""),
    resume_filename: str = Form("resume.pdf"),
    x_api_key: str = Header(None),
    session: AsyncSession = Depends(get_session),
):
    if config.ANALYSIS_API_KEY and x_api_key != config.ANALYSIS_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if seniority.lower() not in ("junior", "mid", "senior", "executive"):
        seniority = "mid"
    target_country = target_country.lower().strip() or "germany"

    try:
        keywords_list = json.loads(raw_keywords)
    except (json.JSONDecodeError, TypeError):
        keywords_list = []

    try:
        report = await analyze_resume(resume_text, keywords_list, seniority)
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
        "resume_markdown": resume_markdown,
        "resume_filename": resume_filename,
        "rewrites": report.rewrites,
        "priority_fixes": report.priority_fixes,
        "tier": report.tier,
        "verdict": report.verdict,
    }

    if target_country != "germany":
        country_label = target_country.title()
        not_present_reason = (
            f"Approbation is a German-specific credential and does not apply to the {country_label} job market. "
            f"This dimension is rated Great because no German medical license is required."
        )
        for dim_key in ("legal_eligibility_status",):
            if dim_key in report_dict.get("dimensions", {}):
                report_dict["dimensions"][dim_key]["rating"] = "Great"
                report_dict["dimensions"][dim_key]["summary"] = not_present_reason
                report_dict["dimensions"][dim_key]["issues"] = []
                report_dict["dimensions"][dim_key]["fixes"] = []
            for g in report_dict.get("dimension_groups", {}).values():
                if dim_key in g.get("dimensions", {}):
                    g["dimensions"][dim_key]["rating"] = "Great"
                    g["dimensions"][dim_key]["summary"] = not_present_reason
                    g["dimensions"][dim_key]["issues"] = []
                    g["dimensions"][dim_key]["fixes"] = []

    full_name = _extract_name_from_report(report_dict, resume_text, resume_filename)

    now = datetime.now(timezone.utc)
    folder_path = safe_save_to_folder(
        resume_markdown, full_name, seniority, created_at=now
    )

    entry = TalentPoolEntry(
        full_name=full_name,
        seniority_declared=seniority,
        seniority_detected=report.seniority_check.detected_level,
        seniority_match=report.seniority_check.status,
        tier=report.tier,
        original_filename=resume_filename,
        folder_path=folder_path,
        resume_text=resume_text,
        resume_markdown=resume_markdown,
        analysis_json=json.dumps(report_dict),
        priority_fixes_json=json.dumps(report.priority_fixes),
        verdict=report.verdict,
        target_country=target_country,
        referral_source=referral_source or None,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)

    logger.info(f"Saved candidate #{entry.id}: {full_name} ({seniority})")

    return JSONResponse(content={
        "id": entry.id,
        "analysis": report_dict,
    })


import asyncio
import multiprocessing

_active_workers = 0
_worker_lock = asyncio.Lock()
MAX_WORKERS = multiprocessing.cpu_count() * 2 + 1


@app.post("/analyze/stream")
@limiter.limit("10/minute")
async def analyze_stream(
    request: Request,
    resume_text: str = Form(...),
    resume_markdown: str = Form(""),
    raw_keywords: str = Form("[]"),
    seniority: str = Form("mid"),
    target_country: str = Form("germany"),
    referral_source: str = Form(""),
    resume_filename: str = Form("resume.pdf"),
    x_api_key: str = Header(None),
    session: AsyncSession = Depends(get_session),
):
    global _active_workers
    if config.ANALYSIS_API_KEY and x_api_key != config.ANALYSIS_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if _active_workers >= MAX_WORKERS:
        raise HTTPException(
            status_code=503,
            detail="All analysis slots are busy. Please try again in 30 seconds.",
        )
    if seniority.lower() not in ("junior", "mid", "senior", "executive"):
        seniority = "mid"
    target_country = target_country.lower().strip() or "germany"

    try:
        keywords_list = json.loads(raw_keywords)
    except (json.JSONDecodeError, TypeError):
        keywords_list = []

    _active_workers += 1

    async def event_stream():
        global _active_workers

        yield f"event: step\ndata: {json.dumps({'step': 'parsing', 'message': 'Extracting keywords and building prompt...'})}\n\n"

        try:
            report = await analyze_resume(resume_text, keywords_list, seniority)
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            yield f"event: error\ndata: {json.dumps({'detail': 'LLM analysis failed. Please try again.'})}\n\n"
            return
        finally:
            _active_workers -= 1

        yield f"event: step\ndata: {json.dumps({'step': 'report', 'message': 'Building your report...'})}\n\n"

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
            "resume_markdown": resume_markdown,
            "resume_filename": resume_filename,
            "rewrites": report.rewrites,
            "priority_fixes": report.priority_fixes,
            "tier": report.tier,
            "verdict": report.verdict,
        }

        if target_country != "germany":
            country_label = target_country.title()
            not_present_reason = (
                f"Approbation is a German-specific credential and does not apply to the {country_label} job market. "
                f"This dimension is rated Great because no German medical license is required."
            )
            for dim_key in ("legal_eligibility_status",):
                if dim_key in report_dict.get("dimensions", {}):
                    report_dict["dimensions"][dim_key]["rating"] = "Great"
                    report_dict["dimensions"][dim_key]["summary"] = not_present_reason
                    report_dict["dimensions"][dim_key]["issues"] = []
                    report_dict["dimensions"][dim_key]["fixes"] = []
                for g in report_dict.get("dimension_groups", {}).values():
                    if dim_key in g.get("dimensions", {}):
                        g["dimensions"][dim_key]["rating"] = "Great"
                        g["dimensions"][dim_key]["summary"] = not_present_reason
                        g["dimensions"][dim_key]["issues"] = []
                        g["dimensions"][dim_key]["fixes"] = []

        full_name = _extract_name_from_report(report_dict, resume_text, resume_filename)

        now = datetime.now(timezone.utc)
        folder_path = safe_save_to_folder(
            resume_markdown, full_name, seniority, created_at=now
        )

        entry = TalentPoolEntry(
            full_name=full_name,
            seniority_declared=seniority,
            seniority_detected=report.seniority_check.detected_level,
            seniority_match=report.seniority_check.status,
            tier=report.tier,
            original_filename=resume_filename,
            folder_path=folder_path,
            resume_text=resume_text,
            resume_markdown=resume_markdown,
            analysis_json=json.dumps(report_dict),
            priority_fixes_json=json.dumps(report.priority_fixes),
            verdict=report.verdict,
            target_country=target_country,
            referral_source=referral_source or None,
        )
        session.add(entry)
        await session.commit()
        await session.refresh(entry)

        logger.info(f"Saved candidate #{entry.id}: {full_name} ({seniority})")

        result_data = json.dumps({"id": entry.id, "analysis": report_dict})
        yield f"event: result\ndata: {result_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _verify_admin_key(x_admin_key: str = Header(None)):
    if not x_admin_key or not hmac.compare_digest(str(x_admin_key), config.ADMIN_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    return x_admin_key


@app.get("/admin/stats")
async def get_stats(
    admin_key: str = Depends(_verify_admin_key),
    session: AsyncSession = Depends(get_session),
):
    from sqlalchemy import func

    total = await session.scalar(select(func.count(TalentPoolEntry.id)))

    tier_rows = await session.execute(
        select(TalentPoolEntry.tier, func.count(TalentPoolEntry.id)).group_by(TalentPoolEntry.tier)
    )
    by_tier = {row[0] or "unknown": row[1] for row in tier_rows.all()}

    seniority_rows = await session.execute(
        select(TalentPoolEntry.seniority_declared, func.count(TalentPoolEntry.id)).group_by(TalentPoolEntry.seniority_declared)
    )
    by_seniority = {row[0]: row[1] for row in seniority_rows.all()}

    today = datetime.now(timezone.utc).date()
    today_count = await session.scalar(
        select(func.count(TalentPoolEntry.id)).where(
            func.date(TalentPoolEntry.created_at) == today
        )
    )

    last_7_days = await session.execute(
        select(func.date(TalentPoolEntry.created_at), func.count(TalentPoolEntry.id))
        .where(TalentPoolEntry.created_at >= datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=7))
        .group_by(func.date(TalentPoolEntry.created_at))
        .order_by(func.date(TalentPoolEntry.created_at))
    )
    daily = {str(row[0]): row[1] for row in last_7_days.all()}

    referral_rows = await session.execute(
        select(TalentPoolEntry.referral_source, func.count(TalentPoolEntry.id))
        .where(TalentPoolEntry.referral_source.isnot(None))
        .group_by(TalentPoolEntry.referral_source)
    )
    by_referral = {row[0] or "unknown": row[1] for row in referral_rows.all()}

    country_rows = await session.execute(
        select(TalentPoolEntry.target_country, func.count(TalentPoolEntry.id))
        .where(TalentPoolEntry.target_country.isnot(None))
        .group_by(TalentPoolEntry.target_country)
    )
    by_country = {row[0] or "unknown": row[1] for row in country_rows.all()}

    return {
        "total_analyses": total or 0,
        "today": today_count or 0,
        "by_tier": by_tier,
        "by_seniority": by_seniority,
        "by_referral": by_referral,
        "by_country": by_country,
        "daily_last_7_days": daily,
    }


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
        "resume_text": entry.resume_text,
        "resume_markdown": entry.resume_markdown,
        "analysis": analysis,
    }


@app.get("/cv/{candidate_id}/download/md")
async def download_cv_markdown(
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

    md_text = entry.resume_markdown or entry.resume_text or ""
    safe_name = entry.full_name.replace(" ", "_").replace("/", "_")
    return StreamingResponse(
        iter([md_text.encode("utf-8")]),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_resume.md"'},
    )


@app.get("/cv/{candidate_id}/download/tex")
async def download_cv_latex(
    candidate_id: int,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(TalentPoolEntry).where(TalentPoolEntry.id == candidate_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Candidate not found")

    md_text = entry.resume_markdown or entry.resume_text or ""
    latex_text = markdown_to_latex(md_text)
    safe_name = entry.full_name.replace(" ", "_").replace("/", "_")
    return StreamingResponse(
        iter([latex_text.encode("utf-8")]),
        media_type="application/x-tex; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_resume.tex"'},
    )


def markdown_to_latex(md_text: str) -> str:
    """Convert resume markdown to a clean LaTeX document."""
    import re

    lines = md_text.split('\n')
    latex_lines = []
    in_itemize = False

    preamble = r"""\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=2cm]{geometry}
\usepackage{enumitem}
\usepackage{hyperref}
\usepackage{titlesec}

\titleformat{\section}{\large\bfseries\uppercase}{}{0em}{}[\titlerule]
\titlespacing*{\section}{0pt}{12pt}{6pt}

\setlist[itemize]{noitemsep, topsep=0pt, leftmargin=1.5em}
\pagestyle{empty}
\setlength{\parindent}{0pt}

\begin{document}
"""
    latex_lines.append(preamble)

    for line in lines:
        stripped = line.strip()

        if not stripped:
            if in_itemize:
                latex_lines.append(r'\end{itemize}')
                in_itemize = False
            latex_lines.append('')
            continue

        # Horizontal rule
        if re.match(r'^-{3,}$', stripped):
            if in_itemize:
                latex_lines.append(r'\end{itemize}')
                in_itemize = False
            latex_lines.append(r'\vspace{4pt}\hrule\vspace{4pt}')
            continue

        # Section headers (## Header)
        header_match = re.match(r'^##\s+(.+)$', stripped)
        if header_match:
            if in_itemize:
                latex_lines.append(r'\end{itemize}')
                in_itemize = False
            title = header_match.group(1).strip()
            latex_lines.append(f'\\section{{{title}}}')
            continue

        # Sub-headers (# Header)
        subheader_match = re.match(r'^#\s+(.+)$', stripped)
        if subheader_match:
            if in_itemize:
                latex_lines.append(r'\end{itemize}')
                in_itemize = False
            title = subheader_match.group(1).strip()
            latex_lines.append(f'\\subsection*{{{title}}}')
            continue

        # Bold headers ( **Label:** value )
        bold_label = re.match(r'^\*\*(.+?)\*\*\s*(.*)', stripped)
        if bold_label:
            if in_itemize:
                latex_lines.append(r'\end{itemize}')
                in_itemize = False
            label = bold_label.group(1).strip().rstrip(':')
            value = bold_label.group(2).strip()
            if value:
                latex_lines.append(f'\\textbf{{{label}:}} {value} \\\\')
            else:
                latex_lines.append(f'\\textbf{{{label}:}} \\\\')
            continue

        # Bullet points
        bullet_match = re.match(r'^[-•*]\s+(.+)$', stripped)
        if bullet_match:
            if not in_itemize:
                latex_lines.append(r'\begin{itemize}')
                in_itemize = True
            content = bullet_match.group(1).strip()
            # Convert **bold** to \textbf{bold}
            content = re.sub(r'\*\*(.+?)\*\*', r'\\textbf{\1}', content)
            # Convert *italic* to \textit{italic}
            content = re.sub(r'\*(.+?)\*', r'\\textit{\1}', content)
            latex_lines.append(f'  \\item {content}')
            continue

        # Regular text
        if in_itemize:
            latex_lines.append(r'\end{itemize}')
            in_itemize = False

        # Convert **bold** to \textbf{bold}
        text = re.sub(r'\*\*(.+?)\*\*', r'\\textbf{\1}', stripped)
        # Convert *italic* to \textit{italic}
        text = re.sub(r'\*(.+?)\*', r'\\textit{\1}', text)
        latex_lines.append(text + ' \\\\' if text else '')

    if in_itemize:
        latex_lines.append(r'\end{itemize}')

    latex_lines.append(r'\end{document}')

    return '\n'.join(latex_lines)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$name — Resume</title>
<style>
  @page { margin: 2cm; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    color: #1a1a2e;
    line-height: 1.6;
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    background: #fff;
  }
  h2 {
    font-size: 1.15rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #1B2A4A;
    border-bottom: 2px solid #1B2A4A;
    padding-bottom: 0.3rem;
    margin: 1.5rem 0 0.75rem;
  }
  h2:first-child { margin-top: 0; }
  p {
    font-size: 0.95rem;
    margin-bottom: 0.4rem;
  }
  ul {
    padding-left: 1.5rem;
    margin-bottom: 0.5rem;
  }
  li {
    font-size: 0.9rem;
    margin-bottom: 0.3rem;
    line-height: 1.5;
  }
  strong { color: #1a1a2e; }
  hr {
    border: none;
    border-top: 1px solid #E5E7EB;
    margin: 1rem 0;
  }
  @media print {
    body { padding: 0; max-width: none; }
  }
</style>
</head>
<body>
$content
</body>
</html>"""


@app.get("/cv/{candidate_id}/download/html")
async def download_cv_html(
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

    md_text = entry.resume_markdown or entry.resume_text or ""

    import markdown as md_lib
    html_body = md_lib.markdown(md_text, extensions=["extra", "sane_lists"])

    from string import Template
    html_content = Template(HTML_TEMPLATE).safe_substitute(name=entry.full_name, content=html_body)
    safe_name = entry.full_name.replace(" ", "_").replace("/", "_")
    return StreamingResponse(
        iter([html_content.encode("utf-8")]),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_resume.html"'},
    )


STATIC_DIR = Path(__file__).parent.parent / "frontend" / "dist"
SPA_EXCLUDED_PREFIXES = ("api/", "health", "analyze", "parse", "analysis/", "cv/")

if STATIC_DIR.is_dir():
    from starlette.responses import FileResponse as StarletteFileResponse

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if ".." in full_path:
            raise HTTPException(status_code=400, detail="Invalid path")
        if any(full_path.startswith(p) or full_path == p.rstrip("/") for p in SPA_EXCLUDED_PREFIXES):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return StarletteFileResponse(str(file_path))
        return StarletteFileResponse(str(STATIC_DIR / "index.html"))
