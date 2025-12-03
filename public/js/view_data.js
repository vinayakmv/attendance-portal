// public/js/view_data.js
document.addEventListener('DOMContentLoaded', async () => {
  const recordsContainer = document.getElementById('recordsContainer');
  recordsContainer.innerHTML = '<p>Loading…</p>';

  try {
    const today = new Date().toISOString().split('T')[0];
    const r = await fetch(`/api/admin/attendance-by-date?date=${encodeURIComponent(today)}`, { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      const list = j.list || [];
      if (list.length === 0) {
        recordsContainer.innerHTML = '<p>No attendance records found for today.</p>';
        return;
      }
      const table = document.createElement('table');
      table.innerHTML = `
        <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Timestamp</th></tr></thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      list.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.email)}</td>
          <td>${item.status === 'logged_in' ? 'Clock In' : 'Clock Out'}</td>
          <td>${item.lastToggledAt ? new Date(item.lastToggledAt).toLocaleString() : ''}</td>
        `;
        tbody.appendChild(tr);
      });
      recordsContainer.innerHTML = '';
      recordsContainer.appendChild(table);
      return;
    }
  } catch (e) {
    console.warn('Server fetch failed — falling back to localStorage', e);
  }

  const data = localStorage.getItem('attendanceRecords');
  const records = data ? JSON.parse(data) : [];
  if (records.length === 0) {
    recordsContainer.innerHTML = '<p>No attendance records found.</p>';
    return;
  }
  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr><th>Name</th><th>Login ID</th><th>Action</th><th>Timestamp</th></tr></thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  records.forEach(record => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(record.name)}</td>
      <td>${escapeHtml(record.loginId)}</td>
      <td>${escapeHtml(record.type)}</td>
      <td>${escapeHtml(record.timestamp)}</td>
    `;
    tbody.appendChild(tr);
  });
  recordsContainer.innerHTML = '';
  recordsContainer.appendChild(table);

  const clearButton = document.createElement('button');
  clearButton.textContent = 'Clear All Records';
  clearButton.onclick = () => {
    if (confirm('Clear local records?')) {
      localStorage.removeItem('attendanceRecords');
      recordsContainer.innerHTML = '<p>Records cleared. Refresh the page.</p>';
    }
  };
  recordsContainer.appendChild(clearButton);
});

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}
