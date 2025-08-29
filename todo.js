// === todo.js — 카테고리 생성/관리 + 기본 카테고리 삭제불가 + 카드 전체 드래그 정렬 ===

// ---------- Utilities ----------
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const uid = () => (crypto?.randomUUID?.() || String(Date.now())+Math.random().toString(16).slice(2));

// ---------- Storage ----------
const LS = { tasks:'td.tasks.v1', cats:'td.cats.v1' };
let tasks = [];
let categories = [];

function loadAll(){
  try {
    tasks = JSON.parse(localStorage.getItem(LS.tasks) || '[]');
    categories = JSON.parse(localStorage.getItem(LS.cats) || '[]');
  } catch { tasks = []; categories = []; }

  if (!categories.length) {
    categories = [{ id:'inbox', name:'Inbox', color:'#3b82f6', order:0 }];
    localStorage.setItem(LS.cats, JSON.stringify(categories));
  }
}
function saveAll(){
  localStorage.setItem(LS.tasks, JSON.stringify(tasks));
  localStorage.setItem(LS.cats, JSON.stringify(categories));
}

// ---------- Toast ----------
function toast(msg, type='success', opts={}){
  const host = $('#toastHost');
  if (!host) return alert(msg);

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.style.cssText = 'background:#14161b;border:1px solid #222933;color:#f7f7f7;padding:10px 12px;border-radius:10px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 24px rgba(0,0,0,.25);';
  el.textContent = msg;

  if (opts.undo){
    const btn = document.createElement('button');
    btn.textContent = '되돌리기';
    btn.style.cssText='padding:6px 10px;border-radius:8px;border:0;background:#3b82f6;color:#fff';
    btn.addEventListener('click', ()=>{ opts.undo(); close(); });
    el.appendChild(btn);
  }

  host.appendChild(el);
  const t = setTimeout(close, 3000);
  function close(){ clearTimeout(t); el.remove(); }
}

// ---------- DOM Hooks ----------
const els = {
  // openers
  btnCreateTask:        $('#btnCreateTask'),
  btnCreateCategory:    $('#btnCreateCategory'),
  btnManageCategories:  $('#btnManageCategories'),
  // task modal
  dlgTask:            $('#taskModal'),
  taskTitle:          $('#taskTitleInput'),
  taskDue:            $('#taskDueInput'),
  taskCat:            $('#taskCategorySelect'),
  taskSave:           $('#taskSaveBtn'),
  taskCancel:         $('#taskCancelBtn'),
  // category create modal
  dlgCat:             $('#categoryModal'),
  catName:            $('#catNameInput'),
  catColor:           $('#catColorInput'),     // hidden input (팔레트/피커 결과)
  catSave:            $('#catSaveBtn'),
  catCancel:          $('#catCancelBtn'),
  // color palette (옵션2)
  catPalette:         $('#catColorPalette'),
  catColorPicker:     $('#catColorPicker'),
  catMoreBtn:         $('#catColorMore'),
  // category manage modal
  dlgCatManage:       $('#categoryManageModal'),
  catList:            $('#catList'),
  catManageClose:     $('#catManageCloseBtn'),
  // list host
  listHost:           (function ensure(){
                        let host = $('#taskList');
                        if (!host) {
                          const parent = $('#todo') || document.body;
                          host = document.createElement('div');
                          host.id = 'taskList';
                          host.setAttribute('role','list');
                          parent.appendChild(host);
                        }
                        return host;
                      })(),
};

// ---------- Renderers ----------
function renderCategoryOptions(){
  if (!els.taskCat) return;
  els.taskCat.innerHTML = categories
    .slice().sort((a,b)=>(a.order??0)-(b.order??0))
    .map(c=>`<option value="${c.id}">${c.name}</option>`)
    .join('');
}
function renderCategoryManageList(){
  if (!els.catList) return;
  els.catList.innerHTML = '';
  categories
    .slice().sort((a,b)=>(a.order??0)-(b.order??0))
    .forEach(c=>{
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;gap:10px;border:1px solid #222933;border-radius:10px;padding:10px;background:#11151e';
      const dot = document.createElement('span');
      dot.style.cssText = `width:14px;height:14px;border-radius:50%;background:${c.color};border:1px solid #0004`;
      const name = document.createElement('span');
      name.textContent = c.name;
      name.style.cssText = 'flex:1';
      const del = document.createElement('button');
      del.textContent = c.id === 'inbox' ? '고정' : '삭제';
      del.className = 'danger';
      del.style.cssText='min-width:64px;padding:8px 10px;border-radius:8px;border:1px solid #3a3f4a;background:#1a1f29;color:#f7f7f7';
      if (c.id === 'inbox') {
        del.disabled = true;
        del.title = '기본 카테고리는 삭제할 수 없습니다';
        del.style.opacity = .5;
      } else {
        del.addEventListener('click', ()=> deleteCategory(c.id));
      }
      li.append(dot, name, del);
      els.catList.appendChild(li);
    });
}

