// public/js/new_request.js
// Fetch pending registration requests and allow admin accept/decline.
// Expects server endpoints:
//  GET  /api/admin/new-requests     -> { ok:true, pending: [...] }
//  POST /api/admin/requests/:id/accept
//  POST /api/admin/requests/:id/decline

(async function () {
  const container = document.getElementById('requestList') || document.getElementById('requestsContainer') || document.getElementById('requestsList');
  if (!container) return;

  container.innerHTML = '<p>Loading pending requests...</p>';

  async function fetchPending() {
    try {
      const r = await fetch('/api/admin/new-requests', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!r.ok) {
        const txt = await r.text().catch(()=>null);
        throw new Error(txt || `HTTP ${r.status}`);
      }
      const j = await r.json().catch(()=>null);
      // server returns { ok:true, pending: [...] }
      return j && (j.pending || j.list || j.requests) ? (j.pending || j.list || j.requests) : [];
    } catch (e) {
      console.error('fetchPending error', e);
      return null;
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
  }

  async function doAction(id, action) {
    // action must be 'accept' or 'decline'
    if (!id || !['accept','decline'].includes(action)) return { ok:false, error:'bad-args' };
    try {
      const r = await fetch(`/api/admin/requests/${encodeURIComponent(id)}/${action}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } });
      if (!r.ok) {
        const txt = await r.text().catch(()=>null);
        return { ok:false, status: r.status, error: txt || 'request-failed' };
      }
      const j = await r.json().catch(()=>null);
      return { ok:true, data: j || {} };
    } catch (err) {
      console.error('doAction error', err);
      return { ok:false, error: String(err) };
    }
  }

  async function render() {
    container.innerHTML = '<p>Loading pending requests...</p>';
    const pending = await fetchPending();
    if (pending === null) {
      container.innerHTML = '<p style="color:crimson">Failed to fetch pending requests. Check console / network.</p>';
      return;
    }
    if (!pending.length) {
      container.innerHTML = '<p style="text-align:center;padding:30px;color:green;">🎉 No new registration requests.</p>';
      return;
    }

    container.innerHTML = '';
    pending.forEach(u => {
      const card = document.createElement('div');
      card.className = 'pending-request-card';
      card.style = 'border:1px solid #ffd; padding:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:12px';
      card.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:700">${escapeHtml(u.name || u.fullName || '')}</div>
          <div style="font-size:0.9em;color:#555">${escapeHtml(u.email || u.username || '')} • ${escapeHtml(u.batch || '')}</div>
          <div style="font-size:0.85em;color:#666; margin-top:6px">${escapeHtml(u.createdAt || u.requestedAt || '')}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="approve-btn" style="background:#28a745;color:#fff;border:none;padding:8px 10px;border-radius:6px;font-weight:700">Allow</button>
          <button class="reject-btn" style="background:#dc3545;color:#fff;border:none;padding:8px 10px;border-radius:6px;font-weight:700">Neglect</button>
        </div>
      `;

      const approveBtn = card.querySelector('.approve-btn');
      const rejectBtn = card.querySelector('.reject-btn');

      approveBtn.addEventListener('click', async () => {
        approveBtn.disabled = true; rejectBtn.disabled = true;
        if (!confirm('Approve this registration request?')) { approveBtn.disabled=false; rejectBtn.disabled=false; return; }
        const res = await doAction(u._id || u.id || u.email, 'accept');
        if (res.ok) {
          card.remove();
          try { localStorage.setItem('gspl_new_requests_update', Date.now().toString()); } catch(e){}
          alert('Approved');
        } else {
          alert('Approve failed: ' + (res.error || res.status || 'unknown'));
          approveBtn.disabled=false; rejectBtn.disabled=false;
        }
      });

      rejectBtn.addEventListener('click', async () => {
        approveBtn.disabled = true; rejectBtn.disabled = true;
        if (!confirm('Reject this registration request?')) { approveBtn.disabled=false; rejectBtn.disabled=false; return; }
        const res = await doAction(u._id || u.id || u.email, 'decline');
        if (res.ok) {
          card.remove();
          alert('Rejected');
        } else {
          alert('Reject failed: ' + (res.error || res.status || 'unknown'));
          approveBtn.disabled=false; rejectBtn.disabled=false;
        }
      });

      container.appendChild(card);
    });
  }

  // initial render
  await render();

  // expose a way to refresh (e.g., other tabs can set localStorage key to trigger)
  window.addEventListener('storage', (ev) => {
    if (!ev.key) return;
    if (ev.key === 'gspl_new_requests_update' || ev.key === 'gspl_attendance_update') {
      render().catch(()=>{});
    }
  });
})();
