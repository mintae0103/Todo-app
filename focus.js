// focus.js — 타이머 + 태그 + 앱 이탈 감지(수동/이탈 문구 분리) + 전체화면 진입/해제
const FOCUS_KEY = 'focus.logs.v1';

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const ce = (t, p = {}) => Object.assign(document.createElement(t), p);

  let currentSession = null;
  let tickId = null;

  // 이탈 이벤트 디바운스
  let lastLeaveStamp = 0;
  const LEAVE_DEBOUNCE_MS = 1200;

  const BANNER_MANUAL = '일시정지됨';
  const BANNER_LEAVE  = '일시정지됨 (앱 이탈 감지)';

  // ---------- Fullscreen helpers ----------
  async function enterFullscreen(el) {
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        // iOS Safari 일부 환경
        await el.webkitRequestFullscreen();
      }
      // 성공/실패와 무관하게 오버레이는 화면을 꽉 채우도록 유지
    } catch (e) {
      // 실패해도 조용히 넘어감 (iOS에서 제한될 수 있음)
      // console.warn('Fullscreen failed:', e);
    }
  }
  async function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      }
    } catch (e) {
      /* noop */
    }
  }

  function setPauseButton(paused) {
    const btn = $('#focusPause'); if (!btn) return;
    btn.textContent = paused ? '▶︎ 계속' : '⏸ 일시정지';
    btn.setAttribute('aria-label', paused ? '계속' : '일시정지');
  }
  function setBanner(paused, label = BANNER_MANUAL) {
    const b = $('#focusBanner'); if (!b) return;
    if (!paused) { b.hidden = true; return; }
    b.textContent = label;
    b.hidden = false;
  }
  function showOverlay(show) { const el = $('#focusOverlay'); if (el) el.hidden = !show; }

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return [h, m, ss].map(n => String(n).padStart(2, '0')).join(':');
  }

  function load(k, def = []) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  function renderList() {
    const logs = load(FOCUS_KEY, []);
    const ul = $('#focusSessionList'); const sum = $('#focusSummaryTotal');
    if (!ul || !sum) return;
    ul.innerHTML = '';
    if (!logs.length) { sum.textContent = '오늘 기록이 없습니다.'; return; }

    let todayMs = 0;
    logs.forEach(l => {
      const li = ce('li', { className: 'log' });
      const dur = fmt(l.durationMs || 0);
      const start = new Date(l.start).toLocaleTimeString();
      const end = new Date(l.end).toLocaleTimeString();
      li.textContent = `${start} ~ ${end} (${dur})`;

      // TAG 칩
      if (l.tagId) {
        const all = (window.Tags?.list?.() || []);
        const t = all.find(x => x.id === l.tagId);
        if (t) {
          const chip = ce('span', { className: 'tag-chip' });
          const dot  = ce('span', { className: 'tag-dot' }); dot.style.background = t.color;
          chip.append(dot, document.createTextNode(t.name));
          li.append(' ', chip);
        }
      }
      // 이탈 정보
      if (typeof l.leaveCount === 'number' && l.leaveCount > 0) {
        const info = ce('span', { className: 'muted' });
        const times = (Array.isArray(l.leaveTimes) ? l.leaveTimes : [])
          .map(ts => new Date(ts).toLocaleTimeString()).join(', ');
        info.textContent = ` · 이탈 ${l.leaveCount}회${times ? ` (${times})` : ''}`;
        li.appendChild(info);
      }

      ul.appendChild(li);

      if (new Date(l.start).toDateString() === new Date().toDateString()) {
        todayMs += (l.durationMs || 0);
      }
    });
    sum.textContent = `오늘 총 ${Math.floor(todayMs / 60000)}분`;
  }

  // ---------- 타이머 ----------
  function startTick() {
    clearInterval(tickId);
    tickId = setInterval(() => {
      if (!currentSession || currentSession.paused) return;
      $('#focusTimer').textContent = fmt(Date.now() - currentSession.start);
    }, 1000);
  }

  async function start() {
    if (currentSession) return;
    currentSession = {
      start: Date.now(),
      paused: false,
      pausedReason: null, // 'manual' | 'leave' | null
      // TAGS
      tagId: (window.getSelectedFocusTagId ? window.getSelectedFocusTagId() : null),
      // LEAVE
      leaveCount: 0,
      leaveTimes: []
    };

    $('#focusTimer').textContent = '00:00:00';
    setBanner(false);
    setPauseButton(false);
    showOverlay(true);

    // ✅ 사용자 클릭 이벤트 핸들러 안에서 전체화면 요청
    await enterFullscreen($('#focusOverlay'));

    startTick();
  }

  function pause(reason = 'manual') {
    if (!currentSession || currentSession.paused) return;
    currentSession.paused = true;
    currentSession.pausedReason = reason;
    clearInterval(tickId); tickId = null;

    const label = (reason === 'leave') ? BANNER_LEAVE : BANNER_MANUAL;
    setBanner(true, label);
    setPauseButton(true);

    // 이탈일 때만 카운트
    if (reason === 'leave') {
      currentSession.leaveCount = (currentSession.leaveCount || 0) + 1;
      (currentSession.leaveTimes ||= []).push(Date.now());
    }
  }

  function resume() {
    if (!currentSession || !currentSession.paused) return;
    currentSession.paused = false;
    currentSession.pausedReason = null;
    setBanner(false);
    setPauseButton(false);
    startTick();
  }

  function togglePause() {
    if (!currentSession) return;
    if (currentSession.paused) resume(); else pause('manual');
  }

  function reset() {
    if (!currentSession) return;
    currentSession.start = Date.now();
    $('#focusTimer').textContent = '00:00:00';
  }

  async function end() {
    if (!currentSession) return;
    clearInterval(tickId); tickId = null;
    const end = Date.now();
    const ms  = end - currentSession.start;

    const logs = load(FOCUS_KEY, []);
    logs.push({
      start: currentSession.start,
      end,
      durationMs: ms,
      tagId: currentSession.tagId || null,
      leaveCount: currentSession.leaveCount || 0,
      leaveTimes: currentSession.leaveTimes || []
    });
    save(FOCUS_KEY, logs);

    currentSession = null;
    showOverlay(false);
    setBanner(false);
    await exitFullscreen();   // ✅ 종료 시 전체화면 해제

    renderList();
    if (window.Goals?.onFocusEnded) window.Goals.onFocusEnded();
  }

  // ---------- 앱 이탈 감지 (iOS Safari 포함) ----------
  function markLeave(source) {
    if (!currentSession) return;
    const now = Date.now();
    if (now - lastLeaveStamp < LEAVE_DEBOUNCE_MS) return; // 중복 방지
    lastLeaveStamp = now;
    pause('leave'); // 이때만 카운트/문구 "(앱 이탈 감지)"
  }

  // 1) visibilitychange
  document.addEventListener('visibilitychange', () => {
    if (!currentSession) return;
    if (document.visibilityState === 'hidden') {
      markLeave('visibilitychange-hidden');
    } else {
      const label = (currentSession.pausedReason === 'leave') ? BANNER_LEAVE : BANNER_MANUAL;
      setBanner(!!currentSession.paused, label);
      setPauseButton(!!currentSession.paused);
    }
  }, true);

  // 2) pagehide/pageshow (BFCache 복귀 포함)
  window.addEventListener('pagehide', () => { if (currentSession) markLeave('pagehide'); }, true);
  window.addEventListener('pageshow', () => {
    if (!currentSession) return;
    const label = (currentSession.pausedReason === 'leave') ? BANNER_LEAVE : BANNER_MANUAL;
    setBanner(true, label);
    setPauseButton(true);
  }, true);

  // 3) blur/focus 보완
  window.addEventListener('blur',  () => { if (currentSession) markLeave('blur');  }, true);
  window.addEventListener('focus', () => {
    if (!currentSession) return;
    const label = (currentSession.pausedReason === 'leave') ? BANNER_LEAVE : BANNER_MANUAL;
    setBanner(true, label);
    setPauseButton(true);
  }, true);

  // ---------- Fullscreen 변화 감지(사용자가 제스처로 빠져나온 경우) ----------
  ['fullscreenchange','webkitfullscreenchange'].forEach(ev=>{
    document.addEventListener(ev, () => {
      // 전체화면이 해제되더라도 오버레이는 유지 (UI 파손 방지)
      // 필요시 여기서 배너 상태를 다시 그릴 수 있음
    });
  });

  // ---------- 버튼 바인딩 ----------
  $('#focusStart')?.addEventListener('click', start);        // 클릭 이벤트 안에서 enterFullscreen 호출됨
  $('#focusPause')?.addEventListener('click', togglePause);
  $('#focusReset')?.addEventListener('click', reset);
  $('#focusEnd')?.addEventListener('click', end);
  $('#focusClearLogs')?.addEventListener('click', () => { save(FOCUS_KEY, []); renderList(); });

  renderList();

  // ---------- TAGS 연결 ----------
  window.getSelectedFocusTagId = function () {
    const el = document.getElementById('focusTagSelect');
    return (el && el.value) ? el.value : null;
  };
  function renderFocusTagChips() {
    const wrap = document.getElementById('focusTagChips'); if (!wrap) return;
    wrap.innerHTML = '';
    const id = window.getSelectedFocusTagId();
    if (!id) return;
    const all = (window.Tags?.list?.() || []);
    const t = all.find(x => x.id === id); if (!t) return;
    const chip = ce('span', { className: 'tag-chip' });
    const dot  = ce('span', { className: 'tag-dot' }); dot.style.background = t.color;
    chip.append(dot, document.createTextNode(t.name));
    wrap.appendChild(chip);
  }
  document.getElementById('focusTagSelect')?.addEventListener('change', renderFocusTagChips);
  window.TagsHook = window.TagsHook || {};
  window.TagsHook.onTagsChanged = function (tags) {
    const sel = document.getElementById('focusTagSelect'); if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = '<option value="">태그 선택(옵션)</option>';
    tags.forEach(t => {
      const opt = ce('option', { value: t.id, textContent: t.name });
      sel.appendChild(opt);
    });
    if (keep) sel.value = keep;
    renderFocusTagChips();
  };
})();