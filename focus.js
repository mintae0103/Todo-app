// focus.js — 연속 이탈 감지 + 풀스크린 + 오버레이 타이머 (일시정지/리셋/종료 + 세션 요약)
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
  
      if (!startBtn || !overlay || !timerEl || !pauseBtn || !resetBtn || !endBtn) return;
  
      // 상태
      let isRunning = false;
      let startAtPerf = 0;   // performance.now()
      let startAtReal = 0;   // Date.now() (실제 시각, 로그용)
      let elapsed   = 0;     // 누적 ms
      let rafId     = null;
      let leaveCount = 0;    // 세션 중 이탈 횟수
  
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
  
      // ===== 풀스크린 (가능하면) =====
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
        const totalLeaves = todays.reduce((acc,x)=> acc + (x.leaves||0), 0);
  
        sumTotalEl.textContent = `오늘 총 집중 ${fmtHMS(totalMs)} · 세션 ${todays.length}개 · 앱 이탈 ${totalLeaves}회`;
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
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.gap = '8px';
  
            const left = document.createElement('div');
            left.textContent = `${fmtClock(x.start)} ~ ${fmtClock(x.end)}  (${fmtHMS(x.durationMs)})`;
  
            const right = document.createElement('div');
            right.className = 'muted';
            right.textContent = `이탈 ${x.leaves||0}회`;
  
            li.append(left, right);
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
        leaveCount = 0;
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
          // 진행 중이면 일시정지 후 리셋
          // pauseTimer는 async지만, 여기선 즉시 초기화
          isRunning = false;
          cancelAnimationFrame(rafId); rafId = null;
        }
        elapsed = 0;
        timerEl.textContent = '00:00:00';
        banner(false);
        toast('↺ 리셋');
        pauseBtn.textContent = '▶︎ 재개';
        pauseBtn.classList.remove('secondary'); pauseBtn.classList.add('primary');
      }
  
      async function endTimer(){
        // 최종 시간 계산
        if (isRunning){
          isRunning = false;
          cancelAnimationFrame(rafId); rafId = null;
          elapsed += (performance.now() - startAtPerf);
        }
        const durationMs = elapsed;
        const endAtReal = Date.now();
  
        // 로그 저장
        if (startAtReal && durationMs >= 0){
          const logs = loadLogs();
          logs.push({
            start: startAtReal,
            end: endAtReal,
            durationMs,
            leaves: leaveCount
          });
          saveLogs(logs);
        }
  
        // UI 초기화
        elapsed = 0;
        timerEl.textContent = '00:00:00';
        leaveCount = 0;
        banner(false);
        await exitFS();
        hideOverlay();
        toast('■ 종료');
  
        // 요약 렌더 & 세션 요약 토스트
        renderSummary();
        const msg = `세션 종료: 집중 ${fmtHMS(durationMs)}, 앱 이탈 ${leaveCount}회`;
        toast(msg);
      }
  
      // ===== 이벤트 =====
      // 앱 이탈 감지
      document.addEventListener('visibilitychange', ()=>{
        if (document.hidden && isRunning){
          leaveCount++;
          pauseTimer(`일시정지됨 (앱 이탈 감지 ${leaveCount}회)`);
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