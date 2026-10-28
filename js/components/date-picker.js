
(function(){
  let activeCalendar=null;

  function parseYMD(v){
    if(!v) return null;
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if(!m) return null;
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function ymd(d){
    return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
  }
  function closeCalendar(){
    if(activeCalendar){
      activeCalendar.remove();
      activeCalendar=null;
    }
  }
  function openCalendar(input){
    closeCalendar();
    const committed=parseYMD(input.value);
    const now=new Date();
    let view=committed ? new Date(committed.getFullYear(),committed.getMonth(),1)
                       : new Date(now.getFullYear(),now.getMonth(),1);
    let selected=committed ? new Date(committed) : null;

    const pop=document.createElement('div');
    pop.className='comp-calendar';
    pop.addEventListener('click',e=>e.stopPropagation());

    function render(){
      const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
      pop.innerHTML='';
      const head=document.createElement('div');
      head.className='comp-calendar-head';

      const selects=document.createElement('div');
      selects.className='comp-calendar-selects';

      const monthSelect=document.createElement('select');
      monthSelect.className='comp-calendar-select month';
      monthNames.forEach((name,i)=>{
        const option=document.createElement('option');
        option.value=String(i);
        option.textContent=name;
        option.selected=i===view.getMonth();
        monthSelect.appendChild(option);
      });

      const yearSelect=document.createElement('select');
      yearSelect.className='comp-calendar-select year';
      const currentYear=new Date().getFullYear();
      for(let year=currentYear-20;year<=currentYear+5;year++){
        const option=document.createElement('option');
        option.value=String(year);
        option.textContent=String(year);
        option.selected=year===view.getFullYear();
        yearSelect.appendChild(option);
      }

      selects.appendChild(monthSelect);
      selects.appendChild(yearSelect);

      const nav=document.createElement('div');
      nav.className='comp-calendar-nav';
      nav.innerHTML='<button type="button" data-nav="-1">‹</button><button type="button" data-nav="1">›</button>';

      head.appendChild(selects);
      head.appendChild(nav);
      pop.appendChild(head);

      monthSelect.addEventListener('change',()=>{
        view=new Date(Number(yearSelect.value),Number(monthSelect.value),1);
        render();
      });
      yearSelect.addEventListener('change',()=>{
        view=new Date(Number(yearSelect.value),Number(monthSelect.value),1);
        render();
      });

      nav.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{
        view=new Date(view.getFullYear(),view.getMonth()+Number(b.dataset.nav),1);
        render();
      }));

      const week=document.createElement('div');
      week.className='comp-calendar-week';
      ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(x=>{
        const el=document.createElement('div'); el.textContent=x; week.appendChild(el);
      });
      pop.appendChild(week);

      const grid=document.createElement('div');
      grid.className='comp-calendar-grid';
      const first=new Date(view.getFullYear(),view.getMonth(),1);
      const start=new Date(view.getFullYear(),view.getMonth(),1-first.getDay());
      for(let i=0;i<42;i++){
        const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
        const b=document.createElement('button');
        b.type='button'; b.className='comp-calendar-day'; b.textContent=d.getDate();
        if(d.getMonth()!==view.getMonth()) b.classList.add('muted');
        if(selected && ymd(d)===ymd(selected)) b.classList.add('selected');
        if(ymd(d)===ymd(now)) b.classList.add('today');
        b.addEventListener('click',()=>{
          selected=new Date(d);
          render();
        });
        grid.appendChild(b);
      }
      pop.appendChild(grid);

      const actions=document.createElement('div');
      actions.className='comp-calendar-actions';
      actions.innerHTML='<button type="button" class="cancel">Cancel</button><button type="button" class="confirm">Confirm</button>';
      actions.querySelector('.cancel').addEventListener('click',closeCalendar);
      actions.querySelector('.confirm').addEventListener('click',()=>{
        if(!selected){ closeCalendar(); return; }
        input.value=ymd(selected);
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        closeCalendar();
      });
      pop.appendChild(actions);
    }

    const wrap=input.closest('.comp-date-wrap') || input.parentElement;
    wrap.appendChild(pop);
    activeCalendar=pop;
    render();
  }

  function bind(){
    document.querySelectorAll('.comp-date, .effective-date').forEach(input=>{
      input.setAttribute('readonly','readonly');
      input.addEventListener('click',e=>{
        e.stopPropagation();
        openCalendar(input);
      });
    });
  }

  document.addEventListener('click',e=>{
    if(activeCalendar && !activeCalendar.contains(e.target) && !e.target.classList.contains('comp-date')){
      closeCalendar();
    }
  });

  // renderCompRows creates rows dynamically, so wrap it once to bind each new row.
  const originalRenderCompRows=window.renderCompRows;
  if(typeof originalRenderCompRows==='function'){
    window.renderCompRows=function(){
      originalRenderCompRows();
      bind();
    };
  }
  document.addEventListener('DOMContentLoaded',bind);
})();
