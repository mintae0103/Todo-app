// === todo.js — 카테고리 묶음 렌더 + D+ 표기, 카테고리 센터(탭/색상 팝오버), 드래그 정렬 ===
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const uid = () => (crypto?.randomUUID?.() || String(Date.now())+Math.random().toString(16).slice(2));

const LS = { tasks:'td.tasks.v1', cats:'td.cats.v1' };
let tasks = [], categories = [];

function loadAll(){
  try{ tasks=JSON.parse(localStorage.getItem(LS.tasks)||'[]');
       categories=JSON.parse(localStorage.getItem(LS.cats)||'[]'); }
  catch{ tasks=[]; categories=[]; }
  if(!categories.length){
    categories=[{ id:'inbox', name:'Inbox', color:'#3b82f6', order:0 }];
    localStorage.setItem(LS.cats, JSON.stringify(categories));
  }
}
function saveAll(){
  localStorage.setItem(LS.tasks, JSON.stringify(tasks));
  localStorage.setItem(LS.cats, JSON.stringify(categories));
}

/* -------- Toast -------- */
function toast(msg,type='success',opts={}){
  const host=$('#toastHost'); if(!host) return alert(msg);
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.style.cssText='background:#14161b;border:1px solid #222933;color:#f7f7f7;padding:10px 12px;border-radius:10px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 24px rgba(0,0,0,.25);';
  el.textContent=msg;
  if(opts.undo){
    const b=document.createElement('button'); b.textContent='되돌리기';
    b.style.cssText='padding:6px 10px;border-radius:8px;border:0;background:#3b82f6;color:#fff';
    b.addEventListener('click',()=>{opts.undo(); close();}); el.appendChild(b);
  }
  host.appendChild(el); const t=setTimeout(close,3000); function close(){clearTimeout(t); el.remove();}
}

/* -------- DOM refs -------- */
const els = {
  btnCreateTask: $('#btnCreateTask'),
  btnCategoryCenter: $('#btnCategoryCenter'),
  // task modal
  dlgTask:$('#taskModal'), taskTitle:$('#taskTitleInput'), taskDue:$('#taskDueInput'),
  taskCat:$('#taskCategorySelect'), taskSave:$('#taskSaveBtn'), taskCancel:$('#taskCancelBtn'),
  // category center
  dlgCatCenter:$('#categoryCenterModal'), catCenterClose:$('#catCenterCloseBtn'),
  tabManage:$('#tabManage'), tabCreate:$('#tabCreate'),
  panelManage:$('#catTabManage'), panelCreate:$('#catTabCreate'),
  catSearch:$('#catSearchInput'), catSort:$('#catSortSelect'), catCenterList:$('#catCenterList'),
  newCatName:$('#newCatName'), newCatPalette:$('#newCatPalette'), newCatColor:$('#newCatColor'),
  newCatMore:$('#newCatMore'), newCatPicker:$('#newCatColorPicker'),
  // list host
  listHost:(()=>{let h=$('#taskList'); if(!h){ h=document.createElement('div'); h.id='taskList'; ($('#todo')||document.body).appendChild(h); } return h;})(),
};

