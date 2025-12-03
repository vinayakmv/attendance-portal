// public/js/student_dashboard.js
async function logout() {
  await fetch('/logout', { credentials: 'include' });
  window.location.href = '/login';
}

async function getMe() {
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    if (!r.ok) return null;
    const j = await r.json();
    return j.user || null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function loadStatus() {
  try {
    const r = await fetch('/api/student/status', { credentials: 'include' });
    if (!r.ok) return null;
    const j = await r.json();
    return j.status;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function updateToggleButton(isLoggedIn) {
  const button = document.getElementById('attendanceToggle');
  if (!button) return;
  if (isLoggedIn) {
    button.textContent = 'Clock Out';
    button.className = 'toggle-button logged-out';
  } else {
    button.textContent = 'Clock In';
    button.className = 'toggle-button logged-in';
  }
}

async function toggleAttendance() {
  try {
    const r = await fetch('/api/student/toggle', { method: 'POST', credentials: 'include' });
    const j = await r.json().catch(()=>null);
    if (!r.ok) {
      const msg = (j && j.message) ? j.message : `Error ${r.status}`;
      alert(msg);
      if (r.status === 401) window.location.href = '/login';
      return;
    }
    // success
    const isLoggedIn = j.status === 'logged_in';
    updateToggleButton(isLoggedIn);
    alert(`Status: ${j.status} at ${new Date(j.timestamp).toLocaleString()}`);
  } catch (e) {
    console.error(e);
    alert('Network error');
  }
}


document.addEventListener('DOMContentLoaded', async () => {
  const me = await getMe();
  const greeting = document.getElementById('studentGreeting');
  if (me && greeting) greeting.textContent = `Hello ${me.name || 'Employee'}!`;

  const status = await loadStatus();
  updateToggleButton(status === 'logged_in');
});
