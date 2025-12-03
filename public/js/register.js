// register.js — robust front-end registration handler
document.addEventListener('DOMContentLoaded', () => {
  // Try to find the register form using common ids/names
  const form =
    document.getElementById('registerForm') ||
    document.querySelector('form[action="/register"]') ||
    document.querySelector('form#register') ||
    document.querySelector('form');

  // Message element to show feedback to user
  let msg = document.getElementById('registerMessage');
  if (!msg) {
    // create a small message element if not present
    msg = document.createElement('div');
    msg.id = 'registerMessage';
    msg.style.marginTop = '12px';
    // append to form or to body as fallback
    if (form) form.appendChild(msg);
    else document.body.appendChild(msg);
  }

  if (!form) {
    console.warn('register.js: no form found on page. Please add id="registerForm" to your form.');
    msg.style.color = 'red';
    msg.textContent = 'Registration form not found on this page.';
    return;
  }

  // helper: find input by several possible names/ids
  const findInput = (...candidates) => {
    for (const sel of candidates) {
      if (!sel) continue;
      // try name
      let el = form.querySelector(`[name="${sel}"]`);
      if (el) return el;
      // try id
      el = form.querySelector(`#${sel}`);
      if (el) return el;
      // try input placeholder text contains
      el = form.querySelector(`input[placeholder*="${sel}"]`);
      if (el) return el;
      // try label text contains (less reliable)
      const labels = Array.from(form.querySelectorAll('label'));
      for (const lab of labels) {
        if (lab.innerText && lab.innerText.toLowerCase().includes(sel.toLowerCase())) {
          const forId = lab.getAttribute('for');
          if (forId) {
            const byId = document.getElementById(forId);
            if (byId) return byId;
          }
        }
      }
    }
    return null;
  };

  // Inputs - try common names used in your files
  const nameInput = findInput('name', 'fullName', 'full_name', 'fullname', 'Full name', 'username');
  const emailInput = findInput('email', 'username', 'user', 'login', 'loginId');
  const passwordInput = findInput('password', 'pass', 'pwd');
  const inviteInput = findInput('inviteCode', 'invite_code', 'adminInvite', 'adminInviteCode', 'invite');
  // role radios (student/admin). Look for radio inputs with name userRole/role
  let roleRadioName = null;
  const maybeRole = form.querySelector('input[type="radio"][name="userRole"], input[type="radio"][name="role"]');
  if (maybeRole) roleRadioName = maybeRole.getAttribute('name');

  // fallback placeholders for values
  const getVal = el => (el ? (el.value || '').trim() : '');

  // show debug helper in console and in UI
  const debugShow = (obj) => {
    console.log('[register.js] payload ->', obj);
  };

  // submit handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // collect values
    const name = getVal(nameInput);
    const email = getVal(emailInput);
    const password = getVal(passwordInput);
    const inviteCode = getVal(inviteInput);
    let role = 'student';
    if (roleRadioName) {
      const checked = form.querySelector(`input[type="radio"][name="${roleRadioName}"]:checked`);
      if (checked && checked.value) role = checked.value;
    } else {
      // try a select or hidden field
      const roleSelect = form.querySelector('select[name="role"], select[name="userRole"]');
      if (roleSelect) role = roleSelect.value;
    }

    // validation
    if (!name || !email || !password) {
      msg.style.color = 'red';
      msg.textContent = 'Please fill name, email and password.';
      return;
    }

    // build payload always including inviteCode (may be empty)
    const payload = { name, email, password, userRole: role, inviteCode };

    // debug UI + console
    debugShow(payload);
    msg.style.color = '#444';
    msg.textContent = 'Registering...';

    try {
      const res = await fetch('/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // try parse json safely
      let data = null;
      try { data = await res.json(); } catch (err) { /* ignore non-json */ }

      if (!res.ok) {
        // show server message if present
        const serverMsg = data && data.message ? data.message : `Server returned ${res.status}`;
        msg.style.color = 'red';
        msg.textContent = serverMsg;
        console.warn('[register.js] server error', res.status, data);
        return;
      }

      // success
      msg.style.color = 'green';
      if (data && data.message) msg.textContent = data.message;
      else msg.textContent = 'Registered successfully — redirecting to login...';

      // redirect after short delay
      setTimeout(() => window.location.href = '/login', 900);

    } catch (err) {
      console.error('[register.js] fetch failed', err);
      msg.style.color = 'red';
      msg.textContent = 'Network error. Trying fallback form POST...';

      // Fallback: submit the form as a normal form post (create hidden inputs if needed)
      try {
        // ensure the server-side will receive inviteCode and userRole via regular form post
        if (inviteInput == null) {
          // create hidden invite input if none exists
          const h = document.createElement('input');
          h.type = 'hidden';
          h.name = 'inviteCode';
          h.value = payload.inviteCode || '';
          form.appendChild(h);
        } else {
          // ensure proper name attribute
          if (!inviteInput.name) inviteInput.name = 'inviteCode';
        }
        if (roleRadioName == null) {
          // add hidden role
          const hr = document.createElement('input');
          hr.type = 'hidden';
          hr.name = 'userRole';
          hr.value = payload.userRole || 'student';
          form.appendChild(hr);
        }
        // ensure name/email/password fields have name attributes
        if (nameInput && !nameInput.name) nameInput.name = 'name';
        if (emailInput && !emailInput.name) emailInput.name = 'email';
        if (passwordInput && !passwordInput.name) passwordInput.name = 'password';
        form.submit();
      } catch (e) {
        console.error('[register.js] fallback form submit failed', e);
        msg.textContent = 'Registration failed. Please try again or contact the admin.';
      }
    }
  });
});
