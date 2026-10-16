const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SecretStore, installSecretIPC } = require('../secrets.cjs');
test('credential IPC replies once after saving and denies Codex token access', () => {
  let handler, saved;
  installSecretIPC({ on(_channel, callback) { handler = callback; } },
    { set(key, value) { saved = [key, value]; }, get() { return 'test-only'; } }, event => event.trusted);
  const replies = [];
  const event = { trusted: true, set returnValue(value) { replies.push(value); } };
  handler(event, 'set', 'comic_api_key', 'test-only');
  assert.deepEqual(replies, [{ ok: true }]);
  assert.deepEqual(saved, ['comic_api_key', 'test-only']);
  handler(event, 'get', 'codex_auth');
  assert.deepEqual(replies[1], { ok: false });
  event.trusted = false;
  handler(event, 'get', 'comic_api_key');
  assert.deepEqual(replies[2], { ok: false });
});
test('keychain failure never overwrites encrypted credentials with plaintext', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-secrets-'));
  const filename = path.join(folder, 'encrypted');
  const existing = Buffer.from('existing encrypted envelope');
  fs.writeFileSync(filename, existing);
  const store = new SecretStore(filename, { isEncryptionAvailable: () => false });
  try {
    assert.throws(() => store.set('comic_api_key', 'test-only'), /钥匙串不可用/);
    assert.deepEqual(fs.readFileSync(filename), existing);
    assert.equal(fs.existsSync(filename + '.tmp'), false);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
test('corrupted encrypted storage fails closed rather than losing other keys', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-secrets-'));
  const filename = path.join(folder, 'encrypted');
  fs.writeFileSync(filename, 'corrupt');
  const store = new SecretStore(filename, { isEncryptionAvailable: () => true,
    decryptString() { throw new Error('cannot decrypt'); } });
  try {
    assert.throws(() => store.set('comic_api_key', 'test-only'), /cannot decrypt/);
    assert.equal(fs.readFileSync(filename, 'utf8'), 'corrupt');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
