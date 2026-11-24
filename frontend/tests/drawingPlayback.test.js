const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runtime(saved) {
  const values = new Map(saved ? [['comic_ai_config', JSON.stringify(saved)]] : []);
  const ctx = vm.createContext({
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    document: { getElementById: () => null },
    console: { warn() {}, error() {} },
    ConsoleAPI: { imageURL: url => `http://localhost:5003${url}` },
  });
  for (const name of ['config', 'app'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${name}.js`), 'utf8'), ctx);
  return { ctx, config: ctx.window.ConfigManager, controller: vm.runInContext('UIController.prototype', ctx) };
}

test('fractional frame targets advance across strokes without stalling', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/drawingPlayback.js'), 'utf8');
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(source.replace('window.DrawingPlayback = { play };', 'window.DrawingPlayback = { painter };'), ctx);
  const ends = [];
  const canvas = {
    beginPath() {},
    moveTo() {},
    lineTo(x) { this.end = x; },
    stroke() {
      assert.ok(ends.length < 170, 'the painter must not repeat a stroke indefinitely');
      ends.push(this.end);
    },
  };
  const paths = Array.from({ length: 168 }, (_, index) =>
    Array.from({ length: index === 167 ? 216 : 240 }, (_, x) => [x, index]));
  const draw = ctx.window.DrawingPlayback.painter(canvas, paths, 1, 1);

  draw((1000 / 30) / 60000 / .45);
  draw((1000 / 15) / 60000 / .45);
  assert.equal(ends.length, 2);
  assert.ok(ends[1] > ends[0]);
  assert.deepEqual(Array.from(draw(1)), [215, 167]);
  assert.equal(ends.length, 170);
  assert.equal(draw(1), null);
});

test('drawing defaults on for new and existing configurations; explicit opt-out survives reload', () => {
  assert.equal(runtime().config.loadConfig().drawingPlayback, true);
  assert.equal(runtime({ imageQuality: 'high' }).config.loadConfig().drawingPlayback, true);
  const r = runtime({ drawingPlayback: false });
  assert.equal(r.config.loadConfig().drawingPlayback, false);
  r.config.saveConfig(r.config.loadConfig());
  assert.equal(r.config.loadConfig().drawingPlayback, false);
});

test('drawing setting saves a boolean, preserving unrelated configuration', () => {
  const r = runtime({ imageQuality: 'high' });
  r.controller.input.call({}, { target: {
    dataset: { field: 'drawingPlayback' }, type: 'checkbox', checked: false,
    value: 'on', hasAttribute: name => name === 'data-config',
  } });
  assert.equal(r.config.loadConfig().drawingPlayback, false);
  assert.equal(r.config.loadConfig().imageQuality, 'high');
});

test('saved images use resolved URLs; playback failures never turn into generation failures', async () => {
  const r = runtime();
  let received;
  r.ctx.window.DrawingPlayback = { play: async (url, options) => { received = { url, title: options.title }; } };
  const controller = { render() {} };
  await r.controller.playDrawing.call(controller, '/static/images/comic.png', '第 2 页');
  assert.deepEqual(received, { url: 'http://localhost:5003/static/images/comic.png', title: '第 2 页' });
  assert.equal(controller.output, 'comic');
  r.ctx.window.DrawingPlayback.play = async () => { throw new Error('canvas unavailable'); };
  await assert.doesNotReject(r.controller.playDrawing.call(controller, '/static/images/comic.png', '封面'));
});

test('disabled playback and reduced motion bypass the overlay entirely', async () => {
  const r = runtime({ drawingPlayback: false });
  r.ctx.window.DrawingPlayback = { play() { assert.fail('playback should not start'); } };
  const controller = { render() { assert.fail('no playback render needed'); } };
  await r.controller.playDrawing.call(controller, '/static/images/comic.png', '漫画');
  r.config.saveConfig({ drawingPlayback: true });
  r.ctx.window.matchMedia = () => ({ matches: true });
  await r.controller.playDrawing.call(controller, '/static/images/comic.png', '漫画');
});
