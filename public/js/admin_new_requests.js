// // // admin_new_requests.js
// // async function fetchPendingRequests() {
// //   try {
// //     const r = await fetch('/api/admin/new-requests', { credentials: 'include', headers: { 'Accept': 'application/json' } });
// //     if (!r.ok) {
// //       const txt = await r.text().catch(()=>null);
// //       throw new Error(txt || `HTTP ${r.status}`);
// //     }
// //     const j = await r.json();
// //     return j.pending || [];
// //   } catch (err) {
// //     console.error('fetchPendingRequests error', err);
// //     return { error: err.message || 'Network' };
// //   }
// // }

// // function createRequestRow(pr) {
// //   const wrapper = document.createElement('div');
// //   wrapper.className = 'request-card';

// //   const left = document.createElement('div');
// //   left.style.flex = '1';

// //   const title = document.createElement('div');
// //   title.innerHTML = `<span class="req-name">${escapeHtml(pr.name || pr.email)}</span>
// //                      <span class="req-meta"> — ${escapeHtml(pr.email)}</span>`;
// //   left.appendChild(title);

// //   const meta = document.createElement('div');
// //   meta.className = 'req-meta';
// //   const createdAt = pr.createdAt ? new Date(pr.createdAt).toLocaleString() : '';
// //   meta.textContent = `Requested: ${createdAt}`;
// //   // show batch if available on request
// //   if (pr.batch) {
// //     const b = document.createElement('span'); b.className = 'batch-pill'; b.textContent = pr.batch;
// //     meta.appendChild(b);
// //   }
// //   left.appendChild(meta);

// //   wrapper.appendChild(left);

// //   const actions = document.createElement('div');
// //   actions.className = 'req-actions';

// //   const acceptBtn = document.createElement('button');
// //   acceptBtn.className = 'btn primary';
// //   acceptBtn.textContent = 'Accept';
// //   acceptBtn.onclick = async () => {
// //     acceptBtn.disabled = true; declineBtn.disabled = true;
// //     try {
// //       const res = await fetch(`/api/admin/requests/${pr._id}/accept`, { method: 'POST', credentials: 'include' });
// //       if (!res.ok) {
// //         const j = await res.json().catch(()=>null);
// //         alert(j && j.message ? j.message : `Accept failed ${res.status}`);
// //         acceptBtn.disabled = false; declineBtn.disabled = false;
// //         return;
// //       }
// //       // removed from UI
// //       wrapper.remove();
// //     } catch (e) {
// //       console.error('accept error', e);
// //       alert('Network error');
// //       acceptBtn.disabled = false; declineBtn.disabled = false;
// //     }
// //   };

// //   const declineBtn = document.createElement('button');
// //   declineBtn.className = 'btn';
// //   declineBtn.textContent = 'Decline';
// //   declineBtn.onclick = async () => {
// //     if (!confirm('Decline and remove this registration request?')) return;
// //     acceptBtn.disabled = true; declineBtn.disabled = true;
// //     try {
// //       const res = await fetch(`/api/admin/requests/${pr._id}/decline`, { method: 'POST', credentials: 'include' });
// //       if (!res.ok) {
// //         const j = await res.json().catch(()=>null);
// //         alert(j && j.message ? j.message : `Decline failed ${res.status}`);
// //         acceptBtn.disabled = false; declineBtn.disabled = false;
// //         return;
// //       }
// //       wrapper.remove();
// //     } catch (e) {
// //       console.error('decline error', e);
// //       alert('Network error');
// //       acceptBtn.disabled = false; declineBtn.disabled = false;
// //     }
// //   };

// //   actions.appendChild(acceptBtn);
// //   actions.appendChild(declineBtn);
// //   wrapper.appendChild(actions);

// //   return wrapper;
// // }

// // function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c])); }

