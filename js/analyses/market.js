
document.documentElement.setAttribute('data-theme','light');
var sales = [];
var allMLSRecords=[];
var rawRecords=[];
var mcPeriods=[];

function normalizeMLSRecords(){
  // The CSV parser already normalizes every MLS row, including listings
  // that do not yet have a contract date.
  allMLSRecords=rawRecords.map(r=>({
    contractDate:r.contractDate || null,
    closeDate:r.closeDate || null,
    listingDate:r.listingDate || null,
    statusGroup:r.statusGroup || '',
    price:r.price ?? null,
    listPrice:r.listPrice ?? null,
    dom:r.dom ?? null,
    listingDOM:r.listingDOM ?? null,
    gla:r.gla ?? null,
    glaField:r.glaField ?? null
  }));
}

function medianNumber(values){
  const nums=values.filter(v=>Number.isFinite(v)).sort((a,b)=>a-b);
  if(!nums.length) return null;
  const mid=Math.floor(nums.length/2);
  return nums.length%2 ? nums[mid] : (nums[mid-1]+nums[mid])/2;
}

function startOfMonth(date){
  return new Date(date.getFullYear(),date.getMonth(),1);
}

function addMonths(date,n){
  return new Date(date.getFullYear(),date.getMonth()+n,1);
}

function endOfMonth(date){
  return new Date(date.getFullYear(),date.getMonth()+1,0,23,59,59,999);
}

function formatPeriod(start,end){
  const opts={month:'short',day:'numeric',year:'numeric'};
  return `${start.toLocaleDateString('en-US',opts)} – ${end.toLocaleDateString('en-US',opts)}`;
}

function getMCClosedDate(r){
  // The 1004MC cohort and the sales graph are both based strictly on Close Date.
  // Under Contract Date is intentionally NOT a fallback here because it can
  // move a closed sale into the wrong 3-month cohort.
  return r.closeDate || null;
}

function periodClosedSales(start,end){
  return allMLSRecords.filter(r=>{
    if(r.statusGroup!=='closed') return false;
    const d=getMCClosedDate(r);
    return d && d>=start && d<=end;
  });
}

function activeListingsAtDate(date){
  // 1004MC inventory is a point-in-time snapshot. A listing is active on the
  // snapshot date when it was listed before that date and had not yet gone
  // under contract. The strict listing-date boundary matches the MLS report's
  // historical snapshot behavior.
  return allMLSRecords.filter(r=>{
    if(!r.listingDate || r.listingDate>=date) return false;
    if(r.contractDate && r.contractDate<=date) return false;
    return true;
  });
}

function buildMCPeriods(){
  if(!allMLSRecords.length) return [];

  const effective=parseDateOnly(document.getElementById('effectiveDate')?.value);
  const closeDates=allMLSRecords
    .filter(r=>r.statusGroup==='closed')
    .map(getMCClosedDate)
    .filter(Boolean)
    .sort((a,b)=>a-b);
  const latestClose=closeDates.length ? closeDates[closeDates.length-1] : null;
  if(!latestClose) return [];

  // The MC periods are always anchored to the entered effective date.
  // The latest available sale never changes the study-period boundaries.
  // If no effective date has been entered, use the latest available close
  // only as a safe fallback for an otherwise incomplete form.
  const anchor=effective || latestClose;

  const periods=[];
  let periodEnd=new Date(anchor);

  while(true){
    // Exact three-month interval ending on periodEnd.
    const periodStart=new Date(
      periodEnd.getFullYear(),
      periodEnd.getMonth()-3,
      periodEnd.getDate()
    );

    const closed=periodClosedSales(periodStart,periodEnd);
    const active=activeListingsAtDate(periodEnd).length;
    const absorption=closed.length/3;
    const supply=absorption>0 ? active/absorption : null;

    const salePrices=closed.map(s=>s.price).filter(Number.isFinite);
    const saleDOM=closed.map(s=>s.dom).filter(Number.isFinite);

    // The 1004MC listing-side statistics are based on the comparable
    // listings that were active at the end of each period. Their current MLS
    // List Price and Days on Market fields are used; closed-sale statistics
    // are not mixed into these two metrics.
    const activeAtEnd=activeListingsAtDate(periodEnd);
    const listPrices=activeAtEnd
      .map(r=>r.listPrice)
      .filter(Number.isFinite);

    const listingDOM=activeAtEnd
      .map(r=>r.dom)
      .filter(Number.isFinite);

    const saleToList=closed
      .filter(s=>Number.isFinite(s.price)&&Number.isFinite(s.listPrice)&&s.listPrice>0)
      .map(s=>s.price/s.listPrice*100);

    periods.push({
      start:periodStart,
      end:periodEnd,
      closedCount:closed.length,
      absorption,
      active,
      supply,
      medianSale:medianNumber(salePrices),
      medianDOM:medianNumber(saleDOM),
      medianList:medianNumber(listPrices),
      medianListingDOM:medianNumber(listingDOM),
      medianSaleToList:medianNumber(saleToList)
    });

    // Stop once the next older period would contain no closed-sale history.
    if(!closeDates.some(d=>d<periodStart)) break;

    periodEnd=new Date(periodStart.getTime()-86400000);
  }

  return periods;
}



function fmtMetric(value,type){
  if(value===null || value===undefined || !Number.isFinite(value)) return '—';
  if(type==='integer') return Math.round(value).toLocaleString('en-US');
  if(type==='decimal') return value.toFixed(2);
  if(type==='money') return '$'+Math.round(value).toLocaleString('en-US');
  if(type==='percent') return value.toFixed(2)+'%';
  return String(value);
}

function renderMarketConditions(){
  const section=document.getElementById('mcSection');
  if(!section || !allMLSRecords.length) return;

  mcPeriods=buildMCPeriods();
  section.style.display='block';

  const head1=document.getElementById('mcHead1');
  const body1=document.getElementById('mcBody1');
  const head2=document.getElementById('mcHead2');
  const body2=document.getElementById('mcBody2');

  if(!mcPeriods.length){
    head1.innerHTML='<tr><th>Metric</th><th>0–3 months</th></tr>';
    body1.innerHTML='<tr><td class="mc-metric">No closed-sale data available</td><td class="mc-empty">—</td></tr>';
    head2.innerHTML='';
    body2.innerHTML='';
    return;
  }

  const headerHTML='<tr><th>Metric</th>'+mcPeriods.map((p,i)=>{
    const start=i===0 ? 0 : i*3+1;
    const end=(i+1)*3;
    return `<th class="period">${start}–${end} months</th>`;
  }).join('')+'</tr>';

  head1.innerHTML=headerHTML;
  head2.innerHTML=headerHTML;

  const metrics=[
    ['# of Sales','closedCount','integer'],
    ['Absorption Rate','absorption','decimal'],
    ['# of Active Listings','active','integer'],
    ['Months of Housing Supply','supply','decimal'],
    ['Median Sale Price','medianSale','money'],
    ['Median DOM','medianDOM','integer'],
    ['Median List Price','medianList','money'],
    ['Median Listing DOM','medianListingDOM','integer'],
    ['Median Sale Price as % of List Price','medianSaleToList','percent']
  ];

  const renderRows=items=>items.map(([label,key,type])=>
    `<tr><td class="mc-metric">${label}</td>`+
    mcPeriods.map(p=>{
      const v=p[key];
      return `<td class="${v===null?'mc-empty':''}">${fmtMetric(v,type)}</td>`;
    }).join('')+
    '</tr>'
  ).join('');

  // Split for readability: first four market-volume/supply metrics,
  // followed by the five price/DOM metrics.
  body1.innerHTML=renderRows(metrics.slice(0,4));
  body2.innerHTML=renderRows(metrics.slice(4));
}