function fmtDate(ms){
  if (!ms) return '';
  const d = new Date(ms);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function dueBadge(ms){
  if (!ms) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(ms); due.setHours(0,0,0,0);
  const diff = Math.round((due - today)/86400000);
  if (diff < 0) return '연체';
  if (diff === 0) return '오늘';
  return `D-${diff}`;
}

function renderTasks(){
  const host = els.listHost;
  host.innerHTML = '';
  // order 우선, 동점은 createdAt
  const list = [...tasks].sort((a,b)=>{
    const ao = a.order ?? 0, bo = b.order ?? 0;
    return ao === bo ? (a.createdAt??0)-(b.createdAt??0) : ao - bo;
  });

  list.forEach(t=>{
    const cat = categories.find(c=>c.id===t.categoryId);
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.id = t.id;
    row.setAttribute('role','listitem');
    // 그리드: 체크박스, 제목, 날짜, 카테고리, 삭제
    row.style.cssText = 'display:grid;grid-template-columns:44px 1fr auto auto 44px;align-items:center;gap:8px;border:1px solid #222933;border-radius:10px;padding:10px;margin:6px 0;background:#11151e;touch-action:none;overflow:hidden';

    // 완료 토글 (드래그 제외)
    const btnDone = document.createElement('button');
    btnDone.textContent = t.done ? '✅' : '⬜️';
    btnDone.setAttribute('aria-pressed', String(!!t.done));
    btnDone.className = 'no-drag';
    btnDone.style.cssText='min-width:44px;min-height:44px';
    btnDone.addEventListener('click', ()=>{
      t.done = !t.done; t.updatedAt = Date.now(); saveAll(); renderTasks();
    });

    // 제목 (ellipsis)
    const title = document.createElement('div');
    title.textContent = t.title;
    title.style.cssText='min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap';
    if (t.done) title.style.cssText += ';color:#9aa0a6;text-decoration:line-through';

    // 날짜
    const due = document.createElement('div');
    due.className = 'date';
    due.style.cssText='font-size:12px;color:#9aa0a6;min-width:auto;text-align:right;white-space:nowrap';
    due.textContent = t.dueAt ? `${fmtDate(t.dueAt)} (${dueBadge(t.dueAt)})` : '';

    // 카테고리 칩
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = cat ? cat.name : 'Inbox';
    chip.style.cssText = `font-size:12px;padding:4px 8px;border-radius:999px;background:${cat?.color||'#3b82f6'};white-space:nowrap`;

    // 삭제 (드래그 제외)
    const btnDel = document.createElement('button');
    btnDel.textContent = '🗑️';
    btnDel.setAttribute('aria-label','삭제');
    btnDel.className = 'no-drag';
    btnDel.style.cssText='min-width:44px;min-height:44px';
    btnDel.addEventListener('click', ()=>{
      const backup = { ...t };
      tasks = tasks.filter(x=>x.id!==t.id); saveAll(); renderTasks();
      toast('🗑️ 삭제됨','success',{ undo:()=>{ tasks.push(backup); saveAll(); renderTasks(); }});
    });

    // ✅ 순서: 체크박스, 할일, 날짜, 카테고리, 삭제
    row.append(btnDone, title, due, chip, btnDel);
    host.appendChild(row);

    // 카드 전체 드래그 가능 (버튼은 제외)
    enableRowDrag(row);
  });
}

// ---------- Dialog helpers ----------
function wireDialogOutsideClose(dlg){
  if (!dlg) return;
  dlg.addEventListener('click', (e)=>{
    const panel = dlg.querySelector('.modal-body');
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const inside = e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
    if (!inside) dlg.close();
  });
}

// ---------- Palette selection (옵션2) ----------
function selectCatColor(color){
  if (!color) return;
  if (els.catColor)       els.catColor.value = color;
  if (els.catColorPicker) els.catColorPicker.value = color;
  if (els.catPalette){
    $$('#catColorPalette button').forEach(b=> b.classList.remove('selected'));
    const btn = $(`#catColorPalette button[data-color="${color}"]`);
    if (btn) btn.classList.add('selected');
  }
}

// ---------- Open modals ----------
function openTaskModal(){
  if (!els.dlgTask) return;
  renderCategoryOptions();
  if (els.taskTitle) els.taskTitle.value = '';
  if (els.taskDue)   els.taskDue.value   = '';
  els.dlgTask.showModal();
}
function openCategoryModal(){
  if (!els.dlgCat) return;
  if (els.catName)  els.catName.value  = '';
  const defaultColor = '#3b82f6';
  if (els.catColor)       els.catColor.value = defaultColor;
  if (els.catColorPicker) els.catColorPicker.value = defaultColor;
  selectCatColor(defaultColor);
  els.dlgCat.showModal();
}
function openCategoryManage(){
  if (!els.dlgCatManage) return;
  renderCategoryManageList();
  els.dlgCatManage.showModal();
}

// ---------- Actions ----------
function saveTask(e){
  e?.preventDefault?.();
  const title = (els.taskTitle?.value || '').trim();
  if (!title) return toast('⚠️ 제목을 입력하세요','error');

  const catId = els.taskCat?.value || 'inbox';
  const dueAt = els.taskDue?.value ? new Date(els.taskDue.value+'T00:00:00').getTime() : null;

  const orderMax = Math.max(-1, ...tasks.map(t=>t.order ?? 0));
  const t = {
    id: uid(),
    title, done:false, categoryId: catId, dueAt,
    order: orderMax+1,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  tasks.push(t); saveAll(); renderTasks();
  els.dlgTask?.close();

  toast('✅ 추가됨','success',{ undo:()=>{ tasks = tasks.filter(x=>x.id!==t.id); saveAll(); renderTasks(); }});
}

function saveCategory(e){
  e?.preventDefault?.();
  const name  = (els.catName?.value || '').trim();
  const color = els.catColor?.value || '#3b82f6';
  if (!name) return toast('⚠️ 이름을 입력하세요','error');
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    return toast('⚠️ 카테고리 이름이 중복입니다','error');
  }

  const order = (categories.reduce((m,c)=>Math.max(m, c.order??0), 0) + 1);
  const c = { id: uid(), name, color, order };
  categories.push(c); saveAll();
  els.dlgCat?.close();
  renderCategoryOptions();

  toast('🏷️ 카테고리 추가됨','success',{ undo:()=>{ categories = categories.filter(x=>x.id!==c.id); saveAll(); renderCategoryOptions(); }});
}

function deleteCategory(catId){
  // 기본 카테고리 삭제 불가
  if (catId === 'inbox') {
    toast('⚠️ 기본 카테고리는 삭제할 수 없습니다','error');
    return;
  }
  const backupCats  = JSON.parse(JSON.stringify(categories));
  const backupTasks = JSON.parse(JSON.stringify(tasks));

  categories = categories.filter(c=>c.id !== catId);
  tasks.forEach(t=>{ if (t.categoryId === catId) t.categoryId = 'inbox'; });
  saveAll();
  renderCategoryOptions();
  renderCategoryManageList();
  renderTasks();

  toast('🗑️ 카테고리 삭제됨 (일정은 Inbox로 이동)', 'success', {
    undo: ()=>{
      categories = backupCats;
      tasks = backupTasks;
      saveAll();
      renderCategoryOptions();
      renderCategoryManageList();
      renderTasks();
    }
  });
}

// ---------- Drag reorder (카드 전체, 레이아웃 유지) ----------
let drag = null;
function enableRowDrag(rowEl){
  let pressTimer = null;

  const start = (yStart)=>{
    const hostRect = els.listHost.getBoundingClientRect();
    const rowRect  = rowEl.getBoundingClientRect();

    // placeholder
    const ph = document.createElement('div');
    ph.className = 'placeholder';
    ph.style.cssText = `height:${rowRect.height}px; border:2px dashed #3b82f6; border-radius:10px; margin:6px 0;`;
    rowEl.style.visibility = 'hidden';
    els.listHost.insertBefore(ph, rowEl.nextSibling);

    // ghost: 원래 그리드 한 줄 유지
    const ghost = rowEl.cloneNode(true);
    ghost.querySelectorAll('button').forEach(b=> b.setAttribute('disabled','true'));
    const rowStyle = window.getComputedStyle(rowEl);
    const gridCols = rowStyle.getPropertyValue('grid-template-columns');
    ghost.style.cssText = `
      position:fixed; left:${rowRect.left}px; top:${rowRect.top}px;
      width:${rowRect.width}px; height:${rowRect.height}px;
      z-index:9999; pointer-events:none; opacity:.98; transform:translateY(0);
      box-shadow:0 12px 32px rgba(0,0,0,.35); border:1px solid #2a3140; background:#11151e; border-radius:10px;
      display:grid; align-items:center; gap:8px;
    `;
    ghost.style.gridTemplateColumns = gridCols;

    document.body.appendChild(ghost);
    els.listHost.classList.add('dragging');

    drag = { ghost, ph, startY:yStart, lastY:yStart, row:rowEl, hostTop:hostRect.top, hostBottom:hostRect.bottom };
  };

  const move = (y)=>{
    if (!drag) return;
    drag.lastY = y;
    const dy = y - drag.startY;
    drag.ghost.style.transform = `translateY(${dy}px)`;

    // placeholder 재배치
    const siblings = [...els.listHost.querySelectorAll('.task-row, .placeholder')];
    const ghostRect = drag.ghost.getBoundingClientRect();
    const ghostCenter = ghostRect.top + ghostRect.height/2;

    for (const s of siblings){
      if (s === drag.ph) continue;
      const r = s.getBoundingClientRect();
      if (ghostCenter < r.top + r.height/2){
        els.listHost.insertBefore(drag.ph, s);
        break;
      }
      if (s === siblings[siblings.length-1]){
        els.listHost.appendChild(drag.ph);
      }
    }
  };

  const end = ()=>{
    if (!drag) return;
    const { ghost, ph, row } = drag;

    ghost.remove();
    row.style.visibility = '';
    els.listHost.insertBefore(row, ph);
    ph.remove();
    els.listHost.classList.remove('dragging');

    // 화면 순서 → order 재계산
    const ids = $$('.task-row', els.listHost).map(el=>el.dataset.id);
    const before = tasks.map(t=>({ id:t.id, order:t.order ?? 0 }));
    ids.forEach((id, i)=>{
      const t = tasks.find(x=>x.id===id);
      if (t) t.order = i;
    });
    saveAll(); renderTasks();

    toast('↕️ 순서 변경됨','success',{
      undo: ()=>{
        before.forEach(b=>{
          const t = tasks.find(x=>x.id===b.id);
          if (t) t.order = b.order;
        });
        saveAll(); renderTasks();
      }
    });

    drag = null;
  };

  const onPointerDown = (e)=>{
    // 카드 전체에서 드래그 시작, 단 클릭용 버튼에서는 제외
    if (e.target.closest('.no-drag')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const y0 = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    e.preventDefault();
    const pressTimer = setTimeout(()=> start(y0), 220);

    const onMove = (ev)=>{
      const y = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;
      if (drag) move(y);
    };
    const onUp = ()=>{
      clearTimeout(pressTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      if (drag) end();
    };
    window.addEventListener('pointermove', onMove, { passive:false });
    window.addEventListener('pointerup', onUp, { passive:false });
    window.addEventListener('touchmove', onMove, { passive:false });
    window.addEventListener('touchend', onUp, { passive:false });
  };

  rowEl.addEventListener('pointerdown', onPointerDown, { passive:false });
}

// ---------- Bindings ----------
function bind(){
  // open buttons
  els.btnCreateTask       ?.addEventListener('click', openTaskModal);
  els.btnCreateCategory   ?.addEventListener('click', openCategoryModal);
  els.btnManageCategories ?.addEventListener('click', openCategoryManage);

  // dialog cancel buttons
  els.taskCancel?.addEventListener('click', ()=> els.dlgTask?.close());
  els.catCancel ?.addEventListener('click', ()=> els.dlgCat?.close());
  els.catManageClose?.addEventListener('click', ()=> els.dlgCatManage?.close());

  // dialog outside click close
  wireDialogOutsideClose(els.dlgTask);
  wireDialogOutsideClose(els.dlgCat);
  wireDialogOutsideClose(els.dlgCatManage);

  // save handlers
  els.taskSave?.addEventListener('click', saveTask);
  els.catSave ?.addEventListener('click', saveCategory);

  // Enter to submit in task title
  els.taskTitle?.addEventListener('keydown', (e)=>{ if (e.key==='Enter') saveTask(e); });

  // 팔레트 조작 (옵션2)
  els.catPalette?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-color]');
    if (!btn) return;
    selectCatColor(btn.dataset.color);
  });
  els.catMoreBtn?.addEventListener('click', ()=> els.catColorPicker?.click());
  els.catColorPicker?.addEventListener('input', ()=> selectCatColor(els.catColorPicker.value));
}

// ---------- Init ----------
function init(){
  loadAll();
  renderCategoryOptions();
  renderTasks();
  bind();
}
document.addEventListener('DOMContentLoaded', init);