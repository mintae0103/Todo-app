// calendar.js — 라이트 월간 캘린더 (Undo 지원)
// - 날짜 드래그 이동 Undo
// - Day 패널 삭제 Undo
// - 안전 초기화 (DOM 준비/캘린더 탭 진입 시 렌더)
(function(){
    function initCalendar(){
      const need = ['calLabel','calPrev','calNext','calToday','calCells'];
      for (const id of need){ if(!document.getElementById(id)) return; }
  
      const $ = (s, r=document)=>r.querySelector(s);
      const LS = { tasks:'td.tasks.v1', cats:'td.cats.v1' };
  
      // ------- Toasts -------
      function toast(msg){
        const host=document.getElementById('toastHost'); if(!host) return;
        const el=document.createElement('div'); el.className='toast'; el.textContent=msg;
        host.appendChild(el); setTimeout(()=>el.remove(), 2000);
      }
      function toastWithUndo(message, undoLabel, onUndo, timeout=5000){
        const host=document.getElementById('toastHost'); if(!host) return;
        const el=document.createElement('div'); el.className='toast';
        const span=document.createElement('span'); span.textContent=message;
        const btn=document.createElement('button'); btn.textContent=undoLabel||'되돌리기'; btn.style.marginLeft='10px';
        let settled=false; const done=()=>{ if(settled) return; settled=true; clearTimeout(timer); el.remove(); };
        btn.addEventListener('click', ()=>{ try{ onUndo?.(); } finally{ done(); } });
        el.append(span, btn); host.appendChild(el);
        const timer=setTimeout(done, timeout);
      }
  
      // ------- Scroll lock during drag (mobile) -------
      function lockScroll(){
        if (document.body.classList.contains('drag-lock')) return;
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        document.body.dataset.lockScrollY = String(y);
        document.body.classList.add('drag-lock');
        document.body.style.position='fixed';
        document.body.style.top=`-${y}px`;
        document.body.style.left='0'; document.body.style.right='0'; document.body.style.width='100%';
        window.addEventListener('touchmove', prevent, {passive:false});
      }
      function unlockScroll(){
        if (!document.body.classList.contains('drag-lock')) return;
        const y = parseInt(document.body.dataset.lockScrollY||'0',10);
        document.body.classList.remove('drag-lock');
        document.body.style.position=''; document.body.style.top=''; document.body.style.left=''; document.body.style.right=''; document.body.style.width='';
        delete document.body.dataset.lockScrollY;
        window.removeEventListener('touchmove', prevent, {passive:false});
        window.scrollTo(0,y);
      }
      function prevent(e){ e.preventDefault(); }
  
      // ------- Storage -------
      function load(){
        let tasks=[], cats=[];
        try{ tasks = JSON.parse(localStorage.getItem(LS.tasks)||'[]'); }catch{}
        try{ cats  = JSON.parse(localStorage.getItem(LS.cats)||'[]'); }catch{}
        if (!cats.length) cats=[{id:'inbox', name:'Inbox', color:'#3b82f6', order:0}];
        return {tasks, cats};
      }
      function saveTasks(tasks){ localStorage.setItem(LS.tasks, JSON.stringify(tasks)); }
  
      // ------- State & Elements -------
      const cal = { y:new Date().getFullYear(), m:new Date().getMonth(), sel:null };
      const el = {
        label: $('#calLabel'),
        prev:  $('#calPrev'),
        next:  $('#calNext'),
        today: $('#calToday'),
        cells: $('#calCells'),
        dayPanel: $('#dayPanel'),
        dayTitle: $('#dayTitle'),
        dayCount: $('#dayCount'),
        dayList: $('#dayList'),
        dayAdd: $('#dayAdd'),
        dayClose: $('#dayClose'),
      };
  
      // ------- Date helpers -------
      const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const parseKey = k => { const [y,m,d]=k.split('-').map(n=>parseInt(n,10)); return new Date(y,m-1,d); };
      const isSameDay = (a,b)=> a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
      const monthLabel = (y,m)=> `${y}. ${String(m+1).padStart(2,'0')}`;
  
      function buildMonth(y,m){
        const first = new Date(y,m,1);
        const startOffset = ((first.getDay()||7)-1); // weekStart = Mon
        const start = new Date(y,m,1-startOffset);
        const arr=[]; for(let i=0;i<42;i++) arr.push(new Date(start.getFullYear(), start.getMonth(), start.getDate()+i));
        return arr;
      }
  
      // ------- Render -------
      function render(){
        const {tasks, cats} = load();
        const byCat = new Map(cats.map(c=>[c.id,c]));
        const today = new Date(); today.setHours(0,0,0,0);
        el.label.textContent = monthLabel(cal.y, cal.m);
  
        const days = buildMonth(cal.y, cal.m);
        el.cells.innerHTML = '';
        days.forEach(d=>{
          const key = fmtDate(d);
          const cell = document.createElement('div');
          cell.className='cal-cell';
          if (d.getMonth()!==cal.m) cell.classList.add('other');
          if (isSameDay(d,today)) cell.classList.add('today');
          cell.dataset.key = key;
  
          const head = document.createElement('div');
          head.className='date';
          head.innerHTML = `<span>${d.getDate()}</span>`;
          cell.appendChild(head);
  
          const items = tasks.filter(t=> t.dueAt && fmtDate(new Date(t.dueAt))===key)
                             .sort((a,b)=>(a.order??0)-(b.order??0));
  
          const maxChips = 2;
          items.slice(0,maxChips).forEach(t=>{
            const chip = document.createElement('div');
            chip.className='cal-chip';
            chip.dataset.taskId = t.id;
  
            const cat = byCat.get(t.categoryId||'inbox') || {color:'#3b82f6', name:'Inbox'};
            const dot = document.createElement('span'); dot.className='dot'; dot.style.background=cat.color;
            const title = document.createElement('span'); title.className='title'; title.textContent=t.title;
  
            chip.append(dot,title);
            chip.addEventListener('click', (e)=>{
              e.stopPropagation();
              if (typeof openTaskModal==='function') openTaskModal('edit', t);
            });
  
            enableChipDrag(chip); // 드래그+Undo
            cell.appendChild(chip);
          });
  
          if (items.length > maxChips){
            const more = document.createElement('div');
            more.className='cal-more';
            more.textContent = `+${items.length - maxChips}`;
            cell.appendChild(more);
          }
  
          cell.addEventListener('click', ()=> openDay(key));
          el.cells.appendChild(cell);
        });
  
        if (cal.sel) openDay(cal.sel, true);
      }
  
      function openDay(key){
        cal.sel = key;
        el.dayTitle.textContent = key;
  
        const {tasks, cats} = load();
        const byCat = new Map(cats.map(c=>[c.id,c]));
        const list = tasks
          .filter(t=> t.dueAt && fmtDate(new Date(t.dueAt))===key)
          .sort((a,b)=>(a.order??0)-(b.order??0));
  
        el.dayCount.textContent = `(${list.length}개)`;
        el.dayList.innerHTML = '';
  
        list.forEach((t)=>{
          const row = document.createElement('div');
          row.className='day-item';
  
          const left = document.createElement('div'); left.className='left';
          const dot  = document.createElement('span'); dot.className='dot';
          const cat  = byCat.get(t.categoryId||'inbox') || {color:'#3b82f6', name:'Inbox'};
          dot.style.background = cat.color;
          const title = document.createElement('div'); title.className='title'; title.textContent = t.title;
          left.append(dot,title);
  
          const actions = document.createElement('div'); actions.className='actions';
          const edit = document.createElement('button'); edit.textContent='✏️';
          const del  = document.createElement('button'); del.textContent='🗑️';
  
          edit.addEventListener('click', ()=>{ if (typeof openTaskModal==='function') openTaskModal('edit', t); });
          del.addEventListener('click', ()=>{
            // 삭제 + Undo
            const data = load().tasks;
            const idx = data.findIndex(x=>x.id===t.id);
            if (idx>=0){
              const removed = data.splice(idx,1)[0];
              saveTasks(data);
              if (typeof renderTasks==='function') renderTasks();
              render();
  
              toastWithUndo('🗑️ 삭제됨', '되돌리기', ()=>{
                const arr = load().tasks;
                if (!arr.find(x=>x.id===removed.id)){
                  const pos = Math.min(Math.max(idx,0), arr.length);
                  arr.splice(pos, 0, removed);
                  saveTasks(arr);
                  if (typeof renderTasks==='function') renderTasks();
                  render();
                }
              }, 6000);
            }
          });
  
          actions.append(edit, del);
          row.append(left, actions);
          el.dayList.appendChild(row);
        });
  
        el.dayPanel.hidden=false;
  
        el.dayAdd.onclick = ()=>{
          if (typeof openTaskModal==='function') openTaskModal('create');
          setTimeout(()=>{
            const inp = document.getElementById('taskDueInput');
            if (inp) inp.value = key;
          },0);
        };
        el.dayClose.onclick = ()=> el.dayPanel.hidden = true;
      }
  
      // ------- Chip drag (with Undo) -------
      function enableChipDrag(chip){
        let drag=null;
        const onDown = (e)=>{
          if (e.pointerType==='mouse' && e.button!==0) return;
          const y0 = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
          const x0 = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
          e.preventDefault();
  
          let started=false;
          lockScroll();
          const timer = setTimeout(()=> start(x0,y0), 160);
  
          function start(x,y){
            started=true;
            const r=chip.getBoundingClientRect();
            const ghost = chip.cloneNode(true);
            ghost.style.position='fixed'; ghost.style.left=r.left+'px'; ghost.style.top=r.top+'px';
            ghost.style.width=r.width+'px'; ghost.style.zIndex='1002'; ghost.style.pointerEvents='none';
            ghost.style.boxShadow='0 12px 32px rgba(0,0,0,.35)'; ghost.style.opacity='.98';
            document.body.appendChild(ghost);
            drag = {ghost, x, y, taskId:chip.dataset.taskId};
          }
  
          const onMove = (ev)=>{
            const x = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
            const y = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;
            if (!started && (Math.abs(x-x0)>6 || Math.abs(y-y0)>6)){ clearTimeout(timer); start(x0,y0); }
            if (!drag) return;
            const dx = x - drag.x, dy = y - drag.y;
            drag.ghost.style.transform = `translate(${dx}px, ${dy}px)`;
          };
  
          const onUp = (ev)=>{
            clearTimeout(timer);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
  
            if (!drag){ unlockScroll(); return; }
  
            const x = ev.clientX ?? ev.changedTouches?.[0]?.clientX ?? 0;
            const y = ev.clientY ?? ev.changedTouches?.[0]?.clientY ?? 0;
            const drop = document.elementFromPoint(x,y)?.closest('.cal-cell');
            const dropKey = drop?.dataset.key;
  
            drag.ghost.remove(); drag=null; unlockScroll();
            if (!dropKey) return;
  
            // 저장 + Undo
            const {tasks} = load();
            const t = tasks.find(v=>v.id===chip.dataset.taskId);
            if (t){
              const prevDue = t.dueAt ?? null; // 이전값 백업
              t.dueAt = new Date(dropKey+'T00:00:00').getTime();
              t.updatedAt = Date.now();
              saveTasks(tasks);
              if (typeof renderTasks==='function') renderTasks();
              render();
  
              toastWithUndo('📅 날짜 변경됨', '되돌리기', ()=>{
                const arr = load().tasks;
                const tt = arr.find(v=>v.id===t.id);
                if (!tt) return;
                tt.dueAt = prevDue;
                tt.updatedAt = Date.now();
                saveTasks(arr);
                if (typeof renderTasks==='function') renderTasks();
                render();
              }, 6000);
            }
          };
  
          window.addEventListener('pointermove', onMove, {passive:false});
          window.addEventListener('pointerup', onUp, {passive:false});
          window.addEventListener('touchmove', onMove, {passive:false});
          window.addEventListener('touchend', onUp, {passive:false});
        };
        chip.addEventListener('pointerdown', onDown, {passive:false});
      }
  
      // ------- Nav -------
      el.prev?.addEventListener('click', ()=>{ cal.m--; if (cal.m<0){ cal.m=11; cal.y--; } render(); });
      el.next?.addEventListener('click', ()=>{ cal.m++; if (cal.m>11){ cal.m=0; cal.y++; } render(); });
      el.today?.addEventListener('click', ()=>{ const t=new Date(); cal.y=t.getFullYear(); cal.m=t.getMonth(); render(); });
  
      function tryRenderWhenVisible(){
        if (location.hash === '#calendar' || document.getElementById('calendar')?.hidden === false){
          render();
        }
      }
      window.addEventListener('hashchange', tryRenderWhenVisible);
      tryRenderWhenVisible(); // 첫 진입 시
    }
  
    if (document.readyState === 'loading'){
      window.addEventListener('DOMContentLoaded', initCalendar);
    } else {
      initCalendar();
    }
  })();