const analysis = document.getElementById('analysis');
const calcStatus = document.getElementById('calcStatus');

window.loadMarketDataset = function(dataset){
  sales = dataset.sales || [];
  // Explicit shared reference for auxiliary analysis pages.
  window.__glaSales = sales;
  rawRecords = dataset.rawRecords || [];
  allMLSRecords = rawRecords.map(r=>({
    contractDate:r.contractDate || null,
    closeDate:r.closeDate || null,
    listingDate:r.listingDate || null,
    statusGroup:r.statusGroup || '',
    price:r.price ?? null,
    listPrice:r.listPrice ?? null,
    dom:r.dom ?? null,
    listingDOM:r.listingDOM ?? null,
    gla:r.gla ?? null
  }));
  mcPeriods=[];

  document.getElementById('records').textContent=dataset.totalRecords.toLocaleString();
  document.getElementById('valid').textContent=sales.length.toLocaleString();
  const activePendingEl=document.getElementById('activePending');
  if(activePendingEl) activePendingEl.textContent=dataset.activePendingCount.toLocaleString();
  document.getElementById('range').textContent=sales.length
    ? `${fmtDate(sales[0].date)} – ${fmtDate(sales[sales.length-1].date)}` : '—';

  document.getElementById('datasetSummary').style.display='block';
  document.getElementById('appraiserNotesSection').style.display='block';
  showExportControls();
  document.getElementById('chartSection').style.display='none';
  if(calcStatus) calcStatus.textContent='';
  calculate();
  initializeStep4();
  renderMarketConditions();
  renderMonthlyActivity();
};


function median(values){
  const a=[...values].sort((x,y)=>x-y);
  const m=Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
}

let compMatches=[];
let compSelectMode=false;