/* -------- Helpers -------- */
function fmtDate(ms){
  if(!ms) return '';
  const d=new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dueBadge(ms){
  if(!ms) return '';
  const today=new Date(); today.setHours(0,0,0,0);
  const due=new Date(ms); due.setHours(0,0,0,0);
  const diff=Math.round((due - today)/86400000);
  if(diff<0)  return `D+${Math.abs(diff)}`;  // ← 변경: 연체 → D+N
  if(diff===0) return '오늘';
  return `D-${diff}`;
}
function selectPalette(container, value){
  $$('.selected',container).forEach(b=>b.classList.remove('selected'));
  const b=container.querySelector(`button[data-color="${value}"]`);
  if(b) b.classList.add('selected');
}

/* -------- Render -------- */
function renderCategoryOptions(){
  if(!els.taskCat) return;
  els.taskCat.innerHTML = categories
    .slice().sort((a,b)=>(a.order??0)-(b.order??0))
    .map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
}

/* 카테고리별 그룹 렌더(헤더 항상 표시) */
function renderTasks(){
  const host=els.listHost; host.innerHTML='';

  // 맵/그룹핑
  const catById=new Map(categories.map(c=>[c.id,c]));
  if(!catById.has('inbox')) catById.set('inbox',{id:'inbox',name:'Inbox',color:'#3b82f6',order:-1});

  const grouped=new Map(); // catId -> tasks[]
  tasks.forEach(t=>{
    const key=t.categoryId || 'inbox';
    if(!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(t);
  });
  if(grouped.size===0) return;

  // 카테고리 표시 순서: order -> 이름
  const catIds=[...grouped.keys()].sort((a,b)=>{
    const ca=catById.get(a), cb=catById.get(b);
    const oa=(ca?.order?? (a==='inbox'?-1:999)), ob=(cb?.order?? (b==='inbox'?-1:999));
    if(oa!==ob) return oa-ob;
    const na=(a==='inbox'?'기본':(ca?.name||'')).toLowerCase();
    const nb=(b==='inbox'?'기본':(cb?.name||'')).toLowerCase();
    return na.localeCompare(nb,'ko');
  });

  catIds.forEach(catId=>{
    const cat=catById.get(catId) || {id:'inbox',name:'Inbox',color:'#3b82f6'};
    const items=grouped.get(catId).slice().sort((a,b)=>{
      const ao=a.order??0, bo=b.order??0;
      return ao===bo ? (a.createdAt??0)-(b.createdAt??0) : ao-bo;
    });

    // 헤더
    const header=document.createElement('div');
    header.className='cat-header';
    const dot=document.createElement('span'); dot.className='dot'; dot.style.background=cat.color;
    const name=document.createElement('span'); name.textContent=(cat.id==='inbox')?'기본':cat.name;
    header.append(dot,name); host.appendChild(header);

    // 항목
    items.forEach(t=>{
      const row=document.createElement('div');
      row.className='task-row'; row.dataset.id=t.id; row.setAttribute('role','listitem');

      const btnDone=document.createElement('button');
      btnDone.className='check no-drag';
      btnDone.textContent=t.done?'✅':'⬜️';
      btnDone.setAttribute('aria-pressed',String(!!t.done));
      btnDone.addEventListener('click',()=>{ t.done=!t.done; t.updatedAt=Date.now(); saveAll(); renderTasks(); });

      const title=document.createElement('div');
      title.className='title'; title.textContent=t.title;
      if(t.done) title.style.cssText='color:#9aa0a6;text-decoration:line-through';

      const btnDel=document.createElement('button');
      btnDel.className='del no-drag'; btnDel.setAttribute('aria-label','삭제'); btnDel.textContent='🗑️';
      btnDel.addEventListener('click',()=>{
        const backup={...t};
        tasks=tasks.filter(x=>x.id!==t.id); saveAll(); renderTasks();
        toast('🗑️ 삭제됨','success',{undo:()=>{tasks.push(backup); saveAll(); renderTasks();}});
      });

      const meta=document.createElement('div');
      meta.className='meta';
      const dueEl=document.createElement('span'); dueEl.className='date';
      if(t.dueAt){ dueEl.textContent=dueBadge(t.dueAt); dueEl.title=fmtDate(t.dueAt); }
      const mDot=document.createElement('span'); mDot.className='dot'; mDot.style.background=cat.color;
      const catName=document.createElement('span'); catName.className='cat-name'; catName.textContent=(cat.id==='inbox')?'기본':cat.name;

      meta.append(dueEl,mDot,catName);
      row.append(btnDone,title,btnDel,meta);
      host.appendChild(row);

      enableRowDrag(row);
    });
  });
}

/* -------- 카테고리 센터 -------- */
function openCategoryCenter(def='manage'){ switchCatTab(def); selectPalette(els.newCatPalette, els.newCatColor.value); els.dlgCatCenter.showModal(); }
function switchCatTab(tab){
  const m=(tab==='manage');
  els.tabManage.classList.toggle('active',m); els.tabManage.setAttribute('aria-selected',String(m)); els.panelManage.hidden=!m;
  els.tabCreate.classList.toggle('active',!m); els.tabCreate.setAttribute('aria-selected',String(!m)); els.panelCreate.hidden=m;
  if(m) renderCatCenterList();
}

/* 색상 팝오버 */
let colorPopover=null;
const POPOVER_COLORS=['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#64748b'];
function closeColorPopover(){ colorPopover?.remove(); colorPopover=null; window.removeEventListener('pointerdown', onOutside, true); }
function onOutside(e){ if(!colorPopover) return; if(!colorPopover.contains(e.target)) closeColorPopover(); }
function openColorPopover(anchorBtn, currentColor, onPick){
  closeColorPopover();
  const pop=document.createElement('div'); pop.className='color-popover';
  POPOVER_COLORS.forEach(col=>{
    const s=document.createElement('button'); s.type='button'; s.className='swatch'; s.style.background=col; if(col===currentColor) s.classList.add('selected');
    s.addEventListener('click',()=>{ onPick(col); closeColorPopover(); }); pop.appendChild(s);
  });
  const more=document.createElement('button'); more.type='button'; more.className='more'; more.textContent='기타…';
  more.addEventListener('click',()=>{
    const picker=document.createElement('input'); picker.type='color'; picker.value=currentColor||'#3b82f6';
    picker.style.position='fixed'; picker.style.left='-9999px'; document.body.appendChild(picker);
    picker.addEventListener('input',()=> onPick(picker.value));
    picker.addEventListener('change',()=>{ closeColorPopover(); picker.remove(); });
    picker.click();
  });
  pop.appendChild(more);
  document.body.appendChild(pop);

  const r=anchorBtn.getBoundingClientRect();
  pop.style.left=`${Math.max(8,Math.min(window.innerWidth-pop.offsetWidth-8,r.left))}px`;
  pop.style.top =`${r.bottom+6}px`;
  colorPopover=pop; setTimeout(()=> window.addEventListener('pointerdown', onOutside, true),0);
}

function renderCatCenterList(){
  const q=(els.catSearch?.value||'').trim().toLowerCase();
  const sort=els.catSort?.value||'order';

  const counts={}; tasks.forEach(t=>{ const id=t.categoryId||'inbox'; counts[id]=(counts[id]||0)+1; });

  let arr=categories.slice();
  if(q) arr=arr.filter(c=> c.name.toLowerCase().includes(q) || (c.id==='inbox' && '기본'.includes(q)));
  arr.sort((a,b)=>{
    if(sort==='name') return a.name.localeCompare(b.name,'ko');
    if(sort==='count') return (counts[b.id]||0)-(counts[a.id]||0);
    return (a.order??0)-(b.order??0);
  });

  els.catCenterList.innerHTML='';
  arr.forEach(c=>{
    const li=document.createElement('li'); li.className='cat-item';
    const dot=document.createElement('span'); dot.className='dot'; dot.style.background=c.color;
    const name=document.createElement('span'); name.className='name'; name.textContent=(c.id==='inbox')?'기본':c.name;
    const count=document.createElement('span'); count.className='count'; count.textContent=`${counts[c.id]||0}개`;
    const spacer=document.createElement('div'); spacer.className='spacer';

    const actions=document.createElement('div'); actions.className='actions';
    const btnRename=document.createElement('button'); btnRename.className='btn'; btnRename.textContent='이름 변경';
    const btnColor=document.createElement('button'); btnColor.className='btn'; btnColor.textContent='색상';
    const btnDelete=document.createElement('button'); btnDelete.className='btn'; btnDelete.textContent='삭제';

    if(c.id==='inbox'){ btnRename.disabled=true; btnDelete.disabled=true; }

    btnRename.addEventListener('click',()=>{
      const newName=(prompt('새 이름을 입력하세요', c.name)||'').trim();
      if(!newName) return;
      if(categories.some(x=>x.id!==c.id && x.name.toLowerCase()===newName.toLowerCase())) return toast('⚠️ 중복된 이름입니다','error');
      c.name=newName; saveAll(); renderCategoryOptions(); renderCatCenterList(); toast('✏️ 이름 변경됨');
    });

    btnColor.addEventListener('click',()=>{
      openColorPopover(btnColor, c.color, col=>{
        c.color=col; dot.style.background=col; saveAll(); renderCategoryOptions(); renderTasks(); toast('🎨 색상 변경됨');
      });
    });

    btnDelete.addEventListener('click',()=>{
      if(c.id==='inbox') return;
      const backupCats=JSON.parse(JSON.stringify(categories));
      const backupTasks=JSON.parse(JSON.stringify(tasks));
      categories=categories.filter(x=>x.id!==c.id);
      tasks.forEach(t=>{ if(t.categoryId===c.id) t.categoryId='inbox'; });
      saveAll(); renderCategoryOptions(); renderCatCenterList(); renderTasks();
      toast('🗑️ 카테고리 삭제됨(해당 일정은 기본으로 이동)','success',{
        undo:()=>{ categories=backupCats; tasks=backupTasks; saveAll(); renderCategoryOptions(); renderCatCenterList(); renderTasks(); }
      });
    });

    actions.append(btnRename, btnColor, btnDelete);
    li.append(dot,name,count,spacer,actions);
    els.catCenterList.appendChild(li);
  });
}

/* -------- Task dialog -------- */
function openTaskModal(){ renderCategoryOptions(); els.taskTitle.value=''; els.taskDue.value=''; els.dlgTask.showModal(); }
function saveTask(e){
  e?.preventDefault?.();
  const title=(els.taskTitle.value||'').trim(); if(!title) return toast('⚠️ 제목을 입력하세요','error');
  const catId=els.taskCat.value||'inbox';
  const dueAt=els.taskDue.value? new Date(els.taskDue.value+'T00:00:00').getTime(): null;
  const orderMax=Math.max(-1,...tasks.map(t=>t.order??0));
  const t={ id:uid(), title, done:false, categoryId:catId, dueAt,
            order:orderMax+1, createdAt:Date.now(), updatedAt:Date.now() };
  tasks.push(t); saveAll(); renderTasks(); els.dlgTask.close();
  toast('✅ 추가됨','success',{undo:()=>{tasks=tasks.filter(x=>x.id!==t.id); saveAll(); renderTasks();}});
}

/* -------- 드래그 정렬 -------- */
let drag=null;
function enableRowDrag(rowEl){
  const start=(yStart)=>{
    const r=rowEl.getBoundingClientRect();
    const ph=document.createElement('div'); ph.className='placeholder';
    ph.style.cssText=`height:${r.height}px;border:2px dashed #3b82f6;border-radius:10px;margin:6px 0;`;
    rowEl.style.visibility='hidden';
    els.listHost.insertBefore(ph,rowEl.nextSibling);

    const ghost=rowEl.cloneNode(true);
    ghost.querySelectorAll('button').forEach(b=>b.setAttribute('disabled','true'));
    const cs=getComputedStyle(rowEl);
    ghost.style.cssText=`
      position:fixed; left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px;
      z-index:9999; pointer-events:none; opacity:.98; transform:translateY(0);
      box-shadow:0 12px 32px rgba(0,0,0,.35); border:1px solid #2a3140; background:#11151e; border-radius:12px;
      display:grid; align-items:center; gap:6px 10px;`;
    ghost.style.gridTemplateColumns=cs.getPropertyValue('grid-template-columns');
    ghost.style.gridTemplateRows=cs.getPropertyValue('grid-template-rows');
    ghost.style.gridTemplateAreas=cs.getPropertyValue('grid-template-areas');
    document.body.appendChild(ghost); els.listHost.classList.add('dragging');
    drag={ghost,ph,startY:yStart,row:rowEl};
  };
  const move=(y)=>{
    if(!drag) return; const dy=y-drag.startY; drag.ghost.style.transform=`translateY(${dy}px)`;
    const siblings=[...els.listHost.querySelectorAll('.task-row, .placeholder, .cat-header')];
    // 행들만 대상으로 placeholder 위치 조정
    const onlyRows=siblings.filter(el=> el.classList.contains('task-row') || el.classList.contains('placeholder'));
    const gr=drag.ghost.getBoundingClientRect(); const center=gr.top+gr.height/2;
    for(const s of onlyRows){
      if(s===drag.ph) continue;
      const rr=s.getBoundingClientRect();
      if(center<rr.top+rr.height/2){ els.listHost.insertBefore(drag.ph,s); break; }
      if(s===onlyRows[onlyRows.length-1]) els.listHost.appendChild(drag.ph);
    }
  };
  const end=()=>{
    if(!drag) return; const {ghost,ph,row}=drag;
    ghost.remove(); row.style.visibility=''; els.listHost.insertBefore(row,ph); ph.remove(); els.listHost.classList.remove('dragging');
    const ids=$$('.task-row',els.listHost).map(el=>el.dataset.id);
    const before=tasks.map(t=>({id:t.id,order:t.order??0}));
    ids.forEach((id,i)=>{ const t=tasks.find(x=>x.id===id); if(t) t.order=i; });
    saveAll(); renderTasks();
    toast('↕️ 순서 변경됨','success',{undo:()=>{before.forEach(b=>{const t=tasks.find(x=>x.id===b.id); if(t) t.order=b.order;}); saveAll(); renderTasks();}});
    drag=null;
  };
  const onPointerDown=(e)=>{
    if(e.target.closest('.no-drag')) return;
    if(e.pointerType==='mouse' && e.button!==0) return;
    const y0=e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    e.preventDefault();
    const press=setTimeout(()=>start(y0),220);
    const onMove=(ev)=>{ const y=ev.clientY ?? ev.touches?.[0]?.clientY ?? 0; if(drag) move(y); };
    const onUp=()=>{ clearTimeout(press);
      window.removeEventListener('pointermove',onMove); window.removeEventListener('pointerup',onUp);
      window.removeEventListener('touchmove',onMove); window.removeEventListener('touchend',onUp);
      if(drag) end(); };
    window.addEventListener('pointermove',onMove,{passive:false});
    window.addEventListener('pointerup',onUp,{passive:false});
    window.addEventListener('touchmove',onMove,{passive:false});
    window.addEventListener('touchend',onUp,{passive:false});
  };
  rowEl.addEventListener('pointerdown',onPointerDown,{passive:false});
}

/* -------- Bind & Init -------- */
function bind(){
  els.btnCreateTask?.addEventListener('click', openTaskModal);
  els.btnCategoryCenter?.addEventListener('click', ()=> openCategoryCenter('manage'));
  els.taskCancel?.addEventListener('click', ()=> els.dlgTask.close());
  els.taskSave?.addEventListener('click', saveTask);
  els.taskTitle?.addEventListener('keydown', e=>{ if(e.key==='Enter') saveTask(e); });

  els.catCenterClose?.addEventListener('click', ()=>{ closeColorPopover(); els.dlgCatCenter.close(); });
  els.tabManage?.addEventListener('click', ()=> switchCatTab('manage'));
  els.tabCreate?.addEventListener('click', ()=> switchCatTab('create'));
  els.catSearch?.addEventListener('input', renderCatCenterList);
  els.catSort?.addEventListener('change', renderCatCenterList);

  els.newCatPalette?.addEventListener('click', e=>{ const b=e.target.closest('button[data-color]'); if(!b) return; els.newCatColor.value=b.dataset.color; selectPalette(els.newCatPalette,b.dataset.color); });
  els.newCatMore?.addEventListener('click', ()=> els.newCatPicker.click());
  els.newCatPicker?.addEventListener('input', ()=>{ els.newCatColor.value=els.newCatPicker.value; selectPalette(els.newCatPalette, els.newCatColor.value); });
  $('#newCatSaveBtn')?.addEventListener('click', e=>{
    e.preventDefault();
    const name=(els.newCatName.value||'').trim(); const color=els.newCatColor.value||'#3b82f6';
    if(!name) return toast('⚠️ 이름을 입력하세요','error');
    if(categories.some(c=>c.name.toLowerCase()===name.toLowerCase())) return toast('⚠️ 카테고리 이름이 중복입니다','error');
    const order=(categories.reduce((m,c)=>Math.max(m,c.order??0),0)+1);
    const c={id:uid(), name, color, order}; categories.push(c); saveAll();
    els.newCatName.value=''; els.newCatColor.value='#3b82f6'; selectPalette(els.newCatPalette,'#3b82f6');
    renderCategoryOptions(); renderCatCenterList(); toast('🏷️ 카테고리 추가됨');
  });

  // 다이얼로그 밖 클릭 닫기
  [els.dlgTask, els.dlgCatCenter].forEach(dlg=>{
    if(!dlg) return;
    dlg.addEventListener('click', e=>{
      const panel=dlg.querySelector('.modal-body'); if(!panel) return;
      const r=panel.getBoundingClientRect();
      const inside=e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
      if(!inside){ closeColorPopover(); dlg.close(); }
    });
  });
}

function init(){ loadAll(); renderCategoryOptions(); renderTasks(); bind(); }
document.addEventListener('DOMContentLoaded', init);