from backend.utils.log import logger
from backend import config

_gemini_cached_content = None


async def generate(system_prompt: str, user_message: str, max_tokens: int = 4096) -> str:
    provider = config.LLM_PROVIDER
    logger.debug(f"LLM call — provider={provider} max_tokens={max_tokens}")
    if provider == "gemini":
        return await _call_gemini(system_prompt, user_message, max_tokens)
    elif provider in ("openai", "avalai", "mimo"):
        return await _call_openai_compatible(system_prompt, user_message, max_tokens)
    elif provider == "anthropic":
        return await _call_anthropic(system_prompt, user_message, max_tokens)
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


async def generate_structured(system_prompt: str, user_message: str, response_model, max_tokens: int = 8192):
    """Call LLM with structured output (response_format=PydanticModel).

    Only works with OpenAI-compatible providers (openai, avalai, mimo).
    Falls back to generate() + manual parsing for other providers.
    """
    provider = config.LLM_PROVIDER
    logger.debug(f"Structured LLM call — provider={provider} model={response_model.__name__}")

    if provider in ("openai", "avalai", "mimo"):
        return await _call_openai_structured(system_prompt, user_message, response_model, max_tokens)
    elif provider == "gemini":
        return await _call_gemini_structured(system_prompt, user_message, response_model, max_tokens)
    elif provider == "anthropic":
        return await _call_anthropic_structured(system_prompt, user_message, response_model, max_tokens)
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


async def _call_gemini(system_prompt: str, user_message: str, max_tokens: int) -> str:
    import google.generativeai as genai
    genai.configure(api_key=config.GEMINI_API_KEY)

    global _gemini_cached_content
    if _gemini_cached_content is None or getattr(_gemini_cached_content, 'expired', False):
        try:
            _gemini_cached_content = genai.cached_content.create(
                model=config.LLM_MODEL,
                system_instruction=system_prompt,
                ttl="3600s",
            )
            logger.info(f"Gemini prompt cached ({len(system_prompt)} chars, TTL 1h)")
        except Exception as e:
            logger.warning(f"Gemini cache creation failed, falling back: {e}")
            _gemini_cached_content = None

    if _gemini_cached_content and not getattr(_gemini_cached_content, 'expired', False):
        model = genai.GenerativeModel.from_cached_content(_gemini_cached_content)
    else:
        model = genai.GenerativeModel(config.LLM_MODEL, system_instruction=system_prompt)

    response = await model.generate_content_async(
        user_message,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=0.2,
        ),
    )
    return response.text or ""


async def _call_gemini_structured(system_prompt: str, user_message: str, response_model, max_tokens: int):
    """Gemini doesn't support native structured outputs — use generate + parse."""
    raw = await _call_gemini(system_prompt, user_message, max_tokens)
    import json, re
    cleaned = re.sub(r"```json\s*|```\s*", "", raw).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise ValueError(f"Failed to parse JSON from Gemini response: {raw[:500]}")
    return response_model.model_validate(data)


async def _call_openai_compatible(system_prompt: str, user_message: str, max_tokens: int) -> str:
    from openai import AsyncOpenAI
    provider = config.LLM_PROVIDER
    if provider == "mimo":
        api_key = config.MIMO_API_KEY
        base_url = config.MIMO_BASE_URL
    elif provider == "avalai":
        api_key = config.AVALAI_API_KEY
        base_url = config.AVALAI_BASE_URL
    else:
        api_key = config.OPENAI_API_KEY
        base_url = None
    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=300)
    response = await client.chat.completions.create(
        model=config.LLM_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        max_tokens=max_tokens,
        temperature=0.2,
    )
    return response.choices[0].message.content or ""


async def _call_openai_structured(system_prompt: str, user_message: str, response_model, max_tokens: int):
    """OpenAI-compatible structured output via beta.chat.completions.parse()."""
    from openai import AsyncOpenAI
    provider = config.LLM_PROVIDER
    if provider == "mimo":
        api_key = config.MIMO_API_KEY
        base_url = config.MIMO_BASE_URL
    elif provider == "avalai":
        api_key = config.AVALAI_API_KEY
        base_url = config.AVALAI_BASE_URL
    else:
        api_key = config.OPENAI_API_KEY
        base_url = None
    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=300)
    completion = await client.beta.chat.completions.parse(
        model=config.LLM_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        response_format=response_model,
        max_tokens=max_tokens,
        temperature=0.2,
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None:
        raise ValueError("LLM response could not be parsed into the expected schema")
    return parsed


async def _call_anthropic(system_prompt: str, user_message: str, max_tokens: int) -> str:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    message = await client.messages.create(
        model=config.LLM_MODEL,
        max_tokens=max_tokens,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_message}],
    )
    return message.content[0].text


async def _call_anthropic_structured(system_prompt: str, user_message: str, response_model, max_tokens: int):
    """Anthropic doesn't support native structured outputs — use generate + parse."""
    raw = await _call_anthropic(system_prompt, user_message, max_tokens)
    import json, re
    cleaned = re.sub(r"```json\s*|```\s*", "", raw).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise ValueError(f"Failed to parse JSON from Anthropic response: {raw[:500]}")
    return response_model.model_validate(data)