function formatDateInputDate(d){
  const y=d.getUTCFullYear();
  const m=String(d.getUTCMonth()+1).padStart(2,'0');
  const day=String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function parseDateOnly(value){
  if(!value) return null;
  const parts=value.split('-').map(Number);
  if(parts.length!==3 || parts.some(n=>!Number.isInteger(n))) return null;
  const d=new Date(parts[0],parts[1]-1,parts[2]);
  return Number.isNaN(d.getTime()) ? null : d;
}

function findMatchingSale(date,price){
  if(!date || !Number.isFinite(price)) return null;
  const targetDay=date.getTime();
  return sales.find(s=>s.date.getTime()===targetDay && Math.abs(s.price-price)<0.01) || null;
}

function rollingMedianAtDate(medians,date){
  if(!medians.length || !date) return null;
  const t=date.getTime();
  if(t<=medians[0].date.getTime()) return medians[0].median;
  if(t>=medians[medians.length-1].date.getTime()) return medians[medians.length-1].median;
  for(let i=1;i<medians.length;i++){
    const a=medians[i-1], b=medians[i];
    const ta=a.date.getTime(), tb=b.date.getTime();
    if(t<=tb){
      if(tb===ta) return b.median;
      const ratio=(t-ta)/(tb-ta);
      return a.median+(b.median-a.median)*ratio;
    }
  }
  return medians[medians.length-1].median;
}

function buildMediansForCurrentWindow(){
  const w=parseInt(document.querySelector('.windowBtn.active')?.dataset.window || '30',10);
  const analysisSales=analysisPopulation();
  const medians=[];
  for(let i=0;i<analysisSales.length;i++){
    const start=Math.max(0,i-w+1);
    const windowSales=analysisSales.slice(start,i+1);
    medians.push({
      date:analysisSales[i].date,
      median:median(windowSales.map(s=>s.price)),
      count:windowSales.length
    });
  }
  return {w,medians};
}

function selectSaleAsComp(index){
  // The graph plots analysisPopulation(), which can be a filtered subset of
  // sales. Use the same population here so the clicked point maps to the
  // correct underlying sale.
  const plottedSales=analysisPopulation();
  const sale=plottedSales[index];
  if(!sale) return;

  const rows=[...document.querySelectorAll('.comp-row')];
  const target=rows.find(row=>{
    const date=row.querySelector('.comp-date')?.value;
    const price=row.querySelector('.comp-price')?.value;
    return !date && !price;
  }) || rows.find(row=>!row.querySelector('.comp-date')?.value || !row.querySelector('.comp-price')?.value);

  if(!target){
    document.getElementById('graphSelectStatus').textContent='All comp slots are filled. Increase the number of comps or edit an existing comp.';
    return;
  }

  target.querySelector('.comp-date').value=formatDateInputDate(sale.date);
  target.querySelector('.comp-price').value=String(Math.round(sale.price));
  target.classList.add('matched');
  document.getElementById('graphSelectStatus').textContent=
    `Added ${fmtDate(sale.date)} — ${fmtMoney(sale.price)} as ${target.querySelector('.comp-label').textContent}.`;
  updateComps();
  if(sales.length) redrawCurrentGraph();
}

function setCompSelectMode(enabled){
  compSelectMode=enabled;
  const btn=document.getElementById('selectCompMode');
  btn.classList.toggle('active',enabled);
  btn.textContent=enabled ? 'Click a sale on the graph…' : 'Select sale from graph';
  document.getElementById('graphSelectStatus').textContent=
    enabled ? 'Click any closed sale point on the graph to add it to the next available comp slot.' : '';
  // Redraw through the same centralized path used by the other graph
  // controls, so selection mode cannot render a stale/inconsistent graph.
  if(sales.length) redrawCurrentGraph();
}

function renderCompRows(){
  const count=parseInt(document.getElementById('compCount').value,10);
  const container=document.getElementById('compRows');
  const previous=[...container.querySelectorAll('.comp-row')].map(row=>({
    date:row.querySelector('.comp-date')?.value || '',
    price:row.querySelector('.comp-price')?.value || ''
  }));
  container.innerHTML='';
  for(let i=0;i<count;i++){
    const row=document.createElement('div');
    row.className='comp-row';
    row.innerHTML=`
      <div class="comp-label">C${i+1}</div>
      <div class="comp-field">
        <label>Contract date</label>
        <div class="comp-date-wrap">
          <input class="comp-date" type="text" readonly placeholder="Select date" value="${previous[i]?.date || ''}">
          
        </div>
      </div>
      <div class="comp-field">
        <label>Sale price</label>
        <input class="comp-price" type="number" min="0" step="1" placeholder="$" value="${previous[i]?.price || ''}">
      </div>
      <div class="comp-result">
        <div class="comp-result-main">—</div>
        <div class="comp-result-sub">Enter comp</div>
      </div>`;
    container.appendChild(row);
    row.querySelectorAll('input').forEach(input=>{
      input.addEventListener('input',updateComps);
      input.addEventListener('change',updateComps);
    });

  }
  updateComps();
}

function updateComps(){
  if(!sales.length) return;
  const {w,medians}=buildMediansForCurrentWindow();
  const effectiveDate=parseDateOnly(document.getElementById('effectiveDate').value);
  const effectiveMedian=effectiveDate ? rollingMedianAtDate(medians,effectiveDate) : null;
  document.getElementById('effectiveMedian').textContent =
    effectiveMedian!==null ? fmtMoney(effectiveMedian) : '—';

  const rows=[...document.querySelectorAll('.comp-row')];
  compMatches=rows.map((row)=>{
    row.classList.remove('matched','invalid','manual-comp');
    const date=parseDateOnly(row.querySelector('.comp-date').value);
    const price=Number(row.querySelector('.comp-price').value);
    const main=row.querySelector('.comp-result-main');
    const sub=row.querySelector('.comp-result-sub');

    if(!date || !Number.isFinite(price) || price<=0){
      main.textContent='—';
      sub.textContent='Enter comp';
      return null;
    }

    const sale=findMatchingSale(date,price);
    const compDate=sale ? sale.date : date;
    const compPrice=sale ? sale.price : price;
    // The market trend/median comes from the current analysis population,
    // so changing the original analysis-range sliders changes this result.
    // A manual comp (or an MLS comp excluded by the analysis range) is not
    // added back into that population.
    const compMedian=rollingMedianAtDate(medians,compDate);

    if(!sale) row.classList.add('manual-comp');
    else row.classList.add('matched');

    if(compMedian===null || effectiveMedian===null || compMedian===0){
      main.textContent=sale ? 'Matched' : 'Manual';
      sub.textContent='Median unavailable';
      return {sale,compDate,compPrice,compMedian,manual:!sale};
    }

    const adjustment=(effectiveMedian/compMedian)-1;
    const adjustedPrice=compPrice*(1+adjustment);
    main.textContent=`${adjustment>=0?'+':''}${(adjustment*100).toFixed(2)}%`;
    sub.textContent=`${sale?'Adj.':'Manual · Adj.'} ${fmtMoney(adjustedPrice)}`;

    return {
      sale,
      compDate,
      compPrice,
      compMedian,
      adjustment,
      adjustedPrice,
      manual:!sale
    };
  });

  const validCount=compMatches.filter(Boolean).length;
  const manualCount=compMatches.filter(m=>m?.manual).length;
  const matchedCount=validCount-manualCount;
  const status=document.getElementById('compStatus');
  if(status){
    if(validCount){
      const parts=[];
      if(matchedCount) parts.push(`${matchedCount} matched to MLS`);
      if(manualCount) parts.push(`${manualCount} manual`);
      status.textContent=`${parts.join(' · ')} of ${rows.length} comparable sales used for time adjustment.`;
    }else{
      status.textContent='';
    }
  }
}

function initializeStep4(){
  if(!sales.length) return;
  const effective=document.getElementById('effectiveDate');
  // Default the effective date to today, rather than the latest contract
  // date in the dataset. This matches the 1004MC convention: the study
  // periods are anchored to the report/effective date, while the MLS data
  // determines which sales and listings fall within those periods.
  if(!effective.value){
    const today=new Date();
    effective.value=formatDateInputDate(today);
  }
  renderCompRows();
  document.getElementById('compSection').style.display='block';
}


function redrawCurrentGraph(){
  if(!sales.length) return;
  const w=parseInt(document.querySelector('.windowBtn.active')?.dataset.window || '30',10);
  if(!Number.isInteger(w) || w<2) return;

  const analysisSales=analysisPopulation();
  if(!analysisSales.length){
    const chartSection=document.getElementById('chartSection');
    if(chartSection) chartSection.style.display='block';
    return;
  }

  const medians=[];
  for(let i=0;i<analysisSales.length;i++){
    const start=Math.max(0,i-w+1);
    const windowSales=analysisSales.slice(start,i+1);
    medians.push({
      date:analysisSales[i].date,
      median:median(windowSales.map(s=>s.price)),
      count:windowSales.length
    });
  }

  // Trend analysis begins only after the rolling median reaches its full
  // selected window size. Immature median values are intentionally excluded
  // from the plotted trend so they cannot influence its direction.
  const matureMedians=medians.filter(m=>m.count>=w);
  const linearOn=document.querySelector('.trendToggle[data-trend="linear"]')?.classList.contains('active') ?? false;
  const quadraticOn=document.querySelector('.trendToggle[data-trend="quadratic"]')?.classList.contains('active') ?? false;
  const linearTrend=linearOn ? fitLinearTrend(matureMedians) : null;
  const quadraticTrend=quadraticOn ? fitQuadraticTrend(matureMedians) : null;

  const noiseBtn=document.querySelector('.noiseBtn.active');
  const noisePct=noiseBtn ? parseInt(noiseBtn.dataset.noise,10) : null;
  const noiseResult=(quadraticTrend && noisePct!==null)
    ? calculateNoiseWindow(analysisSales,quadraticTrend,noisePct)
    : null;

  drawChart(medians,w,linearTrend,quadraticTrend,noiseResult,quadraticTrend,compMatches);
}

function calculate(){
  const activeWindowBtn=document.querySelector('.windowBtn.active');
  const w=parseInt(activeWindowBtn?.dataset.window || '30',10);
  if(!Number.isInteger(w) || w<2) return;

  const analysisSales=analysisPopulation();
  if(!analysisSales.length){
    document.getElementById('chartSection').style.display='block';
    document.getElementById('yAxisSection').style.display='block';
    document.getElementById('graphYAxisSection').style.display='block';
    setupYAxisControls();
    setupGraphYAxisControls();
    const n=document.getElementById('analysisCount'); if(n) n.textContent='0 sales selected';
    return;
  }
  const medians=[];
  for(let i=0;i<analysisSales.length;i++){
    const start=Math.max(0,i-w+1);
    const windowSales=analysisSales.slice(start,i+1);
    medians.push({
      date:analysisSales[i].date,
      median:median(windowSales.map(s=>s.price)),
      count:windowSales.length
    });
  }

  // Trend analysis begins only after the rolling median reaches its full
  // selected window size. Immature median values are intentionally excluded
  // from the plotted trend so they cannot influence its direction.
  const matureMedians=medians.filter(m=>m.count>=w);
  const linearOn=document.querySelector('.trendToggle[data-trend="linear"]')?.classList.contains('active') ?? false;
  const quadraticOn=document.querySelector('.trendToggle[data-trend="quadratic"]')?.classList.contains('active') ?? false;
  const linearTrend=linearOn ? fitLinearTrend(matureMedians) : null;
  const quadraticTrend=quadraticOn ? fitQuadraticTrend(matureMedians) : null;

  const noiseBtn=document.querySelector('.noiseBtn.active');
  const noisePct=noiseBtn ? parseInt(noiseBtn.dataset.noise,10) : null;
  const noiseTrend=quadraticTrend;
  const noiseResult=(noiseTrend && noisePct!==null) ? calculateNoiseWindow(analysisSales,noiseTrend,noisePct) : null;

  const channelStats=noiseTrend && noiseResult ? calculateSaleChannelStats(analysisSales,noiseTrend,noiseResult) : null;
  const noiseCountEl=document.getElementById('noiseInChannel');
  const noisePctEl=document.getElementById('noiseInChannelPct');
  if(channelStats){
    noiseCountEl.textContent=`${channelStats.within.toLocaleString()} of ${channelStats.total.toLocaleString()}`;
    if(noisePctEl) noisePctEl.textContent=`${channelStats.percent.toFixed(1)}%`;
  } else {
    noiseCountEl.textContent='—';
    if(noisePctEl) noisePctEl.textContent='—';
  }

  redrawCurrentGraph();
  renderMonthlyActivity();

  document.getElementById('chartSection').style.display='block';
  const ySec=document.getElementById('yAxisSection');
  if(ySec) ySec.style.display='block';
  const graphYSec=document.getElementById('graphYAxisSection');
  if(graphYSec) graphYSec.style.display='block';
  if(!yAnalysisInitialized) setupYAxisControls();
  else updateYAxisControls();
  setupGraphYAxisControls();

  calcStatus.textContent='';
  calcStatus.className='status';
}


function fitLinearTrend(points){
  if(points.length<2) return null;
  const t0=points[0].date.getTime();
  const t1=points[points.length-1].date.getTime();
  const span=Math.max(t1-t0,1);
  const rows=points.map(p=>({x:((p.date.getTime()-t0)/span)*2-1,y:p.median}));
  let sx=0,sy=0,sxx=0,sxy=0;
  rows.forEach(r=>{sx+=r.x;sy+=r.y;sxx+=r.x*r.x;sxy+=r.x*r.y;});
  const denom=rows.length*sxx-sx*sx;
  if(Math.abs(denom)<1e-12)return null;
  const slope=(rows.length*sxy-sx*sy)/denom;
  const intercept=(sy-slope*sx)/rows.length;
  return {valueAtDate(d){
    const x=((d.getTime()-t0)/span)*2-1;
    return intercept+slope*x;
  }};
}

function fitQuadraticTrend(points){
  if(points.length<3) return null;
  const t0=points[0].date.getTime();
  const t1=points[points.length-1].date.getTime();
  const span=Math.max(t1-t0,1);

  const rows=points.map(p=>{
    const x=((p.date.getTime()-t0)/span)*2-1;
    return {x,y:p.median};
  });

  let s0=0,s1=0,s2=0,s3=0,s4=0,sy=0,sxy=0,sx2y=0;
  rows.forEach(r=>{
    const x=r.x, x2=x*x;
    s0+=1; s1+=x; s2+=x2; s3+=x2*x; s4+=x2*x2;
    sy+=r.y; sxy+=x*r.y; sx2y+=x2*r.y;
  });

  const A=[[s0,s1,s2],[s1,s2,s3],[s2,s3,s4]];
  const b=[sy,sxy,sx2y];

  for(let col=0;col<3;col++){
    let pivot=col;
    for(let row=col+1;row<3;row++){
      if(Math.abs(A[row][col])>Math.abs(A[pivot][col])) pivot=row;
    }
    if(Math.abs(A[pivot][col])<1e-12) return null;
    [A[col],A[pivot]]=[A[pivot],A[col]];
    [b[col],b[pivot]]=[b[pivot],b[col]];
    for(let row=col+1;row<3;row++){
      const factor=A[row][col]/A[col][col];
      for(let j=col;j<3;j++) A[row][j]-=factor*A[col][j];
      b[row]-=factor*b[col];
    }
  }

  const coef=[0,0,0];
  for(let row=2;row>=0;row--){
    let sum=b[row];
    for(let j=row+1;j<3;j++) sum-=A[row][j]*coef[j];
    coef[row]=sum/A[row][row];
  }

  return {
    valueAtDate(d){
      const x=((d.getTime()-t0)/span)*2-1;
      return coef[0]+coef[1]*x+coef[2]*x*x;
    }
  };
}

function calculateSaleChannelStats(sales,trend,noiseResult){
  if(!trend || !noiseResult || !sales.length) return null;

  const halfWidth=(noiseResult.totalRange*(noiseResult.keepPct/100))/2;
  let within=0;

  sales.forEach(sale=>{
    const trendValue=trend.valueAtDate(sale.date);
    const lower=trendValue-halfWidth;
    const upper=trendValue+halfWidth;
    if(sale.price>=lower && sale.price<=upper) within++;
  });

  return {
    total:sales.length,
    within,
    percent:(within/sales.length)*100
  };
}

function calculateNoiseWindow(sales,trend,keepPct){
  if(!trend || !sales.length) return null;

  // Use the full observed range of individual closed-sale prices,
  // not the much narrower range of rolling-median values.
  const prices=sales.map(s=>s.price);
  const minPrice=Math.min(...prices);
  const maxPrice=Math.max(...prices);
  const totalRange=maxPrice-minPrice;
  const halfWidth=(totalRange*(keepPct/100))/2;

  return {
    lowerOffset:-halfWidth,
    upperOffset:halfWidth,
    keepPct,
    minPrice,
    maxPrice,
    totalRange
  };
}


let yAnalysisInitialized = false;
let yAnalysisMin = null;
let yAnalysisMax = null;

// Independent display-only Y-axis range. These values never participate in
// analysisPopulation(), so changing them cannot remove sales or alter any
// statistical calculation.
let graphYMin = null;
let graphYMax = null;
let graphYAxisInitialized = false;

function analysisPopulation(){
  if(!Array.isArray(sales)) return [];
  if(!yAnalysisInitialized) return sales.slice();
  return sales.filter(s=>{
    const p=Number(s.price);
    return Number.isFinite(p) && p>=yAnalysisMin && p<=yAnalysisMax;
  });
}

window.getGLAAnalysisSales = function(){
  return analysisPopulation().slice();
};

function priceRangeStep(min,max){
  const span=Math.max(max-min,1);
  const raw=span/100;
  const pow=Math.pow(10,Math.floor(Math.log10(raw)));
  const n=raw/pow;
  return (n<=1?1:n<=2?2:n<=5?5:10)*pow;
}

function setupYAxisControls(){
  const prices=(sales||[]).map(s=>Number(s.price)).filter(Number.isFinite);
  if(!prices.length) return;

  // The analysis sliders must always be able to reach every actual sale in
  // the dataset.  Previously the calculated slider step could produce a
  // rounded minimum that was too coarse for the browser's range input, making
  // lower-priced sales effectively unreachable.  Use a practical $1,000
  // increment and expand the slider bounds just enough to contain the exact
  // observed minimum and maximum.
  const actualMin=Math.min(...prices);
  const actualMax=Math.max(...prices);
  const step=1000;
  const lo=Math.floor(actualMin/step)*step;
  const hi=Math.ceil(actualMax/step)*step;

  const minSlider=document.getElementById('yMinSlider');
  const maxSlider=document.getElementById('yMaxSlider');
  if(!minSlider||!maxSlider) return;
  minSlider.min=lo; minSlider.max=hi; minSlider.step=step;
  maxSlider.min=lo; maxSlider.max=hi; maxSlider.step=step;

  if(!yAnalysisInitialized){
    yAnalysisMin=actualMin;
    yAnalysisMax=actualMax;
    yAnalysisInitialized=true;
  }

  // Keep the stored range inside the newly established slider bounds.
  yAnalysisMin=Math.max(lo,Math.min(yAnalysisMin,hi));
  yAnalysisMax=Math.max(lo,Math.min(yAnalysisMax,hi));
  minSlider.value=yAnalysisMin;
  maxSlider.value=yAnalysisMax;
  updateYAxisControls();
}

function updateYAxisControls(){
  const minEl=document.getElementById('yMinValue');
  const maxEl=document.getElementById('yMaxValue');
  const countEl=document.getElementById('analysisCount');
  if(minEl) minEl.textContent=fmtMoney(yAnalysisMin||0);
  if(maxEl) maxEl.textContent=fmtMoney(yAnalysisMax||0);
  const total=(sales||[]).length, included=analysisPopulation().length;
  if(countEl) countEl.textContent=included===total?`All ${total} sales`:`${included} of ${total} sales`;
}

function yRangeChanged(){
  const a=document.getElementById('yMinSlider'), b=document.getElementById('yMaxSlider');
  if(!a||!b) return;
  let lo=Number(a.value), hi=Number(b.value), step=Number(a.step)||1;
  if(lo>=hi){
    if(document.activeElement===a){hi=Math.min(Number(b.max),lo+step);b.value=hi}
    else {lo=Math.max(Number(a.min),hi-step);a.value=lo}
  }
  yAnalysisMin=lo; yAnalysisMax=hi; yAnalysisInitialized=true;
  updateYAxisControls();
  // The analysis-range sliders change the market population itself, so the
  // time-adjustment calculation must be refreshed immediately as well.
  updateComps();
  calculate();
  renderMonthlyActivity();
}

function resetYAxisRange(){
  yAnalysisInitialized=false;
  setupYAxisControls();
  updateComps();
  calculate();
  renderMonthlyActivity();
}

function setupGraphYAxisControls(){
  const prices=(sales||[]).map(s=>Number(s.price)).filter(Number.isFinite);
  if(!prices.length) return;
  const lo=Math.floor(Math.min(...prices)/priceRangeStep(Math.min(...prices),Math.max(...prices)))*priceRangeStep(Math.min(...prices),Math.max(...prices));
  const hi=Math.ceil(Math.max(...prices)/priceRangeStep(Math.min(...prices),Math.max(...prices)))*priceRangeStep(Math.min(...prices),Math.max(...prices));
  const step=priceRangeStep(lo,hi);
  const minSlider=document.getElementById('graphYMinSlider');
  const maxSlider=document.getElementById('graphYMaxSlider');
  if(!minSlider||!maxSlider) return;

  minSlider.min=lo; minSlider.max=hi; minSlider.step=step;
  maxSlider.min=lo; maxSlider.max=hi; maxSlider.step=step;

  if(!graphYAxisInitialized){
    graphYMin=lo;
    graphYMax=hi;
    graphYAxisInitialized=true;
  }

  // Keep the current display range when analysis controls change, while
  // expanding it if a newly loaded dataset falls outside the old range.
  graphYMin=Math.max(lo,Math.min(graphYMin,hi-step));
  graphYMax=Math.min(hi,Math.max(graphYMax,lo+step));
  minSlider.value=graphYMin;
  maxSlider.value=graphYMax;
  updateGraphYAxisControls();
}

function updateGraphYAxisControls(){
  const minEl=document.getElementById('graphYMinValue');
  const maxEl=document.getElementById('graphYMaxValue');
  if(minEl) minEl.textContent=fmtMoney(graphYMin||0);
  if(maxEl) maxEl.textContent=fmtMoney(graphYMax||0);
}

function graphYAxisChanged(){
  const a=document.getElementById('graphYMinSlider');
  const b=document.getElementById('graphYMaxSlider');
  if(!a||!b) return;
  let lo=Number(a.value), hi=Number(b.value), step=Number(a.step)||1;
  if(lo>=hi){
    if(document.activeElement===a){
      hi=Math.min(Number(b.max),lo+step);
      b.value=hi;
    }else{
      lo=Math.max(Number(a.min),hi-step);
      a.value=lo;
    }
  }
  graphYMin=lo;
  graphYMax=hi;
  graphYAxisInitialized=true;
  updateGraphYAxisControls();
  calculate();
}

function resetGraphYAxisRange(){
  graphYAxisInitialized=false;
  setupGraphYAxisControls();
  calculate();
}

function drawChart(medians,w,linearTrend,quadraticTrend,noiseResult,noiseTrend,compMatches=[]){
  const showMedian=(document.querySelector('.medianBtn.active')?.dataset.median || 'on')==='on';
  const svg=document.getElementById('chart');
  const NS='http://www.w3.org/2000/svg';
  while(svg.firstChild) svg.removeChild(svg.firstChild);

  const W=1000,H=500;
  const pad={l:104,r:42,t:30,b:66};
  const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;

  const includedSales=analysisPopulation();
  if(!includedSales.length) return;

  const matureMedians=medians.filter(m=>m.count>=w);
  if(!matureMedians.length) return;

  // Display the graph only from the first complete rolling window onward.
  const t0=matureMedians[0].date.getTime();
  const t1=includedSales[includedSales.length-1].date.getTime();
  // Scale the Y axis from the actual plotted closed-sale prices only.
  // Do not let rolling medians, trend lines, or the noise channel expand
  // the automatic axis range. This keeps the sale data readable instead of
  // compressing it toward the bottom of the chart.
  const salePrices=includedSales.map(s=>Number(s.price)).filter(Number.isFinite);
  const autoMin=salePrices.length ? Math.min(...salePrices) : 0;
  const autoMax=salePrices.length ? Math.max(...salePrices) : 1;
  let min=Number.isFinite(graphYMin) ? graphYMin : autoMin;
  let max=Number.isFinite(graphYMax) ? graphYMax : autoMax;
  if(max<=min) max=min+1;

  const x=d=>{
    if(t1===t0) return pad.l+cw/2;
    return pad.l+(d.getTime()-t0)/(t1-t0)*cw;
  };
  const y=v=>pad.t+(max-v)/(max-min)*ch;

  let drawParent=svg;
  const el=(tag,attrs={},text='')=>{
    const n=document.createElementNS(NS,tag);
    Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));
    if(text) n.textContent=text;
    drawParent.appendChild(n);
    return n;
  };

  // Background
  el('rect',{x:0,y:0,width:W,height:H,fill:'transparent'});

  // Keep plotted observations, trends, noise, and comp markers inside the
  // actual plotting rectangle.  This is especially important when the
  // display-only Graph Y-axis is constricted: observations outside that
  // visible range should be clipped rather than spilling into the margins.
  const defs=document.createElementNS(NS,'defs');
  const clip=document.createElementNS(NS,'clipPath');
  clip.setAttribute('id','marketChartPlotClip');
  const clipRect=document.createElementNS(NS,'rect');
  clipRect.setAttribute('x',pad.l);
  clipRect.setAttribute('y',pad.t);
  clipRect.setAttribute('width',cw);
  clipRect.setAttribute('height',ch);
  clip.appendChild(clipRect);
  defs.appendChild(clip);
  svg.appendChild(defs);

  // Y grid + labels
  const yTicks=6;
  for(let i=0;i<=yTicks;i++){
    const val=max-(max-min)*i/yTicks;
    const yy=y(val);
    el('line',{x1:pad.l,y1:yy,x2:W-pad.r,y2:yy,class:'chart-grid'});
    el('text',{x:pad.l-12,y:yy+4,'text-anchor':'end',class:'chart-label'},fmtMoney(val));
  }

  // X-axis automatically scales to the actual closed-sale data range.
  // Use roughly one label every 2 months, capped so labels stay readable.
  const monthSpan=Math.max(
    1,
    (sales[sales.length-1].date.getFullYear()-sales[0].date.getFullYear())*12 +
    (sales[sales.length-1].date.getMonth()-sales[0].date.getMonth()) + 1
  );
  const xTicks=Math.min(12,Math.max(3,Math.ceil(monthSpan/2)+1));
  for(let i=0;i<xTicks;i++){
    const d=new Date(t0+(t1-t0)*(i/(xTicks-1)));
    const xx=x(d);
    el('line',{x1:xx,y1:pad.t,x2:xx,y2:H-pad.b,class:'chart-grid'});
    el('text',{x:xx,y:H-pad.b+24,'text-anchor':'middle',class:'chart-label'},
      d.toLocaleDateString('en-US',{month:'short',year:'numeric'}));
  }

  // Axis lines
  el('line',{x1:pad.l,y1:H-pad.b,x2:W-pad.r,y2:H-pad.b,class:'chart-axis'});
  el('line',{x1:pad.l,y1:pad.t,x2:pad.l,y2:H-pad.b,class:'chart-axis'});

  // Axis titles
  el('text',{x:pad.l+cw/2,y:H-15,'text-anchor':'middle',class:'chart-label'},'Close Date');
  const yTitleX=22;
  const yTitle=el('text',{x:yTitleX,y:pad.t+ch/2,'text-anchor':'middle',class:'chart-label'},
    'Sale Price');
  yTitle.setAttribute('transform',`rotate(-90 ${yTitleX} ${pad.t+ch/2})`);

  // Everything below this point is plotted data and belongs inside the
  // clipping rectangle. Axis/grid labels above remain unaffected.
  const plotGroup=document.createElementNS(NS,'g');
  plotGroup.setAttribute('clip-path','url(#marketChartPlotClip)');
  svg.appendChild(plotGroup);
  drawParent=plotGroup;

  // Individual sales — every observation gets a visible point and hover target.
  const tooltip=document.getElementById('tooltip');
  analysisPopulation().filter(s=>s.date.getTime()>=t0).forEach((s,i)=>{
    const c=el('circle',{cx:x(s.date),cy:y(s.price),r:5,class:'sale-point'});
    c.dataset.saleIndex=i;
    if(compSelectMode) c.classList.add('comp-selectable');
    c.addEventListener('click',()=>{
      if(compSelectMode) selectSaleAsComp(i);
    });
    c.addEventListener('mouseenter',()=>{
      tooltip.style.display='block';
      tooltip.innerHTML=`<strong>Sale</strong><br>${fmtDate(s.date)}<br>${fmtMoney(s.price)}`;
    });
    c.addEventListener('mousemove',e=>{
      const wrap=document.getElementById('chartWrap').getBoundingClientRect();
      tooltip.style.left=(e.clientX-wrap.left+12)+'px';
      tooltip.style.top=(e.clientY-wrap.top+12)+'px';
    });
    c.addEventListener('mouseleave',()=>tooltip.style.display='none');
  });


  // Rolling median: plot only mature observations. The first plotted point
  // therefore represents a complete w-sale rolling window.
  if(showMedian){
    const full=medians.filter(m=>m.count>=w);
    if(full.length){
      let d='';
      full.forEach((m,i)=>{
        d+=(i?' L ':'M ')+x(m.date)+' '+y(m.median);
      });
      el('path',{d,class:'median-line'});
    }
  }

  // Trend lines begin at the first mature rolling-median observation and
  // end at the last mature observation. They never span the immature period.
  if(linearTrend){
    const matureMedians=medians.filter(m=>m.count>=w);
    if(matureMedians.length){
      const first=matureMedians[0].date;
      const last=matureMedians[matureMedians.length-1].date;
      const path=`M ${x(first)} ${y(linearTrend.valueAtDate(first))} L ${x(last)} ${y(linearTrend.valueAtDate(last))}`;
      el('path',{d:path,class:'linear-trend-line'});
    }
  }

  // Transactional noise channel: total channel height is the selected
  // percentage of the observed sale-price range, centered on the selected trend.
  if(noiseResult){
    if(noiseTrend){
      let upperPath='', lowerPath='';
      const steps=160;
      for(let i=0;i<=steps;i++){
        const d=new Date(t0+(t1-t0)*(i/steps));
        upperPath+=(i===0?'M ':'L ')+x(d)+' '+y(noiseTrend.valueAtDate(d)+noiseResult.upperOffset);
        lowerPath+=(i===0?'M ':'L ')+x(d)+' '+y(noiseTrend.valueAtDate(d)+noiseResult.lowerOffset);
      }

      const lowerPoints=[];
      for(let i=steps;i>=0;i--){
        const d=new Date(t0+(t1-t0)*(i/steps));
        lowerPoints.push(x(d)+' '+y(noiseTrend.valueAtDate(d)+noiseResult.lowerOffset));
      }

      const channelPath=upperPath+' L '+lowerPoints.join(' L ')+' Z';
      el('path',{d:channelPath,class:'noise-channel'});
      el('path',{d:upperPath,class:'noise-boundary'});
      el('path',{d:lowerPath,class:'noise-boundary'});
    }
  }

  // Median point hover targets: mature observations only.
  if(showMedian){
    medians.filter(m=>m.count>=w).forEach(m=>{
      const c=el('circle',{cx:x(m.date),cy:y(m.median),r:4,class:'median-point'});
      c.addEventListener('mouseenter',()=>{
        tooltip.style.display='block';
        tooltip.innerHTML=`<strong>${w}-sale rolling median</strong><br>${fmtDate(m.date)}<br>${fmtMoney(m.median)}`;
      });
      c.addEventListener('mousemove',e=>{
        const wrap=document.getElementById('chartWrap').getBoundingClientRect();
        tooltip.style.left=(e.clientX-wrap.left+12)+'px';
        tooltip.style.top=(e.clientY-wrap.top+12)+'px';
      });
      c.addEventListener('mouseleave',()=>tooltip.style.display='none');
    });
  }  // Comparable-sale markers. Manual comps are displayed too when their
  // date falls within the visible graph period.
  compMatches.forEach((match,idx)=>{
    if(!match) return;
    const compDate=match.sale ? match.sale.date : match.compDate;
    const compPrice=match.sale ? match.sale.price : match.compPrice;
    if(!compDate || !Number.isFinite(compPrice) || compDate.getTime()<t0 || compDate.getTime()>t1) return;
    const px=x(compDate), py=y(compPrice);
    const label=`C${idx+1}`;
    const boxW=match.manual ? 40 : 30, boxH=20;
    const offsetY=(idx%2===0 ? -34 : 18);
    let boxX=px-boxW/2;
    let boxY=py+offsetY;
    boxX=Math.max(pad.l+2,Math.min(W-pad.r-boxW-2,boxX));
    boxY=Math.max(pad.t+2,Math.min(H-pad.b-boxH-2,boxY));
    const anchorY=offsetY<0 ? boxY+boxH : boxY;
    el('line',{x1:px,y1:py,x2:px,y2:anchorY,class:'comp-marker-line'});
    el('rect',{x:boxX,y:boxY,width:boxW,height:boxH,rx:5,ry:5,class:match.manual?'comp-marker-box manual-comp-marker-box':'comp-marker-box'});
    el('text',{x:boxX+boxW/2,y:boxY+14,'text-anchor':'middle',class:'comp-marker-text'},match.manual ? `${label} · M` : label);
  });

  // Render nonlinear trend last so it remains visually above the rolling median.
  if(quadraticTrend){
    let path='';
    const steps=160;
    for(let i=0;i<=steps;i++){
      const d=new Date(t0+(t1-t0)*(i/steps));
      path+=(i===0?'M ':'L ')+x(d)+' '+y(quadraticTrend.valueAtDate(d));
    }
    el('path',{d:path,class:'trend-line'});
  }

}

