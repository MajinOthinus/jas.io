(() => {
  const $ = id => document.getElementById(id);
  const money = v => Number.isFinite(v) ? v.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}) : '—';
  const number = v => Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—';
  const pct = (a,b) => b ? `${(100*a/b).toFixed(1)}%` : '—';
  const median = values => { const a=values.filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return null; const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; };
  const stats = values => {const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return {n:a.length,low:a.length?a[0]:null,median:median(a),high:a.length?a[a.length-1]:null};};
  function set(id,value){const el=$(id);if(el)el.textContent=value;}
  function setStats(prefix, values, formatter=number){const s=stats(values);set(prefix+'Low',formatter(s.low));set(prefix+'Median',formatter(s.median));set(prefix+'High',formatter(s.high));return s;}
  function distribution(id, values, formatter=v=>String(v), maxItems=8){
    const el=$(id);if(!el)return; const usable=values.filter(v=>v!==null&&v!==undefined&&Number.isFinite(v));
    if(!usable.length){el.innerHTML='<div class="snapshot-empty">No usable data</div>';return;}
    const counts=new Map();usable.forEach(v=>counts.set(v,(counts.get(v)||0)+1));
    const entries=[...counts.entries()].sort((a,b)=>a[0]-b[0]);
    let shown=entries;
    if(entries.length>maxItems){const common=[...entries].sort((a,b)=>b[1]-a[1]).slice(0,maxItems-1);const keys=new Set(common.map(x=>x[0]));const other=entries.filter(x=>!keys.has(x[0])).reduce((n,x)=>n+x[1],0);shown=[...common.sort((a,b)=>a[0]-b[0]),['Other',other]];}
    el.innerHTML=shown.map(([v,n])=>`<div class="snapshot-dist-row"><span>${formatter(v)}</span><div class="snapshot-dist-track"><i style="width:${Math.max(2,100*n/usable.length)}%"></i></div><strong>${n} <small>(${pct(n,usable.length)})</small></strong></div>`).join('')+`<div class="snapshot-subtext">${usable.length} records with known values</div>`;
  }
  function render(){
    const d=window.currentDataset;if(!d||!Array.isArray(d.rawRecords)){set('snapshotStatus','Load an MLS CSV to calculate the market snapshot.');return;}
    const all=d.rawRecords; const dateInput=$('snapshotEffectiveDate');
    const effective=dateInput&&dateInput.value?new Date(dateInput.value+'T23:59:59'):new Date();
    const lookback=$('snapshotLookback')?.value||'12';
    const cutoff=lookback==='all'?null:new Date(effective);if(cutoff)cutoff.setMonth(cutoff.getMonth()-Number(lookback));
    // Current export status is treated as current inventory; date fields only constrain the selected closed-sale lookback.
    const active=all.filter(r=>r.statusGroup==='active');
    const pending=all.filter(r=>r.statusGroup==='pending');
    const closed=all.filter(r=>r.statusGroup==='closed'&&r.closeDate&&r.closeDate<=effective&&(!cutoff||r.closeDate>=cutoff)&&r.price!==null&&r.price>0);
    // Full-period DOM is independent of the selected closed-sale price lookback.
    // Invalid/negative DOM values are excluded; sales remain eligible for price statistics.
    const fullPeriodClosed=all.filter(r=>r.statusGroup==='closed'&&r.closeDate&&r.closeDate<=effective&&r.price!==null&&r.price>0);
    const fullPeriodDOM=median(fullPeriodClosed.map(r=>r.dom).filter(v=>Number.isFinite(v)&&v>=0));
    const a=stats(active.map(r=>r.listPrice).filter(v=>v!==null&&v>0));
    const p=stats(pending.map(r=>(r.listPrice!==null&&r.listPrice>0)?r.listPrice:null).filter(v=>v!==null));
    const c=stats(closed.map(r=>r.price));
    set('snapActiveCount',number(active.length));set('snapActiveLow',money(a.low));set('snapActiveMedian',money(a.median));set('snapActiveHigh',money(a.high));
    set('snapPendingCount',number(pending.length));set('snapPendingLow',money(p.low));set('snapPendingMedian',money(p.median));set('snapPendingHigh',money(p.high));
    set('snapClosedCount',number(closed.length));set('snapClosedLow',money(c.low));set('snapClosedMedian',money(c.median));set('snapClosedHigh',money(c.high));
    set('snapFullMedianDOM',fullPeriodDOM===null?'—':`${number(fullPeriodDOM)} days`);
    const gla=all.map(r=>r.gla).filter(v=>v!==null&&v>0), years=all.map(r=>r.yearBuilt).filter(v=>v!==null&&v>1700&&v<=new Date().getFullYear()+1);
    const gs=setStats('snapGla',gla);set('snapGlaN',`${number(gs.n)} records with usable living area`);
    const ys=setStats('snapYear',years);set('snapYearN',`${number(ys.n)} records with usable year built`);
    distribution('snapBedrooms',all.map(r=>r.bedrooms).filter(v=>v!==null&&v>=0),v=>`${v} bed`);
    distribution('snapBathrooms',all.map(r=>r.bathrooms).filter(v=>v!==null&&v>=0),v=>`${v} bath`);
    distribution('snapGarage',all.map(r=>r.garageSpaces).filter(v=>v!==null&&v>=0),v=>`${v} car`);
    const pools=all.filter(r=>r.poolKnown);const poolCount=pools.filter(r=>r.poolYes).length;
    set('snapPoolCount',number(poolCount));set('snapPoolPct',pct(poolCount,pools.length));set('snapPoolN',`${number(pools.length)} records with known pool status; ${number(all.length-pools.length)} unknown`);
    set('snapshotStatus',`Effective date: ${effective.toLocaleDateString('en-US')}. Active and pending counts reflect the statuses in the current CSV export. Closed sales include transactions with a valid close date and sale price within the selected lookback period.`);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const date=$('snapshotEffectiveDate');if(date){date.value=new Date().toISOString().slice(0,10);date.addEventListener('change',render);}
    $('snapshotLookback')?.addEventListener('change',render);
  });
  window.renderSnapshotAnalysis=render;
})();
