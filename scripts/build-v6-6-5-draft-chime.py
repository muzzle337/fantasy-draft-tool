from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path('.')
APP = ROOT / 'app-v6-5.js'
INDEXES = [ROOT / 'index.html', ROOT / 'index-v6-5.html']
SW = ROOT / 'service-worker-v6-5.js'
AUDIO = ROOT / 'assets' / 'nfl-draft-chime.mp3'

app = APP.read_text(encoding='utf-8')
app = app.replace('const BUILD_VERSION = "6.6.4-clean-status";', 'const BUILD_VERSION = "6.6.5-draft-chime";')
app = app.replace('const BRAIN_URL = "./draft-brain-v6-5.json?v=6.6.4";', 'const BRAIN_URL = "./draft-brain-v6-5.json?v=6.6.5";')
app = app.replace('setEngineStatus("ready",`Engine Ready v${BUILD_VERSION}`);', 'setEngineStatus("ready","Engine Ready");')

marker = '// === V6.6.5 DRAFT CHIME ==='
if marker not in app:
    app += r'''

// === V6.6.5 DRAFT CHIME ===
const DRAFT_CHIME_URL = './assets/nfl-draft-chime.mp3';
let draftChimeAudio = null;
function playDraftChime() {
  try {
    if (!draftChimeAudio) {
      draftChimeAudio = new Audio(DRAFT_CHIME_URL);
      draftChimeAudio.preload = 'auto';
      draftChimeAudio.volume = 1;
    }
    draftChimeAudio.pause();
    draftChimeAudio.currentTime = 0;
    const playPromise = draftChimeAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
  } catch (_) {}
}
const recordActionBeforeDraftChime = recordAction;
recordAction = function(type, playerId, options = {}) {
  const before = currentState().history.length;
  const result = recordActionBeforeDraftChime(type, playerId, options);
  const recorded = currentState().history.length > before;
  if (recorded && (type === 'draftedByOther' || type === 'myPick')) playDraftChime();
  return result;
};
'''
APP.write_text(app, encoding='utf-8')

for path in INDEXES:
    text = path.read_text(encoding='utf-8')
    text = text.replace('V6.6.4', 'V6.6.5')
    text = text.replace('styles-v6-5.css?v=6.6.4', 'styles-v6-5.css?v=6.6.5')
    text = text.replace('app-v6-5.js?v=6.6.4', 'app-v6-5.js?v=6.6.5')
    path.write_text(text, encoding='utf-8')

sw = SW.read_text(encoding='utf-8')
sw = sw.replace('fantasy-draft-tool-v6-6-4-clean-status', 'fantasy-draft-tool-v6-6-5-draft-chime')
sw = sw.replace('styles-v6-5.css?v=6.6.4', 'styles-v6-5.css?v=6.6.5')
sw = sw.replace('app-v6-5.js?v=6.6.4', 'app-v6-5.js?v=6.6.5')
sw = sw.replace('draft-brain-v6-5.json?v=6.6.4', 'draft-brain-v6-5.json?v=6.6.5')
if '"./assets/nfl-draft-chime.mp3"' not in sw:
    sw = sw.replace('  "./manifest.json"\n];', '  "./manifest.json",\n  "./assets/nfl-draft-chime.mp3"\n];')
SW.write_text(sw, encoding='utf-8')

AUDIO.parent.mkdir(parents=True, exist_ok=True)
req = Request('https://www.myinstants.com/media/sounds/nfl-draft-chime.mp3', headers={'User-Agent': 'Mozilla/5.0'})
with urlopen(req, timeout=30) as response:
    data = response.read()
if len(data) < 1000:
    raise RuntimeError(f'Draft chime download too small: {len(data)} bytes')
AUDIO.write_bytes(data)

print(f'Wrote draft chime: {len(data)} bytes')
print('V6.6.5 draft chime build complete')
