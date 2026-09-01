const fs=require('fs');
const appPath='app-v6-5.js';
const htmlFiles=['index.html','index-v6-5.html'];
const cssPath='styles-v6-5.css';
const swPath='service-worker-v6-5.js';
let app=fs.readFileSync(appPath,'utf8');
app=app.replace(/const BUILD_VERSION = "[^"]+";/,'const BUILD_VERSION = "6.6.1-room-intel-debug";');
app=app.replace(/const BRAIN_URL = "\.\/draft-brain-v6-5\.json\?v=[^"]+";/,'const BRAIN_URL = "./draft-brain-v6-5.json?v=6.6.1";');
const marker='// === V6.6.1 ROOM INTEL TRANSPARENCY ===';
if(!app.includes(marker)){
app+=`\n\n${marker}\n
function roomNeedSummaryForTeam(slot,state=currentState()) {
  return ['QB','RB','WR','TE','K','DEF'].filter(pos=>teamNeedsPosition(slot,pos,state));
}
function whyNowText(player,state=currentState()) {
  const r=survivalRiskInfo(player,state);
  const bits=[];
  bits.push('Survival '+r.level);
  if(r.teams>0) bits.push(r.demand+' of '+r.teams+' teams need '+player.position);
  if(r.tier!=null) bits.push(r.tier+' left in tier');
  if(r.run>=3) bits.push(r.run+' '+player.position+' in last 7');
  if(r.cliffGap>=10) bits.push('cliff +'+r.cliffGap+' ranks');
  return bits.join(' · ');
}
function renderWhyNow() {
  const state=currentState();
  document.querySelectorAll('#recommendationPanel .recommendation-row').forEach(row=>{
    row.querySelector('.why-now-line')?.remove();
    const pick=row.querySelector('[data-my-pick-direct]');
    if(!pick) return;
    const player=getPlayer(pick.dataset.myPickDirect);
    if(!player) return;
    const line=document.createElement('div');
    const risk=survivalRiskInfo(player,state);
    line.className='why-now-line risk-'+String(risk.level||'low').toLowerCase();
    line.innerHTML='<strong>Why Now:</strong> '+whyNowText(player,state);
    const details=row.querySelector('.recommendation-details');
    if(details) details.insertAdjacentElement('afterend',line);
    else row.prepend(line);
  });
}
function renderDraftRoomDebug() {
  const host=el('draftRoomDebugContent');
  if(!host) return;
  const state=currentState();
  const pick=currentOverallPick(state);
  const currentSlot=teamSlotForOverallPick(pick);
  const needs=roomNeedSummaryForTeam(currentSlot,state);
  const next=nextMyPick(state);
  const topRun=['RB','WR','TE','QB'].map(pos=>({pos,count:recentPositionRun(pos,state)})).sort((a,b)=>b.count-a.count)[0];
  const topRec=isMyTurn(state)?recommendationCandidatePool(state).map(p=>({p,score:recommendationScore(p,state)})).sort((a,b)=>b.score-a.score||a.p.overallRank-b.p.overallRank)[0]?.p:null;
  const lastMock=[...enrichedHistory(state)].reverse().find(x=>x.simulated&&x.mockWhy);
  host.innerHTML=
    '<div class="intel-debug-grid">'+
      '<div><span>Current pick</span><strong>#'+pick+' · Team '+currentSlot+'</strong></div>'+
      '<div><span>Team needs</span><strong>'+(needs.join(' / ')||'No urgent starter need')+'</strong></div>'+
      '<div><span>Your next pick</span><strong>'+(next||'—')+'</strong></div>'+
      '<div><span>Recent run</span><strong>'+topRun.pos+' ×'+topRun.count+' / last 7</strong></div>'+
    '</div>'+
    (topRec?'<div class="intel-debug-callout"><span>Top recommendation</span><strong>'+topRec.name+'</strong><small>'+whyNowText(topRec,state)+'</small></div>':'')+
    (lastMock?'<div class="intel-debug-callout"><span>Last simulated pick</span><strong>Team '+lastMock.teamSlot+' → '+(lastMock.player?.name||'Unknown')+'</strong><small>'+lastMock.mockWhy+'</small></div>':'<p class="muted intel-debug-empty">Run a mock simulation to see the last simulated decision here.</p>');
}
function simulateToMyPick(){
  const state=currentState();if(activeMode()!=='mock'||!state.draftSlot)return;
  let safety=0;
  while(safety<300){
    const nextMine=nextMyPick(state);if(nextMine===null||currentOverallPick(state)>=nextMine)break;
    const overallPick=currentOverallPick(state),teamSlot=teamSlotForOverallPick(overallPick);
    const beforeNeeds=roomNeedSummaryForTeam(teamSlot,state);
    const player=realisticMockCandidate(state);if(!player)break;
    const run=recentPositionRun(player.position,state);
    const matched=beforeNeeds.includes(player.position);
    const market=yahooAdpAvailable(player)?'Yahoo '+player.yahooAdp:'Our #'+player.overallRank;
    const mockWhy=(matched?'Matched team '+player.position+' need':'Best market/tier fit')+(run>=3?' · '+player.position+' run ×'+run:'')+' · '+market;
    state.draftedByOthers.push(player.id);
    state.history.push({type:'draftedByOther',playerId:player.id,recordedAt:new Date().toISOString(),simulated:true,teamSlot,overallPick,mockWhy});
    safety++;
  }
  saveState('mock');renderAll();renderDraftRoom();renderWhyNow();renderDraftRoomDebug();
}
const originalRenderAllV661=renderAll;
renderAll=function(){originalRenderAllV661();renderWhyNow();renderDraftRoomDebug();};
setTimeout(()=>{renderWhyNow();renderDraftRoomDebug();},500);
`;
}
fs.writeFileSync(appPath,app);
for(const f of htmlFiles){let h=fs.readFileSync(f,'utf8');
  h=h.replace(/Draft Engine v6\.5\.2/g,'Draft Engine v6.6.1');
  h=h.replace(/app-v6-5\.js\?v=[^"]+/,'app-v6-5.js?v=6.6.1');
  h=h.replace(/styles-v6-5\.css\?v=[^"]+/,'styles-v6-5.css?v=6.6.1');
  if(!h.includes('draftRoomDebugContent')){
    const anchor='<section class="card tools-card">';
    const card=`<section id="draftRoomDebugCard" class="card room-intel-debug-card">\n        <div class="section-heading"><div><p class="eyebrow">Verification</p><h2>Draft Room Debug</h2></div><span class="section-note">Live logic</span></div>\n        <div id="draftRoomDebugContent"><p class="muted">Waiting for draft state...</p></div>\n      </section>\n\n      `;
    const pos=h.indexOf(anchor,h.indexOf('id="toolsView"'));
    if(pos<0) throw new Error('Tools insertion anchor missing in '+f);
    h=h.slice(0,pos)+card+h.slice(pos);
  }
  fs.writeFileSync(f,h);
}
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('/* V6.6.1 room intel transparency */')) css+=`\n/* V6.6.1 room intel transparency */\n.why-now-line{margin:0 12px 10px;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.035);font-size:12px;line-height:1.35}.why-now-line strong{font-weight:800}.why-now-line.risk-high{border-left:4px solid currentColor;font-weight:650}.why-now-line.risk-medium{border-left:3px solid currentColor}.room-intel-debug-card{margin-bottom:14px}.intel-debug-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.intel-debug-grid>div,.intel-debug-callout{padding:10px;border-radius:12px;background:rgba(0,0,0,.035)}.intel-debug-grid span,.intel-debug-callout span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.62;margin-bottom:3px}.intel-debug-grid strong,.intel-debug-callout strong{display:block;font-size:13px}.intel-debug-callout{margin-top:8px}.intel-debug-callout small{display:block;margin-top:4px;line-height:1.35;opacity:.78}.intel-debug-empty{margin:10px 0 0}\n`;
fs.writeFileSync(cssPath,css);
let sw=fs.readFileSync(swPath,'utf8');
sw=sw.replace(/const CACHE_NAME = "[^"]+";/,'const CACHE_NAME = "fantasy-draft-tool-v6-6-1-room-intel-debug";');
sw=sw.replaceAll(/app-v6-5\.js\?v=[^"'\n]+/g,'app-v6-5.js?v=6.6.1');
sw=sw.replaceAll(/styles-v6-5\.css\?v=[^"'\n]+/g,'styles-v6-5.css?v=6.6.1');
sw=sw.replaceAll(/draft-brain-v6-5\.json\?v=[^"'\n]+/g,'draft-brain-v6-5.json?v=6.6.1');
fs.writeFileSync(swPath,sw);
console.log('V6.6.1 transparency build applied');