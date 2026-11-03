/* =========================================================
   七年四班 · 身份验证层 / auth.js
   纯前端演示：注册码校验 → 创建账号(localStorage) → 登录跳转
   接后端时只需替换 API.verifyCode / API.register / API.login
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 演示用「后端」 ----------------
     以后接真后端：把下面三个函数换成 fetch 即可，
     其余 UI 逻辑完全不用动。                       */
  var MOCK_CODES = {
    '7C4A-9F2E-B615': { use: '班级成员 · 普通成员', batch: '2026 秋季 · B 批', tags: ['一次性', '绑定学号', '有效期 30 天'] },
    'M4D1-77AB-C0DE': { use: '班级成员 · 管理员', batch: '2026 秋季 · A 批', tags: ['管理员', '一次性', '可发码'] }
  };

  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
        return d;
      });
    });
  }

  var API = {
    /* 注册码：本地格式校验，真正是否可用由 /api/register 判定 */
    verifyCode: function (code) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var norm = code.toUpperCase();
          if (MOCK_CODES[norm]) {
            var d = MOCK_CODES[norm];
            resolve({ ok: true, data: { use: d.use, batch: d.batch, tags: d.tags } });
          } else if (/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(norm)) {
            resolve({ ok: true, data: { use: '班级成员 · 普通成员', batch: '2026 秋季 · 通用', tags: ['通用码', '绑定学号'] } });
          } else {
            resolve({ ok: false, error: '注册码格式不对（XXXX-XXXX-XXXX）' });
          }
        }, 380);
      });
    },

    /* 注册 → 服务器建账号 */
    register: function (payload) {
      return post('/api/register', {
        code: payload.code, user: payload.id, name: payload.name, pass: payload.pwd
      }).then(function (d) {
        return { ok: true, data: d.user };
      }).catch(function (e) {
        return { ok: false, error: e.message || '注册失败' };
      });
    },

    /* 登录 → 服务器校验，拿 token */
    login: function (id, pwd) {
      return post('/api/login', { user: id, pass: pwd }).then(function (d) {
        var u = d.user;
        if (window.C74 && C74.setAuth) {
          C74.setAuth(d.token, u);
        } else {
          try {
            localStorage.setItem('c74_token', d.token);
            localStorage.setItem('c74_me', JSON.stringify(u));
          } catch (e) {}
        }
        try {
          sessionStorage.setItem('c74_session', JSON.stringify({
            id: u.id, name: u.name, role: u.level, level: u.level, at: Date.now()
          }));
        } catch (e) {}
        return { ok: true, data: u };
      }).catch(function (e) {
        var m = e.message || '登录失败';
        if (m === 'Failed to fetch' || m.indexOf('fetch') > -1) m = '连不上服务器，检查网络后重试';
        return { ok: false, error: m };
      });
    }
  };

  /* ---------------- 小工具 ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function loadUsers() {
    try { return JSON.parse(localStorage.getItem('c74_users') || '[]'); } catch (e) { return []; }
  }
  function saveUsers(list) {
    try { localStorage.setItem('c74_users', JSON.stringify(list)); } catch (e) {}
  }

  /* 预置一个管理员演示账号：温泊 / 2404-01 / 123456 */
  (function seedDemoUser() {
    var users = loadUsers();
    if (!users.some(function (u) { return u.id === '2404-01'; })) {
      users.push({ id: '2404-01', name: '温泊', pwd: '123456', role: 'admin', at: Date.now() });
      saveUsers(users);
    }
  })();

  var toastEl = $('#toast'), toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translate(-50%,0)';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translate(-50%,14px)';
    }, 1800);
  }

  function showMsg(el, text, kind) {
    if (!el) return;
    var span = el.querySelector('span');
    if (span) span.textContent = text || '';
    el.classList.toggle('show', !!text);
    el.classList.toggle('ok', kind === 'ok');
    el.classList.toggle('warn', kind === 'warn');
  }

  /* ---------------- 背景流线 ---------------- */
  (function waves() {
    var cv = $('#waves');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, dpr = 1, t = 0;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function frame() {
      ctx.clearRect(0, 0, W, H);
      var rows = 26, step = 8;
      for (var i = 0; i < rows; i++) {
        var base = H * (i / (rows - 1));
        var amp = 8 + Math.sin(i * 0.7) * 6;
        ctx.beginPath();
        for (var x = -16; x <= W + 16; x += step) {
          var k = x / (W || 1);
          var y = base
            + Math.sin(k * 6.1 + t * 0.3 + i * 0.4) * amp
            + Math.sin(k * 11.4 - t * 0.2 + i * 1.2) * amp * 0.45;
          if (x === -16) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        var a = 0.06 + 0.08 * Math.abs(Math.sin(i * 0.8 + t * 0.1));
        ctx.strokeStyle = 'rgba(96,180,250,' + a.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      for (var d = 0; d < 5; d++) {
        var px = ((t * (16 + d * 6) + d * 151) % (W + 140)) - 70;
        var py = H * (0.1 + 0.18 * d) + Math.sin(px / 100 + t * 0.5 + d) * 12;
        var g = ctx.createRadialGradient(px, py, 0, px, py, 11);
        g.addColorStop(0, 'rgba(150,225,255,' + (0.3 + 0.2 * Math.sin(t + d)).toFixed(2) + ')');
        g.addColorStop(1, 'rgba(150,225,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, 11, 0, 6.2832); ctx.fill();
      }
      t += 0.016;
      if (!reduce) requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener('resize', function () { resize(); if (reduce) frame(); });
    frame();
  })();

  /* ---------------- 模式切换 ---------------- */
  var panel = $('#panel');
  var viewLogin = $('#view-login'), viewReg = $('#view-register'), viewDone = $('#view-done');

  function setMode(mode) {
    if (!panel) return;
    panel.setAttribute('data-mode', mode);
    $$('.seg button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === mode ? 'true' : 'false');
    });
    viewLogin.hidden = mode !== 'login';
    viewReg.hidden = mode !== 'register';
    viewDone.hidden = true;
    /* 触屏设备不自动聚焦：键盘会顶起布局，且在部分 WebView 里会卡死渲染进程 */
    if (window.matchMedia('(hover:hover) and (pointer:fine)').matches && window.innerWidth > 899) {
      setTimeout(function () { var el = $(mode === 'login' ? '#loginId' : '#code'); if (el) el.focus(); }, 60);
    }
  }
  $$('.seg button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.tab); });
  });
  $('#goRegister') && $('#goRegister').addEventListener('click', function () { setMode('register'); });
  $('#backLogin') && $('#backLogin').addEventListener('click', function () { setMode('login'); });

  /* ---------------- 密码显隐 ---------------- */
  $$('.eyebtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var inp = document.getElementById(btn.dataset.eye);
      if (!inp) return;
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      btn.style.color = show ? '#5fe3ff' : '';
    });
  });

  /* ---------------- 注册码分段输入 ---------------- */
  var zs = [$('#code'), $('#code2'), $('#code3')];
  var codeState = $('#codeState'), csLabel = $('#csLabel');
  var codeMsg = $('#codeMsg'), csUse = $('#csUse'), csBatch = $('#csBatch'), csChips = $('#csChips');
  var codeBox = $('#codeBox');
  var lastVerified = null;   /* 已生效的注册码 */
  var verifyTimer = null;
  var verifying = false;

  function joinCode() {
    return zs.map(function (z) { return (z.value || '').toUpperCase(); }).join('-').replace(/-+$/, '');
  }
  function fullCode() {
    return zs.every(function (z) { return z.value.length === 4; }) ? joinCode() : '';
  }
  function resetVerify() {
    lastVerified = null;
    codeBox.classList.remove('locked');
    zs.forEach(function (z) { z.disabled = false; z.classList.remove('ok', 'err'); });
    codeState.classList.remove('on', 'bad');
    csLabel.textContent = '待输入';
    showMsg(codeMsg, '');
  }

  zs.forEach(function (z, i) {
    z.addEventListener('input', function () {
      var v = z.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (v.length > 4) {
        /* 自动填充 / 一次性塞入整串：向后逐段拆分 */
        var j = i;
        while (v.length && j < 3) { zs[j].value = v.slice(0, 4); v = v.slice(4); j++; }
        zs[Math.min(2, j)].focus();
      } else {
        z.value = v;
      }
      z.classList.remove('ok', 'err');
      if (z.value.length === 4 && zs[i + 1] && !zs[i + 1].value) zs[i + 1].focus();
      clearTimeout(verifyTimer);
      if (lastVerified && fullCode() !== lastVerified) resetVerify();
      var c = fullCode();
      if (c) { verifyTimer = setTimeout(function () { doVerify(c); }, 260); }
      else { codeState.classList.remove('on', 'bad'); csLabel.textContent = '待输入'; showMsg(codeMsg, ''); }
    });
    /* 退格回到上一段 */
    z.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !z.value && zs[i - 1]) { zs[i - 1].focus(); }
      if (e.key === 'Enter') { e.preventDefault(); $('#regForm').requestSubmit(); }
    });
    /* 整段粘贴 */
    z.addEventListener('paste', function (e) {
      var txt = (e.clipboardData || window.clipboardData).getData('text') || '';
      var clean = txt.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (clean.length >= 8) {
        e.preventDefault();
        fillCode(clean);
      }
    });
  });

  function fillCode(clean) {
    for (var i = 0; i < 3; i++) {
      zs[i].value = clean.substr(i * 4, 4);
      zs[i].classList.remove('ok', 'err');
    }
    resetVerify();
    var c = fullCode();
    if (c) doVerify(c);
    else if (zs[2].value.length < 4) zs[Math.min(2, Math.floor(clean.length / 4))].focus();
  }

  $('#pasteCode') && $('#pasteCode').addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (txt) {
        var clean = (txt || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (clean.length >= 8) { fillCode(clean); }
        else { toast('剪贴板里没有可用的注册码'); }
      }).catch(function () { toast('读不到剪贴板，手动输入吧'); });
    } else {
      toast('当前环境不支持读取剪贴板');
    }
  });

  function doVerify(code) {
    if (verifying) return;
    verifying = true;
    csLabel.textContent = '校验中…';
    codeState.classList.remove('on', 'bad');
    showMsg(codeMsg, '');
    API.verifyCode(code).then(function (res) {
      verifying = false;
      if (fullCode() !== code) return;   /* 期间又改了 */
      if (res.ok) {
        lastVerified = code;
        codeState.classList.add('on');
        csLabel.textContent = '有效';
        csUse.textContent = res.data.use;
        csBatch.textContent = res.data.batch;
        csChips.innerHTML = '';
        (res.data.tags || []).forEach(function (t) {
          var s = document.createElement('span');
          s.className = 'chip';
          s.textContent = t;
          csChips.appendChild(s);
        });
        zs.forEach(function (z) { z.classList.add('ok'); z.disabled = true; });
        codeBox.classList.add('locked');
        showMsg(codeMsg, '注册码校验通过', 'ok');
        var n = $('#regName'); if (n) n.focus();
      } else {
        codeState.classList.add('bad');
        csLabel.textContent = '无效';
        zs.forEach(function (z) { z.classList.add('err'); });
        showMsg(codeMsg, res.error || '注册码无效');
        csUse.textContent = '—'; csBatch.textContent = '—'; csChips.innerHTML = '';
      }
    });
  }

  /* ---------------- 密码强度 ---------------- */
  var bars = $('#bars'), strLabel = $('#strLabel');
  function scorePwd(v) {
    var s = 0;
    if (v.length >= 6) s++;
    if (v.length >= 10) s++;
    if (/[a-zA-Z]/.test(v) && /\d/.test(v)) s++;
    if (/[^a-zA-Z0-9]/.test(v)) s++;
    return Math.min(s, 4);
  }
  $('#regPwd') && $('#regPwd').addEventListener('input', function () {
    var v = this.value, s = scorePwd(v);
    var kinds = ['', 'm', 'm', 's', 's'];
    $$('i', bars).forEach(function (b, i) {
      b.className = i < s ? ('on ' + (kinds[s] || '')) : '';
    });
    strLabel.textContent = !v ? '—' : ['太弱', '弱', '一般', '较强', '很强'][s];
    strLabel.style.color = !v ? '' : ['#ff6b8a', '#ff6b8a', 'var(--amber)', 'var(--ok)', 'var(--ok)'][s];
  });

  /* ---------------- 注册提交 ---------------- */
  $('#regForm') && $('#regForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = ($('#regName').value || '').trim();
    var sid = ($('#regId').value || '').trim();
    var pwd = $('#regPwd').value || '';
    var pwd2 = $('#regPwd2').value || '';
    var agree = $('#agree').checked;
    var code = fullCode();

    if (!code) { showMsg(codeMsg, '请先输入 3 段注册码'); toast('请先输入注册码'); return; }
    if (!lastVerified) { showMsg(codeMsg, '注册码还没通过校验'); zs[0].focus(); return; }
    if (name.length < 2) { showMsg($('#regMsg'), '昵称至少 2 个字'); $('#regName').focus(); return; }
    if (!/^[A-Za-z0-9-]{4,12}$/.test(sid)) { showMsg($('#regMsg'), '学号格式：字母数字，4–12 位，可带 -'); $('#regId').focus(); return; }
    if (pwd.length < 6) { showMsg($('#regMsg'), '密码至少 6 位'); $('#regPwd').focus(); return; }
    if (pwd !== pwd2) { showMsg($('#regMsg'), '两次输入的密码不一样'); $('#regPwd2').focus(); return; }
    if (!agree) { showMsg($('#regMsg'), '需要先同意《班级空间公约》'); return; }

    showMsg($('#regMsg'), '');
    var btn = $('#regBtn');
    btn.disabled = true; btn.classList.add('loading');

    API.register({ code: code, name: name, id: sid, pwd: pwd }).then(function (res) {
      btn.disabled = false; btn.classList.remove('loading');
      if (!res.ok) { showMsg($('#regMsg'), res.error || '注册失败'); return; }
      $('#doneName').textContent = res.data.name;
      $('#doneId').textContent = res.data.id;
      viewReg.hidden = true;
      viewDone.hidden = false;
      var lg = $('#loginId');
      if (lg) lg.value = res.data.id;
    });
  });

  $('#toLogin') && $('#toLogin').addEventListener('click', function () { setMode('login'); });

  /* ---------------- 登录提交 ---------------- */
  $('#loginForm') && $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = ($('#loginId').value || '').trim();
    var pwd = $('#loginPwd').value || '';
    var msg = $('#loginMsg');
    if (id.length < 2) { showMsg(msg, '请输入学号或昵称'); $('#loginId').focus(); return; }
    if (pwd.length < 4) { showMsg(msg, '密码至少 4 位'); $('#loginPwd').focus(); return; }
    showMsg(msg, '');
    var btn = $('#loginBtn'), tx = btn.querySelector('.tx');
    btn.disabled = true; btn.classList.add('loading');
    tx.textContent = '正在验证身份…';

    API.login(id, pwd).then(function (res) {
      btn.disabled = false; btn.classList.remove('loading');
      tx.textContent = '进入班级空间';
      if (!res.ok) { showMsg(msg, res.error || '登录失败'); $('#loginIdWrap').classList.add('bad'); return; }
      showMsg(msg, '验证通过，正在进入…', 'ok');
      try {
        if ($('#remember').checked) localStorage.setItem('c74_last_id', id);
        else localStorage.removeItem('c74_last_id');
      } catch (err) {}
      setTimeout(function () { location.href = 'index.html'; }, 620);
    });
  });

  /* ---------------- 杂项 ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-toast]');
    if (t) { e.preventDefault(); toast(t.dataset.toast); }
  });

  (function clock() {
    var el = $('#footClock');
    if (!el) return;
    function tick() {
      var d = new Date();
      el.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map(function (n) { return String(n).padStart(2, '0'); }).join(':');
    }
    tick(); setInterval(tick, 1000);
  })();

  /* 记住上次账号 */
  try {
    var last = localStorage.getItem('c74_last_id');
    if (last && $('#loginId')) $('#loginId').value = last;
  } catch (e) {}

  /* 顶栏时钟占位不闪烁 */
  window.__C74_AUTH__ = { API: API, setMode: setMode };
})();
