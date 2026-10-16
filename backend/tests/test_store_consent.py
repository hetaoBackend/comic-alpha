import hashlib
import hmac
import os
import time
import unittest
from unittest.mock import patch
from flask import Flask
from store_consent import AI_PATHS, install_store_consent

class StoreConsentTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        install_store_consent(self.app)
        for index, path in enumerate(AI_PATHS):
            self.app.add_url_rule(path, str(index), lambda: {'sent': True}, methods=['POST'])
        self.app.add_url_rule('/api/health', 'health', lambda: {'ok': True})
        self.client = self.app.test_client()
        self.env = patch.dict(os.environ, {'COMIC_STORE': '1', 'COMIC_CONSENT_SECRET': 'test-only'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def headers(self, path, body, stamp=None):
        stamp = str(stamp or int(time.time() * 1000))
        nonce = '12345678-1234-1234-1234-123456789012'
        payload = f'{path}\n{stamp}\n{nonce}\n'.encode() + body
        signature = hmac.new(b'test-only', payload, hashlib.sha256).hexdigest()
        return {'X-Comic-Consent-Time': stamp, 'X-Comic-Consent-Nonce': nonce, 'X-Comic-Consent': signature}

    def test_every_generation_route_requires_consent_but_health_does_not(self):
        for path in AI_PATHS:
            self.assertEqual(self.client.post(path, json={}).status_code, 403, path)
        self.assertEqual(self.client.get('/api/health').status_code, 200)

    def test_authorization_is_bound_to_content_route_and_single_use(self):
        path, body = '/api/generate', '{"prompt":"虚构故事"}'.encode()
        headers = self.headers(path, body)
        self.assertEqual(self.client.post(path, data=body+b' ', headers=headers).status_code, 403)
        self.assertEqual(self.client.post('/api/generate-cover', data=body, headers=headers).status_code, 403)
        self.assertEqual(self.client.post(path, data=body, headers=headers).status_code, 200)
        self.assertEqual(self.client.post(path, data=body, headers=headers).status_code, 403)

    def test_expired_and_previous_launch_signatures_are_denied(self):
        path, body = '/api/generate', b'{}'
        headers = self.headers(path, body, int(time.time()*1000)-61000)
        self.assertEqual(self.client.post(path, data=body, headers=headers).status_code, 403)
        headers = self.headers(path, body)
        with patch.dict(os.environ, {'COMIC_CONSENT_SECRET': 'new-launch'}):
            self.assertEqual(self.client.post(path, data=body, headers=headers).status_code, 403)

    def test_web_development_keeps_existing_behavior(self):
        with patch.dict(os.environ, {'COMIC_STORE': '0'}):
            self.assertEqual(self.client.post('/api/generate', json={}).status_code, 200)
