// === todo.js — 모바일 모달 폴백 + 카테고리/할일 드래그 + D+ 표기 + 스크롤잠금 ===
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const uid = () => (crypto?.randomUUID?.() || String(Date.now())+Math.random().toString(16).slice(2));

const LS = { tasks:'td.tasks.v1', cats:'td.cats.v1' };
let tasks = [], categories = [];

/* ----- safe dialog helpers (모바일 폴백) ----- */
function safeShowModal(dlg){
  if (dlg?.showModal) { try { dlg.showModal(); return; } catch(_){} }
  dlg.setAttribute('open','');
  dlg.style.display='block';
}
function safeCloseModal(dlg){
  if (!dlg) return;
  if (dlg.close) { try { dlg.close(); return; } catch(_){} }
  dlg.removeAttribute('open');
  dlg.style.display='none';
}

/* ----- drag scroll-lock helpers ----- */
function lockScroll(){
  if (document.body.classList.contains('drag-lock')) return;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.dataset.lockScrollY = String(y);
  document.body.classList.add('drag-lock');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${y}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  window.addEventListener('touchmove', preventTouch, { passive:false });
}
function unlockScroll(){
  if (!document.body.classList.contains('drag-lock')) return;
  const y = parseInt(document.body.dataset.lockScrollY || '0', 10);
  document.body.classList.remove('drag-lock');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  delete document.body.dataset.lockScrollY;
  window.removeEventListener('touchmove', preventTouch, { passive:false });
  window.scrollTo(0, y);
}
function preventTouch(e){ e.preventDefault(); }

/* ----- storage ----- */
function loadAll(){
  try{
    tasks = JSON.parse(localStorage.getItem(LS.tasks)||'[]');
    categories = JSON.parse(localStorage.getItem(LS.cats)||'[]');
  }catch{ tasks=[]; categories=[]; }
  if (!categories.length){
    categories = [{ id:'inbox', name:'Inbox', color:'#3b82f6', order:0 }];
    localStorage.setItem(LS.cats, JSON.stringify(categories));
  }
}
function saveAll(){
  localStorage.setItem(LS.tasks, JSON.stringify(tasks));
  localStorage.setItem(LS.cats, JSON.stringify(categories));
}

/* ----- toast ----- */
function toast(msg,type='success',opts={}){
  const host=$('#toastHost'); if(!host) return alert(msg);
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.style.cssText='background:#14161b;border:1px solid #222933;color:#f7f7f7;padding:10px 12px;border-radius:10px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 24px rgba(0,0,0,.25);';
  el.textContent=msg;
  if (opts.undo){
    const b=document.createElement('button'); b.textContent='되돌리기';
    b.style.cssText='padding:6px 10px;border-radius:8px;border:0;background:#3b82f6;color:#fff';
    b.addEventListener('click', ()=>{ opts.undo(); close(); }); el.appendChild(b);
  }
  host.appendChild(el); const t=setTimeout(close,3000);
  function close(){ clearTimeout(t); el.remove(); }
}

/* ----- refs ----- */
const els = {
  btnCreateTask: $('#btnCreateTask'),
  btnCategoryCenter: $('#btnCategoryCenter'),

  dlgTask: $('#taskModal'),
  taskTitle: $('#taskTitleInput'),
  taskDue: $('#taskDueInput'),
  taskCat: $('#taskCategorySelect'),
  taskSave: $('#taskSaveBtn'),
  taskCancel: $('#taskCancelBtn'),

  dlgCatCenter: $('#categoryCenterModal'),
  catCenterClose: $('#catCenterCloseBtn'),
  tabManage: $('#tabManage'),
  tabCreate: $('#tabCreate'),
  panelManage: $('#catTabManage'),
  panelCreate: $('#catTabCreate'),
  catSearch: $('#catSearchInput'),
  catSort: $('#catSortSelect'),
  catCenterList: $('#catCenterList'),

  newCatName: $('#newCatName'),
  newCatPalette: $('#newCatPalette'),
  newCatColor: $('#newCatColor'),
  newCatMore: $('#newCatMore'),
  newCatPicker: $('#newCatColorPicker'),

  listHost: (()=>{
    let host = $('#taskList');
    if (!host){
      host = document.createElement('div'); host.id='taskList';
      ($('#todo')||document.body).appendChild(host);
    }
    return host;
  })(),
};

