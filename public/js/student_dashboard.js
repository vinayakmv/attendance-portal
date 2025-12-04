// public/js/student_dashboard.js
// Defensive student UI: relies on /api/student/status that returns timestamps (ISO or null)

(function () {
  const POLL_INTERVAL_MS = 7000;
  let lunchTimerHandle = null;

  function q(id){ return document.getElementById(id); }
  function toast(msg, type='info', ttl=2500){
    let t = document.getElementById('globalToast');
    if(!t){ t = document.createElement('div'); t.id='globalToast'; Object.assign(t.style, { position:'fixed', right:'18px', bottom:'22px', zIndex:9999, padding:'10px 14px', borderRadius:'10px', color:'#fff', fontWeight:700 }); document.body.appendChild(t); }
    t.textContent = msg;
    t.style.background = type === 'ok' ? '#0b8b4f' : (type === 'warn' ? '#d96a3d' : '#1f6fd8');
    t.style.opacity = '1';
    setTimeout(()=>{ t.style.transition='opacity .4s'; t.style.opacity='0'; }, ttl);
  }

  async function postJson(path){
    const r = await fetch(path, { method:'POST', credentials:'include' });
    if(!r.ok){
      const txt = await r.text().catch(()=>null);
      const err = new Error(txt || `HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return await r.json().catch(()=>null);
  }

  function toDate(v){
    if(!v) return null;
    try { const d = new Date(v); return isNaN(d) ? null : d; } catch(e){ return null; }
  }
  function formatShort(d){
    if(!d) return '—';
    return d.toLocaleString(undefined, { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  function formatTimeOnly(d){
    if(!d) return '—';
    return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  }

  // local cache so a short polling response doesn't clear UI
  const state = { status: 'logged_out', lastClockInAt: null, lastClockOutAt: null, lunchStartAt: null, lunchEndAt: null, lunchDurationMins: null, lunchOvertime: false };

  function updateUIFromState(){
    // status pill & button
    const isLoggedIn = state.status === 'logged_in';
    const pill = q('statusPill');
    if(pill){
      pill.className = isLoggedIn ? 'status-pill in' : 'status-pill out';
      const txt = pill.querySelector('.status-text');
      if(txt) txt.textContent = isLoggedIn ? 'Logged In' : 'Not Logged In';
      const dot = pill.querySelector('.dot');
      if(dot) dot.className = isLoggedIn ? 'dot dot-on' : 'dot dot-off';
    }
    const attBtn = q('attendanceToggle');
    if(attBtn){
      if(isLoggedIn){ attBtn.textContent = 'Clock Out'; attBtn.classList.remove('primary'); attBtn.classList.add('primary-filled'); }
      else { attBtn.textContent = 'Clock In'; attBtn.classList.remove('primary-filled'); attBtn.classList.add('primary'); }
    }

    // clock in/out cards
    q('clockInTime').textContent = state.lastClockInAt ? formatShort(toDate(state.lastClockInAt)) : '—';
    q('clockOutTime').textContent = state.lastClockOutAt ? formatShort(toDate(state.lastClockOutAt)) : '—';

    // lunch card + buttons
    const lunchCard = q('lunchCard');
    if(!state.lunchStartAt && !state.lunchEndAt && (state.lunchDurationMins == null)){
      if(lunchCard) { lunchCard.style.display = 'none'; }
      stopLunchCountdown();
    } else {
      if(lunchCard) lunchCard.style.display = 'inline-block';
      q('lunchCard').querySelector('.l-start').textContent = state.lunchStartAt ? formatShort(toDate(state.lunchStartAt)) : '—';
      q('lunchCard').querySelector('.l-end').textContent = state.lunchEndAt ? formatShort(toDate(state.lunchEndAt)) : '—';
      const durEl = q('lunchCard').querySelector('.l-dur');
      if(state.lunchEndAt){
        // show duration only after lunchEnd exists
        if(state.lunchDurationMins != null) {
          durEl.textContent = `${state.lunchDurationMins} min`;
          if(state.lunchOvertime) durEl.classList.add('overtime'); else durEl.classList.remove('overtime');
        } else {
          durEl.textContent = '—';
          durEl.classList.remove('overtime');
        }
        stopLunchCountdown();
      } else {
        durEl.textContent = '—';
        if(state.lunchStartAt) startLunchCountdown(state.lunchStartAt);
      }
    }

    // enable/disable lunch buttons
    const startBtn = q('lunchStartBtn'), endBtn = q('lunchEndBtn');
    if(startBtn && endBtn){
      if(state.lunchStartAt && !state.lunchEndAt){ startBtn.disabled = true; endBtn.disabled = false; }
      else { startBtn.disabled = false; endBtn.disabled = true; }
    }
  }

  function startLunchCountdown(lunchStartAt){
    const counter = q('lunchCountdown');
    if(!counter) return;
    function tick(){
      const start = toDate(lunchStartAt);
      if(!start){ counter.textContent = ''; return; }
      const elapsed = Math.floor((Date.now() - start.getTime())/60000);
      const remaining = 30 - elapsed;
      if(remaining <= 0){ counter.textContent = '0 min (Overtime)'; counter.classList.add('overtime'); clearInterval(lunchTimerHandle); lunchTimerHandle = null; return; }
      counter.textContent = `${remaining} min left`; counter.classList.remove('overtime');
    }
    if(lunchTimerHandle) clearInterval(lunchTimerHandle);
    tick();
    lunchTimerHandle = setInterval(tick, 20000);
  }
  function stopLunchCountdown(){ const counter = q('lunchCountdown'); if(counter){ counter.textContent=''; counter.classList.remove('overtime'); } if(lunchTimerHandle){ clearInterval(lunchTimerHandle); lunchTimerHandle=null; } }

  // Read server status and merge into local state carefully
  async function fetchStatus(){
    try {
      const r = await fetch('/api/student/status', { credentials:'include' });
      if (!r.ok) return null;
      const j = await r.json().catch(()=>null);
      if (!j) return null;
      // merge: replace values if present (explicit null allowed)
      ['status','lastClockInAt','lastClockOutAt','lunchStartAt','lunchEndAt','lunchDurationMins','lunchOvertime'].forEach(k => {
        if (k in j) state[k] = j[k];
      });
      // Additional safety: if out < in then clear out (server should already prevent this)
      const inD = toDate(state.lastClockInAt);
      const outD = toDate(state.lastClockOutAt);
      if(inD && outD && outD.getTime() < inD.getTime()) state.lastClockOutAt = null;
      // Lunch safety: only show duration if lunchEndAt exists
      if(!state.lunchEndAt) { state.lunchDurationMins = null; state.lunchOvertime = false; }

      updateUIFromState();
      return state;
    } catch (e) {
      console.warn('fetchStatus failed', e);
      return null;
    }
  }

  // actions
  async function toggleAttendance(){
    const btn = q('attendanceToggle'); if(btn) btn.disabled = true;
    try {
      // client guard: if clocking out ensure current timestamp >= lastClockInAt
      if(state.status === 'logged_in' && state.lastClockInAt){
        const inD = toDate(state.lastClockInAt);
        if(inD && Date.now() < inD.getTime()){
          alert('Local clock/time problem: current time is earlier than last clock in. Cannot clock out.');
          if(btn) btn.disabled = false;
          return;
        }
      }
      const j = await postJson('/api/student/toggle');
      // merge returned values
      if (j) {
        ['status','lastClockInAt','lastClockOutAt','lunchStartAt','lunchEndAt','lunchDurationMins','lunchOvertime'].forEach(k => { if(k in j) state[k] = j[k]; });
      }
      await fetchStatus(); // refresh authoritative state
      toast('Attendance updated', 'ok', 1500);
      try { localStorage.setItem('gspl_attendance_update', Date.now().toString()); } catch(e){}
    } catch (err) {
      console.error(err);
      toast(err.message || 'Action failed', 'warn', 3500);
      if (err.status === 401) window.location.href = '/login';
    } finally { if(btn) btn.disabled = false; }
  }

  async function startLunch(){
    const btn = q('lunchStartBtn'); if(btn) btn.disabled = true;
    try {
      const j = await postJson('/api/student/lunch/start');
      if (j && j.lunchStartAt) state.lunchStartAt = j.lunchStartAt;
      state.lunchEndAt = null; state.lunchDurationMins = null; state.lunchOvertime = false;
      updateUIFromState();
      toast('Lunch started', 'ok', 1800);
      try { localStorage.setItem('gspl_attendance_update', Date.now().toString()); } catch(e){}
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to start lunch', 'warn', 3000);
      if(btn) btn.disabled = false;
    }
  }

  async function endLunch(){
    const btn = q('lunchEndBtn'); if(btn) btn.disabled = true;
    try {
      if(!state.lunchStartAt){ alert('No lunch start recorded'); if(btn) btn.disabled = false; return; }
      const startD = toDate(state.lunchStartAt);
      if(startD && Date.now() < startD.getTime()){ alert('Local clock/time problem: current time is earlier than lunch start. Cannot end.'); if(btn) btn.disabled = false; return; }

      const j = await postJson('/api/student/lunch/end');
      if (j) {
        ['lunchStartAt','lunchEndAt','lunchDurationMins','lunchOvertime'].forEach(k => { if(k in j) state[k] = j[k]; });
      }
      await fetchStatus();
      toast('Lunch ended', 'ok', 1600);
      try { localStorage.setItem('gspl_attendance_update', Date.now().toString()); } catch(e){}
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to end lunch', 'warn', 3000);
      if(btn) btn.disabled = false;
    }
  }

  // boot
  document.addEventListener('DOMContentLoaded', () => {
    // bindings
    const logoutBtn = q('logoutBtn'); if(logoutBtn) logoutBtn.addEventListener('click', async ()=>{ await fetch('/api/logout',{ method:'POST', credentials:'include' }).catch(()=>{}); window.location.href='/login'; });
    const attBtn = q('attendanceToggle'); if(attBtn) attBtn.addEventListener('click', toggleAttendance);
    const lsBtn = q('lunchStartBtn'); if(lsBtn) lsBtn.addEventListener('click', startLunch);
    const leBtn = q('lunchEndBtn'); if(leBtn) leBtn.addEventListener('click', endLunch);

    // initial placeholders
    updateUIFromState();

    // initial load of me + status
    (async () => {
      try {
        const r = await fetch('/api/me', { credentials:'include' });
        if (r.ok) {
          const j = await r.json().catch(()=>null);
          if (j && j.user) { q('studentGreeting').textContent = `Hello ${j.user.name || 'Employee'}!`; q('myBatch').textContent = j.user.batch || '—'; }
        }
      } catch(e){}
      await fetchStatus();
    })();

    // poll
    setInterval(fetchStatus, POLL_INTERVAL_MS);

    // storage events (admin / other tabs)
    window.addEventListener('storage', (ev) => {
      if(!ev.key) return;
      if(ev.key === 'gspl_attendance_update' || ev.key === 'gspl_new_requests_update') {
        fetchStatus();
      }
    });
  });

})();