window.addEventListener('resize',()=>{
  if(document.getElementById('chartSection').style.display!=='none'){
    calculate();
  }
});

// Rolling-window selector.
document.querySelectorAll('.windowBtn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.windowBtn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if(sales.length){
      updateComps();
      redrawCurrentGraph();
    } else {
      calculate();
    }
  });
});

document.querySelectorAll('.trendToggle').forEach(btn=>{
  btn.addEventListener('click',()=>{
    btn.classList.toggle('active');
    calculate();
  });
});

document.querySelectorAll('.medianBtn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.medianBtn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    calculate();
  });
});

document.getElementById('compCount').addEventListener('change',renderCompRows);
document.getElementById('effectiveDate').addEventListener('change',()=>{
  // The same Effective Date selector drives both the comparable-sale
  // adjustments and the Market Conditions (MC) periods.
  updateComps();
  renderMarketConditions();
});
document.getElementById('selectCompMode').addEventListener('click',()=>{
  setCompSelectMode(!compSelectMode);
});

document.querySelectorAll('.noiseBtn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const wasActive=btn.classList.contains('active');
    document.querySelectorAll('.noiseBtn').forEach(b=>b.classList.remove('active'));
    if(!wasActive) btn.classList.add('active');
    calculate();
  });
});



function showExportControls(){
  const el=document.getElementById('exportSection');
  if(el) el.style.display='block';
}

