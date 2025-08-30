// goals.js — 목표/루틴 관리 + 태그 연동
const GOALS_KEY    = 'goals.v1';
const ROUTINES_KEY = 'routines.v1';
const ROUTELOG_KEY = 'routines.logs.v1';
const FOCUS_KEY    = 'focus.logs.v1';

(function(){
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const ce = (t,p={})=>Object.assign(document.createElement(t),p);
  const uid= ()=> (crypto?.randomUUID?.() || Date.now()+Math.random().toString(16).slice(2));
  const load=(k,def=[])=>{ try{const v=localStorage.getItem(k); return v?JSON.parse(v):def;}catch{return def;} };
  const save=(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v));}catch{} };

  window.Tags = window.Tags || { list:()=>[] };
  window.TagsHook = window.TagsHook || {};

  function toast(m){
    const host=$('#toastHost'); if(!host) return;
    const el=ce('div',{className:'toast',textContent:m});
    host.appendChild(el); setTimeout(()=>el.remove(),2000);
  }

  // ===== 기간 범위 =====
  const SOD=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};
  const EOD=d=>{const x=new Date(d);x.setHours(23,59,59,999);return x;};
  const SOW=d=>{const x=SOD(d);const w=x.getDay()||7;x.setDate(x.getDate()-(w-1));return x;};
  const EOW=d=>{const s=SOW(d);const e=new Date(s);e.setDate(e.getDate()+6);e.setHours(23,59,59,999);return e;};
  const SOM=d=>{const x=new Date(d);x.setDate(1);x.setHours(0,0,0,0);return x;};
  const EOM=d=>{const x=new Date(d);x.setMonth(x.getMonth()+1,0);x.setHours(23,59,59,999);return x;};
  function getRange(p){
    const now=new Date();
    if(p==='daily') return [SOD(now).getTime(),EOD(now).getTime()];
    if(p==='monthly') return [SOM(now).getTime(),EOM(now).getTime()];
    return [SOW(now).getTime(),EOW(now).getTime()];
  }

  // ===== 목표 진행도 =====
  function computeGoalProgress(g){
    const [from,to]=getRange(g.period||'weekly');
    const target=Math.max(1,parseInt(g.target||0,10)||1);
    let current=0, unit=(g.kind==='time'?'분':'회');

    if(g.kind==='time'){
      const logs=load(FOCUS_KEY,[]);
      const tagSet=(Array.isArray(g.tagIds)&&g.tagIds.length)?new Set(g.tagIds):null;
      const sumMs=logs
        .filter(x=>x&&x.start>=from&&x.start<=to)
        .filter(x=>!tagSet||(x.tagId&&tagSet.has(x.tagId)))
        .reduce((a,x)=>a+(x.durationMs||0),0);
      current=Math.floor(sumMs/60000);
    } else {
      const rlogs=load(ROUTELOG_KEY,[]);
      const ridSet=(Array.isArray(g.routineIds)&&g.routineIds.length)?new Set(g.routineIds):null;
      current=rlogs.filter(l=>{
        if(!l)return false;
        const t=new Date(l.date).getTime();
        if(!(t>=from&&t<=to))return false;
        return ridSet?ridSet.has(l.rid):true;
      }).length;
    }
    const ratio=Math.max(0,Math.min(1,current/target));
    return {current,target,unit,ratio};
  }

  // ===== 목표 렌더 =====
  function renderGoals(){
    const grid=$('#goalGrid'); if(!grid)return;
    const arr=load(GOALS_KEY,[]);
    grid.innerHTML='';
    if(!arr.length){ grid.appendChild(ce('div',{className:'muted',textContent:'목표가 없습니다.'})); return; }

    arr.forEach(g=>{
      const card=ce('div',{className:'goal-card'});
      const head=ce('div',{style:'display:flex;align-items:center;gap:8px'});
      head.append(ce('div',{textContent:g.title,style:'flex:1'}));
      const btnEdit=ce('button',{textContent:'✏'}), btnDel=ce('button',{textContent:'🗑'});
      btnEdit.addEventListener('click',()=>openGoalEdit(g.id));
      btnDel.addEventListener('click',()=>{const a=load(GOALS_KEY,[]);const i=a.findIndex(x=>x.id===g.id);if(i>=0){a.splice(i,1);save(GOALS_KEY,a);renderGoals();}});
      head.append(btnEdit,btnDel);

      const barWrap=ce('div',{className:'bar-wrap'});
      const bar=ce('div',{className:'bar'}); barWrap.appendChild(bar);
      const p=computeGoalProgress(g); bar.style.width=`${Math.round(p.ratio*100)}%`;
      const meta=ce('div',{className:'muted',textContent:`진행: ${p.current}${p.unit} / ${p.target}${p.unit}`});

      card.append(head,barWrap,meta);
      grid.appendChild(card);
    });
  }

  // ===== 루틴 렌더 =====
  function renderRoutines(){
    const list=$('#routineList'); if(!list)return;
    const arr=load(ROUTINES_KEY,[]);
    list.innerHTML='';
    if(!arr.length){ list.appendChild(ce('div',{className:'muted',textContent:'루틴이 없습니다.'})); return; }

    arr.forEach(r=>{
      const row=ce('div',{className:'routine-row'});
      row.textContent=r.title+' ('+(r.freq==='daily'?'매일': '매주 '+(r.days||[]).join(','))+')';
      const btnEdit=ce('button',{textContent:'✏'}), btnDel=ce('button',{textContent:'🗑'});
      btnEdit.addEventListener('click',()=>openRoutineEdit(r.id));
      btnDel.addEventListener('click',()=>{const a=load(ROUTINES_KEY,[]);const i=a.findIndex(x=>x.id===r.id);if(i>=0){a.splice(i,1);save(ROUTINES_KEY,a);renderRoutines();}});
      row.append(' ',btnEdit,btnDel);
      list.appendChild(row);
    });
  }

  // ===== 태그/루틴 체크박스 =====
  function buildGoalTagCheckboxes(selected=new Set()){
    const wrap=$('#goalTagList'); if(!wrap)return;
    const tags=(window.Tags?.list?.()||[]);
    wrap.innerHTML='';
    if(!tags.length){wrap.appendChild(ce('div',{className:'muted',textContent:'태그 없음'}));return;}
    tags.forEach(t=>{
      const label=ce('label',{className:'tag-chip'});
      const dot=ce('span',{className:'tag-dot'}); dot.style.background=t.color;
      const cb=ce('input',{type:'checkbox',value:t.id}); cb.checked=selected.has(t.id);
      label.append(dot,cb,document.createTextNode(t.name));
      wrap.appendChild(label);
    });
  }
  function buildRoutineCheckboxes(selected=new Set()){
    const wrap=$('#goalRoutineList'); if(!wrap)return;
    const list=load(ROUTINES_KEY,[]);
    wrap.innerHTML='';
    if(!list.length){wrap.appendChild(ce('div',{className:'muted',textContent:'루틴 없음'}));return;}
    list.forEach(r=>{
      const label=ce('label',{className:'tag-chip'});
      const cb=ce('input',{type:'checkbox',value:r.id}); cb.checked=selected.has(r.id);
      label.append(cb,document.createTextNode(r.title||'루틴'));
      wrap.appendChild(label);
    });
  }
  window.TagsHook.onTagsForGoals=function(){
    const checked=new Set($$('#goalTagList input[type=checkbox]:checked').map(x=>x.value));
    buildGoalTagCheckboxes(checked);
  };

  // ===== 종류 전환 =====
  function setKindVisibility(kind){
    const tagWrap=$('#goalTagFilterWrap');
    const routineWrap=$('#goalRoutineFilterWrap');
    if(tagWrap)tagWrap.style.display=(kind==='time')?'':'none';
    if(routineWrap)routineWrap.style.display=(kind==='check')?'':'none';
  }

  // ===== 모달 관리 =====
  let editingGoalId=null, editingRoutineId=null;
  function safeOpen(d){try{d?.showModal?.();}catch{d?.setAttribute('open','');}}
  function safeClose(d){try{d?.close?.();}catch{d?.removeAttribute('open');}}

  function openGoalCreate(){
    editingGoalId=null;
    $('#goalForm')?.reset();
    $('#goalModalTitle').textContent='목표 만들기';
    $('#goalKind').value='time';
    $('#goalPeriod').value='weekly';
    buildGoalTagCheckboxes(new Set());
    buildRoutineCheckboxes(new Set());
    setKindVisibility('time');
    safeOpen($('#goalModal'));
  }
  function openGoalEdit(id){
    const arr=load(GOALS_KEY,[]); const g=arr.find(x=>x.id===id); if(!g)return;
    editingGoalId=id;
    $('#goalForm')?.reset();
    $('#goalModalTitle').textContent='목표 수정';
    $('#goalTitle').value=g.title||'';
    $('#goalKind').value=g.kind||'time';
    $('#goalPeriod').value=g.period||'weekly';
    buildGoalTagCheckboxes(new Set(g.tagIds||[]));
    buildRoutineCheckboxes(new Set(g.routineIds||[]));
    setKindVisibility(g.kind||'time');
    safeOpen($('#goalModal'));
  }
  function openRoutineCreate(){
    editingRoutineId=null;
    $('#routineForm')?.reset();
    $('#routineModalTitle').textContent='루틴 만들기';
    $('#routineFreq').value='weekly';
    $$('#routineDays input[type=checkbox]').forEach(cb=>cb.checked=false);
    safeOpen($('#routineModal'));
  }
  function openRoutineEdit(id){
    const arr=load(ROUTINES_KEY,[]); const r=arr.find(x=>x.id===id); if(!r)return;
    editingRoutineId=id;
    $('#routineForm')?.reset();
    $('#routineModalTitle').textContent='루틴 수정';
    $('#routineTitle').value=r.title||'';
    $('#routineFreq').value=r.freq||'weekly';
    $$('#routineDays input[type=checkbox]').forEach(cb=>cb.checked=(r.days||[]).includes(cb.value));
    safeOpen($('#routineModal'));
  }

  // ===== 이벤트 =====
  $('#btnAddGoal')?.addEventListener('click',openGoalCreate);
  $('#goalClose')?.addEventListener('click',()=>safeClose($('#goalModal')));
  $('#goalKind')?.addEventListener('change',()=>setKindVisibility($('#goalKind').value));

  $('#goalForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const title=$('#goalTitle').value.trim();
    const kind=$('#goalKind').value, period=$('#goalPeriod').value;
    const target=600; // 기본값 (추가로 프리셋/입력 지원 가능)
    if(!title){toast('제목 입력');return;}
    let tagIds=[], routineIds=[];
    if(kind==='time') $$('#goalTagList input:checked').forEach(x=>tagIds.push(x.value));
    else $$('#goalRoutineList input:checked').forEach(x=>routineIds.push(x.value));

    const arr=load(GOALS_KEY,[]);
    if(editingGoalId){
      const i=arr.findIndex(x=>x.id===editingGoalId);
      if(i>=0) arr[i]={...arr[i],title,kind,period,target,tagIds,routineIds};
      toast('목표 수정');
    } else {
      arr.push({id:uid(),title,kind,period,target,tagIds,routineIds});
      toast('목표 추가');
    }
    save(GOALS_KEY,arr); safeClose($('#goalModal')); renderGoals();
  });

  $('#btnAddRoutine')?.addEventListener('click',openRoutineCreate);
  $('#routineClose')?.addEventListener('click',()=>safeClose($('#routineModal')));
  $('#routineForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const title=$('#routineTitle').value.trim();
    const freq=$('#routineFreq').value;
    const days=$$('#routineDays input:checked').map(x=>x.value);
    if(!title){toast('제목 입력');return;}
    const arr=load(ROUTINES_KEY,[]);
    if(editingRoutineId){
      const i=arr.findIndex(x=>x.id===editingRoutineId);
      if(i>=0) arr[i]={...arr[i],title,freq,days};
      toast('루틴 수정');
    } else {
      arr.push({id:uid(),title,freq,days});
      toast('루틴 추가');
    }
    save(ROUTINES_KEY,arr); safeClose($('#routineModal')); renderRoutines();
  });

  function init(){ renderGoals(); renderRoutines(); }
  if(document.readyState==='loading') window.addEventListener('DOMContentLoaded',init); else init();

  // focus.js 종료 콜백에서 목표 갱신
  window.Goals=window.Goals||{};
  window.Goals.onFocusEnded=()=>renderGoals();
})();