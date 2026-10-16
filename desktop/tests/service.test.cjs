const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LocalService } = require('../service.cjs');

test('owned local service stops with the shell and failed readiness leaves no process', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-service-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const success of [true, false]) {
    const service = new LocalService({ executable: process.execPath,
      args: ['-e', `console.log('COMIC_DESKTOP_READY ' + JSON.stringify({url: '${success ? 'comicperfect://app/' : 'https://outside.example'}'}));setInterval(()=>{},1000);`],
      cwd: temp, env: process.env, logPath: path.join(temp, 'service.log'),
    });
    if (success) {
      assert.equal(await service.start(), 'comicperfect://app');
      await service.stop();
      await service.stop();
    } else await assert.rejects(service.start(), /无效地址/);
    assert.ok(service.child.exitCode !== null || service.child.signalCode !== null);
  }
});

test('pipe requests correlate concurrent binary replies and reject pending work on exit', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-pipe-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const script = `console.log('COMIC_DESKTOP_READY {"url":"comicperfect://app/"}');
    require('node:readline').createInterface({input:process.stdin}).on('line', line => {
      const r=JSON.parse(line); if(r.path==='/wait')return;
      setTimeout(()=>console.log('COMIC_DESKTOP_RESPONSE '+JSON.stringify({id:r.id,status:200,
        headers:[['Content-Type','application/octet-stream']],body:r.body})),r.path==='/slow'?30:1);
    });`;
  const service = new LocalService({executable:process.execPath,args:['-e',script],cwd:temp,env:process.env,logPath:path.join(temp,'log')});
  await service.start();
  const [a,b] = await Promise.all(['/slow','/fast'].map((p,i)=>service.request(new Request('comicperfect://app'+p,{method:'POST',body:Buffer.from([0,255,i])}))));
  assert.deepEqual(Buffer.from(await a.arrayBuffer()),Buffer.from([0,255,0]));
  assert.deepEqual(Buffer.from(await b.arrayBuffer()),Buffer.from([0,255,1]));
  await assert.rejects(service.request(new Request('comicperfect://evil/')),/Invalid desktop URL/);
  const pending=service.request(new Request('comicperfect://app/wait'));
  const rejected=assert.rejects(pending,/已停止/);
  await new Promise(resolve=>setTimeout(resolve,5));
  await service.stop(); await rejected;
});
