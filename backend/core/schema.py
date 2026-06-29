from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SeniorityCheck:
    status: str = "match"
    detected_level: Optional[str] = None
    reason: str = ""


@dataclass
class DimensionResult:
    code: str = ""
    name: str = ""
    priority_tier: str = ""
    rating: str = "not present"
    confidence: str = "high"
    summary: str = ""
    issues: list[str] = field(default_factory=list)
    fixes: list[str] = field(default_factory=list)
    highlight_targets: list[dict] = field(default_factory=list)


@dataclass
class AnalysisReport:
    extraction_status: str = "ok"
    extraction_notes: str = ""
    header: dict = field(default_factory=dict)
    executive_summary: str = ""
    seniority_check: SeniorityCheck = field(default_factory=SeniorityCheck)
    candidate_name: str = ""
    dimensions: dict[str, DimensionResult] = field(default_factory=dict)
    rewrites: list[dict] = field(default_factory=list)
    priority_fixes: list[dict] = field(default_factory=list)
    tier: str = ""
    verdict: str = ""
    raw_llm_response: str = ""
    parse_error: bool = False


DIMENSION_KEYS = [
    "page_structure",
    "visual_design_scannability",
    "ats_compatibility",
    "section_order",
    "formalities",
    "professional_network",
    "professional_summary",
    "bullet_quality_ownership",
    "impact_so_what",
    "specialty_fit_rotation_relevance",
    "keyword_density",
    "relevance_recency",
    "soft_skills_integration",
    "grammar_spelling_consistency",
    "additional_context",
    "legal_eligibility_status",
    "gaps_risk_signals",
    "pii_sensitive_data",
    "white_space",
    "fluff_buzzwords",
    "bullet_length_formatting_consistency",
]

DIMENSION_GROUPS = {
    "layout": {
        "icon": "📐",
        "label": "Layout",
        "keys": [
            "page_structure",
            "visual_design_scannability",
            "ats_compatibility",
            "section_order",
            "formalities",
            "professional_network",
        ],
    },
    "content": {
        "icon": "📋",
        "label": "Content",
        "keys": [
            "professional_summary",
            "bullet_quality_ownership",
            "impact_so_what",
            "specialty_fit_rotation_relevance",
            "keyword_density",
            "relevance_recency",
            "soft_skills_integration",
            "grammar_spelling_consistency",
            "additional_context",
        ],
    },
    "red_flags": {
        "icon": "🔴",
        "label": "Red Flags",
        "keys": [
            "legal_eligibility_status",
            "gaps_risk_signals",
            "pii_sensitive_data",
        ],
    },
    "readability": {
        "icon": "👁️",
        "label": "Readability",
        "keys": [
            "white_space",
            "fluff_buzzwords",
            "bullet_length_formatting_consistency",
        ],
    },
}
