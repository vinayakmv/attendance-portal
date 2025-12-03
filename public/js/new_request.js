// public/js/new_request.js
async function fetchPendingRequests() {
  try {
    const r = await fetch('/api/admin/new-requests', { credentials: 'include' });
    if (!r.ok) {
      console.error('Failed to fetch pending requests', await r.text());
      return [];
    }
    const j = await r.json();
    return j.pending || [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

function createCard(user) {
  const card = document.createElement('div');
  card.className = 'pending-request-card';
  card.innerHTML = `
    <div class="request-details">
      <p><strong>Name:</strong> ${escapeHtml(user.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
      <p><strong>Role:</strong> ${escapeHtml(user.role || 'student')}</p>
      <p style="font-size:0.8em;color:#555;">Requested: ${user.createdAt || user.requestedAt || ''}</p>
    </div>
    <div class="request-actions">
      <button class="approve-btn">Allow</button>
      <button class="reject-btn">Neglect</button>
    </div>
  `;
  const approveBtn = card.querySelector('.approve-btn');
  const rejectBtn = card.querySelector('.reject-btn');

  approveBtn.addEventListener('click', () => handleApproval(user._id, 'accept'));
  rejectBtn.addEventListener('click', () => handleApproval(user._id, 'decline'));

  return card;
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}

async function renderPendingRequests() {
  const requestList = document.getElementById('requestList');
  requestList.innerHTML = '<p>Loading pending requests...</p>';
  const pending = await fetchPendingRequests();
  requestList.innerHTML = '';

  if (!pending || pending.length === 0) {
    requestList.innerHTML = '<p style="text-align:center;padding:30px;color:green;">🎉 No new registration requests.</p>';
    return;
  }

  pending.forEach(u => {
    const card = createCard(u);
    requestList.appendChild(card);
  });
}

async function handleApproval(id, action) {
  if (!confirm(`Are you sure you want to ${action} this request?`)) return;
  try {
    const r = await fetch(`/api/admin/requests/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!r.ok) {
      const t = await r.text();
      alert(`Action failed: ${t}`);
      return;
    }
    alert(`Request ${action}ed`);
    await renderPendingRequests();
  } catch (e) {
    console.error(e);
    alert('Network error');
  }
}

document.addEventListener('DOMContentLoaded', renderPendingRequests);
