const test = require('node:test');
const assert = require('node:assert/strict');
const { ScopedAccess } = require('../scoped-access.cjs');
test('restores folder access and releases it only at shutdown', () => {
  let stopped = 0;
  const settings = { value: { bookmarks: { '/ok': 'ok', '/revoked': 'revoked' } } };
  const access = new ScopedAccess({ startAccessingSecurityScopedResource(bookmark) {
    if (bookmark === 'revoked') throw new Error('revoked');
    return () => stopped++;
  } }, settings);
  assert.deepEqual(access.restore(), ['/revoked']);
  assert.equal(stopped, 0);
  access.close(); access.close();
  assert.equal(stopped, 1);
});
test('failed bookmark persistence releases the new grant', () => {
  let stopped = 0;
  const access = new ScopedAccess({ startAccessingSecurityScopedResource: () => () => stopped++ },
    { value: {}, update() { throw new Error('disk full'); } });
  assert.throws(() => access.remember('/folder', 'bookmark'), /disk full/);
  assert.equal(stopped, 1);
  assert.throws(() => access.remember('/folder'), /访问授权/);
});
