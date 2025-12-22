export function renderLogin(container, onLogin) {
  container.innerHTML = `
    <div class="container">
      <div id="login-screen">
        <h2>🔐 Đăng Nhập</h2>
        <div id="login-form">
          <input type="text" id="username" placeholder="Tài khoản (admin)">
          <input type="password" id="password" placeholder="Mật khẩu">
          <button id="login-btn">Vào Bếp</button>
        </div>
      </div>
    </div>
  `;

  const btn = container.querySelector('#login-btn');
  btn.addEventListener('click', async () => {
    const user = container.querySelector('#username').value;
    const pass = container.querySelector('#password').value;
    btn.disabled = true;
    try {
      await onLogin(user, pass);
    } catch (e) {
      alert(e.message || 'Đăng nhập thất bại');
    } finally {
      btn.disabled = false;
    }
  });
}
