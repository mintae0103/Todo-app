// tags.js — 태그 CRUD + 팔레트 + 드래그 정렬 + 다른 모듈로 브로드캐스트
const TAGS_KEY = 'tags.v1';
(function(){
  const $  = (s, r=document)=>r.querySelector(s);
  const ce = (t,p={})=>Object.assign(document.createElement(t),p);
  const uid= ()=> (crypto?.randomUUID?.() || Date.now()+Math.random().toString(16).slice(2));

  const PALETTE = ['#EF4444','#F59E0B','#10B981','#06B6D4','#3B82F6','#6366F1','#8B5CF6','#A855F7','#EC4899','#F43F5E','#84CC16','#14B8A6'];

  // storage
  const load = (k, def=[])=>{ try{const v=localStorage.getItem(k); return v?JSON.parse(v):def;}catch{ return def; } };
  const save = (k, v)=>{ try{localStorage.setItem(k, JSON.stringify(v));}catch{ /* noop */ } };

  function toast(msg){ const host=$('#toastHost'); if(!host) return; const el=ce('div',{className:'toast',textContent:msg}); host.appendChild(el); setTimeout(()=>el.remove(),2000); }

  // render palette radios + custom color sync
  function renderPalette(selected){
    const wrap = $('#tagPalette'); if(!wrap) return; wrap.innerHTML='';
    PALETTE.forEach(c=>{
      const b=ce('button',{type:'button',className:'tag-swatch',title:c});
      b.style.background=c;
      if (selected===c) b.classList.add('selected');
      b.addEventListener('click', ()=>{
        wrap.querySelectorAll('.tag-swatch').forEach(x=>x.classList.remove('selected'));
        b.classList.add('selected');
        $('#tagCustomColor').value = c;
      });
      wrap.appendChild(b);
    });
  }

  function getSelectedColor(){
    // palette에서 selected 우선, 없으면 custom color
    const sel = $('#tagPalette .tag-swatch.selected');
    return sel ? sel.title : ($('#tagCustomColor')?.value || '#6E56CF');
  }

  function renderList(){
    const list=$('#tagList'); if(!list) return;
    const tags=load(TAGS_KEY,[]);
    // order 보장
    tags.sort((a,b)=>(a.order??0)-(b.order??0));
    list.innerHTML = '';
    tags.forEach(t=>{
      const row=ce('div',{className:'tag-row', draggable:true});
      row.dataset.id=t.id;

      const drag=ce('span',{className:'drag',textContent:'↕'});
      const dot =ce('span',{className:'tag-dot'}); dot.style.background=t.color;
      const name=ce('input',{type:'text',value:t.name,style:'flex:1;min-width:120px'});
      const color=ce('input',{type:'color',value:t.color});
      const del =ce('button',{textContent:'🗑'});

      del.addEventListener('click', ()=>{
        const arr=load(TAGS_KEY,[]);
        const idx=arr.findIndex(x=>x.id===t.id);
        if(idx>=0){ arr.splice(idx,1); save(TAGS_KEY,arr); renderList(); broadcast(); toast('태그 삭제됨'); }
      });
      name.addEventListener('change', ()=>{
        const arr=load(TAGS_KEY,[]); const i=arr.findIndex(x=>x.id===t.id);
        if(i>=0){ arr[i].name=name.value.trim()||arr[i].name; save(TAGS_KEY,arr); broadcast(); }
      });
      color.addEventListener('input', ()=>{
        const arr=load(TAGS_KEY,[]); const i=arr.findIndex(x=>x.id===t.id);
        if(i>=0){ arr[i].color=color.value; save(TAGS_KEY,arr); dot.style.background=color.value; broadcast(); }
      });

      // drag order
      row.addEventListener('dragstart', e=>{
        e.dataTransfer.setData('text/plain', t.id);
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', ()=> row.classList.remove('dragging'));
      row.addEventListener('dragover', e=>{
        e.preventDefault();
        const after = getDragAfterElement(list, e.clientY);
        const dragging = $('.tag-row.dragging', list);
        if(!dragging) return;
        if (after == null) list.appendChild(dragging);
        else list.insertBefore(dragging, after);
      });
      row.addEventListener('drop', ()=>{
        // recompute order
        const arr=load(TAGS_KEY,[]);
        Array.from(list.querySelectorAll('.tag-row')).forEach((el, idx)=>{
          const id=el.dataset.id;
          const i=arr.findIndex(x=>x.id===id);
          if(i>=0) arr[i].order = idx;
        });
        save(TAGS_KEY,arr); broadcast();
      });

      row.append(drag,dot,name,color,del);
      list.appendChild(row);
    });
  }
  function getDragAfterElement(container, y){
    const els=[...container.querySelectorAll('.tag-row:not(.dragging)')];
    return els.reduce((closest, child)=>{
      const box=child.getBoundingClientRect();
      const offset=y - box.top - box.height/2;
      if(offset<0 && offset>closest.offset){ return {offset, element: child}; }
      else return closest;
    }, {offset: Number.NEGATIVE_INFINITY}).element;
  }

  // broadcast tags to other modules
  function broadcast(){
    const tags=load(TAGS_KEY,[]).sort((a,b)=>(a.order??0)-(b.order??0));
    // Focus: fill select/chips
    if (window.TagsHook?.onTagsChanged) window.TagsHook.onTagsChanged(tags);
    // Goals: fill tag checkbox list
    if (window.TagsHook?.onTagsForGoals) window.TagsHook.onTagsForGoals(tags);
  }

  function init(){
    // open/close
    $('#btnManageTags')?.addEventListener('click', ()=>{
      renderPalette();
      renderList();
      openDialog($('#tagModal'));
    });
    $('#tagClose')?.addEventListener('click', ()=> closeDialog($('#tagModal')));

    // create
    $('#tagForm')?.addEventListener('submit', e=>{
      e.preventDefault();
      const name = $('#tagName')?.value?.trim();
      if(!name){ toast('태그 이름을 입력하세요'); return; }
      const color = getSelectedColor();
      const arr = load(TAGS_KEY,[]);
      arr.push({ id: uid(), name, color, order: arr.length });
      save(TAGS_KEY, arr);
      $('#tagName').value='';
      renderList(); broadcast(); toast('태그 추가됨');
    });

    // 최초 브로드캐스트
    broadcast();
  }

  // borrow openDialog/closeDialog from global (already defined in apps)
  function openDialog(d){ try{ d.showModal?.() ?? d.setAttribute('open',''); }catch{ d.setAttribute('open',''); } }
  function closeDialog(d){ try{ d.close(); }catch{ d.removeAttribute('open'); } }

  if(document.readyState==='loading') window.addEventListener('DOMContentLoaded',init);
  else init();

  // expose minimal API if needed
  window.Tags = {
    list(){ return load(TAGS_KEY,[]).sort((a,b)=>(a.order??0)-(b.order??0)); }
  };
})();