/* GLA Analysis — first implementation
   Uses the shared uploaded dataset and the current sale-price population.
   Ratterman inputs are intentionally manual and transparent.
*/
(function(){
  'use strict';

  const state={
    siteValue:null,
    indicatedValue:null,
    sensitivityPct:5,
    regression:{enabled:true}
  };

  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function closedPopulation(){
    if(typeof window.getGLAAnalysisSales==='function') return window.getGLAAnalysisSales();
    if(Array.isArray(window.__glaSales)) return window.__glaSales.slice();
    return [];
  }
  function num(v){
    const n=Number(String(v??'').replace(/[$,%\s,]/g,''));
    return Number.isFinite(n)?n:null;
  }

  function field(r,names){
    for(const n of names){
      if(r && r[n]!==undefined && r[n]!==null && r[n]!=='') return r[n];
    }
    return null;
  }

  function rowData(r){
    const gla=num(field(r,['gla']));
    const price=num(field(r,['salePrice','sale_price','price','closedPrice','closePrice']));
    const dom=num(field(r,['dom','DOM','daysOnMarket','days_on_market']));
    return {r,gla,price,dom,ppsf:gla&&price?price/gla:null};
  }

  function median(a){
    const x=a.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!x.length)return null;
    const m=Math.floor(x.length/2);
    return x.length%2?x[m]:(x[m-1]+x[m])/2;
  }
  function mean(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((a,b)=>a+b,0)/x.length:null;}
  function stdev(a){
    const x=a.filter(Number.isFinite),m=mean(x);
    return x.length>1?Math.sqrt(x.reduce((s,v)=>s+(v-m)**2,0)/(x.length-1)):null;
  }
  function fmtN(v,d=0){return Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d}):'—';}
  function fmtDollar(v,d=0){return Number.isFinite(v)?v.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:d}):'—';}
  function fmtPct(v,d=1){return Number.isFinite(v)?(v*100).toFixed(d)+'%':'—';}

  function regress(points){
    const p=points.filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y));
    if(p.length<3)return null;
    const mx=mean(p.map(a=>a.x)),my=mean(p.map(a=>a.y));
    const ssx=p.reduce((s,a)=>s+(a.x-mx)**2,0);
    const sxy=p.reduce((s,a)=>s+(a.x-mx)*(a.y-my),0);
    if(!ssx)return null;
    const b=sxy/ssx,a=my-b*mx;
    const sst=p.reduce((s,q)=>s+(q.y-my)**2,0);
    const sse=p.reduce((s,q)=>s+(q.y-(a+b*q.x))**2,0);
    return {a,b,r2:sst?sse>=0?1-sse/sst:null:null,n:p.length};
  }

  function ratterman(pop){
    const sv=state.siteValue,iv=state.indicatedValue;
    if(!(sv>0&&iv>0))return null;
    const siteRatio=sv/iv;
    const improvement=1-siteRatio;
    const glaFactor=improvement/2;
    const comps=pop.map(rowData).filter(x=>x.gla>0&&x.price>0);
    const indications=comps.map(c=>({...c,adj:c.ppsf*glaFactor}));
    return {siteRatio,improvement,glaFactor,comps,indications};
  }

  function render(){
    const pop=closedPopulation(), data=pop.map(rowData);
    const valid=data.filter(x=>x.gla>0&&x.price>0);
    const gla=valid.map(x=>x.gla), prices=valid.map(x=>x.price), ppsf=valid.map(x=>x.ppsf);
    const r=ratterman(pop);
    const reg=regress(valid.map(x=>({x:x.gla,y:x.price})));

    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    set('glaSaleCount',fmtN(valid.length));
    set('glaRange',valid.length?`${fmtN(Math.min(...gla))} – ${fmtN(Math.max(...gla))} SF`:'—');
    set('glaMedian',fmtN(median(gla))+' SF');
    set('glaMean',fmtN(mean(gla))+' SF');
    set('glaPriceRange',valid.length?`${fmtDollar(Math.min(...prices))} – ${fmtDollar(Math.max(...prices))}`:'—');
    set('glaMedianPrice',fmtDollar(median(prices)));
    set('glaMedianPpsf',fmtDollar(median(ppsf),2));
    set('glaMeanPpsf',fmtDollar(mean(ppsf),2));

    set('rSiteRatio',r?fmtPct(r.siteRatio):'—');
    set('rImprovement',r?fmtPct(r.improvement):'—');
    set('rFactor',r?fmtPct(r.glaFactor):'—');
    set('rStatus',r?'Calculated from manual inputs.':'Enter Site Value and Indicated Property Value.');
    const vals=r?.indications.map(x=>x.adj).filter(Number.isFinite)||[];
    set('rIndCount',fmtN(vals.length));
    set('rIndRange',vals.length?`${fmtDollar(Math.min(...vals),2)} – ${fmtDollar(Math.max(...vals),2)}`:'—');
    set('rIndMean',fmtDollar(mean(vals),2));
    set('rIndMedian',fmtDollar(median(vals),2));

    if(reg){
      set('regEquation',`Sale Price = ${fmtDollar(reg.a,0)} + (${fmtDollar(reg.b,2)} × GLA)`);
      set('regR2',fmtN(reg.r2*100,1)+'%');
      set('regN',fmtN(reg.n));
      set('regMarginal',fmtDollar(reg.b,2));
    }else{
      set('regEquation','Insufficient variation/data for regression.');
      set('regR2','—');set('regN',fmtN(valid.length));set('regMarginal','—');
    }

    drawScatter(valid,reg);
  }

  function drawScatter(data,reg){
    const svg=$('#glaScatter');if(!svg)return;
    svg.innerHTML='';
    const W=900,H=420,ml=72,mr=22,mt=22,mb=58;
    const pw=W-ml-mr,ph=H-mt-mb;
    if(!data.length){svg.innerHTML='<text x="450" y="205" text-anchor="middle" fill="#64748b" font-size="14">Load a CSV to display GLA analysis.</text>';return;}
    const xs=data.map(d=>d.gla),ys=data.map(d=>d.price);
    const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
    const xp=v=>ml+(v-xmin)/Math.max(1,xmax-xmin)*pw;
    const yp=v=>mt+(ymax-v)/Math.max(1,ymax-ymin)*ph;
    const NS='http://www.w3.org/2000/svg';
    const add=(tag,a,text)=>{const e=document.createElementNS(NS,tag);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;svg.appendChild(e);return e;};
    for(let i=0;i<=4;i++){
      const yy=mt+ph*i/4, val=ymax-(ymax-ymin)*i/4;
      add('line',{x1:ml,y1:yy,x2:W-mr,y2:yy,stroke:'#e2e8f0'});
      add('text',{x:ml-8,y:yy+4,'text-anchor':'end',fill:'#64748b','font-size':11},fmtDollar(val,0));
      const xx=ml+pw*i/4, xv=xmin+(xmax-xmin)*i/4;
      add('line',{x1:xx,y1:mt,x2:xx,y2:H-mb,stroke:'#f1f5f9'});
      add('text',{x:xx,y:H-mb+20,'text-anchor':'middle',fill:'#64748b','font-size':11},fmtN(xv));
    }
    add('line',{x1:ml,y1:H-mb,x2:W-mr,y2:H-mb,stroke:'#94a3b8'});
    add('line',{x1:ml,y1:mt,x2:ml,y2:H-mb,stroke:'#94a3b8'});
    if(reg){
      const y1=reg.a+reg.b*xmin,y2=reg.a+reg.b*xmax;
      add('line',{x1:xp(xmin),y1:yp(y1),x2:xp(xmax),y2:yp(y2),stroke:'#1f2937','stroke-width':2,'stroke-dasharray':'7 5'});
    }
    data.forEach(d=>add('circle',{cx:xp(d.gla),cy:yp(d.price),r:4.5,fill:'#fff',stroke:'#334155','stroke-width':1.8}));
    add('text',{x:W/2,y:H-8,'text-anchor':'middle',fill:'#475569','font-size':12},'GLA (SF)');
    add('text',{x:16,y:H/2,transform:`rotate(-90 16 ${H/2})`,'text-anchor':'middle',fill:'#475569','font-size':12},'Sale Price');
  }

  function wire(){
    ['rSiteValue','rIndicatedValue'].forEach(id=>{
      const e=document.getElementById(id);
      if(e)e.addEventListener('input',()=>{state[id==='rSiteValue'?'siteValue':'indicatedValue']=num(e.value);render();});
    });
  }
  window.renderGLAAnalysis=render;
  document.addEventListener('DOMContentLoaded',wire);
})();
