"""
Base class for LLM-backed scoring agents.

Handles: prompt assembly, low-temperature API calls, JSON parsing,
contract validation, and a single retry on malformed output.

PROVIDER SUPPORT: both Gemini and Grok expose OpenAI-compatible chat
completion endpoints, so this uses the `openai` SDK for both -- only the
base_url, API key, and model name differ. Pick the provider via the
LLM_PROVIDER environment variable (or the `provider` constructor arg).
"""

import json
import os
import sys
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from contract import validate_agent_output, ContractViolation

# NOTE: model names change over time -- verify these against current provider
# docs before relying on them. Override via the LLM_MODEL env var if a default
# here goes stale.
PROVIDER_CONFIGS = {
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key_env": "GOOGLE_API_KEY",
        "default_model": "gemini-2.0-flash",  # free-tier friendly as of writing; verify current limits
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "api_key_env": "GROQ_API_KEY",
        "default_model": "openai/gpt-oss-120b", # good quality; ~1,000 requests/day on free tier
        # alternative: "llama-3.1-8b-instant" -- lower quality but ~14,400 requests/day free
    },
}


class AgentError(RuntimeError):
    """Raised when an agent fails to produce a valid, contract-compliant score."""
    pass


class BaseScoringAgent:
    AGENT_NAME: str = None          # override in subclass, e.g. "skills"
    SYSTEM_PROMPT: str = None       # override in subclass

    def __init__(self, provider: str = None, model: str = None,
                 temperature: float = 0.2, api_key: str = None):
        if self.AGENT_NAME is None or self.SYSTEM_PROMPT is None:
            raise NotImplementedError("Subclasses must set AGENT_NAME and SYSTEM_PROMPT")

        provider = (provider or os.environ.get("LLM_PROVIDER", "gemini")).lower()
        if provider not in PROVIDER_CONFIGS:
            raise ValueError(f"Unknown provider {provider!r}, must be one of {list(PROVIDER_CONFIGS)}")
        config = PROVIDER_CONFIGS[provider]

        self.provider = provider
        self.model = model or os.environ.get("LLM_MODEL") or config["default_model"]
        self.temperature = temperature  # low temp: consistency matters more than creativity here

        resolved_key = api_key or os.environ.get(config["api_key_env"])
        if not resolved_key:
            raise ValueError(
                f"No API key found for provider '{provider}'. "
                f"Set the {config['api_key_env']} environment variable."
            )
        self.client = OpenAI(api_key=resolved_key, base_url=config["base_url"])

    def evaluate(self, resume_text: str, job_description: str, max_retries: int = 1) -> dict:
        """
        Score a candidate against a job description.
        Returns a dict matching the shared interface contract.
        """
        return self._run(self._build_user_message(resume_text, job_description), max_retries)

    def _run(self, user_message: str, max_retries: int) -> dict:
        last_error = None
        for _ in range(max_retries + 1):
            try:
                raw_text = self._call_model(user_message)
                parsed = self._parse_json(raw_text)
                validate_agent_output(parsed)
                return parsed
            except (json.JSONDecodeError, ContractViolation) as e:
                last_error = e
                continue

        raise AgentError(
            f"{self.AGENT_NAME} agent failed to produce valid output "
            f"after {max_retries + 1} attempt(s): {last_error}"
        )

    def _build_user_message(self, resume_text: str, job_description: str) -> str:
        return f"""JOB DESCRIPTION:
{job_description}

CANDIDATE RESUME:
{resume_text}

Respond with ONLY a JSON object in exactly this shape, no other text before or after:
{{"agent": "{self.AGENT_NAME}", "utility": <float between 0 and 1>, "rationale": "<one or two sentence justification>", "flags": [<list of short strings, empty list if nothing notable>]}}"""

    def _call_model(self, user_message: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            max_tokens=400,
            temperature=self.temperature,
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
        return response.choices[0].message.content

    @staticmethod
    def _parse_json(raw_text: str) -> dict:
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
