// === calendar.js — 라이트 월간 캘린더 (tasks 기반) ===
(function(){
    const $ = (s, r=document)=>r.querySelector(s);
    const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
    const LS = { tasks:'td.tasks.v1', cats:'td.cats.v1' };
  
    // 간단 스크롤 잠금(독립 동작)
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
  
    function load(){
      let tasks=[], cats=[];
      try{ tasks = JSON.parse(localStorage.getItem(LS.tasks)||'[]'); }catch{}
      try{ cats  = JSON.parse(localStorage.getItem(LS.cats)||'[]'); }catch{}
      if (!cats.length) cats=[{id:'inbox', name:'Inbox', color:'#3b82f6', order:0}];
      return {tasks, cats};
    }
    function saveTasks(tasks){
      localStorage.setItem(LS.tasks, JSON.stringify(tasks));
    }
    function toast(msg){ const host=$('#toastHost'); if(!host) return; const el=document.createElement('div'); el.className='toast'; el.textContent=msg; host.appendChild(el); setTimeout(()=>el.remove(),2000); }
  
    const cal = {
      y: new Date().getFullYear(),
      m: new Date().getMonth(), // 0-11
      sel: null,               // 선택 날짜(yyyy-mm-dd)
    };
  
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
  
    function fmtDate(d){ // Date -> 'YYYY-MM-DD'
      const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${dd}`;
    }
    function parseKey(key){ // 'YYYY-MM-DD' -> Date
      const [y,m,d]=key.split('-').map(n=>parseInt(n,10));
      return new Date(y, m-1, d);
    }
    function isSameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  
    function monthLabel(y,m){ return `${y}. ${String(m+1).padStart(2,'0')}`; }
  
    function buildMonth(y,m){
      // weekStart=Mon(1)
      const first = new Date(y,m,1);
      const startOffset = ( (first.getDay()||7) - 1 ); // 0(월)~6(일)
      const start = new Date(y,m,1 - startOffset);
      const cells = [];
      for (let i=0;i<42;i++){
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
        cells.push(d);
      }
      return cells;
    }
  
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
        cell.className = 'cal-cell';
        if (d.getMonth() !== cal.m) cell.classList.add('other');
        if (isSameDay(d, today)) cell.classList.add('today');
        cell.dataset.key = key;
  
        // 상단 날짜/선택
        const head = document.createElement('div');
        head.className='date';
        head.innerHTML = `<span>${d.getDate()}</span>`;
        cell.appendChild(head);
  
        // 해당 날짜 할 일
        const items = tasks.filter(t=> t.dueAt && fmtDate(new Date(t.dueAt)) === key)
                           .sort((a,b)=>(a.order??0)-(b.order??0));
  
        // 최대 2개 칩 + +N
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
            if (typeof openTaskModal === 'function') openTaskModal('edit', t);
          });
          enableChipDrag(chip);
          cell.appendChild(chip);
        });
        if (items.length > maxChips){
          const more = document.createElement('div');
          more.className='cal-more';
          more.textContent = `+${items.length - maxChips}`;
          cell.appendChild(more);
        }
  
        // 셀 클릭 → Day 패널 열기
        cell.addEventListener('click', ()=> openDay(key));
        el.cells.appendChild(cell);
      });
  
      // 선택된 날짜 유지
      if (cal.sel) openDay(cal.sel, true);
    }
  
    function openDay(key, keep=false){
      cal.sel = key;
      const d = parseKey(key);
      el.dayTitle.textContent = key;
  
      const {tasks, cats} = load();
      const byCat = new Map(cats.map(c=>[c.id,c]));
      const list = tasks.filter(t=> t.dueAt && fmtDate(new Date(t.dueAt)) === key)
                        .sort((a,b)=>(a.order??0)-(b.order??0));
      el.dayCount.textContent = `(${list.length}개)`;
      el.dayList.innerHTML = '';
  
      list.forEach(t=>{
        const row = document.createElement('div');
        row.className = 'day-item';
        const left = document.createElement('div'); left.className='left';
        const dot = document.createElement('span'); dot.className='dot';
        const cat = byCat.get(t.categoryId||'inbox') || {color:'#3b82f6', name:'Inbox'};
        dot.style.background = cat.color;
        const title = document.createElement('div'); title.className='title'; title.textContent=t.title;
        left.append(dot,title);
  
        const actions = document.createElement('div'); actions.className='actions';
        const edit = document.createElement('button'); edit.textContent='✏️';
        const del  = document.createElement('button'); del.textContent='🗑️';
        edit.addEventListener('click', ()=> { if (typeof openTaskModal==='function') openTaskModal('edit', t); });
        del.addEventListener('click', ()=>{
          const {tasks} = load();
          const idx=tasks.findIndex(x=>x.id===t.id);
          if (idx>=0){
            const removed = tasks.splice(idx,1)[0];
            saveTasks(tasks);
            if (typeof renderTasks==='function') renderTasks();
            render();
            toast('🗑️ 삭제됨');
            // 간단 undo는 calendar.js에선 생략(필요시 todo.js toast undo와 연결 가능)
          }
        });
        actions.append(edit, del);
        row.append(left, actions);
        el.dayList.appendChild(row);
      });
  
      el.dayPanel.hidden = false;
  
      // “이 날짜에 추가” → 생성 모달 프리필
      el.dayAdd.onclick = ()=>{
        if (typeof openTaskModal === 'function') openTaskModal('create');
        setTimeout(()=>{
          const inp = document.getElementById('taskDueInput');
          if (inp) inp.value = key;
        }, 0);
      };
      el.dayClose.onclick = ()=>{ el.dayPanel.hidden = true; };
    }
  
    // 칩 드래그 → 다른 날짜로 이동
    function enableChipDrag(chip){
      let drag=null;
      const onDown = (e)=>{
        if (e.pointerType==='mouse' && e.button!==0) return;
        const y0 = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
        const x0 = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
        e.preventDefault();
  
        let started=false;
        lockScroll();
        const timer = setTimeout(()=> start(x0,y0), 180);
  
        function start(x,y){
          started=true;
          const r=chip.getBoundingClientRect();
          const ghost = chip.cloneNode(true);
          ghost.style.position='fixed'; ghost.style.left=r.left+'px'; ghost.style.top=r.top+'px';
          ghost.style.width=r.width+'px'; ghost.style.zIndex='1002'; ghost.style.pointerEvents='none';
          ghost.style.boxShadow='0 12px 32px rgba(0,0,0,.35)'; ghost.style.opacity='.98';
          document.body.appendChild(ghost);
  
          const fromCell = chip.closest('.cal-cell');
          const taskId = chip.dataset.taskId;
          drag = {ghost, x, y, taskId, fromCell};
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
  
          // 드롭 대상 셀 찾기
          const x = ev.clientX ?? ev.changedTouches?.[0]?.clientX ?? 0;
          const y = ev.clientY ?? ev.changedTouches?.[0]?.clientY ?? 0;
          const drop = document.elementFromPoint(x,y)?.closest('.cal-cell');
          const dropKey = drop?.dataset.key;
  
          drag.ghost.remove(); drag=null; unlockScroll();
  
          if (!dropKey) return;
          // 데이터 갱신
          const {tasks} = load();
          const t = tasks.find(v=>v.id===chip.dataset.taskId);
          if (t){
            t.dueAt = new Date(dropKey+'T00:00:00').getTime();
            t.updatedAt = Date.now();
            saveTasks(tasks);
            if (typeof renderTasks==='function') renderTasks();
            render();
            toast('📅 날짜 변경됨');
          }
        };
  
        window.addEventListener('pointermove', onMove, {passive:false});
        window.addEventListener('pointerup', onUp, {passive:false});
        window.addEventListener('touchmove', onMove, {passive:false});
        window.addEventListener('touchend', onUp, {passive:false});
      };
  
      chip.addEventListener('pointerdown', onDown, {passive:false});
    }
  
    // 네비 버튼
    el.prev?.addEventListener('click', ()=>{
      cal.m--; if (cal.m<0){ cal.m=11; cal.y--; } render();
    });
    el.next?.addEventListener('click', ()=>{
      cal.m++; if (cal.m>11){ cal.m=0; cal.y++; } render();
    });
    el.today?.addEventListener('click', ()=>{
      const t=new Date(); cal.y=t.getFullYear(); cal.m=t.getMonth(); render();
    });
  
    // 초기 렌더 (캘린더 섹션이 열릴 때마다 업데이트 되도록 hashchange에도 연결 권장)
    window.addEventListener('hashchange', ()=>{
      if (location.hash==='#calendar') render();
    });
  
    // 첫 로드
    render();
  })();