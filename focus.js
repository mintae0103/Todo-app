// focus.js — 연속 이탈 감지 + 풀스크린 + 오버레이 타이머 (일시정지/리셋/종료)
(function(){
    function initFocus(){
      const startBtn   = document.getElementById('focusStart');
      const overlay    = document.getElementById('focusOverlay');
      const timerEl    = document.getElementById('focusTimer');
      const pauseBtn   = document.getElementById('focusPause');
      const resetBtn   = document.getElementById('focusReset');
      const endBtn     = document.getElementById('focusEnd');
      const bannerEl   = document.getElementById('focusBanner');
  
      if (!startBtn || !overlay || !timerEl || !pauseBtn || !resetBtn || !endBtn) return;
  
      // 상태
      let isRunning = false;
      let startAt   = 0;     // performance.now()
      let elapsed   = 0;     // 누적 ms
      let rafId     = null;
      let leaveCount = 0;    // 세션 중 이탈 횟수
  
      // 표시 포맷
      const fmt = (ms)=>{
        const s = Math.floor(ms/1000);
        const h = Math.floor(s/3600);
        const m = Math.floor((s%3600)/60);
        const ss= s%60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
      };
  
      // 토스트
      function toast(msg){
        const host = document.getElementById('toastHost');
        if (!host) return;
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        host.appendChild(el);
        setTimeout(()=> el.remove(), 1800);
      }
  
      // 오버레이
      function showOverlay(){ overlay.hidden = false; document.body.style.overflow = 'hidden'; }
      function hideOverlay(){ overlay.hidden = true; document.body.style.overflow = ''; banner(false); }
  
      // 배너
      function banner(show, text){
        if (!bannerEl) return;
        if (show){ if (text) bannerEl.textContent = text; bannerEl.hidden = false; }
        else bannerEl.hidden = true;
      }
  
      // 풀스크린 (가능한 경우만)
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
  
      // 루프
      function tick(){
        if (!isRunning) return;
        const now = performance.now();
        const ms = elapsed + (now - startAt);
        timerEl.textContent = fmt(ms);
        rafId = requestAnimationFrame(tick);
      }
  
      // 시작/재개
      async function startTimer(){
        if (isRunning) return;
        isRunning = true;
        banner(false);
        startAt = performance.now();
        tick();
        showOverlay();
        await requestFS();
        toast('⏱️ 타이머 시작');
        // 버튼 상태
        pauseBtn.textContent = '⏸ 일시정지';
        pauseBtn.classList.remove('primary'); pauseBtn.classList.add('secondary');
      }
  
      // 일시정지
      async function pauseTimer(reason){
        if (!isRunning) return;
        isRunning = false;
        cancelAnimationFrame(rafId); rafId = null;
        elapsed += (performance.now() - startAt);
        timerEl.textContent = fmt(elapsed);
        banner(true, reason || '일시정지됨');
        await exitFS(); // 원치 않으면 주석 처리
        toast('⏸ 일시정지');
        pauseBtn.textContent = '▶︎ 재개';
        pauseBtn.classList.remove('secondary'); pauseBtn.classList.add('primary');
      }
  
      // 재개
      async function resumeTimer(){
        if (isRunning) return;
        isRunning = true;
        banner(false);
        startAt = performance.now();
        tick();
        await requestFS();
        toast('▶︎ 재개');
        pauseBtn.textContent = '⏸ 일시정지';
        pauseBtn.classList.remove('primary'); pauseBtn.classList.add('secondary');
      }
  
      // 리셋(경과시간 0으로, 기본은 일시정지 상태 유지)
      function resetTimer(){
        if (isRunning){
          // 진행 중이면 일시정지 후 리셋
          pauseTimer('리셋됨');
          // pauseTimer가 async라 타이밍에 따라 깜빡일 수 있음 → 바로 상태 조정
          isRunning = false;
        }
        elapsed = 0;
        timerEl.textContent = '00:00:00';
        banner(false);
        toast('↺ 리셋');
        pauseBtn.textContent = '▶︎ 재개';
        pauseBtn.classList.remove('secondary'); pauseBtn.classList.add('primary');
      }
  
      // 종료(세션 완전 종료하고 오버레이 닫기)
      async function endTimer(){
        isRunning = false;
        cancelAnimationFrame(rafId); rafId = null;
        elapsed = 0;
        timerEl.textContent = '00:00:00';
        leaveCount = 0;
        banner(false);
        await exitFS();
        hideOverlay();
        toast('■ 종료');
      }
  
      // 앱 이탈 감지
      document.addEventListener('visibilitychange', ()=>{
        if (document.hidden && isRunning){
          leaveCount++;
          pauseTimer(`일시정지됨 (앱 이탈 감지 ${leaveCount}회)`);
        }
      });
  
      // 시작 버튼
      startBtn.addEventListener('click', async ()=>{
        // 새 세션 초기화
        isRunning = false;
        elapsed = 0;
        leaveCount = 0;
        timerEl.textContent = '00:00:00';
        pauseBtn.textContent = '⏸ 일시정지';
        pauseBtn.classList.remove('primary'); pauseBtn.classList.add('secondary');
        await startTimer();
      });
  
      // 오버레이 내 컨트롤
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
  
      // 포커스 섹션을 벗어나면 오버레이 닫기
      window.addEventListener('hashchange', ()=>{
        if (location.hash !== '#focus') endTimer();
      });
    }
  
    if (document.readyState === 'loading'){
      window.addEventListener('DOMContentLoaded', initFocus);
    } else {
      initFocus();
    }
  })();