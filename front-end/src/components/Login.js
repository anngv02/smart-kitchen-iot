export function renderLogin(container, onLogin, onRegister) {
  // Store callbacks in local variables to ensure they're always available in closure
  const loginCallback = onLogin || (async () => { throw new Error('Login function is not available'); });
  const registerCallback = onRegister || (async () => { throw new Error('Registration function is not available'); });
  
  let isRegisterMode = false;

  function renderForm() {
    container.innerHTML = `
      <div class="container">
        <div id="login-screen">
          <h2>${isRegisterMode ? '📝 Đăng Ký' : '🔐 Đăng Nhập'}</h2>
          <div id="auth-form">
            <input type="text" id="username" placeholder="Tài khoản" autocomplete="username">
            <input type="password" id="password" placeholder="Mật khẩu" autocomplete="current-password">
            ${isRegisterMode ? '<input type="password" id="confirm-password" placeholder="Xác nhận mật khẩu" autocomplete="new-password">' : ''}
            <button id="submit-btn">${isRegisterMode ? 'Đăng Ký' : 'Vào Bếp'}</button>
            <button id="toggle-mode-btn" style="margin-top: 10px; background: #95a5a6; width: 100%;">
              ${isRegisterMode ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
            </button>
          </div>
        </div>
      </div>
    `;

    const submitBtn = container.querySelector('#submit-btn');
    const toggleBtn = container.querySelector('#toggle-mode-btn');
    const usernameInput = container.querySelector('#username');
    const passwordInput = container.querySelector('#password');

    submitBtn.addEventListener('click', async () => {
      const user = usernameInput.value.trim();
      const pass = passwordInput.value;

      if (!user || !pass) {
        alert('Vui lòng nhập đầy đủ thông tin');
        return;
      }

      if (isRegisterMode) {
        const confirmPass = container.querySelector('#confirm-password').value;
        if (pass !== confirmPass) {
          alert('Mật khẩu xác nhận không khớp');
          return;
        }
        if (pass.length < 4) {
          alert('Mật khẩu phải có ít nhất 4 ký tự');
          return;
        }
      }

      submitBtn.disabled = true;
      try {
        if (isRegisterMode) {
          await registerCallback(user, pass);
          // The registerCallback in main.js will automatically log in the user
        } else {
          await loginCallback(user, pass);
        }
      } catch (e) {
        alert(e.message || (isRegisterMode ? 'Đăng ký thất bại' : 'Đăng nhập thất bại'));
      } finally {
        submitBtn.disabled = false;
      }
    });

    toggleBtn.addEventListener('click', () => {
      isRegisterMode = !isRegisterMode;
      renderForm();
    });

    // Allow Enter key to submit
    const inputs = [usernameInput, passwordInput];
    if (isRegisterMode) {
      const confirmInput = container.querySelector('#confirm-password');
      if (confirmInput) inputs.push(confirmInput);
    }
    inputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          submitBtn.click();
        }
      });
    });
  }

  renderForm();
}