/* ----- helpers ----- */
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
  if (diff < 0)  return `D+${Math.abs(diff)}`;   // 지남 → D+N
  if (diff === 0) return '오늘';
  return `D-${diff}`;
}
function selectPalette(container, value){
  $$('.selected',container).forEach(b=>b.classList.remove('selected'));
  const b=container.querySelector(`button[data-color="${value}"]`);
  if (b) b.classList.add('selected');
}

/* ===== 렌더링 (카테고리 그룹) ===== */
function renderCategoryOptions(){
  els.taskCat.innerHTML = categories
    .slice()
    .sort((a,b)=>(a.order??0)-(b.order??0))
    .map(c=>{
      const name = (c.id === 'inbox') ? '기본' : c.name;
      return `<option value="${c.id}">${name}</option>`;
    }).join('');
}

function renderTasks(){
  const host = els.listHost;
  host.innerHTML = '';

  const catById = new Map(categories.map(c=>[c.id,c]));
  if (!catById.has('inbox')) catById.set('inbox', { id:'inbox', name:'Inbox', color:'#3b82f6', order:-1 });

  const grouped = new Map(); // catId -> tasks[]
  tasks.forEach(t=>{
    const key = t.categoryId || 'inbox';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(t);
  });

  const orderCats = [...grouped.keys()].sort((a,b)=>{
    const ca=catById.get(a), cb=catById.get(b);
    const oa=(ca?.order?? (a==='inbox'?-1:999)), ob=(cb?.order?? (b==='inbox'?-1:999));
    if (oa!==ob) return oa-ob;
    const na=(a==='inbox'?'기본':(ca?.name||'')).toLowerCase();
    const nb=(b==='inbox'?'기본':(cb?.name||'')).toLowerCase();
    return na.localeCompare(nb,'ko');
  });

  orderCats.forEach(catId=>{
    const cat = catById.get(catId) || { id:'inbox', name:'Inbox', color:'#3b82f6' };
    const items = grouped.get(catId).slice().sort((a,b)=>{
      const ao=a.order??0, bo=b.order??0;
      return ao===bo ? (a.createdAt??0)-(b.createdAt??0) : ao-bo;
    });

    const group = document.createElement('div');
    group.className = 'cat-group';
    group.dataset.catId = catId;

    const header = document.createElement('div');
    header.className = 'cat-header';
    const dot = document.createElement('span'); dot.className='dot'; dot.style.background = cat.color;
    const name = document.createElement('span'); name.textContent = (cat.id==='inbox') ? '기본' : cat.name;
    const handle = document.createElement('span'); handle.className='handle'; handle.textContent='↕︎ 드래그';
    header.append(dot, name, handle);
    group.appendChild(header);

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
      if (t.done) title.style.cssText='color:#9aa0a6;text-decoration:line-through';

      const btnDel=document.createElement('button');
      btnDel.className='del no-drag'; btnDel.setAttribute('aria-label','삭제'); btnDel.textContent='🗑️';
      btnDel.addEventListener('click',()=>{
        const backup={...t};
        tasks=tasks.filter(x=>x.id!==t.id); saveAll(); renderTasks();
        toast('🗑️ 삭제됨','success',{undo:()=>{tasks.push(backup); saveAll(); renderTasks();}});
      });

      const meta=document.createElement('div'); meta.className='meta';
      const dueEl=document.createElement('span'); dueEl.className='date';
      if(t.dueAt){ dueEl.textContent=dueBadge(t.dueAt); dueEl.title=fmtDate(t.dueAt); }
      const mDot=document.createElement('span'); mDot.className='dot'; mDot.style.background=cat.color;
      const catName=document.createElement('span'); catName.className='cat-name'; catName.textContent=(cat.id==='inbox')?'기본':cat.name;

      meta.append(dueEl,mDot,catName);
      row.append(btnDone,title,btnDel,meta);
      group.appendChild(row);

      enableRowDrag(row);
    });

    host.appendChild(group);
    enableCategoryDrag(group, header.querySelector('.handle'));
  });
}