function exportGraphImage(){
  const svg=document.getElementById('chart');
  if(!svg) return;
  const clone=svg.cloneNode(true);
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
  clone.setAttribute('width','2000');
  clone.setAttribute('height','1000');

  // Inline the computed SVG styles so the exported image matches the
  // currently selected light/dark theme.
  const sourceEls=[svg,...svg.querySelectorAll('*')];
  const cloneEls=[clone,...clone.querySelectorAll('*')];
  const props=['fill','stroke','stroke-width','stroke-dasharray','font-family',
    'font-size','font-weight','opacity','text-anchor','dominant-baseline'];
  sourceEls.forEach((el,i)=>{
    const target=cloneEls[i];
    if(!target || !(el instanceof Element)) return;
    const cs=getComputedStyle(el);
    const style=props.map(prop=>{
      const val=cs.getPropertyValue(prop);
      return val ? `${prop}:${val}` : '';
    }).filter(Boolean).join(';');
    if(style) target.setAttribute('style',style);
  });

  const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');
  bg.setAttribute('x','0'); bg.setAttribute('y','0');
  bg.setAttribute('width','100%'); bg.setAttribute('height','100%');
  bg.setAttribute('fill',document.documentElement.getAttribute('data-theme')==='dark' ? '#111b27' : '#ffffff');
  clone.insertBefore(bg,clone.firstChild);

  const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);
  const blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const img=new Image();
  img.onload=()=>{
    const canvas=document.createElement('canvas');
    canvas.width=2000; canvas.height=1000;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0,2000,1000);
    URL.revokeObjectURL(url);
    canvas.toBlob(png=>{
      if(!png) return;
      const pngUrl=URL.createObjectURL(png);
      const a=document.createElement('a');
      a.href=pngUrl;
      a.download='market-conditions-graph.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(pngUrl),1000);
    },'image/png');
  };
  img.onerror=()=>URL.revokeObjectURL(url);
  img.src=url;
}

