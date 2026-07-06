from backend.utils.log import logger
from backend.core.schema import (
    AnalysisReport as DataclassReport, DimensionResult as DataclassDim,
    SeniorityCheck, DIMENSION_KEYS
)
from backend.core.validator import AnalysisReport as PydanticReport
from backend import config, llm_client


def build_prompt(resume_text, raw_keywords, seniority):
    system_prompt = config.load_system_prompt()
    keywords_str = ", ".join(raw_keywords) if raw_keywords else "none extracted"

    user_message = f"""CANDIDATE INPUT:

Declared Seniority: {seniority.upper()}

Pre-extracted Keywords: {keywords_str}

Resume Text:
{resume_text}
"""

    return system_prompt, user_message


def _pydantic_to_dataclass(py_report: PydanticReport) -> DataclassReport:
    report = DataclassReport(raw_llm_response="")

    report.extraction_status = py_report.extraction_status.value
    report.extraction_notes = py_report.extraction_notes
    report.header = py_report.header.model_dump()
    report.executive_summary = py_report.executive_summary
    report.candidate_name = py_report.header.candidate_name

    report.seniority_check = SeniorityCheck(
        status="match",
        detected_level=py_report.header.declared_seniority.value.lower(),
        reason="",
    )

    for key in DIMENSION_KEYS:
        dim = getattr(py_report.dimensions, key, None)
        if dim is not None:
            hl_targets = [{"section": h.section, "type": h.type, "phrase": h.phrase} for h in dim.highlight_targets]
            report.dimensions[key] = DataclassDim(
                code=dim.code,
                name=dim.name,
                priority_tier=dim.priority_tier.value,
                rating=dim.rating.value,
                confidence=dim.confidence.value,
                summary=dim.summary,
                issues=dim.issues,
                fixes=dim.fixes,
                highlight_targets=hl_targets,
            )

    report.rewrites = [{"original": r.original, "rewritten": r.rewritten} for r in py_report.rewrites]
    report.priority_fixes = [
        {"dimension_code": f.dimension_code, "dimension_name": f.dimension_name, "fix": f.fix}
        for f in py_report.priority_fixes
    ]
    report.tier = py_report.overall_verdict.tier.value
    report.verdict = py_report.overall_verdict.summary

    return report


async def analyze_resume(resume_text, raw_keywords, seniority):
    system_prompt, user_message = build_prompt(resume_text, raw_keywords, seniority)
    total_chars = len(system_prompt) + len(user_message)
    logger.info(f"LLM call ({total_chars} chars) to {config.LLM_PROVIDER}")

    try:
        py_report = await llm_client.generate_structured(
            system_prompt, user_message, PydanticReport, max_tokens=16384
        )
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        report = DataclassReport(raw_llm_response="")
        report.parse_error = True
        report.verdict = f"LLM analysis failed: {e}"
        return report

    report = _pydantic_to_dataclass(py_report)
    report.raw_llm_response = ""
    logger.info(f"Analysis complete — tier={report.tier}")
    return report
