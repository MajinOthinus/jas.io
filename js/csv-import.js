window.MCAData = (() => {
  function parseCSV(text) {
    const rows=[]; let row=[], cell='', quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(quoted){
        if(c === '"' && n === '"'){ cell+='"'; i++; }
        else if(c === '"') quoted=false;
        else cell+=c;
      } else {
        if(c === '"') quoted=true;
        else if(c === ','){ row.push(cell); cell=''; }
        else if(c === '\n'){ row.push(cell.replace(/\r$/,'')); rows.push(row); row=[]; cell=''; }
        else cell+=c;
      }
    }
    if(cell.length || row.length){ row.push(cell.replace(/\r$/,'')); rows.push(row); }
    return rows;
  }
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
  function findField(headers,candidates){
    for(const c of candidates){ const exact=headers.find(h=>norm(h)===c); if(exact) return exact; }
    for(const c of candidates){ const partial=headers.find(h=>norm(h).includes(c)); if(partial) return partial; }
    return null;
  }
  function parseDate(v){
    const str=String(v||'').trim();
    const m=str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m){ const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3])); return isNaN(d)?null:d; }
    const d=new Date(str); return isNaN(d)?null:d;
  }
  function parseNumber(v){ if(v===null||v===undefined||String(v).trim()==='') return null; const n=Number(String(v).replace(/[$,% ,]/g,'')); return Number.isFinite(n)?n:null; }
  function parseMoney(v){ const n=Number(String(v||'').replace(/[$,\s]/g,'')); return Number.isFinite(n)?n:null; }
  function parse(text){
    const rows=parseCSV(text);
    if(rows.length<2) throw new Error('The CSV does not appear to contain any data rows.');
    const headers=rows[0].map(h=>h.trim());
    const contract=findField(headers,['undercontractdate','contractdate','contractdt','datecontracted']);
    const closeDateField=headers.find(h=>String(h).trim().toLowerCase()==='close date') || findField(headers,['closedate','solddate','settlementdate']);
    const price=findField(headers,['closeprice','saleprice','soldprice','closedprice','salesprice']);
    const statusField=findField(headers,['status','listingstatus','mlsstatus']);
    if(!contract || !price) throw new Error('Could not automatically find both Contract Date and Sale Price fields.');
    const ci=headers.indexOf(contract), closeDateIndex=closeDateField?headers.indexOf(closeDateField):-1, pi=headers.indexOf(price), si=statusField?headers.indexOf(statusField):-1;
    const listPriceField=findField(headers,['listprice','originalprice','originallistprice','listprice']);
    const listingDateField=headers.find(h=>String(h).trim().toLowerCase()==='listing date') || findField(headers,['listingdate','listdate','dateonmarket']);
    const domField=headers.find(h=>String(h).trim().toLowerCase()==='days on market') || null;
    // GLA is specifically MLS "Living Main".
    // "Building Main" is intentionally NOT used because it may include
    // garages and other non-living area.
    const glaField=findField(headers,['livingareamain']);
    const li=listPriceField?headers.indexOf(listPriceField):-1, ldiDate=listingDateField?headers.indexOf(listingDateField):-1, di=domField?headers.indexOf(domField):-1, gi=glaField?headers.indexOf(glaField):-1;
    const sales=[], rawRecords=[]; let closedCount=0, activePendingCount=0;
    for(const r of rows.slice(1)){
      const rawStatus=si>=0?String(r[si]||'').trim().toUpperCase():'';
      const isClosed=rawStatus==='C'||rawStatus==='CLOSED'||rawStatus==='S'||rawStatus==='SOLD';
      const isActive=rawStatus==='A'||rawStatus==='ACTIVE'; const isPending=rawStatus==='P'||rawStatus==='PENDING';
      const contractDate=parseDate(r[ci]); const closeDate=closeDateIndex>=0?parseDate(r[closeDateIndex]):null; const date=isClosed?closeDate:null;
      const listingDate=ldiDate>=0?parseDate(r[ldiDate]):null;
      if(!date&&!closeDate&&!listingDate) continue;
      const priceValue=parseMoney(r[pi]); const listValue=li>=0?parseMoney(r[li]):null; const domValueRaw = di >= 0 ? parseNumber(r[di]) : null;

// Negative MLS DOM values are invalid data.
// Keep the transaction, but exclude its DOM from all DOM statistics.
const domValue =
  domValueRaw !== null && domValueRaw >= 0
    ? domValueRaw
    : null;
      const glaValue=gi>=0?parseNumber(r[gi]):null;
      const derivedListingDOM=listingDate&&date?Math.max(0,Math.round((date-listingDate)/86400000)):null;
      rawRecords.push({contractDate,closeDate,listingDate,statusGroup:isClosed?'closed':isActive?'active':isPending?'pending':'',price:priceValue,listPrice:listValue,dom:domValue,listingDOM:derivedListingDOM,gla:glaValue,glaField:glaField||null});
      if(isClosed){ closedCount++; if(closeDate&&priceValue!==null&&priceValue>0) sales.push({date:closeDate,closeDate,price:priceValue,listPrice:listValue,dom:domValue,listingDate,listingDOM:derivedListingDOM,gla:glaValue}); }
      else if(isActive||isPending) activePendingCount++;
    }
    sales.sort((a,b)=>a.date-b.date);
    return {sales,rawRecords,totalRecords:rows.length-1,closedCount,activePendingCount,fileName:''};
  }
  return {parse};
})();

document.addEventListener('DOMContentLoaded',()=>{
  const drop=document.getElementById('drop'), fileInput=document.getElementById('file'), status=document.getElementById('status');
  if(!drop||!fileInput) return;
  function process(file){
    status.textContent='Reading CSV…'; status.className='status';
    const reader=new FileReader();
    reader.onload=()=>{ try{ const dataset=MCAData.parse(reader.result); dataset.fileName=file.name; window.currentDataset=dataset; window.loadMarketDataset(dataset); if(typeof window.renderGLAAnalysis==='function') window.renderGLAAnalysis(); status.textContent=`Successfully loaded ${file.name}`; status.className='status success'; } catch(err){ status.textContent=err.message; status.className='status error'; } };
    reader.readAsText(file,'UTF-8');
  }
  drop.addEventListener('click',()=>fileInput.click());
  drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag')});
  drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');if(e.dataTransfer.files[0])process(e.dataTransfer.files[0])});
  fileInput.addEventListener('change',()=>{if(fileInput.files[0])process(fileInput.files[0])});
});
