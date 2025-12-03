// public/js/login.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const role = document.querySelector('input[name="role"]:checked')?.value || 'student';
    const errorMsg = document.getElementById('errorMsg');

    errorMsg.textContent = '';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: username,
          password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        errorMsg.textContent = data.message || 'Login failed';
        errorMsg.style.color = '#d32f2f';
        return;
      }

      if (data.role === 'admin') {
        window.location.href = '/admin/dashboard';
      } else {
        window.location.href = '/student';
      }
    } catch (err) {
      console.error(err);
      errorMsg.textContent = 'Network error. Try again.';
      errorMsg.style.color = '#d32f2f';
    }
  });
});