function printMode(mode){
  document.body.classList.remove('print-graph-only','print-full-report');
  document.body.classList.add(mode);
  const cleanup=()=>{
    document.body.classList.remove('print-graph-only','print-full-report');
    window.removeEventListener('afterprint',cleanup);
  };
  window.addEventListener('afterprint',cleanup);
  window.print();
}

document.getElementById('exportGraphImage')?.addEventListener('click',exportGraphImage);
document.getElementById('exportGraphPdf')?.addEventListener('click',()=>printMode('print-graph-only'));
document.getElementById('exportReportPdf')?.addEventListener('click',()=>printMode('print-full-report'));

// Default to 30 sales.
document.querySelectorAll('.windowBtn').forEach(b=>b.classList.remove('active'));
document.querySelector('.windowBtn[data-window="30"]').classList.add('active');

document.getElementById('yMinSlider')?.addEventListener('input',yRangeChanged);
document.getElementById('yMaxSlider')?.addEventListener('input',yRangeChanged);
document.getElementById('yAxisReset')?.addEventListener('click',resetYAxisRange);

document.getElementById('graphYMinSlider')?.addEventListener('input',graphYAxisChanged);
document.getElementById('graphYMaxSlider')?.addEventListener('input',graphYAxisChanged);
document.getElementById('graphYAxisReset')?.addEventListener('click',resetGraphYAxisRange);



