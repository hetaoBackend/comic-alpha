"""Controller auth helpers."""

from urllib.parse import urlsplit

from flask import request


def is_loopback_request() -> bool:
    """Only allow local callers to use local machine credentials."""
    remote_addr = request.remote_addr or ""
    return remote_addr in ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]


def is_trusted_local_request() -> bool:
    """Require a loopback peer and, when present, a loopback browser Origin.

    Non-browser local clients commonly omit Origin and remain supported.  A
    browser request with a hostile or opaque Origin is rejected to prevent an
    arbitrary website from using the permissive global CORS policy to access
    local ComicBrain files.
    """
    if not is_loopback_request():
        return False

    origin = request.headers.get("Origin")
    # Only the inherited desktop pipe transport sets this WSGI marker. It is
    # not a request header and cannot be asserted by a Web client.
    if request.environ.get('comic.desktop_ipc') is True:
        return origin is None or origin == 'comicperfect://app'
    if origin is None:
        return True
    if not origin or origin == "null":
        return False

    try:
        parsed = urlsplit(origin)
        # Accessing .port performs strict validation (for example, rejects
        # ``http://localhost:not-a-port``).
        parsed.port
    except ValueError:
        return False

    return (
        parsed.scheme in ("http", "https")
        and parsed.hostname in ("localhost", "127.0.0.1", "::1")
        and parsed.username is None
        and parsed.password is None
        and parsed.path in ("", "/")
        and not parsed.query
        and not parsed.fragment
    )


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
