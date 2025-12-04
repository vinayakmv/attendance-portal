// admin_attendance_decorate.js
// Call decorateAttendanceTable() after your table is rendered (on DOMContentLoaded or after AJAX fills table)

(function(){
  // Column indexes - change if your table columns differ
  const COL_IDX_NAME = 0;
  const COL_IDX_EMAIL = 1;
  const COL_IDX_ACTION = 2;    // this cell will be replaced with status pill
  const COL_IDX_TIMESTAMP = 3; // read this for timestamp

  // Deadline config (local time)
  const DEADLINE_HOUR = 10;
  const DEADLINE_MIN = 0;

  // Helper: parse timestamp text to Date; returns null if invalid
  function parseTimestampText(txt) {
    if (!txt) return null;
    // Try to parse with Date; if your timestamp format is different, adjust
    const d = new Date(txt);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  // Helper: format minutes difference nicely
  function plural(n, s='min') { return `${n} ${s}${n===1?'':'s'}`; }

  function decorateAttendanceTable(tableSelector = '#attendanceTable') {
    const table = document.querySelector(tableSelector);
    if (!table) {
      console.warn('decorateAttendanceTable: table not found', tableSelector);
      return;
    }
    const tbody = table.tBodies[0] || table.querySelector('tbody');
    if (!tbody) {
      console.warn('decorateAttendanceTable: tbody not found');
      return;
    }

    const rows = Array.from(tbody.rows);
    if (!rows.length) return;

    // Get the date for deadline. If you have a date-picker in page, read it; else use today
    let dateStr = (document.getElementById('datePicker') && document.getElementById('datePicker').value) || null;
    const today = new Date();
    let deadlineDate;
    if (dateStr) {
      const [y,m,d] = dateStr.split('-').map(Number);
      deadlineDate = new Date(y, m-1, d, DEADLINE_HOUR, DEADLINE_MIN, 0, 0);
    } else {
      deadlineDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), DEADLINE_HOUR, DEADLINE_MIN, 0, 0);
    }

    rows.forEach(row => {
      // ensure row has enough cells
      const cells = row.cells;
      if (cells.length <= COL_IDX_TIMESTAMP) return; // skip

      const tsCell = cells[COL_IDX_TIMESTAMP];
      const actionCell = cells[COL_IDX_ACTION];

      // read timestamp string (trim)
      const tsText = tsCell.textContent.trim();

      // Remove any previous pill (if any)
      actionCell.innerHTML = '';

      const statusSpan = document.createElement('span');
      statusSpan.classList.add('att-status');

      // If no timestamp -> Not logged in
      if (!tsText || tsText.toLowerCase().includes('not logged') || tsText.toLowerCase().includes('no records')) {
        statusSpan.classList.add('att-missed');
        statusSpan.textContent = 'Not logged in';
        row.classList.add('att-row-missed');
        tsCell.textContent = '—';
        actionCell.appendChild(statusSpan);
        return;
      }

      // parse timestamp
      const t = parseTimestampText(tsText);
      if (!t) {
        // if parse fails, show as unknown
        statusSpan.classList.add('att-missed');
        statusSpan.textContent = 'No time';
        row.classList.add('att-row-missed');
        actionCell.appendChild(statusSpan);
        return;
      }

      // compare with deadline
      if (t <= deadlineDate) {
        // On time
        statusSpan.classList.add('att-on-time');
        statusSpan.textContent = 'On time';
        row.classList.add('att-row-on-time');

        // update timestamp cell to nice format if you want
        tsCell.textContent = t.toLocaleString();
        actionCell.appendChild(statusSpan);
      } else {
        // Late
        const diffMin = Math.round((t - deadlineDate) / 60000);
        statusSpan.classList.add('att-late');
        statusSpan.textContent = `Late • ${diffMin} min`;
        row.classList.add('att-row-late');
        tsCell.textContent = `${t.toLocaleString()} (${diffMin} min late)`;
        actionCell.appendChild(statusSpan);
      }
    });
  }

  // Auto-run after page load. If your table is filled by AJAX, call decorateAttendanceTable()
  // AFTER the AJAX finishes populating table.
  document.addEventListener('DOMContentLoaded', () => {
    // small delay to allow any DOM rendering
    setTimeout(()=>decorateAttendanceTable('#attendanceTable'), 200);
  });

  // expose function for manual re-run
  window.decorateAttendanceTable = decorateAttendanceTable;
})();


//can be deleted
