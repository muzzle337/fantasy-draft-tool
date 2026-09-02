const fs = require('fs');

const appPath = 'app-v6-5.js';
const swPath = 'service-worker-v6-5.js';
const indexes = ['index.html', 'index-v6-5.html'];
const layer = './draft-sep2-edge-intel.json?v=20260902-1';

let app = fs.readFileSync(appPath, 'utf8');
app = app.replace(/const BUILD_VERSION = "[^"]+";/, 'const BUILD_VERSION = "6.6.8";');
app = app.replace(/const BRAIN_URL = "\.\/draft-brain-v6-5\.json\?v=[^"]+";/, 'const BRAIN_URL = "./draft-brain-v6-5.json?v=6.6.8";');
fs.writeFileSync(appPath, app);

for (const path of indexes) {
  if (!fs.existsSync(path)) continue;
  let html = fs.readFileSync(path, 'utf8');
  html = html.replace(/styles-v6-5\.css\?v=[^"']+/g, 'styles-v6-5.css?v=6.6.8');
  html = html.replace(/app-v6-5\.js\?v=[^"']+/g, 'app-v6-5.js?v=6.6.8');
  fs.writeFileSync(path, html);
}

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "fantasy-draft-tool-v6-6-8-sep2-edge-intel";');
sw = sw.replace(/styles-v6-5\.css\?v=[^"]+/g, 'styles-v6-5.css?v=6.6.8');
sw = sw.replace(/app-v6-5\.js\?v=[^"]+/g, 'app-v6-5.js?v=6.6.8');
sw = sw.replace(/draft-brain-v6-5\.json\?v=[^"]+/g, 'draft-brain-v6-5.json?v=6.6.8');

if (!sw.includes(layer)) {
  const appShellNeedle = '  "./manifest.json"';
  if (!sw.includes(appShellNeedle)) throw new Error('APP_SHELL manifest entry not found');
  sw = sw.replace(appShellNeedle, `  "./manifest.json",\n  "${layer}"`);

  const refreshStart = 'const REFRESH_URLS = [';
  const refreshIndex = sw.indexOf(refreshStart);
  if (refreshIndex < 0) throw new Error('REFRESH_URLS not found');
  const firstQuote = sw.indexOf('"', refreshIndex + refreshStart.length);
  if (firstQuote < 0) throw new Error('REFRESH_URLS first entry not found');
  sw = sw.slice(0, firstQuote) + `"${layer}",\n  ` + sw.slice(firstQuote);
}

sw = sw.replace(/base\.version = "[^"]+";/, 'base.version = "1.2.4-sep2-edge-intel";');
sw = sw.replace(/base\.as_of = "[^"]+";/, 'base.as_of = "2026-09-02";');
sw = sw.replace(/base\.latest_intel_refresh = \{[\s\S]*?\n    \};/, `base.latest_intel_refresh = {\n      date: "2026-09-02",\n      type: "DRAFT_DAY_EDGE_INGEST",\n      sources: layers.map((layer) => layer.source),\n      rules: [\n        "Yahoo ADP is unchanged by transcript ECR or mock-draft positions.",\n        "Only actionable role, injury, conviction, price-discipline and conflict signals are retained.",\n        "Rank-review flags do not automatically change our_rank or tier.",\n        "Multi-week camp injuries receive extra caution at premium cost; cheap asymmetric upside remains draftable."\n      ]\n    };`);

fs.writeFileSync(swPath, sw);
console.log('Built V6.6.8 Sep 2 edge intel');
