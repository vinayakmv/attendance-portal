// public/js/calendar.js
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('selectedDate');
  if (dateInput) {
    dateInput.value = today;
    fetchData();
  }
});

async function fetchData() {
  const dateInput = document.getElementById('selectedDate').value;
  const timeInput = document.getElementById('selectedTime').value;
  const dataDisplay = document.getElementById('attendanceData');

  if (!dateInput) {
    dataDisplay.innerHTML = '<p style="color:red;">Please select a valid date.</p>';
    return;
  }

  try {
    const r = await fetch(`/api/admin/attendance-by-date?date=${encodeURIComponent(dateInput)}`, { credentials: 'include' });
    if (!r.ok) {
      dataDisplay.innerHTML = '<p style="color:red;">Failed to fetch data from server.</p>';
      return;
    }
    const j = await r.json();
    const attendanceRecords = j.list || [];

    if (attendanceRecords.length === 0) {
      dataDisplay.innerHTML = `<p>No attendance records found for <strong>${dateInput}</strong>.</p>`;
      return;
    }

    let filteredRecords = attendanceRecords;

    if (timeInput) {
      const [h, m] = timeInput.split(':').map(Number);
      const selectedMinutes = h * 60 + m;
      filteredRecords = attendanceRecords.filter(rec => {
        if (!rec.lastToggledAt) return false;
        const dt = new Date(rec.lastToggledAt);
        const minutes = dt.getHours() * 60 + dt.getMinutes();
        return minutes <= selectedMinutes;
      });
    }

    dataDisplay.innerHTML = '';
    filteredRecords.forEach(record => {
      const p = document.createElement('p');
      const ts = record.lastToggledAt ? new Date(record.lastToggledAt).toLocaleTimeString() : '';
      p.innerHTML = `[${ts}] <strong>${escapeHtml(record.name)}</strong> - ${record.status === 'logged_in' ? 'Clock In' : 'Clock Out'}`;
      dataDisplay.appendChild(p);
    });

  } catch (e) {
    console.error(e);
    dataDisplay.innerHTML = '<p style="color:red;">Network error while fetching attendance.</p>';
  }
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}
