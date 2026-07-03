from enum import Enum
from typing import Optional
from pydantic import BaseModel, field_validator


class Rating(str, Enum):
    GREAT = "Great"
    GOOD = "Good with slight improvement"
    NEEDS_IMPROVEMENT = "Needs Improvement"
    BAD = "Bad"
    NOT_PRESENT = "Not Present"


class Tier(str, Enum):
    NEEDS_WORK = "Needs Work"
    ENTRY = "Entry"
    COMPETITIVE = "Competitive"
    STRONG = "Strong"
    TOP_10 = "Top 10%"


class Confidence(str, Enum):
    HIGH = "high"
    LOW = "low"


class PriorityTier(str, Enum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class ExtractionStatus(str, Enum):
    OK = "ok"
    PARTIAL = "partial"
    FAILED = "failed"


class CvLanguage(str, Enum):
    GERMAN = "German"
    ENGLISH = "English"


class SeniorityDeclared(str, Enum):
    JUNIOR = "JUNIOR"
    MID = "MID"
    SENIOR = "SENIOR"
    EXECUTIVE = "EXECUTIVE"


class Header(BaseModel):
    candidate_name: str = ""
    page_count: int = 0
    cv_language: CvLanguage = CvLanguage.ENGLISH
    declared_seniority: SeniorityDeclared = SeniorityDeclared.MID
    detected_specialty: str = ""
    foreign_trained_physician: bool = False


class HighlightTarget(BaseModel):
    section: str  # contact, professional_summary, work_experience, education, additional_context, signature_block
    type: str = "section"  # "section" or "phrase"
    phrase: str = ""  # only if type == "phrase"


class DimensionResult(BaseModel):
    code: str = ""
    name: str = ""
    priority_tier: PriorityTier = PriorityTier.P2
    rating: Rating = Rating.NOT_PRESENT
    confidence: Confidence = Confidence.HIGH
    summary: str = ""
    issues: list[str] = []
    fixes: list[str] = []
    highlight_targets: list[HighlightTarget] = []

    @field_validator("issues", "fixes", mode="before")
    @classmethod
    def coerce_to_list(cls, v):
        if isinstance(v, str):
            return [v]
        return v

    @field_validator("fixes", mode="after")
    @classmethod
    def clean_fixes(cls, v):
        """Strip JSON fragments, highlight_targets leaks, and empty strings from fixes."""
        import re
        cleaned = []
        for fix in v:
            if not fix or not fix.strip():
                continue
            f = fix.strip()
            # Skip JSON-like fragments
            if re.search(r'(highlight_targets|"[^"]*":\s*[\[{]|\'[^\']*\':\s*[\[{])', f):
                continue
            if f.startswith('{') or f.startswith('[') or f.startswith('"'):
                continue
            if f.endswith('},') or f.endswith('}]') or f.endswith('",'):
                continue
            cleaned.append(f)
        return cleaned

    @field_validator("highlight_targets", mode="before")
    @classmethod
    def coerce_highlights(cls, v):
        if isinstance(v, dict):
            return [v]
        return v


class Rewrite(BaseModel):
    original: str
    rewritten: str


class PriorityFix(BaseModel):
    dimension_code: str = ""
    dimension_name: str = ""
    fix: str = ""


class OverallVerdict(BaseModel):
    tier: Tier = Tier.COMPETITIVE
    summary: str = ""


class Dimensions(BaseModel):
    page_structure: DimensionResult = DimensionResult(code="page_structure", name="Page Structure")
    visual_design_scannability: DimensionResult = DimensionResult(code="visual_design_scannability", name="Visual Design & Scannability")
    ats_compatibility: DimensionResult = DimensionResult(code="ats_compatibility", name="ATS Compatibility")
    section_order: DimensionResult = DimensionResult(code="section_order", name="Section Order")
    formalities: DimensionResult = DimensionResult(code="formalities", name="Formalities")
    professional_network: DimensionResult = DimensionResult(code="professional_network", name="Professional Network")
    professional_summary: DimensionResult = DimensionResult(code="professional_summary", name="Professional Summary")
    bullet_quality_ownership: DimensionResult = DimensionResult(code="bullet_quality_ownership", name="Bullet Quality & Ownership")
    impact_so_what: DimensionResult = DimensionResult(code="impact_so_what", name='Impact / "So What?"')
    specialty_fit_rotation_relevance: DimensionResult = DimensionResult(code="specialty_fit_rotation_relevance", name="Specialty Fit & Rotation Relevance")
    keyword_density: DimensionResult = DimensionResult(code="keyword_density", name="Keyword Density")
    relevance_recency: DimensionResult = DimensionResult(code="relevance_recency", name="Relevance & Recency")
    soft_skills_integration: DimensionResult = DimensionResult(code="soft_skills_integration", name="Soft Skills Integration")
    grammar_spelling_consistency: DimensionResult = DimensionResult(code="grammar_spelling_consistency", name="Grammar, Spelling & Consistency")
    additional_context: DimensionResult = DimensionResult(code="additional_context", name="Additional Context")
    legal_eligibility_status: DimensionResult = DimensionResult(code="legal_eligibility_status", name="Legal & Eligibility Status")
    gaps_risk_signals: DimensionResult = DimensionResult(code="gaps_risk_signals", name="Gaps & Risk Signals")
    pii_sensitive_data: DimensionResult = DimensionResult(code="pii_sensitive_data", name="PII & Sensitive Data")
    white_space: DimensionResult = DimensionResult(code="white_space", name="White Space")
    fluff_buzzwords: DimensionResult = DimensionResult(code="fluff_buzzwords", name="Fluff & Buzzwords")
    bullet_length_formatting_consistency: DimensionResult = DimensionResult(code="bullet_length_formatting_consistency", name="Bullet Length & Formatting Consistency")


class AnalysisReport(BaseModel):
    extraction_status: ExtractionStatus = ExtractionStatus.OK
    extraction_notes: str = ""
    header: Header = Header()
    executive_summary: str = ""
    dimensions: Dimensions = Dimensions()
    rewrites: list[Rewrite] = []
    priority_fixes: list[PriorityFix] = []
    overall_verdict: OverallVerdict = OverallVerdict()
