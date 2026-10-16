const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { waitForReady } = require('./runtime.cjs');
const { randomUUID } = require('node:crypto');
const MAX_FRAME = 128 * 1024 * 1024;

class LocalService {
  constructor(options, spawnProcess = spawn) {
    this.options = options; this.spawnProcess = spawnProcess; this.pending = new Map();
  }
  async start() {
    const { executable, args, cwd, env, logPath } = this.options;
    if (!fs.existsSync(executable)) throw new Error('本地运行环境缺失。开发模式请先运行 npm run desktop:prepare；安装版请重新安装。');
    const log = fs.openSync(logPath, 'a');
    try {
      this.child = this.spawnProcess(executable, args, { cwd, env, stdio: ['pipe', 'pipe', log] });
    } finally { fs.closeSync(log); }
    this.exited = new Promise(resolve => {
      this.child.once('exit', resolve);
      this.child.once('error', resolve);
    });
    let buffer = '';
    const fail = () => { for (const item of this.pending.values()) item.reject(new Error('本机创作进程已停止')); };
    this.child.once('exit', fail);
    this.child.stdin.on('error', fail);
    this.child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      if (buffer.length > MAX_FRAME) { fail(); this.child.kill('SIGTERM'); return; }
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line.startsWith('COMIC_DESKTOP_RESPONSE ')) continue;
        try {
          const result = JSON.parse(line.slice('COMIC_DESKTOP_RESPONSE '.length));
          const item = this.pending.get(result.id);
          if (!item) continue;
          if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599 ||
              typeof result.body !== 'string' || !Array.isArray(result.headers)) throw new Error();
          item.resolve(result);
        } catch { fail(); }
      }
    });
    try {
      const url = await waitForReady(this.child);
      this.child.stdout.resume();
      return url;
    } catch (error) { await this.stop(); throw error; }
  }
  async request(request) {
    const url = new URL(request.url);
    if (url.protocol !== 'comicperfect:' || url.host !== 'app' || url.username || url.password)
      throw new Error('Invalid desktop URL');
    if (this.pending.size >= 64) throw new Error('Too many desktop requests');
    const body = Buffer.from(await request.arrayBuffer());
    if (body.length > 64 * 1024 * 1024) throw new Error('Desktop request too large');
    const id = randomUUID();
    const result = await new Promise((resolve, reject) => {
      const finish = callback => value => {
        clearTimeout(timer); this.pending.delete(id); callback(value);
      };
      const timer = setTimeout(() => this.pending.get(id)?.reject(new Error('本机创作请求超时')), 15 * 60 * 1000);
      this.pending.set(id, { resolve: finish(resolve), reject: finish(reject) });
      this.child.stdin.write(JSON.stringify({ id, path: url.pathname + url.search, method: request.method,
        headers: [...request.headers], body: body.toString('base64') }) + '\n', error => {
        if (error) this.pending.get(id)?.reject(error);
      });
    });
    const headers = result.headers.filter(([name]) => !['connection', 'transfer-encoding', 'content-length'].includes(name.toLowerCase()));
    return new Response(request.method === 'HEAD' || [204, 205, 304].includes(result.status) ? null : Buffer.from(result.body, 'base64'),
      { status: result.status, headers });
  }
  stop() {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      if (!this.child?.pid || this.child.exitCode !== null || this.child.signalCode !== null) return;
      this.child.kill('SIGTERM');
      const timer = setTimeout(() => this.child.kill('SIGKILL'), 4000);
      try { await this.exited; } finally { clearTimeout(timer); }
    })();
    return this.stopping;
  }
}
module.exports = { LocalService };
