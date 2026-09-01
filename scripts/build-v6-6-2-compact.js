const fs = require('fs');

const appPath = 'app-v6-5.js';
const htmlFiles = ['index.html', 'index-v6-5.html'];
const cssPath = 'styles-v6-5.css';
const swPath = 'service-worker-v6-5.js';

let app = fs.readFileSync(appPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

app = app.replace(/const BUILD_VERSION = "[^"]+";/, 'const BUILD_VERSION = "6.6.2-compact-view";');
app = app.replace(/const BRAIN_URL = "\.\/draft-brain-v6-5\.json\?v=[^"]+";/, 'const BRAIN_URL = "./draft-brain-v6-5.json?v=6.6.2";');

const jsMarker = '// === V6.6.2 COMPACT VIEW ===';
if (!app.includes(jsMarker)) {
  app += `\n\n${jsMarker}\nconst COMPACT_VIEW_KEY = 'fantasyDraftCompactViewV1';\nfunction compactViewEnabled(){try{return localStorage.getItem(COMPACT_VIEW_KEY)==='1';}catch(_){return false;}}\nfunction applyCompactView(){const on=compactViewEnabled();document.body.classList.toggle('compact-view',on);const btn=el('compactViewButton');if(btn){btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',on?'true':'false');}}\nfunction toggleCompactView(){try{localStorage.setItem(COMPACT_VIEW_KEY,compactViewEnabled()?'0':'1');}catch(_){}applyCompactView();window.scrollTo({top:0,behavior:'auto'});}\ndocument.addEventListener('click',event=>{const btn=event.target.closest('#compactViewButton');if(!btn)return;event.preventDefault();event.stopPropagation();toggleCompactView();});\nsetTimeout(applyCompactView,0);\n`;
}

const cssMarker = '/* === V6.6.2 COMPACT VIEW === */';
if (!css.includes(cssMarker)) {
  css += `\n\n${cssMarker}\n.bottom-nav{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;}\n#compactViewButton.active{background:#151515;color:#fff;}\nbody.compact-view .recommendation-card,\nbody.compact-view #focusCard,\nbody.compact-view #cliffCard,\nbody.compact-view #bestAvailableCard,\nbody.compact-view .needs-card,\nbody.compact-view #draftRoomDebugCard{display:none!important;}\nbody.compact-view .player-thesis,\nbody.compact-view .recommendation-thesis,\nbody.compact-view .recommendation-reason,\nbody.compact-view .injury-line,\nbody.compact-view .player-tags,\nbody.compact-view .player-price,\nbody.compact-view .why-now-strip,\nbody.compact-view .room-intel-strip,\nbody.compact-view .room-intel-debug,\nbody.compact-view .detail-grid,\nbody.compact-view .note-box{display:none!important;}\nbody.compact-view .player-card{padding:0;}\nbody.compact-view .player-details-button{padding:10px 12px;}\nbody.compact-view .player-card-top{margin-bottom:0;}\nbody.compact-view .player-meta{margin-top:2px;}\nbody.compact-view .player-quick-actions{border-top:1px solid var(--border);}\nbody.compact-view #playerModal .modal-copy,\nbody.compact-view #playerModal .eyebrow{display:none!important;}\n`;
}

for (const file of htmlFiles) {
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<title>Jewel City Draft Tool V[^<]+<\/title>/, '<title>Jewel City Draft Tool V6.6.2</title>');
  html = html.replace(/styles-v6-5\.css\?v=[^"']+/, 'styles-v6-5.css?v=6.6.2');
  html = html.replace(/app-v6-5\.js\?v=[^"']+/, 'app-v6-5.js?v=6.6.2');
  html = html.replace(/Draft Engine v6\.6\.1/g, 'Draft Engine v6.6.2');

  if (!html.includes('id="compactViewButton"')) {
    const toolsButton = '<button class="bottom-nav-button" data-view="toolsView" type="button"><span class="nav-icon">⚙</span><span>Tools</span></button>';
    const compactButton = toolsButton + '\n    <button id="compactViewButton" class="bottom-nav-button compact-toggle-button" type="button" aria-pressed="false" title="Toggle compact view"><span class="nav-icon">▤</span><span>Compact</span></button>';
    if (!html.includes(toolsButton)) throw new Error(`Bottom nav marker not found in ${file}`);
    html = html.replace(toolsButton, compactButton);
  }

  fs.writeFileSync(file, html);
}

fs.writeFileSync(appPath, app);
fs.writeFileSync(cssPath, css);

if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/fantasy-draft-tool-v[^"'`\s]+/g, 'fantasy-draft-tool-v6-6-2-compact-view');
  sw = sw.replace(/app-v6-5\.js\?v=[^"']+/g, 'app-v6-5.js?v=6.6.2');
  sw = sw.replace(/styles-v6-5\.css\?v=[^"']+/g, 'styles-v6-5.css?v=6.6.2');
  sw = sw.replace(/draft-brain-v6-5\.json\?v=[^"']+/g, 'draft-brain-v6-5.json?v=6.6.2');
  fs.writeFileSync(swPath, sw);
}

if (!fs.readFileSync(appPath,'utf8').includes('6.6.2-compact-view')) throw new Error('Build version update failed');
if (!fs.readFileSync('index.html','utf8').includes('compactViewButton')) throw new Error('Compact button missing');
if (!fs.readFileSync(cssPath,'utf8').includes('body.compact-view .recommendation-card')) throw new Error('Compact CSS missing');

console.log('V6.6.2 compact view build complete');
