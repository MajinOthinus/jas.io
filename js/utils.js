/* Shared display helpers used by all analysis pages. */
function fmtDate(date){
  if(!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});
}

function fmtMoney(value){
  if(!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US',{
    style:'currency',
    currency:'USD',
    maximumFractionDigits:0
  });
}
