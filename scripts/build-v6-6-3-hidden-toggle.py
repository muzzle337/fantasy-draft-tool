from pathlib import Path

ROOT = Path('.')

# index files
for name in ['index.html','index-v6-5.html']:
    p = ROOT / name
    if not p.exists():
        continue
    s = p.read_text(encoding='utf-8')
    s = s.replace('Jewel City Draft Tool V6.6.2','Jewel City Draft Tool V6.6.3')
    s = s.replace('styles-v6-5.css?v=6.6.2','styles-v6-5.css?v=6.6.3')
    s = s.replace('app-v6-5.js?v=6.6.2','app-v6-5.js?v=6.6.3')
    s = s.replace('Draft Engine v6.6.2','Draft Engine v6.6.3')
    compact = '    <button id="compactViewButton" class="bottom-nav-button compact-toggle-button" type="button" aria-pressed="false" title="Toggle compact view"><span class="nav-icon">▤</span><span>Compact</span></button>\n'
    s = s.replace(compact, '')
    p.write_text(s, encoding='utf-8')

# JS
p = ROOT / 'app-v6-5.js'
s = p.read_text(encoding='utf-8')
s = s.replace('const BUILD_VERSION = "6.6.2-compact-view";', 'const BUILD_VERSION = "6.6.3-hidden-view-toggle";')
s = s.replace('./draft-brain-v6-5.json?v=6.6.2', './draft-brain-v6-5.json?v=6.6.3')
old = "function applyCompactView(){const on=compactViewEnabled();document.body.classList.toggle('compact-view',on);const btn=el('compactViewButton');if(btn){btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',on?'true':'false');}}\nfunction toggleCompactView(){try{localStorage.setItem(COMPACT_VIEW_KEY,compactViewEnabled()?'0':'1');}catch(_){}applyCompactView();window.scrollTo({top:0,behavior:'auto'});}\ndocument.addEventListener('click',event=>{const btn=event.target.closest('#compactViewButton');if(!btn)return;event.preventDefault();event.stopPropagation();toggleCompactView();});\nsetTimeout(applyCompactView,0);"
new = "function applyCompactView(){const on=compactViewEnabled();document.body.classList.toggle('compact-view',on);}\nfunction toggleCompactView(){try{localStorage.setItem(COMPACT_VIEW_KEY,compactViewEnabled()?'0':'1');}catch(_){}applyCompactView();window.scrollTo({top:0,behavior:'auto'});}\ndocument.addEventListener('click',event=>{const mode=event.target.closest('#modeDisplay');if(!mode)return;event.preventDefault();event.stopPropagation();toggleCompactView();});\nsetTimeout(applyCompactView,0);"
if old not in s:
    raise SystemExit('Compact toggle block not found')
s = s.replace(old,new)
p.write_text(s, encoding='utf-8')

# CSS: no functional change required, just keep compact-view rules. Remove any explicit compact button styling if present is optional.

# Service worker cache/query bumps
sw = ROOT / 'service-worker-v6-5.js'
if sw.exists():
    t = sw.read_text(encoding='utf-8')
    t = t.replace('6.6.2','6.6.3')
    t = t.replace('v6-6-2','v6-6-3')
    sw.write_text(t, encoding='utf-8')

print('V6.6.3 hidden single-click view toggle applied')
