// public/js/index.js
function getAttendanceData() {
  const data = localStorage.getItem('attendanceRecords');
  return data ? JSON.parse(data) : [];
}
function saveAttendanceData(data) {
  localStorage.setItem('attendanceRecords', JSON.stringify(data));
}

async function logAttendance(type) {
  try {
    const r = await fetch('/api/student/toggle', { method: 'POST', credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      alert(`Success: ${j.status} at ${new Date(j.timestamp).toLocaleString()}`);
      return;
    }
  } catch (e) {
    // ignore and fallback to localStorage
  }

  const nameInput = document.getElementById('employeeName');
  const idInput = document.getElementById('loginId');
  const messageElement = document.getElementById('message');

  const name = nameInput.value.trim();
  const id = idInput.value.trim();

  if (!name || !id) {
    messageElement.textContent = 'Please enter both Name and Login ID.';
    messageElement.style.color = 'red';
    return;
  }

  const records = getAttendanceData();
  const timestamp = new Date().toLocaleString();
  const newRecord = { name, loginId: id, type, timestamp };
  records.push(newRecord);
  saveAttendanceData(records);

  messageElement.textContent = `${name} (${id}) successfully logged: ${type} at ${timestamp}`;
  messageElement.style.color = 'green';
  nameInput.value = '';
  idInput.value = '';
}
