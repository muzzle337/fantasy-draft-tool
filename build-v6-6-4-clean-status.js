const fs = require('fs');

const appPath = 'app-v6-5.js';
const indexPath = 'index.html';
const altIndexPath = 'index-v6-5.html';
const swPath = 'service-worker-v6-5.js';

let app = fs.readFileSync(appPath, 'utf8');
app = app.replace('const BUILD_VERSION = "6.6.3-hidden-view-toggle";', 'const BUILD_VERSION = "6.6.4-clean-status";');
app = app.replace('const BRAIN_URL = "./draft-brain-v6-5.json?v=6.6.3";', 'const BRAIN_URL = "./draft-brain-v6-5.json?v=6.6.4";');
app = app.replace('setEngineStatus("loading",`Engine loading v${BUILD_VERSION}…`);', 'setEngineStatus("loading","Engine loading…");');
app = app.replace('setEngineStatus("ready",`Engine Ready v${BUILD_VERSION}`);', 'setEngineStatus("ready","Engine Ready");');
fs.writeFileSync(appPath, app);

for (const path of [indexPath, altIndexPath]) {
  if (!fs.existsSync(path)) continue;
  let html = fs.readFileSync(path, 'utf8');
  html = html.replace(/Jewel City Draft Tool V6\.6(?:\.\d+)?/g, 'Jewel City Draft Tool');
  html = html.replace(/Draft Engine v6\.6\.\d+/g, 'Draft Engine');
  html = html.replace(/styles-v6-5\.css\?v=6\.6\.\d+/g, 'styles-v6-5.css?v=6.6.4');
  html = html.replace(/app-v6-5\.js\?v=6\.6\.\d+/g, 'app-v6-5.js?v=6.6.4');
  fs.writeFileSync(path, html);
}

if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/fantasy-draft-tool-v6-6-[^'"\s]+/g, 'fantasy-draft-tool-v6-6-4-clean-status');
  sw = sw.replace(/app-v6-5\.js\?v=6\.6\.\d+/g, 'app-v6-5.js?v=6.6.4');
  sw = sw.replace(/styles-v6-5\.css\?v=6\.6\.\d+/g, 'styles-v6-5.css?v=6.6.4');
  sw = sw.replace(/draft-brain-v6-5\.json\?v=6\.6\.\d+/g, 'draft-brain-v6-5.json?v=6.6.4');
  fs.writeFileSync(swPath, sw);
}

const checks = [
  ['visible ready status', app.includes('setEngineStatus("ready","Engine Ready");')],
  ['no hidden-view label in visible ready status', !app.includes('Engine Ready v${BUILD_VERSION}')],
  ['hidden toggle retained', app.includes("event.target.closest('#modeDisplay')")],
  ['three-button nav retained', fs.readFileSync(indexPath,'utf8').match(/bottom-nav-button/g)?.length >= 3]
];
for (const [name, ok] of checks) {
  if (!ok) throw new Error('Check failed: ' + name);
}
console.log('V6.6.4 clean status checks passed');
