const fs = require('fs');

const appPath = 'app-v6-5.js';
const indexPath = 'index.html';
const legacyIndexPath = 'index-v6-5.html';
const swPath = 'service-worker-v6-5.js';

let app = fs.readFileSync(appPath, 'utf8');
app = app.replace(/const BUILD_VERSION = "[^"]+";/, 'const BUILD_VERSION = "6.6.6";');
app = app.replace(/const BRAIN_URL = "\.\/draft-brain-v6-5\.json\?v=[^"]+";/, 'const BRAIN_URL = "./draft-brain-v6-5.json?v=6.6.6";');

const oldFn = `function setEngineStatus(kind, message) {\n  const status = el("engineStatus");\n  if (!status) return;\n  status.className = \`engine-status \${kind}\`;\n  status.textContent = message;\n}`;
const newFn = `function setEngineStatus(kind, message) {\n  const status = el("engineStatus");\n  if (!status) return;\n  status.className = \`engine-status \${kind}\`;\n  const publicVersion = String(BUILD_VERSION).match(/^\\d+(?:\\.\\d+)+/)?.[0] || BUILD_VERSION;\n  status.textContent = kind === "ready" ? \`Engine Ready · v\${publicVersion}\` : message;\n}`;
if (!app.includes(oldFn)) throw new Error('setEngineStatus function shape not found');
app = app.replace(oldFn, newFn);
fs.writeFileSync(appPath, app);

for (const p of [indexPath, legacyIndexPath]) {
  if (!fs.existsSync(p)) continue;
  let html = fs.readFileSync(p, 'utf8');
  html = html.replace(/styles-v6-5\.css\?v=[^"']+/g, 'styles-v6-5.css?v=6.6.6');
  html = html.replace(/app-v6-5\.js\?v=[^"']+/g, 'app-v6-5.js?v=6.6.6');
  fs.writeFileSync(p, html);
}

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "fantasy-draft-tool-v6-6-6-public-version";');
sw = sw.replace(/styles-v6-5\.css\?v=[^"]+/g, 'styles-v6-5.css?v=6.6.6');
sw = sw.replace(/app-v6-5\.js\?v=[^"]+/g, 'app-v6-5.js?v=6.6.6');
sw = sw.replace(/draft-brain-v6-5\.json\?v=[^"]+/g, 'draft-brain-v6-5.json?v=6.6.6');
fs.writeFileSync(swPath, sw);

console.log('Built V6.6.6 public version status');
