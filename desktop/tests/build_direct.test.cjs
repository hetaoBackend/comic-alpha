const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compareVersions, lowestSystemVersion } = require('../build_direct.cjs');

test('compares dotted macOS versions numerically', () => {
  assert.ok(compareVersions('15.0', '13.0') > 0);
  assert.ok(compareVersions('11.0', '15.0') < 0);
  assert.ok(compareVersions('10.15', '10.9') > 0);
  assert.equal(compareVersions('15.0', '15.0.0'), 0);
});

test('reads the lowest macOS of native binaries and ignores other files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comicperfect-minos-'));
  try {
    fs.copyFileSync('/usr/bin/true', path.join(directory, 'tool'));
    // Linker and source versions must not be mistaken for a system requirement.
    fs.writeFileSync(path.join(directory, 'notes.txt'), 'version 1230.1 minos 99.0');
    assert.match(lowestSystemVersion(directory), /^\d+\.\d+$/);
    assert.ok(compareVersions(lowestSystemVersion(directory), '30.0') < 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('refuses a runtime without any versioned native binary', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comicperfect-minos-'));
  try {
    fs.writeFileSync(path.join(directory, 'app.py'), 'print(1)');
    assert.throws(() => lowestSystemVersion(directory), /No native build version/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