// ── Monthly Market Activity ────────────────────────────────────────────────
let monthlyTrendState={absorption:{linear:false,quadratic:false},dom:{linear:false,quadratic:false}};

function buildMonthlyActivity(){
  // Monthly activity uses the same filtered closed-sale population as the
  // main market analysis, so the sale-price range slider applies here too.
  const rows=analysisPopulation()
    .map(r=>({date:getMCClosedDate(r),dom:r.dom}))
    .filter(r=>r.date)
    .sort((a,b)=>a.date-b.date);
  if(!rows.length) return [];

  const buckets=new Map();
  rows.forEach(r=>{
    const key=`${r.date.getFullYear()}-${String(r.date.getMonth()+1).padStart(2,'0')}`;
    if(!buckets.has(key)) buckets.set(key,{year:r.date.getFullYear(),month:r.date.getMonth(),sales:0,dom:[]});
    const b=buckets.get(key);
    b.sales++;
    if(Number.isFinite(r.dom)) b.dom.push(r.dom);
  });

  return [...buckets.values()].sort((a,b)=>a.year-b.year||a.month-b.month)
    .map(b=>({
      date:new Date(b.year,b.month,1),
      sales:b.sales,
      medianDOM:b.dom.length?medianNumber(b.dom):null
    }));
}

