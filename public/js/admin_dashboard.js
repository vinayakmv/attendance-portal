// public/js/admin_dashboard.js
// Admin dashboard client - fetches attendance and renders table
const POLL_INTERVAL_MS = 10000;

function formatLocal(ts){
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString();
}
function formatDateYYYYMMDD(dt=new Date()){
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchAttendance(date, batch){
  try {
    const base = window.location.origin;
    const q = `date=${encodeURIComponent(date || formatDateYYYYMMDD())}` + (batch && batch !== 'all' ? `&batch=${encodeURIComponent(batch)}` : '');
    const url = `${base}/api/admin/attendance-by-date?${q}`;
    const r = await fetch(url, { credentials:'include', headers:{ 'Accept':'application/json' }});
    if (!r.ok) {
      const txt = await r.text().catch(()=>null);
      throw new Error(txt || `HTTP ${r.status}`);
    }
    const j = await r.json();
    return j;
  } catch (err) {
    console.error('fetchAttendance error', err);
    throw err;
  }
}

function clearTable(){
  const tbody = document.getElementById('attendanceTbody');
  if (tbody) tbody.innerHTML = '';
}

function renderAttendanceRows(list, dateStr, batchDeadlines = {}){
  const tbody = document.getElementById('attendanceTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list || !list.length){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" style="padding:28px;text-align:center;color:#666">No students found for ${dateStr}</td>`;
    tbody.appendChild(tr);
    return;
  }

  const parts = dateStr.split('-').map(Number);

  list.forEach(student => {
    const tr = document.createElement('tr');

    // name
    const tdName = document.createElement('td');
    tdName.textContent = student.name || '';
    tr.appendChild(tdName);

    // login id
    const tdEmail = document.createElement('td');
    tdEmail.textContent = student.email || '';
    tr.appendChild(tdEmail);

    // status
    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = 'att-status';
    const clockIn = student.lastClockInAt ? new Date(student.lastClockInAt) : null;
    const clockOut = student.lastClockOutAt ? new Date(student.lastClockOutAt) : null;

    // compute deadline for this student's batch
    function deadlineForBatch(studentBatch){
      const cfg = (batchDeadlines && batchDeadlines[studentBatch]) ? batchDeadlines[studentBatch] : null;
      if (!cfg) return new Date(parts[0], parts[1]-1, parts[2], 10, 0, 0);
      return new Date(parts[0], parts[1]-1, parts[2], cfg.hour, cfg.minute || 0, 0);
    }

    const studentBatch = student.batch || 'batch1';
    const ddl = deadlineForBatch(studentBatch);
    let refTime = clockIn || clockOut || null;

    if (!refTime){
      statusBadge.classList.add('att-not-logged');
      statusBadge.textContent = 'Not logged in';
    } else {
      if (refTime <= ddl){
        statusBadge.classList.add('att-on-time');
        statusBadge.textContent = 'On time';
      } else {
        statusBadge.classList.add('att-late');
        const diff = Math.round((refTime - ddl)/60000);
        statusBadge.textContent = `Late · ${diff} min`;
      }
    }
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    // lunch cell - we will show simple OK / OVERTIME
    const tdLunch = document.createElement('td');
    if (student.lunchStartAt || student.lunchEndAt || student.lunchDurationMins != null){
      const div = document.createElement('div');
      div.style.fontSize='0.95em';
      if (student.lunchStartAt) div.innerHTML += `<div><strong>Start:</strong> ${formatLocal(student.lunchStartAt)}</div>`;
      if (student.lunchEndAt) div.innerHTML += `<div><strong>End:</strong> ${formatLocal(student.lunchEndAt)}</div>`;
      if (student.lunchDurationMins != null){
        const dur = `${student.lunchDurationMins} min`;
        if (student.lunchOvertime){
          div.innerHTML += `<div><strong>Lunch:</strong> ${dur} <span class="lunch-overtime">OVERTIME</span></div>`;
        } else {
          div.innerHTML += `<div><strong>Lunch:</strong> ${dur} <span class="lunch-ok">OK</span></div>`;
        }
      }
      tdLunch.appendChild(div);
    } else {
      tdLunch.textContent = '—';
      tdLunch.style.color = '#777';
    }
    tr.appendChild(tdLunch);

    // timestamp cell: nice in/out blocks
    const tdTime = document.createElement('td');

    if (clockIn){
      const inDiv = document.createElement('div');
      inDiv.className = 'ts-block ts-in';
      // show without seconds (use toLocaleString but drop seconds) - use options
      const inTxt = new Date(clockIn).toLocaleString(undefined, { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      inDiv.innerHTML = `<strong>In:</strong> ${inTxt}`;
      tdTime.appendChild(inDiv);
    }
    if (clockOut){
      const outDiv = document.createElement('div');
      outDiv.className = 'ts-block ts-out';
      const outTxt = new Date(clockOut).toLocaleString(undefined, { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      outDiv.innerHTML = `<strong>Out:</strong> ${outTxt}`;
      tdTime.appendChild(outDiv);
    }
    if (!clockIn && !clockOut){
      tdTime.textContent = '—';
      tdTime.style.color = '#777';
    }
    tr.appendChild(tdTime);

    tbody.appendChild(tr);
  });
}

// UI wiring
async function loadAttendanceForSelectedDate(){
  const dateInput = document.getElementById('attendanceDate');
  const date = dateInput && dateInput.value ? dateInput.value : formatDateYYYYMMDD();
  const batchSelect = document.getElementById('batchFilter');
  const batch = batchSelect ? batchSelect.value : 'all';

  // show a simple loading state in tbody
  const tbody = document.getElementById('attendanceTbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:#666">Loading attendance...</td></tr>`;

  try {
    const res = await fetchAttendance(date, batch);
    renderAttendanceRows(res.list || [], date, res.batchDeadlines || {});
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:crimson">Failed to load attendance</td></tr>`;
  }
}


// menu/side bar toggles
document.addEventListener('DOMContentLoaded', () => {
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const closeSidebar = document.getElementById('closeSidebar');
  const logoutBtn = document.getElementById('logoutBtn');
  const sidebarLogout = document.getElementById('sidebarLogout');
  const batchFilter = document.getElementById('batchFilter');

  function openSidebar(){
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden','false');
    overlay.classList.remove('hidden');
  }
  function close(){
    sidebar.classList.remove('open');
    sidebar.setAttribute('aria-hidden','true');
    overlay.classList.add('hidden');
  }

  menuBtn && menuBtn.addEventListener('click', openSidebar);
  closeSidebar && closeSidebar.addEventListener('click', close);
  overlay && overlay.addEventListener('click', close);

  logoutBtn && logoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/logout',{ method:'POST', credentials:'include' }); } catch(e){}
    window.location.href = '/login';
  });
  sidebarLogout && sidebarLogout.addEventListener('click', () => {
    // same as logout button
    logoutBtn && logoutBtn.click();
  });

  // date default
  const dateInput = document.getElementById('attendanceDate');
  const today = formatDateYYYYMMDD();
  if (dateInput && !dateInput.value) dateInput.value = today;

  // load on refresh
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn && refreshBtn.addEventListener('click', loadAttendanceForSelectedDate);

  // batch filter change
  batchFilter && batchFilter.addEventListener('change', () => {
    loadAttendanceForSelectedDate();
  });

  // close sidebar by default (hidden)
  sidebar.classList.remove('open');
  overlay.classList.add('hidden');

  // initial fetch
  loadAttendanceForSelectedDate();

  // poll
  setInterval(loadAttendanceForSelectedDate, POLL_INTERVAL_MS);
});

/* ====== NEW: listen for storage events so admin refreshes immediately when students update ====== */
window.addEventListener('storage', (ev) => {
  if (!ev.key) return;
  if (ev.key === 'gspl_attendance_update') {
    try {
      // immediate refresh of table (only if attendance view is visible)
      const currentView = document.querySelector('.sidebar .navitem.active')?.getAttribute('data-view');
      if (currentView === 'attendance') {
        // call your existing loader
        loadAttendanceForSelectedDate();
      }
    } catch (e) { console.error(e); }
  }
});