/* ===== 카테고리 그룹 드래그 ===== */
let catDrag = null;
function enableCategoryDrag(groupEl, handleEl){
  const onDown = (e)=>{
    if (e.pointerType==='mouse' && e.button!==0) return;

    // ▶︎ 롱프레스 대기 전에 '바로' 스크롤 잠금
    let pressed = true;
    let started = false;
    lockScroll();

    const startY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    e.preventDefault();

    const start = (y0)=>{
      // 실제 드래그 시작
      const rect = groupEl.getBoundingClientRect();
      const ph = document.createElement('div'); ph.className = 'placeholder'; ph.style.height = rect.height + 'px';
      groupEl.style.visibility='hidden';
      els.listHost.insertBefore(ph, groupEl.nextSibling);

      const ghost = document.createElement('div');
      ghost.style.cssText = `
        position:fixed; left:${rect.left}px; top:${rect.top}px; width:${rect.width}px; height:${rect.height}px;
        z-index:9998; pointer-events:none; opacity:.98; transform:translateY(0);
        box-shadow:0 12px 32px rgba(0,0,0,.35); border:1px solid #2a3140; background:#11151e; border-radius:12px;`;
      const hClone = groupEl.querySelector('.cat-header').cloneNode(true);
      hClone.style.margin='10px'; ghost.appendChild(hClone);
      document.body.appendChild(ghost);

      document.body.classList.add('dragging-cat');
      catDrag = { ghost, ph, group: groupEl, startY:y0 };
      started = true;
    };

    // 롱프레스 타이머 (살짝 줄여 반응성 개선)
    const pressTimer = setTimeout(()=>{ if(pressed) start(startY); }, 160);

    const onMove = (ev)=>{
      const y = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;

      // 롱프레스 기다리는 중에 손가락이 많이 움직이면 '드래그 시작'으로 전환
      if (!started && pressed && Math.abs(y - startY) > 6) {
        clearTimeout(pressTimer);
        start(startY);
      }

      if (!catDrag) return;
      const dy = y - catDrag.startY;
      catDrag.ghost.style.transform = `translateY(${dy}px)`;

      const groups = $$('.cat-group', els.listHost);
      const gRect = catDrag.ghost.getBoundingClientRect();
      const center = gRect.top + gRect.height/2;

      for (const g of groups){
        if (g === catDrag.group || g === catDrag.ph) continue;
        const r = g.getBoundingClientRect();
        if (center < r.top + r.height/2){
          els.listHost.insertBefore(catDrag.ph, g);
          break;
        }
        if (g === groups[groups.length-1]){
          els.listHost.appendChild(catDrag.ph);
        }
      }
    };

    const onUp = ()=>{
      pressed = false;
      clearTimeout(pressTimer);

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);

      // ▶︎ 드래그 시작 안 했으면(롱프레스 실패/취소) 잠금 해제
      if (!started) { unlockScroll(); return; }

      // 드래그 종료 처리
      const {ghost, ph, group} = catDrag;
      ghost.remove();
      group.style.visibility='';
      els.listHost.insertBefore(group, ph);
      ph.remove();
      document.body.classList.remove('dragging-cat');

      // 순서 반영
      const newOrderIds = $$('.cat-group', els.listHost).map(g=>g.dataset.catId);
      const before = categories.map(c=>({id:c.id, order:c.order??0}));
      newOrderIds.forEach((id, idx)=>{
        const c = categories.find(x=>x.id===id);
        if (c) c.order = idx;
      });
      saveAll(); renderTasks();

      toast('🏷️ 카테고리 순서 변경됨','success',{
        undo: ()=>{
          before.forEach(b=>{
            const c = categories.find(x=>x.id===b.id);
            if (c) c.order = b.order;
          });
          saveAll(); renderTasks();
        }
      });

      catDrag = null;
      unlockScroll();  // ▶︎ 마지막에 스크롤 복원
    };

    window.addEventListener('pointermove', onMove, {passive:false});
    window.addEventListener('pointerup', onUp, {passive:false});
    window.addEventListener('touchmove', onMove, {passive:false});
    window.addEventListener('touchend', onUp, {passive:false});
  };

  // 핸들에 바인딩
  handleEl.addEventListener('pointerdown', onDown, {passive:false});
}
/* ===== 카드(행) 드래그 ===== */
let rowDrag = null;
function enableRowDrag(rowEl){
  const start=(y0)=>{
    const r=rowEl.getBoundingClientRect();
    const ph=document.createElement('div'); ph.className='placeholder'; ph.style.height=r.height+'px';
    rowEl.style.visibility='hidden';
    const group = rowEl.closest('.cat-group');
    group.insertBefore(ph, rowEl.nextSibling);

    const ghost=rowEl.cloneNode(true);
    ghost.querySelectorAll('button').forEach(b=>b.setAttribute('disabled','true'));
    const cs=getComputedStyle(rowEl);
    ghost.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:9999;pointer-events:none;opacity:.98;transform:translateY(0);box-shadow:0 12px 32px rgba(0,0,0,.35);border:1px solid #2a3140;background:#11151e;border-radius:12px;display:grid;align-items:center;gap:6px 10px;`;
    ghost.style.gridTemplateColumns=cs.getPropertyValue('grid-template-columns');
    ghost.style.gridTemplateRows=cs.getPropertyValue('grid-template-rows');
    ghost.style.gridTemplateAreas=cs.getPropertyValue('grid-template-areas');
    document.body.appendChild(ghost);

    rowDrag={ghost,ph,row:rowEl,group,startY:y0};
    lockScroll();                                            /* ← 스크롤잠금 */
  };
  const move=(y)=>{
    if(!rowDrag) return;
    const dy=y-rowDrag.startY; rowDrag.ghost.style.transform=`translateY(${dy}px)`;
    const siblings=[...rowDrag.group.querySelectorAll('.task-row, .placeholder')];
    const gr=rowDrag.ghost.getBoundingClientRect(); const center=gr.top+gr.height/2;
    for (const s of siblings){
      if (s===rowDrag.ph) continue;
      const rr=s.getBoundingClientRect();
      if (center < rr.top + rr.height/2){ rowDrag.group.insertBefore(rowDrag.ph, s); break; }
      if (s===siblings[siblings.length-1]) rowDrag.group.appendChild(rowDrag.ph);
    }
  };
  const end=()=>{
    if(!rowDrag) return;
    unlockScroll();                                         /* ← 스크롤복원 */
    const {ghost,ph,row,group}=rowDrag; ghost.remove(); row.style.visibility=''; group.insertBefore(row, ph); ph.remove();

    const ids=[...group.querySelectorAll('.task-row')].map(el=>el.dataset.id);
    const before=tasks.map(t=>({id:t.id, order:t.order??0}));
    ids.forEach((id,i)=>{ const t=tasks.find(x=>x.id===id); if(t) t.order=i; });

    saveAll(); renderTasks();
    toast('↕️ 순서 변경됨','success',{undo:()=>{before.forEach(b=>{const t=tasks.find(x=>x.id===b.id); if(t) t.order=b.order;}); saveAll(); renderTasks();}});
    rowDrag=null;
  };

  const onDown=(e)=>{
    if (e.target.closest('.no-drag')) return;
    if (e.pointerType==='mouse' && e.button!==0) return;
    const y0=e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    e.preventDefault();

    const press=setTimeout(()=>start(y0),220);
    const onMove=(ev)=>{ if(!rowDrag) return; const y=ev.clientY ?? ev.touches?.[0]?.clientY ?? 0; move(y); };
    const onUp=()=>{ clearTimeout(press);
      window.removeEventListener('pointermove',onMove); window.removeEventListener('pointerup',onUp);
      window.removeEventListener('touchmove',onMove); window.removeEventListener('touchend',onUp);
      if(rowDrag) end(); };
    window.addEventListener('pointermove',onMove,{passive:false});
    window.addEventListener('pointerup',onUp,{passive:false});
    window.addEventListener('touchmove',onMove,{passive:false});
    window.addEventListener('touchend',onUp,{passive:false});
  };

  rowEl.addEventListener('pointerdown', onDown, {passive:false});
}

