// focus.js — 연속 이탈 감지 + 풀스크린 + 오버레이 타이머
// (일시정지/리셋/종료 + 세션 요약 + "이탈 구간 기록")
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
      const clearBtn = document.getElementById('focusClearLogs');

        function clearLogs(){
        if (confirm('정말 모든 집중 로그를 삭제할까요?')) {
            localStorage.removeItem(LS_KEY);
            renderSummary();
            toast('📁 모든 로그 삭제됨');
        }
        }

        clearBtn?.addEventListener('click', clearLogs);
  
      if (!startBtn || !overlay || !timerEl || !pauseBtn || !resetBtn || !endBtn) return;
  
      // ===== 상태 =====
      let isRunning = false;
      let startAtPerf = 0;     // performance.now() 기준 시작 시각
      let startAtReal = 0;     // Date.now() (로그용 실제 시각)
      let elapsed   = 0;       // 누적 ms
      let rafId     = null;
  
      // 이탈 기록
      let leaves = [];               // [{at, resumedAt}, ...]
      let currentLeave = null;       // 진행 중인 이탈 (hidden 시 시작)
      const LS_KEY = 'focus.logs.v1';
  
      // ===== 유틸 =====
      const fmtHMS = (ms)=>{
        const s = Math.floor(ms/1000);
        const h = Math.floor(s/3600);
        const m = Math.floor((s%3600)/60);
        const ss= s%60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
      };
      const fmtClock = (t)=>{ // Date ms -> "HH:MM"
        const d = new Date(t);
        const HH = String(d.getHours()).padStart(2,'0');
        const MM = String(d.getMinutes()).padStart(2,'0');
        return `${HH}:${MM}`;
      };
      const isSameDay = (a,b)=>{
        const da = new Date(a), db = new Date(b);
        return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate();
      };
      function sumLeaveMs(arr){
        return arr.reduce((acc, l)=> acc + (l.resumedAt ? (l.resumedAt - l.at) : 0), 0);
      }
      function toast(msg){
        const host = document.getElementById('toastHost');
        if (!host) return;
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        host.appendChild(el);
        setTimeout(()=> el.remove(), 2000);
      }
  
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
  
            // 이탈 구간 목록
            if (x.leaves && x.leaves.length > 0){
              const ul = document.createElement('ul');
              ul.style.margin = '0';
              ul.style.paddingLeft = '18px';
              x.leaves.forEach(l=>{
                const li2 = document.createElement('li');
                const endTxt = l.resumedAt ? fmtClock(l.resumedAt) : '...';
                const durTxt = l.resumedAt ? ` (${fmtHMS(l.resumedAt - l.at)})` : '';
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
        // 이탈 기록은 세션 중 유지 (원하면 여기서 leaves = [] 초기화로 변경 가능)
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
  
        // 만약 종료 시점에 이탈이 열린 상태라면 닫아줌
        if (currentLeave && !currentLeave.resumedAt){
          currentLeave.resumedAt = endAtReal;
          currentLeave = null;
        }
  
        // 로그 저장
        if (startAtReal && durationMs >= 0){
          const logs = loadLogs();
          logs.push({
            start: startAtReal,
            end: endAtReal,
            durationMs,
            leaves: leaves.slice() // [{at,resumedAt}, ...]
          });
          saveLogs(logs);
        }
  
        // UI 초기화
        elapsed = 0;
        timerEl.textContent = '00:00:00';
        leaves = [];
        currentLeave = null;
        banner(false);
        await exitFS();
        hideOverlay();
        toast('■ 종료');
  
        // 요약 렌더 & 세션 요약 토스트
        renderSummary();
        const awayMs = sumLeaveMs(leaves); // 종료 직후 leaves는 초기화됨(위 renderSummary가 이미 저장된 로그로 합계 계산)
      }
  
      // ===== 이벤트 =====
      // 앱 이탈 감지 (hidden → 이탈 시작 / visible → 이탈 종료 시각 기록)
      document.addEventListener('visibilitychange', ()=>{
        if (!startAtReal) return; // 세션 외 무시
        const now = Date.now();
  
        if (document.hidden){
          // 이탈 시작 (타이머가 돌아가는 상태에서만 의미)
          if (isRunning && !currentLeave){
            currentLeave = { at: now, resumedAt: null };
            leaves.push(currentLeave);
            // 이탈과 동시에 일시정지
            pauseTimer(`일시정지됨 (앱 이탈 감지 ${leaves.length}회)`);
          }
        } else {
          // 앱으로 복귀 → 열린 이탈이 있으면 종료시각 기록
          if (currentLeave && !currentLeave.resumedAt){
            currentLeave.resumedAt = now;
            currentLeave = null;
            // 자동 재개는 하지 않고, 사용자가 ▶︎ 눌러 재개하도록 유지
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
  
      // 포커스 섹션을 벗어나면 종료
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