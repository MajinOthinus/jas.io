document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.analysis-nav-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.analysis-nav-btn').forEach(b=>b.classList.toggle('active',b===btn));
    document.querySelectorAll('.analysis-page').forEach(p=>p.style.display=p.id===btn.dataset.page?'block':'none');
    if(btn.dataset.page==='glaPage' && typeof window.renderGLAAnalysis==='function') window.renderGLAAnalysis();
  }));
});