/* ===== 카테고리 센터 ===== */
function openCategoryCenter(def='manage'){
  switchCatTab(def);
  selectPalette(els.newCatPalette, els.newCatColor.value);
  safeShowModal(els.dlgCatCenter);
}
function switchCatTab(tab){
  const m=(tab==='manage');
  els.tabManage.classList.toggle('active',m); els.tabManage.setAttribute('aria-selected',String(m)); els.panelManage.hidden=!m;
  els.tabCreate.classList.toggle('active',!m); els.tabCreate.setAttribute('aria-selected',String(!m)); els.panelCreate.hidden=m;
  if (m) renderCatCenterList();
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
    s.addEventListener('click',()=>{ onPick(col); closeColorPopover(); });
    pop.appendChild(s);
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
    li.append(dot, name, count, spacer, actions);
    els.catCenterList.appendChild(li);
  });
}

/* ===== 일정 모달 ===== */
function openTaskModal(){
  renderCategoryOptions();
  els.taskTitle.value=''; els.taskDue.value='';
  safeShowModal(els.dlgTask);
}
function saveTask(e){
  e?.preventDefault?.();
  const title=(els.taskTitle.value||'').trim();
  if(!title) return toast('⚠️ 제목을 입력하세요','error');
  const catId=els.taskCat.value||'inbox';
  const dueAt=els.taskDue.value ? new Date(els.taskDue.value+'T00:00:00').getTime() : null;
  const orderMax=Math.max(-1,...tasks.map(t=>t.order??0));
  const t={ id:uid(), title, done:false, categoryId:catId, dueAt, order:orderMax+1, createdAt:Date.now(), updatedAt:Date.now() };
  tasks.push(t); saveAll(); renderTasks();
  safeCloseModal(els.dlgTask);
  toast('✅ 추가됨','success',{undo:()=>{tasks=tasks.filter(x=>x.id!==t.id); saveAll(); renderTasks();}});
}