// // async function loadRequests() {
// //   const container = document.getElementById('requestsList');
// //   container.innerHTML = '<p style="color:#666;padding:12px;">Loading pending requests…</p>';
// //   const res = await fetchPendingRequests();
// //   if (res && res.error) {
// //     container.innerHTML = `<p style="color:crimson;padding:12px;">${escapeHtml(res.error)}</p>`;
// //     return;
// //   }
// //   container.innerHTML = '';
// //   if (!res || res.length === 0) {
// //     container.innerHTML = '<p style="color:#666;padding:12px;">No pending requests.</p>';
// //     return;
// //   }
// //   res.forEach(pr => {
// //     const row = createRequestRow(pr);
// //     container.appendChild(row);
// //   });
// // }

// // document.addEventListener('DOMContentLoaded', () => {
// //   loadRequests();
// // });

// // public/js/new_request.js  (REPLACE with this)
// async function fetchPendingRequests() {
//   try {
//     const r = await fetch('/api/admin/requests', { credentials: 'include', headers:{ 'Accept':'application/json' } });
//     if (!r.ok) {
//       console.error('Failed to fetch pending requests', r.status, await r.text().catch(()=>null));
//       return [];
//     }
//     const j = await r.json();
//     // support multiple shapes: { list: [...] } or { pending: [...] } or raw array
//     return j.list || j.pending || j.requests || (Array.isArray(j) ? j : []);
//   } catch (e) {
//     console.error(e);
//     return [];
//   }
// }

// function createCard(user) {
//   const card = document.createElement('div');
//   card.className = 'pending-request-card';
//   card.innerHTML = `
//     <div class="request-details">
//       <p><strong>Name:</strong> ${escapeHtml(user.name || user.fullName || '')}</p>
//       <p><strong>Email:</strong> ${escapeHtml(user.email || user.username || '')}</p>
//       <p><strong>Role:</strong> ${escapeHtml(user.role || 'student')}</p>
//       <p style="font-size:0.8em;color:#555;">Requested: ${escapeHtml(user.createdAt || user.requestedAt || '')}</p>
//     </div>
//     <div class="request-actions">
//       <button class="approve-btn">Allow</button>
//       <button class="reject-btn">Neglect</button>
//     </div>
//   `;
//   const approveBtn = card.querySelector('.approve-btn');
//   const rejectBtn = card.querySelector('.reject-btn');

//   approveBtn.addEventListener('click', () => handleApproval(user._id || user.id, 'approve', card));
//   rejectBtn.addEventListener('click', () => handleApproval(user._id || user.id, 'reject', card));

//   return card;
// }

// function escapeHtml(s) {
//   if (!s) return '';
//   return String(s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
// }

// async function renderPendingRequests() {
//   const requestList = document.getElementById('requestList');
//   if (!requestList) return;
//   requestList.innerHTML = '<p>Loading pending requests...</p>';
//   const pending = await fetchPendingRequests();
//   requestList.innerHTML = '';

//   if (!pending || pending.length === 0) {
//     requestList.innerHTML = '<p style="text-align:center;padding:30px;color:green;">🎉 No new registration requests.</p>';
//     return;
//   }

//   pending.forEach(u => {
//     const card = createCard(u);
//     requestList.appendChild(card);
//   });
// }

// async function handleApproval(id, action, cardEl) {
//   if (!id) {
//     alert('Invalid request id');
//     return;
//   }
//   const verb = action === 'approve' ? 'approve' : 'reject';
//   if (!confirm(`Are you sure you want to ${verb} this request?`)) return;
//   try {
//     const r = await fetch(`/api/admin/requests/${encodeURIComponent(id)}/${verb}`, {
//       method: 'POST',
//       credentials: 'include',
//       headers: { 'Accept': 'application/json' }
//     });
//     if (!r.ok) {
//       const t = await r.text().catch(()=>null);
//       alert(`Action failed: ${t || r.status}`);
//       return;
//     }
//     // success: remove card and notify other tabs
//     if (cardEl && cardEl.remove) cardEl.remove();
//     try { localStorage.setItem('gspl_new_requests_update', Date.now().toString()); } catch(e){}
//     alert(`Request ${verb}ed`);
//   } catch (e) {
//     console.error(e);
//     alert('Network error');
//   }
// }

// document.addEventListener('DOMContentLoaded', renderPendingRequests);
