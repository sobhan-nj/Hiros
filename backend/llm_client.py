import asyncio
import random
from backend.utils.log import logger
from backend import config

_gemini_cached_content = None
_gemini_cache_lock = asyncio.Lock()

# Retry configuration
MAX_RETRIES = 3
BASE_DELAY = 2  # seconds
MAX_DELAY = 30  # seconds


async def _retry_with_backoff(func, *args, **kwargs):
    """Execute function with exponential backoff retry logic."""
    last_exception = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return await func(*args, **kwargs)
        except (TimeoutError, ConnectionError, OSError) as e:
            last_exception = e
            if attempt == MAX_RETRIES:
                break
            # Exponential backoff with jitter
            delay = min(BASE_DELAY * (2 ** attempt) + random.uniform(0, 1), MAX_DELAY)
            logger.warning(f"Attempt {attempt + 1}/{MAX_RETRIES + 1} failed: {e}. Retrying in {delay:.1f}s...")
            await asyncio.sleep(delay)
        except Exception as e:
            # Don't retry on non-transient errors
            raise
    raise last_exception


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
    async with _gemini_cache_lock:
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

    async def _make_request():
        response = await model.generate_content_async(
            user_message,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=0.2,
            ),
        )
        return response.text or ""

    return await _retry_with_backoff(_make_request)


async def _call_gemini_structured(system_prompt: str, user_message: str, response_model, max_tokens: int):
    """Gemini doesn't support native structured outputs — use generate + parse."""
    # Add JSON schema to the prompt so Gemini returns the correct structure
    schema_instruction = (
        f"\n\nYou MUST respond with a single valid JSON object matching this exact schema. "
        f"No markdown, no explanation, just the raw JSON object.\n"
        f"Schema: {response_model.model_json_schema()}"
    )
    raw = await _call_gemini(system_prompt + schema_instruction, user_message, max_tokens)
    import json, re

    # Strip markdown code blocks (handles ```json ... ``` and ``` ... ```)
    cleaned = re.sub(r"```(?:json)?\s*", "", raw)
    cleaned = re.sub(r"```\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()

    # Try to extract JSON by finding balanced braces
    def extract_json(text):
        start = text.find('{')
        if start == -1:
            return None
        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(text)):
            c = text[i]
            if escape:
                escape = False
                continue
            if c == '\\' and in_string:
                escape = True
                continue
            if c == '"' and not escape:
                in_string = not in_string
                continue
            if in_string:
                continue
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return text[start:i+1]
        return None

    # Try direct parse first
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try extracting balanced JSON
        json_str = extract_json(cleaned)
        if json_str:
            # Fix common JSON issues
            json_str = re.sub(r',\s*}', '}', json_str)
            json_str = re.sub(r',\s*]', ']', json_str)
            try:
                data = json.loads(json_str)
            except json.JSONDecodeError:
                raise ValueError(f"Failed to parse JSON from Gemini response: {raw[:800]}")
        else:
            raise ValueError(f"Failed to extract JSON from Gemini response: {raw[:800]}")

    # Log the parsed structure for debugging
    logger.debug(f"Gemini response keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")

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

    async def _make_request():
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

    return await _retry_with_backoff(_make_request)


async def _call_openai_structured(system_prompt: str, user_message: str, response_model, max_tokens: int):
    """OpenAI-compatible structured output. Tries beta.chat.completions.parse() first,
    falls back to regular generation + manual JSON parsing."""
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

    # Try native structured output first
    if hasattr(client, 'beta') and hasattr(getattr(client, 'beta', None), 'chat'):
        try:
            async def _try_structured():
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
                if parsed is not None:
                    return parsed
                raise ValueError("No parsed response")
            return await _retry_with_backoff(_try_structured)
        except Exception as e:
            logger.warning(f"Structured output via beta.parse failed, falling back: {e}")

    # Fallback: regular generation + JSON parsing
    return await _call_openai_with_json_fallback(client, system_prompt, user_message, response_model, max_tokens)


async def _call_openai_with_json_fallback(client, system_prompt: str, user_message: str, response_model, max_tokens: int):
    """Generate text asking for JSON, then parse into the response model."""
    import json, re
    json_instruction = (
        f"\n\nYou MUST respond with a single valid JSON object matching this schema. "
        f"No markdown, no explanation, just the raw JSON object.\n"
        f"Schema: {response_model.model_json_schema()}"
    )

    async def _make_request():
        completion = await client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt + json_instruction},
                {"role": "user", "content": user_message},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
        )
        return completion.choices[0].message.content or ""

    raw = await _retry_with_backoff(_make_request)
    cleaned = re.sub(r"```json\s*|```\s*", "", raw).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise ValueError(f"Failed to parse JSON from response: {raw[:500]}")
    return response_model.model_validate(data)


async def _call_anthropic(system_prompt: str, user_message: str, max_tokens: int) -> str:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)

    async def _make_request():
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

    return await _retry_with_backoff(_make_request)


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
