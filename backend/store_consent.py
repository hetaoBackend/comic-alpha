"""Require a fresh, body-bound authorization from the trusted desktop host."""
import hashlib
import hmac
import os
import threading
import time
from flask import jsonify, request

AI_PATHS = frozenset(('/api/generate', '/api/generate-image', '/api/generate-cover',
    '/api/generate-xiaohongshu', '/api/generate-session-title', '/api/optimize-prompt',
    '/api/console/plan', '/api/console/storyboard', '/api/console/canon/prepare',
    '/api/console/canon/save', '/api/console/retrospective', '/api/console/assistant'))

def install_store_consent(app):
    used = {}
    lock = threading.Lock()

    @app.before_request
    def require_consent():
        if os.environ.get('COMIC_STORE') != '1' or request.method != 'POST' or request.path not in AI_PATHS:
            return None
        secret = os.environ.get('COMIC_CONSENT_SECRET', '')
        stamp = request.headers.get('X-Comic-Consent-Time', '')
        nonce = request.headers.get('X-Comic-Consent-Nonce', '')
        signature = request.headers.get('X-Comic-Consent', '')
        now = time.time() * 1000
        if not secret or not stamp.isdecimal() or abs(now - int(stamp)) > 60000 or len(nonce) != 36:
            return jsonify(error='请先在 ComicPerfect 中同意向所选 AI 服务共享本次创作内容。'), 403
        payload = f'{request.path}\n{stamp}\n{nonce}\n'.encode() + request.get_data()
        expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return jsonify(error='AI 共享授权与本次请求不匹配。'), 403
        with lock:
            for key, expiry in list(used.items()):
                if expiry < now:
                    del used[key]
            if nonce in used:
                return jsonify(error='AI 共享授权已使用，请重新发起。'), 403
            used[nonce] = now + 60000
        return None