function monthlyTrend(points,key){
  const valid=points.filter(p=>Number.isFinite(p[key])).map(p=>({date:p.date,median:p[key]}));
  return {
    linear:valid.length>=2?fitLinearTrend(valid):null,
    quadratic:valid.length>=3?fitQuadraticTrend(valid):null
  };
}

function drawMonthlyActivityChart(svgId,points,key,trendState,label){
  const svg=document.getElementById(svgId);
  if(!svg)return;
  svg.innerHTML='';
  const W=900,H=360,ml=58,mr=18,mt=18,mb=58;
  const plotW=W-ml-mr,plotH=H-mt-mb;
  const valid=points.filter(p=>Number.isFinite(p[key]));
  if(!valid.length){
    svg.innerHTML='<text x="450" y="180" text-anchor="middle" fill="#64748b" font-size="14">No data available</text>';
    return;
  }
  const minDate=points[0].date,maxDate=points[points.length-1].date;
  const span=Math.max(maxDate-minDate,86400000*28);
  const vals=valid.map(p=>p[key]);
  const vmin=Math.min(0,...vals),vmax=Math.max(...vals);
  const pad=Math.max((vmax-vmin)*.12,1);
  const yMin=Math.max(0,vmin-pad),yMax=vmax+pad;
  const x=d=>ml+((d-minDate)/span)*plotW;
  const y=v=>mt+((yMax-v)/(yMax-yMin))*plotH;
  const NS='http://www.w3.org/2000/svg';
  const el=(tag,attrs,text='')=>{
    const e=document.createElementNS(NS,tag);
    Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));
    if(text)e.textContent=text;
    svg.appendChild(e);return e;
  };
  // grid + y labels
  const ticks=4;
  for(let i=0;i<=ticks;i++){
    const val=yMin+(yMax-yMin)*i/ticks, yy=y(val);
    el('line',{x1:ml,y1:yy,x2:W-mr,y2:yy,stroke:'#e2e8f0','stroke-width':1});
    el('text',{x:ml-8,y:yy+4,'text-anchor':'end',fill:'#64748b','font-size':11},key==='sales'?val.toFixed(1):Math.round(val).toLocaleString());
  }
  el('line',{x1:ml,y1:mt,x2:ml,y2:H-mb,stroke:'#94a3b8','stroke-width':1});
  el('line',{x1:ml,y1:H-mb,x2:W-mr,y2:H-mb,stroke:'#94a3b8','stroke-width':1});

  const step=Math.max(1,Math.ceil(points.length/8));
  points.forEach((p,i)=>{
    if(i%step!==0 && i!==points.length-1)return;
    const xx=x(p.date);
    el('line',{x1:xx,y1:H-mb,x2:xx,y2:H-mb+5,stroke:'#94a3b8'});
    el('text',{x:xx,y:H-mb+20,'text-anchor':'middle',fill:'#64748b','font-size':10},p.date.toLocaleDateString('en-US',{month:'short',year:'2-digit'}));
  });

  // data line and points
  const path=valid.map((p,i)=>(i?'L':'M')+x(p.date).toFixed(2)+' '+y(p[key]).toFixed(2)).join(' ');
  el('path',{d:path,fill:'none',stroke:'#475569','stroke-width':2});
  valid.forEach(p=>el('circle',{cx:x(p.date),cy:y(p[key]),r:3.5,fill:'#fff',stroke:'#334155','stroke-width':1.7}));

  const trends=monthlyTrend(points,key);
  if(trendState.linear && trends.linear){
    el('path',{d:`M ${x(minDate)} ${y(trends.linear.valueAtDate(minDate))} L ${x(maxDate)} ${y(trends.linear.valueAtDate(maxDate))}`,fill:'none',stroke:'#64748b','stroke-width':2,'stroke-dasharray':'7 5'});
  }
  if(trendState.quadratic && trends.quadratic){
    let d='';
    for(let i=0;i<=60;i++){
      const dt=new Date(minDate.getTime()+span*i/60);
      d+=(i?' L ':'M ')+x(dt).toFixed(2)+' '+y(trends.quadratic.valueAtDate(dt)).toFixed(2);
    }
    el('path',{d,fill:'none',stroke:'#1f2937','stroke-width':2,'stroke-dasharray':'2 4'});
  }
  el('text',{x:ml,y:12,fill:'#475569','font-size':11},label);
}

function renderMonthlyActivity(){
  const section=document.getElementById('monthlyActivitySection');
  if(!section)return;
  const points=buildMonthlyActivity();
  if(!points.length){section.style.display='none';return;}
  section.style.display='block';
  drawMonthlyActivityChart('monthlyAbsorptionChart',points,'sales',monthlyTrendState.absorption,'Closed sales / month');
  drawMonthlyActivityChart('monthlyDomChart',points,'medianDOM',monthlyTrendState.dom,'Days on market');
}


(function initMonthlyActivityControls(){
  document.addEventListener('click',e=>{
    const btn=e.target.closest('.monthly-trend-btn');
    if(!btn)return;
    const group=btn.closest('.monthly-trend-controls');
    const chart=group?.dataset.chart;
    const trend=btn.dataset.trend;
    if(!chart||!trend)return;
    monthlyTrendState[chart][trend]=!monthlyTrendState[chart][trend];
    btn.classList.toggle('active',monthlyTrendState[chart][trend]);
    renderMonthlyActivity();
  });
})();
