// public/js/admin_requests.js
// Loads pending requests (GET /api/admin/new-requests) and approve/decline (POST /api/admin/requests/:id/:action)

async function loadAdminRequests(containerId = 'requestsContainer') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="muted-small">Loading requests…</div>';

  try {
    const r = await fetch('/api/admin/new-requests', { credentials:'include', headers:{ Accept:'application/json' } });
    if (!r.ok) {
      const t = await r.text().catch(()=>null);
      throw new Error(t || `HTTP ${r.status}`);
    }
    const j = await r.json();
    const list = j.pending || j.list || j.requests || [];
    if (!list || !list.length) {
      container.innerHTML = '<div class="muted-small">No new requests.</div>';
      return;
    }

    const frag = document.createElement('div');
    frag.className = 'requests-list';
    list.forEach(req => {
      const card = document.createElement('div');
      card.className = 'req-card';
      card.innerHTML = `
        <div class="req-info">
          <div style="font-weight:700">${req.name || req.email}</div>
          <div class="req-meta">${req.email || ''} • ${req.batch || req.role || 'student'}</div>
          <div style="font-size:13px;color:#666">${req.createdAt || ''}</div>
        </div>
        <div class="req-actions">
          <button class="btn approve">Approve</button>
          <button class="btn reject">Reject</button>
        </div>
      `;
      const approveBtn = card.querySelector('.approve');
      const rejectBtn = card.querySelector('.reject');

      approveBtn.onclick = async () => {
        if (!confirm('Approve this request?')) return;
        approveBtn.disabled = true; rejectBtn.disabled = true;
        try {
          const res = await fetch(`/api/admin/requests/${encodeURIComponent(req._id || req.id || req.email)}/accept`, { method:'POST', credentials:'include' });
          if (!res.ok) { const txt = await res.text().catch(()=>null); throw new Error(txt || `HTTP ${res.status}`); }
          card.remove();
          try { localStorage.setItem('gspl_new_requests_update', Date.now().toString()); } catch(e){}
          alert('Request approved');
        } catch (e) {
          console.error(e); alert('Approve failed: ' + (e && e.message ? e.message : 'unknown')); approveBtn.disabled = false; rejectBtn.disabled = false;
        }
      };

      rejectBtn.onclick = async () => {
        if (!confirm('Reject this request?')) return;
        approveBtn.disabled = true; rejectBtn.disabled = true;
        try {
          const res = await fetch(`/api/admin/requests/${encodeURIComponent(req._id || req.id || req.email)}/decline`, { method:'POST', credentials:'include' });
          if (!res.ok) { const txt = await res.text().catch(()=>null); throw new Error(txt || `HTTP ${res.status}`); }
          card.remove();
          alert('Request rejected');
        } catch (e) {
          console.error(e); alert('Reject failed: ' + (e && e.message ? e.message : 'unknown')); approveBtn.disabled = false; rejectBtn.disabled = false;
        }
      };

      frag.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(frag);
  } catch (err) {
    console.error('loadAdminRequests error', err);
    container.innerHTML = `<div style="color:crimson">Failed to load requests: ${err && err.message ? err.message : ''}</div>`;
  }
}

// Expose on window for inline calls
window.loadAdminRequests = loadAdminRequests;
