
(function(){
  function addRemoveButtons(){
    document.querySelectorAll('#compRows .comp-row').forEach((row)=>{
      if(row.querySelector('.remove-comp')) return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='remove-comp';
      btn.title='Remove this comp';
      btn.textContent='×';
      row.appendChild(btn);
    });
  }

  document.addEventListener('click',(e)=>{
    const btn=e.target.closest('#compRows .remove-comp');
    if(!btn) return;
    const row=btn.closest('.comp-row');
    if(!row) return;

    // Clear this comp's data but keep the comp slot itself. The comp count
    // controls how many rows exist, so removing the DOM row would make that
    // slot unavailable for future graph-selected comps.
    const date=row.querySelector('.comp-date');
    const price=row.querySelector('.comp-price');
    if(date) date.value='';
    if(price) price.value='';
    row.classList.remove('matched');

    // Re-run existing comp matching / calculations.
    if(typeof updateComps==='function') updateComps();
    if(typeof redrawCurrentGraph==='function') redrawCurrentGraph();

    const status=document.getElementById('graphSelectStatus');
    if(status) status.textContent=`Cleared ${row.querySelector('.comp-label')?.textContent || 'comp'}.`;
  });

  // The comp rows are generated dynamically; observe additions.
  const target=document.getElementById('compRows');
  if(target){
    addRemoveButtons();
    new MutationObserver(addRemoveButtons).observe(target,{childList:true,subtree:true});
  }
})();
