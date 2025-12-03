// public/js/admin_dashboard.js
// Consolidated admin dashboard client that calls /api/admin/... endpoints
// and renders color-coded attendance rows + recent activity.
//
// Updated to display both Clock In and Clock Out times and compute lateness
// based on clock-in time (lastClockInAt).

const POLL_INTERVAL_MS = 5000;
const DEADLINE_HOUR = 10;   // 10 AM
const DEADLINE_MINUTE = 0;

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"'`]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c])
  );
}
function formatLocal(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString();
}
function formatDateYYYYMMDD(dt = new Date()) {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// --- Fetch helpers that expect JSON responses ---
async function fetchAttendance(date) {
  try {
    const r = await fetch(`/api/admin/attendance-by-date?date=${encodeURIComponent(date)}`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    // if server returned HTML (e.g. a login page), treat as error
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) {
      if (ct.includes('application/json')) {
        const j = await r.json().catch(()=>null);
        return { ok:false, status:r.status, text: j && j.message ? j.message : `HTTP ${r.status}` };
      }
      const txt = await r.text().catch(()=>null);
      return { ok:false, status:r.status, text: txt || `HTTP ${r.status}` };
    }
    if (!ct.includes('application/json')) {
      const txt = await r.text().catch(()=>null);
      return { ok:false, status:r.status, text: txt || 'Unexpected non-JSON response' };
    }
    const j = await r.json();
    return { ok:true, list: j.list || [], date: j.date };
  } catch (err) {
    console.error('fetchAttendance error', err);
    return { ok:false, error: err.message || 'Network error' };
  }
}

async function fetchRecentActivity() {
  try {
    const r = await fetch('/api/admin/recent-activity', {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) {
      if (ct.includes('application/json')) {
        const j = await r.json().catch(()=>null);
        return { ok:false, text: j && j.message ? j.message : `HTTP ${r.status}` };
      }
      const txt = await r.text().catch(()=>null);
      return { ok:false, text: txt || `HTTP ${r.status}` };
    }
    if (!ct.includes('application/json')) {
      const txt = await r.text().catch(()=>null);
      return { ok:false, text: txt || 'Unexpected non-JSON response' };
    }
    const j = await r.json();
    return { ok:true, list: j.list || [] };
  } catch (err) {
    console.error('fetchRecentActivity error', err);
    return { ok:false, error: err.message || 'Network' };
  }
}

// --- Render helpers ---
function showInlineMessage(containerSelector, message, color = '#666') {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const old = container.querySelector('.inline-msg');
  if (old) old.remove();
  const div = document.createElement('div');
  div.className = 'inline-msg';
  div.style.color = color;
  div.style.padding = '8px 12px';
  div.textContent = message;
  container.insertBefore(div, container.querySelector('table') || container.firstChild);
}
function clearInlineMessage(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const old = container.querySelector('.inline-msg');
  if (old) old.remove();
}

function renderRecentActivityList(ul, list) {
  ul.innerHTML = '';
  if (!list || list.length === 0) {
    const li = document.createElement('li');
    li.style.color = '#666';
    li.style.padding = '10px';
    li.textContent = 'No recent activity.';
    ul.appendChild(li);
    return;
  }
  list.forEach(item => {
    const li = document.createElement('li');
    li.style.padding = '10px 0';
    li.style.borderBottom = '1px dashed #ddd';
    const time = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
    const action = item.status === 'logged_in' ? 'Clocked In' : 'Clocked Out';
    li.innerHTML = `<strong>${escapeHtml(item.name)}</strong> (${escapeHtml(item.email)}) &nbsp;→&nbsp; ${action}
                    <div style="font-size:0.85em;color:#666;margin-top:4px;">${time}</div>`;
    ul.appendChild(li);
  });
}

/**
 * renderAttendanceRows
 * - Renders the table body for attendance.
 * - Uses lastClockInAt and lastClockOutAt if present.
 * - Determines on-time vs late based on clock-in (first clock-in of day).
 */
// Replace your existing renderAttendanceRows(...) with this improved version

function renderAttendanceRows(tbody, list, dateStr) {
  tbody.innerHTML = '';

  // construct deadline date object in local timezone
  const parts = dateStr.split('-').map(Number);
  const deadline = new Date(parts[0], parts[1]-1, parts[2], DEADLINE_HOUR, DEADLINE_MINUTE, 0);

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">No students found for ${dateStr}</td></tr>`;
    return;
  }

  list.forEach(student => {
    const tr = document.createElement('tr');

    // Name
    const tdName = document.createElement('td');
    tdName.textContent = student.name || '';
    tr.appendChild(tdName);

    // Login ID (email)
    const tdEmail = document.createElement('td');
    tdEmail.textContent = student.email || '';
    tr.appendChild(tdEmail);

    // Status and Timestamp columns
    const tdStatus = document.createElement('td');
    const tdTime = document.createElement('td');

    // Robust detection of "clock in / clock out" timestamps.
    // Accept multiple possible field names (in case backend uses different names).
    const clockInCandidates = [
      student.lastClockInAt, student.clockInAt, student.firstClockInAt,
      student.clockIn, student.firstLoggedInAt, student.firstToggledAt
    ];
    const clockOutCandidates = [
      student.lastClockOutAt, student.clockOutAt, student.lastToggledOutAt,
      student.clockOut
    ];

    // pick first valid date-like value from candidates
    function pickDate(cands) {
      for (const v of cands) {
        if (!v) continue;
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    }

    let clockIn = pickDate(clockInCandidates);
    let clockOut = pickDate(clockOutCandidates);

    // fallback: if neither found but there is lastToggledAt, use it depending on status
    if (!clockIn && !clockOut && student.lastToggledAt) {
      const lt = new Date(student.lastToggledAt);
      if (!isNaN(lt.getTime())) {
        if (student.status === 'logged_in') clockIn = lt;
        else if (student.status === 'logged_out') clockOut = lt;
      }
    }

    // If status is logged_out but we have an earlier clockIn recorded in the same attendance object
    // some backends might store both in different fields; we already try to pick them above.

    // Now decide what to render.

    // Case: never logged in today (no clockIn & status logged_out or undefined)
    if ((!clockIn && !clockOut) && (!student || student.status === 'logged_out')) {
      const span = document.createElement('span');
      span.className = 'att-status att-not-logged';
      span.textContent = 'Not logged in';
      tdStatus.appendChild(span);
      tdTime.textContent = ''; // empty for no activity
      tr.classList.add('att-row-miss', 'att-row-missed');
    } else {
      // If there is a clockIn — use it to compute on-time / late
      if (clockIn) {
        if (clockIn <= deadline) {
          const span = document.createElement('span');
          span.className = 'att-status att-on-time';
          span.textContent = 'On time';
          tdStatus.appendChild(span);
          tr.classList.add('att-row-on-time');
        } else {
          const diffMin = Math.round((clockIn - deadline) / 60000);
          const span = document.createElement('span');
          span.className = 'att-status att-late';
          span.textContent = `Late • ${diffMin} min`;
          tdStatus.appendChild(span);
          tr.classList.add('att-row-late');
        }
      } else {
        // No clockIn but maybe clockOut (edge case) or unknown time
        const span = document.createElement('span');
        span.className = 'att-status att-not-logged';
        span.textContent = 'Logged (time unknown)';
        tdStatus.appendChild(span);
        tr.classList.add('att-row-miss', 'att-row-missed');
      }

      // Timestamp column: show In and Out lines if available
      const parts = [];
      if (clockIn) parts.push(`In: ${formatLocal(clockIn)}`);
      if (clockOut) parts.push(`Out: ${formatLocal(clockOut)}`);
      tdTime.textContent = parts.join('  •  ');

      // If the user is currently logged_out (i.e., they clocked out later),
      // still display the status badge according to whether they were late/on-time at clockIn.
      // If the user has no clockIn (but has clockOut) keep the badge as logged (unknown).
    }

    tr.appendChild(tdStatus);
    tr.appendChild(tdTime);
    tbody.appendChild(tr);
  });
}



// --- UI actions ---
async function loadAttendanceForSelectedDate() {
  const dateInput = document.getElementById('attendanceDate');
  const date = (dateInput && dateInput.value) ? dateInput.value : formatDateYYYYMMDD();
  const panelSelector = '.attendance-panel';
  const tbody = document.getElementById('attendanceTbody');
  if (!tbody) return;

  showInlineMessage(panelSelector, `Loading attendance for ${date}...`, '#007bff');
  const res = await fetchAttendance(date);
  clearInlineMessage(panelSelector);

  if (!res.ok) {
    console.warn('Attendance fetch failed', res);
    // If server returned HTML, we'll show a short preview (strip tags)
    const preview = (res.text || res.error || '').toString().replace(/<[^>]+>/g, ' ').slice(0, 400);
    showInlineMessage(panelSelector, preview || 'Failed to load attendance', 'crimson');
    setTimeout(()=> clearInlineMessage(panelSelector), 6000);
    return;
  }

  // use date from response (if server provided) or our requested date
  const dateToUse = res.date || date;
  renderAttendanceRows(tbody, res.list, dateToUse);
}

async function loadRecentActivity() {
  const ul = document.getElementById('recentActivityList');
  if (!ul) return;
  const ph = document.createElement('li');
  ph.className = 'loading-placeholder';
  ph.style.color = '#666';
  ph.style.padding = '10px';
  ph.textContent = 'Updating...';
  ul.insertBefore(ph, ul.firstChild);

  const res = await fetchRecentActivity();
  const p = ul.querySelector('.loading-placeholder');
  if (p) p.remove();

  if (!res.ok) {
    const preview = (res.text || res.error || '').toString().replace(/<[^>]+>/g, ' ').slice(0,400);
    const errLi = document.createElement('li');
    errLi.style.color = 'crimson';
    errLi.style.padding = '8px';
    errLi.textContent = preview || 'Failed to update recent activity';
    ul.insertBefore(errLi, ul.firstChild);
    setTimeout(()=> { if (errLi.parentNode) errLi.remove(); }, 4000);
    return;
  }
  renderRecentActivityList(ul, res.list);
}

function clearAllRecords() {
  if (!confirm('Are you sure you want to clear all records locally? This only clears the UI.')) return;
  const tbody = document.getElementById('attendanceTbody');
  if (tbody) tbody.innerHTML = '';
  alert('Cleared UI (server data unchanged).');
}

async function logoutAndRedirect() {
  // try POST /api/logout so session cookie destroyed and JSON returned
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include', headers: { 'Accept': 'application/json' } });
  } catch (e) {
    console.warn('logout POST failed, falling back to GET /logout', e);
  }
  // redirect to login page
  window.location.href = '/login';
}

// --- bootstrap ---
let pollHandle = null;
document.addEventListener('DOMContentLoaded', () => {
  // wire UI
  const btn = document.getElementById('logoutBtn');
  if (btn) btn.addEventListener('click', logoutAndRedirect);

  const dateInput = document.getElementById('attendanceDate');
  const today = formatDateYYYYMMDD();
  if (dateInput && !dateInput.value) dateInput.value = today;

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      await loadAttendanceForSelectedDate();
      refreshBtn.disabled = false;
    });
  }

  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearAllRecords);

  // initial
  loadAttendanceForSelectedDate();
  loadRecentActivity();

  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(() => {
    loadAttendanceForSelectedDate();
    loadRecentActivity();
  }, POLL_INTERVAL_MS);
});
