const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { waitForReady, isAppURL, isExternalURL } = require('../runtime.cjs');

function child() {
  const process = new EventEmitter();
  process.stdout = new EventEmitter();
  return process;
}

test('waits for a complete readiness line and ignores other output', async () => {
  const service = child();
  const ready = waitForReady(service);
  service.stdout.emit('data', Buffer.from('Starting…\nCOMIC_DESKTOP_'));
  service.stdout.emit('data', Buffer.from('READY {"url":"comicperfect://app/"}\n'));
  assert.equal(await ready, 'comicperfect://app');
  assert.equal(service.listenerCount('exit'), 0);
});

test('rejects a service that exits before readiness', async () => {
  const service = child();
  const ready = waitForReady(service);
  service.emit('exit', 1);
  await assert.rejects(ready, /启动失败/);
});

test('rejects external readiness addresses and startup timeouts', async () => {
  const service = child();
  const ready = waitForReady(service);
  service.stdout.emit('data', Buffer.from('COMIC_DESKTOP_READY {"url":"https://outside.example"}\n'));
  await assert.rejects(ready, /无效地址/);
  await assert.rejects(waitForReady(child(), 5), /超时/);
});

test('navigation stays on the local app and opens only http(s) externally', () => {
  const origin = 'comicperfect://app';
  assert.equal(isAppURL(origin + '/#library', origin), true);
  for (const value of ['file:///etc/passwd', 'javascript:alert(1)', 'comic://run', origin]) {
    assert.equal(isExternalURL(value, origin), false);
  }
  assert.equal(isExternalURL('https://example.com', origin), true);
  assert.equal(isAppURL('http://127.0.0.1:8000', origin), false);
});

 test('opaque and foreign custom origins cannot obtain desktop privileges', () => {
  const origin = 'comicperfect://app';
  for (const value of ['comicperfect://evil/', 'file:///etc/passwd', 'other://app/', 'comicperfect://user@app/', 'comicperfect://app:123/'])
    assert.equal(isAppURL(value, origin), false);
  assert.equal(isAppURL(origin + '/api/health', origin), true);
 });
