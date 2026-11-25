// Fill the website download page from a verified public release only. The
// pages under docs/app-store/site are the source; the site copy is a build
// artifact that still has to be deployed by the site owner.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'docs/app-store/site');
const output = path.join(os.homedir(), 'Library/Caches/ComicPerfect/direct');
const destination = process.env.COMIC_SITE_DIST || path.join(os.homedir(), 'Library/Caches/ComicPerfect/support-site/dist/comicperfect');

const publicFile = path.join(output, 'public-verification.json');
if (!fs.existsSync(publicFile)) throw new Error('Publish the release and verify its public download before enabling the download button.');
const release = JSON.parse(fs.readFileSync(path.join(output, 'release.json'), 'utf8'));
const verified = JSON.parse(fs.readFileSync(publicFile, 'utf8'));
if (release.ready !== true || !/^[a-f0-9]{64}$/.test(release.sha256) || verified.sha256 !== release.sha256)
  throw new Error('Publish the release and verify its public download before enabling the download button.');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const chip = release.arch === 'arm64' ? 'Apple Silicon' : escape(release.arch);
const slot = [
  `<a id="download" href="${escape(verified.url)}">下载 Mac 版 · ${chip}</a>`,
  `<p id="details">版本 ${escape(release.version)} · macOS ${escape(release.minimumSystemVersion)} 或更新版本 · 约 ${Math.ceil(release.size / 1e6)} MB</p>`,
  `<p id="checksum">SHA-256<br><code>${escape(release.sha256)}</code></p>`,
].join('\n');
fs.mkdirSync(destination, { recursive: true });
for (const name of ['download', 'index', 'support', 'privacy']) {
  const page = fs.readFileSync(path.join(source, `${name}.html`), 'utf8');
  fs.writeFileSync(path.join(destination, `${name}.html`), name === 'download' ? page.replace('<!-- RELEASE_SLOT -->', slot) : page);
}
console.log(`Download page for ${release.version} written to ${destination}. It is live only after the site is deployed.`);
