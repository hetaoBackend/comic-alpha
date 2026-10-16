function isAppURL(value, appURL) {
  try {
    const candidate = new URL(value), expected = new URL(appURL);
    if (expected.protocol === 'comicperfect:')
      return candidate.protocol === expected.protocol && candidate.host === 'app' &&
        !candidate.username && !candidate.password && !candidate.port;
    return expected.origin !== 'null' && candidate.origin === expected.origin;
  } catch { return false; }
}

function isExternalURL(value, appURL) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) && !isAppURL(value, appURL); } catch { return false; }
}

function waitForReady(child, timeout = 60000) {
  return new Promise((resolve, reject) => {
    let pending = '';
    const timer = setTimeout(() => finish(new Error('本地服务启动超时，请查看 desktop-service.log。')), timeout);
    function finish(error, url) {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error); else resolve(url);
    }
    function onError() { finish(new Error('无法启动本地服务，请检查运行环境。')); }
    function onExit() { finish(new Error('本地服务启动失败，请查看 desktop-service.log。')); }
    function onData(data) {
      pending += data.toString();
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (!line.startsWith('COMIC_DESKTOP_READY ')) continue;
        try {
          const url = new URL(JSON.parse(line.slice('COMIC_DESKTOP_READY '.length)).url);
          if (url.href !== 'comicperfect://app/') throw new Error();
          finish(null, 'comicperfect://app');
        } catch { finish(new Error('本地服务返回了无效地址。')); }
        return;
      }
      if (pending.length > 65536) finish(new Error('本地服务启动输出异常。'));
    }
    child.stdout.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

module.exports = { waitForReady, isAppURL, isExternalURL };
