export function renderLogin(container, onLogin, onRegister) {
  // Store callbacks in local variables to ensure they're always available in closure
  const loginCallback = onLogin || (async () => { throw new Error('Login function is not available'); });
  const registerCallback = onRegister || (async () => { throw new Error('Registration function is not available'); });
  
  let isRegisterMode = false;

  function renderForm() {
    container.innerHTML = `
      <div class="container">
        <div id="login-screen">
          <h2>${isRegisterMode ? '📝 Đăng Ký' : '🍳 Smart Kitchen'}</h2>
          <p style="text-align: center; color: var(--text-secondary); margin: -10px 0 30px 0; font-size: 14px;">
            ${isRegisterMode ? 'Tạo tài khoản mới' : 'Đăng nhập để quản lý bếp thông minh'}
          </p>
          <div id="auth-form">
            <div class="input-group">
              <input type="text" id="username" placeholder=" " autocomplete="username">
              <label class="floating-label" for="username">Tài khoản</label>
            </div>
            <div class="input-group">
              <input type="password" id="password" placeholder=" " autocomplete="${isRegisterMode ? 'new-password' : 'current-password'}">
              <label class="floating-label" for="password">Mật khẩu</label>
            </div>
            ${isRegisterMode ? `
            <div class="input-group">
              <input type="password" id="confirm-password" placeholder=" " autocomplete="new-password">
              <label class="floating-label" for="confirm-password">Xác nhận mật khẩu</label>
            </div>
            ` : ''}
            <button id="submit-btn">${isRegisterMode ? 'Đăng Ký' : 'Vào Bếp'}</button>
            <button id="toggle-mode-btn" class="btn-secondary" style="margin-top: 12px; width: 100%;">
              ${isRegisterMode ? '← Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký →'}
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
        showToast('Vui lòng nhập đầy đủ thông tin', 'warning');
        return;
      }

      if (isRegisterMode) {
        const confirmPass = container.querySelector('#confirm-password').value;
        if (pass !== confirmPass) {
          showToast('Mật khẩu xác nhận không khớp', 'error');
          return;
        }
        if (pass.length < 4) {
          showToast('Mật khẩu phải có ít nhất 4 ký tự', 'warning');
          return;
        }
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="loading-spinner"></span> Đang xử lý...';
      
      try {
        if (isRegisterMode) {
          await registerCallback(user, pass);
        } else {
          await loginCallback(user, pass);
        }
      } catch (e) {
        showToast(e.message || (isRegisterMode ? 'Đăng ký thất bại' : 'Đăng nhập thất bại'), 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = isRegisterMode ? 'Đăng Ký' : 'Vào Bếp';
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

    // Focus first input with animation delay
    setTimeout(() => usernameInput.focus(), 100);
  }

  // Simple toast notification
  function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const colors = {
      info: 'var(--primary)',
      warning: 'var(--warning)',
      error: 'var(--danger)',
      success: 'var(--success)'
    };

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: ${colors[type] || colors.info};
      color: white;
      padding: 14px 28px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      z-index: 9999;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: 'Quicksand', sans-serif;
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);
    
    // Animate out and remove
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(100px)';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  renderForm();
}
