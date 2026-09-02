const fs = require('fs');

const appPath = 'app-v6-5.js';
const indexPaths = ['index.html','index-v6-5.html'];
const stylesPath = 'styles-v6-5.css';
const swPath = 'service-worker-v6-5.js';

let app = fs.readFileSync(appPath,'utf8');
app = app.replace(/const BUILD_VERSION = "[^"]+";/, 'const BUILD_VERSION = "6.6.7";');
app = app.replace(/const BRAIN_URL = "\.\/draft-brain-v6-5\.json\?v=[^"]+";/, 'const BRAIN_URL = "./draft-brain-v6-5.json?v=6.6.7";');

const oldListener = "document.addEventListener('click',event=>{const mode=event.target.closest('#modeDisplay');if(!mode)return;event.preventDefault();event.stopPropagation();toggleCompactView();});";
const newListener = `const modeToggleTarget = el('modeBanner');\nif (modeToggleTarget) {\n  modeToggleTarget.addEventListener('pointerup', event => {\n    if (event.target.closest('button')) return;\n    if (!event.target.closest('#modeBanner > div')) return;\n    event.preventDefault();\n    event.stopPropagation();\n    toggleCompactView();\n  });\n}`;
if (!app.includes(oldListener)) throw new Error('Old mode toggle listener not found');
app = app.replace(oldListener,newListener);
fs.writeFileSync(appPath,app);

let styles = fs.readFileSync(stylesPath,'utf8');
const marker = '/* V6.6.7 mode toggle reliability */';
if (!styles.includes(marker)) {
  styles += `\n\n${marker}\n#modeBanner > div{touch-action:manipulation;-webkit-user-select:none;user-select:none;min-height:44px;display:flex;flex-direction:column;justify-content:center;flex:1;}\n`;
}
fs.writeFileSync(stylesPath,styles);

for (const p of indexPaths) {
  if (!fs.existsSync(p)) continue;
  let html = fs.readFileSync(p,'utf8');
  html = html.replace(/styles-v6-5\.css\?v=[^"']+/g,'styles-v6-5.css?v=6.6.7');
  html = html.replace(/app-v6-5\.js\?v=[^"']+/g,'app-v6-5.js?v=6.6.7');
  fs.writeFileSync(p,html);
}

let sw = fs.readFileSync(swPath,'utf8');
sw = sw.replace(/const CACHE_NAME = "[^"]+";/,'const CACHE_NAME = "fantasy-draft-tool-v6-6-7-mode-toggle";');
sw = sw.replace(/styles-v6-5\.css\?v=[^"]+/g,'styles-v6-5.css?v=6.6.7');
sw = sw.replace(/app-v6-5\.js\?v=[^"]+/g,'app-v6-5.js?v=6.6.7');
sw = sw.replace(/draft-brain-v6-5\.json\?v=[^"]+/g,'draft-brain-v6-5.json?v=6.6.7');
fs.writeFileSync(swPath,sw);

console.log('Built V6.6.7 reliable hidden mode toggle');
