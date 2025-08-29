// goals.js — 목표(time/check + 루틴 필터) & 루틴(check) CRUD
// 모달 폴백(iOS), 클릭/터치 바인딩, 요일 라벨, 루틴 생성/수정/삭제/렌더 포함
const GOALS_KEY    = 'goals.v1';
const ROUTINES_KEY = 'routines.v1';
const ROUTELOG_KEY = 'routines.logs.v1';
const FOCUS_KEY    = 'focus.logs.v1';

(function(){
  const $  = (s, r=document)=>r.querySelector(s);
  const ce = (tag, props={})=> Object.assign(document.createElement(tag), props);
  const uid= ()=> (crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2));

  /* ---------------- Toast ---------------- */
  function toast(msg){
    const host = $('#toastHost'); if(!host) return;
    const el = ce('div', {className:'toast', textContent: msg});
    host.appendChild(el); setTimeout(()=>el.remove(), 2200);
  }

  /* ---------------- Storage ---------------- */
  const load = (k, def=[]) => { try{ return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); }catch{ return def; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------------- Dialog helpers ---------------- */
  function lockScroll(lock){
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    document.body.style.overflow = lock ? 'hidden' : '';
  }
  function openDialog(d){
    if (!d) return;
    try {
      if (typeof d.showModal === 'function') d.showModal();
      else { d.setAttribute('open',''); d.removeAttribute('hidden'); }
    } catch {
      d.setAttribute('open',''); d.removeAttribute('hidden');
    }
    lockScroll(true);
  }
  function closeDialog(d){
    if (!d) return;
    try { d.close(); }
    catch { d.removeAttribute('open'); d.setAttribute('hidden',''); }
    lockScroll(false);
  }

  /* ---------------- Time helpers & Progress ---------------- */
  const startOfDay = (d)=>{ const x=new Date(d); x.setHours(0,0,0,0); return x; };
  const endOfDay   = (d)=>{ const x=new Date(d); x.setHours(23,59,59,999); return x; };
  const startOfWeekMon = (d)=>{ const x=startOfDay(d); const day=x.getDay()||7; x.setDate(x.getDate()-(day-1)); return x; };
  const endOfWeekMon   = (d)=>{ const s=startOfWeekMon(d); const e=new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999); return e; };
  const startOfMonth   = (d)=>{ const x=new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; };
  const endOfMonth     = (d)=>{ const x=new Date(d); x.setMonth(x.getMonth()+1,0); x.setHours(23,59,59,999); return x; };
  const minutes        = (ms)=> Math.floor(ms/60000);
  function getPeriodRange(p){ const now=new Date(); if(p==='daily')return[startOfDay(now).getTime(),endOfDay(now).getTime()]; if(p==='monthly')return[startOfMonth(now).getTime(),endOfMonth(now).getTime()]; return[startOfWeekMon(now).getTime(),endOfWeekMon(now).getTime()]; }

  function computeGoalProgress(goal){
    const [from,to]=getPeriodRange(goal.period||'weekly');
    let current=0,target=Math.max(1,parseInt(goal.target||0,10));
    if(goal.kind==='time'){
      const logs=load(FOCUS_KEY,[]);
      const sumMs=logs.filter(x=>x.start>=from&&x.start<=to).reduce((a,x)=>a+(x.durationMs||0),0);
      current=minutes(sumMs);
    } else {
      const logs=load(ROUTELOG_KEY,[]);
      current=logs.filter(l=>{
        const t=new Date(l.date).getTime();
        if(!(t>=from&&t<=to)) return false;
        if(Array.isArray(goal.routineIds)&&goal.routineIds.length){
          return goal.routineIds.includes(l.rid);
        }
        return true;
      }).length;
    }
    const ratio=Math.max(0,Math.min(1,current/target));
    return {current,target,ratio,unit:(goal.kind==='time')?'분':'회'};
  }

  /* ---------------- Routines helpers ---------------- */
  const DOW_LABEL={1:'월',2:'화',3:'수',4:'목',5:'금',6:'토',7:'일'};
  const daysToLabel=(days=[])=>!days?.length?'-':days.slice().sort((a,b)=>a-b).map(d=>DOW_LABEL[d]||d).join(',');
  const isScheduledToday=(r)=>{const f=r.schedule?.freq||'weekly'; if(f==='daily')return true; const dow=(new Date().getDay()||7); return r.schedule?.days?.includes(dow);};
  function markRoutineToday(r){const logs=load(ROUTELOG_KEY,[]);const d=new Date();const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;if(logs.some(x=>x.rid===r.id&&x.date===key))return false;logs.push({rid:r.id,date:key});save(ROUTELOG_KEY,logs);return true;}
  function unmarkRoutineToday(r){const logs=load(ROUTELOG_KEY,[]);const d=new Date();const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const idx=logs.findIndex(x=>x.rid===r.id&&x.date===key);if(idx<0)return false;logs.splice(idx,1);save(ROUTELOG_KEY,logs);return true;}

  /* ---------------- Render: Goals ---------------- */
  function renderGoals(){
    const grid=$('#goalGrid'); if(!grid) return;
    const goals=load(GOALS_KEY,[]); grid.innerHTML='';
    if(!goals.length){grid.appendChild(ce('div',{className:'muted',textContent:'목표가 없습니다. "목표 추가"로 만들어보세요.'}));return;}
    goals.forEach(g=>{
      const card=ce('div'); Object.assign(card.style,{border:'1px solid var(--border)',borderRadius:'12px',background:'#11151e',padding:'12px',display:'flex',flexDirection:'column',gap:'8px'});
      const head=ce('div'); head.style.display='flex'; head.style.alignItems='center';
      const title=ce('div',{textContent:g.title}); title.style.flex='1';
      const editBtn=ce('button',{textContent:'✏',title:'수정'});
      const delBtn=ce('button',{textContent:'🗑',title:'삭제'});
      editBtn.addEventListener('click',()=>openGoalEdit(g.id));
      delBtn.addEventListener('click',()=>{const arr=load(GOALS_KEY,[]);const idx=arr.findIndex(x=>x.id===g.id);if(idx<0)return;arr.splice(idx,1);save(GOALS_KEY,arr);renderGoals();toast('목표 삭제됨');});
      head.append(title,editBtn,delBtn);

      const barWrap=ce('div');Object.assign(barWrap.style,{height:'8px',background:'#0b0f16',border:'1px solid var(--border)',borderRadius:'999px',overflow:'hidden'});
      const bar=ce('div');Object.assign(bar.style,{height:'100%',background:'#3b82f6',width:'0%'});barWrap.append(bar);
      const p=computeGoalProgress(g); bar.style.width=`${Math.round(p.ratio*100)}%`;
      const text=ce('div');text.className='muted';text.textContent=`진행: ${p.current}${p.unit} / ${p.target}${p.unit} (${Math.round(p.ratio*100)}%)`;

      card.append(head,barWrap,text);grid.appendChild(card);
    });
  }

  /* ---------------- Render: Routines ---------------- */
  function renderRoutines(){
    const host = $('#routineList'); if (!host) return;
    const routines = load(ROUTINES_KEY, []);
    host.innerHTML='';
    if (!routines.length){
      host.appendChild(ce('div',{className:'muted', textContent:'루틴이 없습니다. "루틴 추가"로 만들어보세요.'}));
      return;
    }
    routines.forEach(r=>{
      const row = ce('div'); Object.assign(row.style,{border:'1px solid var(--border)',borderRadius:'12px',background:'#11151e',padding:'10px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px'});
      const left = ce('div'); Object.assign(left.style,{display:'flex',flexDirection:'column',gap:'4px'});
      const t = ce('div',{textContent: r.title});
      const freq = r.schedule?.freq || 'weekly'; const days = daysToLabel(r.schedule?.days||[]);
      const meta = ce('div',{className:'muted', textContent: (freq==='daily'?'매일':`매주(${days})`) + ' · 단위: 체크' });
      left.append(t, meta);

      const actions = ce('div'); actions.style.display='flex'; actions.style.gap='6px';
      const btnDone = ce('button',{className:'primary', textContent: isScheduledToday(r)?'오늘 완료':'완료'});
      const btnEdit = ce('button',{textContent:'✏', title:'수정'});
      const btnDel  = ce('button',{textContent:'🗑', title:'삭제'});

      btnDone.addEventListener('click', ()=>{
        if (!isScheduledToday(r) && freq!=='daily'){ toast('오늘은 스케줄된 날이 아닙니다'); return; }
        if (markRoutineToday(r)){ toast('🎉 오늘 루틴 완료!'); }
        else { const ok = unmarkRoutineToday(r); toast(ok?'오늘 완료 취소됨':'이미 처리됨'); }
        renderRoutines(); renderGoals();
      });

      // 편집: routineModal 재사용
      btnEdit.addEventListener('click', ()=>{
        const dlg = $('#routineModal'); if (!dlg) return;
        $('#routineForm')?.reset();
        $('#routineTitle').value = r.title || '';
        $('#routineFreq').value  = r.schedule?.freq || 'weekly';
        const wrap = $('#routineDays'); wrap?.querySelectorAll('input[type=checkbox]').forEach(cb=>{
          cb.checked = !!(r.schedule?.days||[]).includes(parseInt(cb.value,10));
        });
        dlg.dataset.editId = r.id;
        openDialog(dlg);
      });

      btnDel.addEventListener('click', ()=>{
        const arr=load(ROUTINES_KEY,[]); const idx=arr.findIndex(x=>x.id===r.id);
        if (idx<0) return; arr.splice(idx,1); save(ROUTINES_KEY,arr);
        renderRoutines(); renderGoals(); toast('루틴 삭제됨');
      });

      actions.append(btnDone, btnEdit, btnDel);
      row.append(left, actions);
      host.appendChild(row);
    });
  }

  /* ---------------- Goal Modal builders ---------------- */
  let editingGoalId=null;

  function buildGoalQuickButtons(){
    const wrap=$('#goalQuick'); if(!wrap) return; wrap.innerHTML='';
    [300,600,900].forEach(min=>{
      const b=ce('button',{type:'button',className:'secondary',textContent:`${min}분`});
      b.addEventListener('click',()=>{$('#goalTarget').value=String(min);});
      wrap.appendChild(b);
    });
  }
  function buildRoutineCheckboxes(selectedIds=new Set()){
    const wrap=$('#goalRoutineList'); if(!wrap) return; wrap.innerHTML='';
    const routines=load(ROUTINES_KEY,[]);
    if(!routines.length){
      wrap.appendChild(ce('div',{className:'muted',textContent:'루틴이 없습니다. 전체 루틴 기준으로 집계됩니다.'}));
      return;
    }
    routines.forEach(r=>{
      const label=ce('label'); Object.assign(label.style,{display:'inline-flex',alignItems:'center',gap:'6px',padding:'2px 8px',border:'1px solid var(--border)',borderRadius:'999px'});
      const cb=ce('input'); cb.type='checkbox'; cb.value=r.id; cb.checked=selectedIds.has(r.id);
      label.append(cb, ce('span',{textContent:r.title}));
      wrap.appendChild(label);
    });
  }

  function openGoalCreate(){
    editingGoalId=null;
    const dlg=$('#goalModal'); if(!dlg){ toast('목표 모달 없음'); return; }
    $('#goalModalTitle').textContent='목표 만들기';
    $('#goalForm')?.reset();
    $('#goalKind').value='time';
    $('#goalPeriod').value='weekly';
    $('#goalTargetLabel').textContent='목표 시간(분)';
    $('#goalTarget').placeholder='예) 600';
    $('#goalQuick').style.display='';
    $('#goalRoutineFilterWrap').style.display='none';
    buildGoalQuickButtons();
    buildRoutineCheckboxes();
    openDialog(dlg);
  }
  function openGoalEdit(goalId){
    const g=load(GOALS_KEY,[]).find(x=>x.id===goalId);
    if(!g){ toast('목표 없음'); return; }
    const dlg=$('#goalModal'); editingGoalId=goalId;
    $('#goalModalTitle').textContent='목표 수정';
    $('#goalForm')?.reset();
    $('#goalTitle').value=g.title||'';
    $('#goalKind').value=g.kind||'time';
    $('#goalPeriod').value=g.period||'weekly';
    $('#goalTarget').value=g.target||'';
    if(g.kind==='time'){
      $('#goalTargetLabel').textContent='목표 시간(분)'; $('#goalQuick').style.display=''; $('#goalRoutineFilterWrap').style.display='none'; buildGoalQuickButtons();
    }else{
      $('#goalTargetLabel').textContent='목표 횟수(회)'; $('#goalQuick').style.display='none'; $('#goalRoutineFilterWrap').style.display=''; buildRoutineCheckboxes(new Set(g.routineIds||[]));
    }
    openDialog(dlg);
  }
  function onKindChange(){
    const k=$('#goalKind')?.value; if(!k) return;
    if(k==='time'){
      $('#goalTargetLabel').textContent='목표 시간(분)'; $('#goalTarget').placeholder='예) 600'; $('#goalQuick').style.display=''; $('#goalRoutineFilterWrap').style.display='none';
    }else{
      $('#goalTargetLabel').textContent='목표 횟수(회)'; $('#goalTarget').placeholder='예) 10'; $('#goalQuick').style.display='none'; $('#goalRoutineFilterWrap').style.display=''; buildRoutineCheckboxes();
    }
  }

  /* ---------------- View Sync ---------------- */
  function ensureGoalsView(){
    const inView = (location.hash==='#goals' || $('#goals')?.hidden===false);
    if (!inView) return;
    renderGoals(); renderRoutines();
  }

  /* ---------------- init ---------------- */
  function init(){
    window.addEventListener('hashchange', ensureGoalsView);
    ensureGoalsView(); // 첫 진입 시 goals 섹션이면 렌더

    // 목표 추가 (click + touchend)
    const btnAddGoal=document.getElementById('btnAddGoal');
    function openGoalHandler(e){ e.preventDefault(); e.stopPropagation(); openGoalCreate(); }
    ['click','touchend'].forEach(ev=>btnAddGoal?.addEventListener(ev, openGoalHandler, {passive:false}));

    // 목표 모달
    $('#goalClose')?.addEventListener('click', ()=> closeDialog($('#goalModal')));
    $('#goalKind')?.addEventListener('change', onKindChange);
    $('#goalForm')?.addEventListener('submit', e=>{
      e.preventDefault();
      const title=$('#goalTitle')?.value?.trim();
      const kind=$('#goalKind')?.value||'time';
      const period=$('#goalPeriod')?.value||'weekly';
      const target=Math.max(1,parseInt($('#goalTarget')?.value||'0',10));
      if(!title||!target){ toast('제목/목표값을 입력하세요'); return; }
      let routineIds=[]; if(kind==='check'){ routineIds=Array.from(document.querySelectorAll('#goalRoutineList input[type=checkbox]:checked')).map(x=>x.value); }
      const arr=load(GOALS_KEY,[]);
      if(editingGoalId){ const i=arr.findIndex(x=>x.id===editingGoalId); if(i>=0){ arr[i]={...arr[i], title, kind, period, target, routineIds}; toast('목표 수정됨'); } }
      else { arr.push({id:uid(), title, kind, period, target, routineIds}); toast('목표 추가됨'); }
      save(GOALS_KEY, arr);
      closeDialog($('#goalModal'));
      renderGoals();
    });

    // 🔹 루틴 추가 버튼 (click + touchend)
    const btnAddRoutine = document.getElementById('btnAddRoutine');
    function openRoutineCreate(e){
      e.preventDefault(); e.stopPropagation();
      const dlg = $('#routineModal'); if (!dlg) return;
      $('#routineForm')?.reset();
      dlg.removeAttribute('data-edit-id');
      $('#routineFreq').value='weekly';
      $('#routineDays')?.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked=false);
      openDialog(dlg);
    }
    ['click','touchend'].forEach(ev=>btnAddRoutine?.addEventListener(ev, openRoutineCreate, {passive:false}));

    // 루틴 모달 닫기/저장
    $('#routineClose')?.addEventListener('click', ()=> closeDialog($('#routineModal')));
    $('#routineForm')?.addEventListener('submit', e=>{
      e.preventDefault();
      const title = $('#routineTitle')?.value?.trim();
      const freq  = $('#routineFreq')?.value || 'weekly';
      if (!title){ toast('제목을 입력하세요'); return; }
      let days = [];
      if (freq==='weekly'){
        days = Array.from($('#routineDays')?.querySelectorAll('input[type=checkbox]:checked')||[])
                .map(x=>parseInt(x.value,10));
        if (!days.length){ toast('요일을 선택하세요'); return; }
      }

      const arr = load(ROUTINES_KEY, []);
      const dlg = $('#routineModal');
      const editId = dlg?.dataset?.editId;
      if (editId){
        const i = arr.findIndex(x=>x.id===editId);
        if (i>=0){ arr[i] = {...arr[i], title, unit:'check', schedule:{freq, days}}; toast('루틴 수정됨'); }
      } else {
        arr.push({ id:uid(), title, unit:'check', schedule:{freq, days} });
        toast('루틴 추가됨');
      }
      save(ROUTINES_KEY, arr);
      closeDialog(dlg);
      renderRoutines(); renderGoals(); // 체크형 목표 집계 갱신
    });

    // goals 보이지 않아도 루틴 리스트가 필요한 경우가 있어 첫 렌더 보장
    renderRoutines();
    renderGoals();
  }

  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',init);
  else init();

  /* ---------------- Focus hook (시간형 목표 알림) ---------------- */
  window.Goals = {
    onFocusEnded(){
      const goals=load(GOALS_KEY,[]).filter(g=>g.kind==='time'); if(!goals.length) return;
      const g=goals[0]; const p=computeGoalProgress(g);
      toast(p.current<p.target?`"${g.title}" 목표까지 ${p.target-p.current}분 남았어요!`:`🎉 "${g.title}" 목표 달성!`);
      if(location.hash==='#goals') renderGoals();
    }
  };
})();