/* ===== 바인딩 ===== */
function bind(){
  els.btnCreateTask?.addEventListener('click', openTaskModal);
  els.btnCategoryCenter?.addEventListener('click', ()=> openCategoryCenter('manage'));

  els.taskCancel?.addEventListener('click', ()=> safeCloseModal(els.dlgTask));
  els.taskSave?.addEventListener('click', saveTask);
  els.taskTitle?.addEventListener('keydown', e=>{ if(e.key==='Enter') saveTask(e); });

  els.catCenterClose?.addEventListener('click', ()=>{ closeColorPopover(); safeCloseModal(els.dlgCatCenter); });
  els.tabManage?.addEventListener('click', ()=> switchCatTab('manage'));
  els.tabCreate?.addEventListener('click', ()=> switchCatTab('create'));
  els.catSearch?.addEventListener('input', renderCatCenterList);
  els.catSort?.addEventListener('change', renderCatCenterList);

  els.newCatPalette?.addEventListener('click', e=>{
    const b=e.target.closest('button[data-color]'); if(!b) return;
    els.newCatColor.value=b.dataset.color; selectPalette(els.newCatPalette, b.dataset.color);
  });
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
    renderCategoryOptions(); renderCatCenterList(); renderTasks();
    toast('🏷️ 카테고리 추가됨');
  });

  // 다이얼로그 밖 클릭 닫기
  [els.dlgTask, els.dlgCatCenter].forEach(dlg=>{
    dlg?.addEventListener('click', (e)=>{
      const panel=dlg.querySelector('.modal-body'); if(!panel) return;
      const r=panel.getBoundingClientRect();
      const inside=e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
      if(!inside){ closeColorPopover(); safeCloseModal(dlg); }
    });
  });
}

/* ===== init ===== */
function init(){ loadAll(); renderCategoryOptions(); renderTasks(); bind(); }
document.addEventListener('DOMContentLoaded', init);