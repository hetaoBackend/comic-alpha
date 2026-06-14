"""Controller auth helpers."""

from flask import request


def is_loopback_request() -> bool:
    """Only allow local callers to use local machine credentials."""
    remote_addr = request.remote_addr or ""
    return remote_addr in ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]


def validate_model_provider(text_provider: str, api_key: str | None, google_api_key: str | None):
    if text_provider not in ["codex", "openai", "google"]:
        return "Text provider must be 'codex', 'openai', or 'google'", 400
    if text_provider == "codex" and not is_loopback_request():
        return "Codex credentials can only be used from localhost", 403
    if text_provider == "openai" and not api_key:
        return "OpenAI API key is required", 400
    if text_provider == "google" and not google_api_key:
        return "Google API key is required", 400
    return None, None


def validate_reasoning_effort(value: str | None):
    reasoning_effort = value or "medium"
    if reasoning_effort not in ["low", "medium", "high"]:
        return None, "reasoning_effort must be 'low', 'medium', or 'high'", 400
    return reasoning_effort, None, None


def infer_text_provider(data: dict) -> str:
    explicit_provider = data.get("text_provider") or data.get("model_provider")
    if explicit_provider:
        return explicit_provider
    if data.get("api_key"):
        return "openai"
    if data.get("google_api_key"):
        return "google"
    return "codex"
