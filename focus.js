// focus.js — 집중 타이머 오버레이 + 연속 이탈 기록 + Undo(세션 저장/전체삭제)
(function(){
  function initFocus(){
    const startBtn   = document.getElementById('focusStart');
    const overlay    = document.getElementById('focusOverlay');
    const timerEl    = document.getElementById('focusTimer');
    const pauseBtn   = document.getElementById('focusPause');
    const resetBtn   = document.getElementById('focusReset');
    const endBtn     = document.getElementById('focusEnd');
    const bannerEl   = document.getElementById('focusBanner');

    const sumTotalEl = document.getElementById('focusSummaryTotal');
    const listEl     = document.getElementById('focusSessionList');
    const clearBtn   = document.getElementById('focusClearLogs'); // (있으면 연결)

    if (!startBtn || !overlay || !timerEl || !pauseBtn || !resetBtn || !endBtn) return;

    // ===== 토스트 =====
    function toast(msg){
      const host = document.getElementById('toastHost');
      if (!host) return;
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      host.appendChild(el);
      setTimeout(()=> el.remove(), 2000);
    }
    function toastWithUndo(message, undoLabel, onUndo, timeout=6000){
      const host = document.getElementById('toastHost');
      if (!host) return;
      const el = document.createElement('div');
      el.className = 'toast';

      const span = document.createElement('span');
      span.textContent = message;

      const btn = document.createElement('button');
      btn.textContent = undoLabel || '되돌리기';
      btn.style.marginLeft = '10px';

      let settled = false;
      const done = ()=>{
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        el.remove();
      };

      btn.addEventListener('click', ()=>{
        try { onUndo?.(); } finally { done(); }
      });

      el.append(span, btn);
      host.appendChild(el);
      const timer = setTimeout(done, timeout);
    }

    // ===== 상태 =====
    let isRunning = false;
    let startAtPerf = 0;     // performance.now()
    let startAtReal = 0;     // Date.now()
    let elapsed   = 0;       // 누적 ms
    let rafId     = null;

    let leaves = [];               // [{at,resumedAt}]
    let currentLeave = null;

    const LS_KEY = 'focus.logs.v1';

    // ===== 유틸 =====
    const fmtHMS = (ms)=>{
      const s = Math.floor(ms/1000);
      const h = Math.floor(s/3600);
      const m = Math.floor((s%3600)/60);
      const ss= s%60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    };
    const fmtClock = (t)=>{ const d=new Date(t); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
    const isSameDay = (a,b)=>{ const da=new Date(a), db=new Date(b); return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate(); };
    const sumLeaveMs = arr => arr.reduce((acc, l)=> acc + (l.resumedAt ? (l.resumedAt - l.at) : 0), 0);

    // ===== 오버레이/배너 =====
    function showOverlay(){ overlay.hidden = false; document.body.style.overflow = 'hidden'; }
    function hideOverlay(){ overlay.hidden = true; document.body.style.overflow = ''; banner(false); }
    function banner(show, text){
      if (!bannerEl) return;
      if (show){ if (text) bannerEl.textContent = text; bannerEl.hidden = false; }
      else bannerEl.hidden = true;
    }

    // ===== 풀스크린 (가능할 때만) =====
    async function requestFS(){
      const el = document.documentElement;
      try{
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      }catch(_){}
    }
    async function exitFS(){
      try{
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
      }catch(_){}
    }

    // ===== 저장/불러오기 + 요약 렌더 =====
    function loadLogs(){
      try { return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); } catch{ return []; }
    }
    function saveLogs(arr){
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    }
    function renderSummary(){
      if (!sumTotalEl || !listEl) return;
      const logs = loadLogs();
      const now = Date.now();
      const todays = logs.filter(x => isSameDay(x.start, now));

      if (todays.length === 0){
        sumTotalEl.textContent = '오늘 기록이 없습니다.';
        listEl.innerHTML = '';
        return;
      }

      const totalMs = todays.reduce((acc,x)=> acc + (x.durationMs||0), 0);
      const totalLeaves = todays.reduce((acc,x)=> acc + ((x.leaves?.length)||0), 0);
      const totalAway = todays.reduce((acc,x)=> acc + sumLeaveMs(x.leaves||[]), 0);

      sumTotalEl.textContent = `오늘 총 집중 ${fmtHMS(totalMs)} · 세션 ${todays.length}개 · 이탈 ${totalLeaves}회 · 이탈시간 ${fmtHMS(totalAway)}`;
      listEl.innerHTML = '';

      todays
        .sort((a,b)=> a.start - b.start)
        .forEach(x=>{
          const li = document.createElement('li');
          li.style.border = '1px solid var(--border)';
          li.style.borderRadius = '10px';
          li.style.background = '#11151e';
          li.style.padding = '8px';
          li.style.display = 'flex';
          li.style.flexDirection = 'column';
          li.style.gap = '6px';

          const top = document.createElement('div');
          top.style.display='flex';
          top.style.justifyContent='space-between';
          top.style.alignItems='center';
          const left = document.createElement('div');
          left.textContent = `${fmtClock(x.start)} ~ ${fmtClock(x.end)}  (${fmtHMS(x.durationMs)})`;
          const right = document.createElement('div');
          right.className = 'muted';
          const awayMs = sumLeaveMs(x.leaves||[]);
          right.textContent = `이탈 ${x.leaves?.length||0}회 · ${fmtHMS(awayMs)}`;
          top.append(left,right);
          li.appendChild(top);

          if (x.leaves && x.leaves.length > 0){
            const ul = document.createElement('ul');
            ul.style.margin = '0';
            ul.style.paddingLeft = '18px';
            x.leaves.forEach(l=>{
              const endTxt = l.resumedAt ? fmtClock(l.resumedAt) : '...';
              const durTxt = l.resumedAt ? ` (${fmtHMS(l.resumedAt - l.at)})` : '';
              const li2 = document.createElement('li');
              li2.textContent = `${fmtClock(l.at)} ~ ${endTxt}${durTxt}`;
              ul.appendChild(li2);
            });
            li.appendChild(ul);
          }

          listEl.appendChild(li);
        });
    }

    // ===== 타이머 루프 =====
    function tick(){
      if (!isRunning) return;
      const now = performance.now();
      const ms = elapsed + (now - startAtPerf);
      timerEl.textContent = fmtHMS(ms);
      rafId = requestAnimationFrame(tick);
    }

    // ===== 제어 =====
    async function startTimer(){
      if (isRunning) return;
      isRunning = true;
      banner(false);
      startAtPerf = performance.now();
      startAtReal = Date.now();
      elapsed = 0;
      leaves = [];
      currentLeave = null;
      timerEl.textContent = '00:00:00';
      tick();
      showOverlay();
      await requestFS();
      toast('⏱️ 타이머 시작');
      pauseBtn.textContent = '⏸ 일시정지';
      pauseBtn.classList.remove('primary'); pauseBtn.classList.add('secondary');
    }

    async function pauseTimer(reason){
      if (!isRunning) return;
      isRunning = false;
      cancelAnimationFrame(rafId); rafId = null;
      elapsed += (performance.now() - startAtPerf);
      timerEl.textContent = fmtHMS(elapsed);
      banner(true, reason || '일시정지됨');
      await exitFS();
      toast('⏸ 일시정지');
      pauseBtn.textContent = '▶︎ 재개';
      pauseBtn.classList.remove('secondary'); pauseBtn.classList.add('primary');
    }

    async function resumeTimer(){
      if (isRunning) return;
      isRunning = true;
      banner(false);
      startAtPerf = performance.now();
      tick();
      await requestFS();
      toast('▶︎ 재개');
      pauseBtn.textContent = '⏸ 일시정지';
      pauseBtn.classList.remove('primary'); pauseBtn.classList.add('secondary');
    }

    function resetTimer(){
      if (isRunning){
        isRunning = false;
        cancelAnimationFrame(rafId); rafId = null;
      }
      elapsed = 0;
      timerEl.textContent = '00:00:00';
      banner(false);
      toast('↺ 리셋');
      pauseBtn.textContent = '▶︎ 재개';
      pauseBtn.classList.remove('secondary'); pauseBtn.classList.add('primary');
      // leaves는 세션 내 유지 (원하면 여기서 초기화)
    }

    async function endTimer(){
      // 진행 중이면 누적 반영
      if (isRunning){
        isRunning = false;
        cancelAnimationFrame(rafId); rafId = null;
        elapsed += (performance.now() - startAtPerf);
      }
      const durationMs = elapsed;
      const endAtReal = Date.now();

      // 열린 이탈 닫기
      if (currentLeave && !currentLeave.resumedAt){
        currentLeave.resumedAt = endAtReal;
        currentLeave = null;
      }

      // 로그 저장 + Undo 백업
      let justAddedLog = null;
      if (startAtReal && durationMs >= 0){
        const logs = loadLogs();
        const entry = { start: startAtReal, end: endAtReal, durationMs, leaves: leaves.slice() };
        logs.push(entry);
        saveLogs(logs);
        justAddedLog = entry;
      }

      // UI 초기화
      elapsed = 0;
      timerEl.textContent = '00:00:00';
      leaves = [];
      currentLeave = null;
      banner(false);
      await exitFS();
      hideOverlay();

      renderSummary();

      // ✅ 종료 시 Undo (방금 저장한 로그 삭제)
      if (justAddedLog){
        toastWithUndo(`세션 종료: 집중 ${fmtHMS(justAddedLog.durationMs)} · 이탈 ${(justAddedLog.leaves||[]).length}회`, '되돌리기', ()=>{
          const logs = loadLogs();
          const i = logs.findIndex(x =>
            x.start === justAddedLog.start &&
            x.end === justAddedLog.end &&
            x.durationMs === justAddedLog.durationMs
          );
          if (i>=0){
            logs.splice(i,1);
            saveLogs(logs);
            renderSummary();
          }
        }, 6000);
      } else {
        toast('■ 종료');
      }
    }

    // ===== 로그 전체 삭제 (있을 때만) + Undo =====
    function clearLogs(){
      const prev = loadLogs();
      if (!prev.length){ toast('삭제할 로그가 없습니다'); return; }
      if (confirm('정말 모든 집중 로그를 삭제할까요?')){
        localStorage.removeItem(LS_KEY);
        renderSummary();
        toastWithUndo('📁 모든 로그 삭제됨', '되돌리기', ()=>{
          saveLogs(prev);
          renderSummary();
        }, 6000);
      }
    }
    clearBtn?.addEventListener('click', clearLogs);

    // ===== 이벤트 =====
    // 앱 이탈 감지 (hidden → 이탈 시작 / visible → 이탈 종료)
    document.addEventListener('visibilitychange', ()=>{
      if (!startAtReal) return; // 세션 외 무시
      const now = Date.now();

      if (document.hidden){
        // 이탈 시작
        if (isRunning && !currentLeave){
          currentLeave = { at: now, resumedAt: null };
          leaves.push(currentLeave);
          // 이탈과 동시에 일시정지
          pauseTimer(`일시정지됨 (앱 이탈 감지 ${leaves.length}회)`);
        }
      } else {
        // 복귀 → 열린 이탈 닫기
        if (currentLeave && !currentLeave.resumedAt){
          currentLeave.resumedAt = now;
          currentLeave = null;
        }
      }
    });

    // 시작 버튼
    startBtn.addEventListener('click', async ()=>{
      await startTimer();
    });

    // 오버레이 컨트롤
    pauseBtn.addEventListener('click', async ()=>{
      if (isRunning) await pauseTimer();
      else await resumeTimer();
    });
    resetBtn.addEventListener('click', resetTimer);
    endBtn.addEventListener('click', endTimer);

    // ESC로 일시정지
    window.addEventListener('keydown', async (e)=>{
      if (e.key === 'Escape' && isRunning){
        await pauseTimer('일시정지됨 (ESC)');
      }
    });

    // 포커스 섹션 벗어나면 종료
    window.addEventListener('hashchange', ()=>{
      if (location.hash !== '#focus' && !overlay.hidden){
        endTimer();
      }
    });

    // 초기 요약 렌더
    renderSummary();
  }

  if (document.readyState === 'loading'){
    window.addEventListener('DOMContentLoaded', initFocus);
  } else {
    initFocus();
  }
})();