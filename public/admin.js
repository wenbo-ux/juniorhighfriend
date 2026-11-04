/* =========================================================
   七年四班 · 管理中枢 / admin.js
   诱饵控制台 → 低层管理区（LV.1）→ 高级管理区（LV.2）
   纯前端演示：密钥、成员、公告都存 localStorage
   ========================================================= */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var STORE = 'c74_admin_v1';
  var SESSION = 'c74_admin_session';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp(d) {
    d = d || new Date();
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function clock() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid(p) { return p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5); }
  function initial(name) { return String(name || '?').trim().charAt(0) || '?'; }

  /* ---------------- 数据（共享 store.js） ---------------- */
  var data = window.C74 ? C74.load() : null;
  if (!data) { location.replace('index.html'); return; }

  function save() { if (window.C74) C74.save(data); }
  function log(text, level) {
    data.logs.unshift({ at: stamp(), who: state.user || '—', level: level || 'mid', text: text });
    data.logs = data.logs.slice(0, 80);
    save();
  }

  var state = {
    level: null,          /* low | high */
    accountLevel: null,   /* high | mid | junior */
    accountId: null,
    user: '',
    tab: 'members',
    memberQuery: '',
    gate: 'low',
    gateUser: '',
    gateKey: '',
    hotTR: 0, hotBL: 0,
    hotTRTimer: null, hotBLTimer: null
  };

  /* ---------------- toast ---------------- */
  var toastEl = $('#toast'), toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1900);
  }

  /* ---------------- 背景波浪 ---------------- */
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
      if (!W || !H) resize();
      ctx.clearRect(0, 0, W, H);
      var rows = 24, step = 7;
      for (var i = 0; i < rows; i++) {
        var base = H * (i / (rows - 1));
        var amp = 9 + Math.sin(i * 0.72) * 6;
        ctx.beginPath();
        for (var x = -24; x <= W + 24; x += step) {
          var k = x / (W || 1);
          var y = base +
            Math.sin(k * 6.4 + t * 0.32 + i * 0.42) * amp +
            Math.sin(k * 12.1 - t * 0.21 + i * 1.27) * amp * 0.44 +
            Math.sin(k * 3.2 + t * 0.13) * 8;
          if (x === -24) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        var a = 0.07 + 0.08 * Math.abs(Math.sin(i * 0.8 + t * 0.1));
        ctx.strokeStyle = 'rgba(96,180,250,' + a.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      t += 0.016;
      if (!reduce) requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener('resize', function () { resize(); if (reduce) frame(); });
    frame();
  })();

  /* ---------------- 屏幕切换 ---------------- */
  var screens = { decoy: $('#scr-decoy'), low: $('#scr-gate-low'), high: $('#scr-gate-high') };

  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('on', k === name);
    });
    window.scrollTo(0, 0);
    var bl = $('#hotBL');
    if (bl) bl.style.display = name === 'decoy' ? 'block' : 'none';
    var tr3 = $('#hotTR3');
    if (tr3) tr3.style.display = name === 'decoy' ? 'block' : 'none';
    resetSeq();
  }

  /* ---------------- 诱饵控制台 ---------------- */
  var termOut = $('#termOut');
  function term(text, cls) {
    if (!termOut) return;
    var line = document.createElement('div');
    line.className = 'ln' + (cls ? ' ' + cls : '');
    line.innerHTML = '<em>' + clock() + '</em><span>' + text + '</span>';
    termOut.appendChild(line);
    while (termOut.children.length > 6) termOut.removeChild(termOut.firstChild);
  }

  var fakeLines = [
    'sync roster ............ <b>OK</b>',
    'feed index ............. <b>128</b> items',
    'session guard .......... <b>ACTIVE</b>',
    'cache warmup ........... <b>OK</b>',
    'audit channel .......... <b>LISTENING</b>',
    'permission matrix ...... <b>READONLY</b>'
  ];

  if (termOut) {
    term('console attached · node 7-4', 'ok');
    var fi = 0;
    setInterval(function () {
      if (!$('#scr-decoy').classList.contains('on')) return;
      var raw = fakeLines[fi % fakeLines.length];
      fi++;
      term(raw, 'ok');
    }, 5200);
  }

  function runCommand() {
    var input = $('#termCmd');
    if (!input) return;
    var cmd = (input.value || '').trim();
    if (!cmd) { toast('请输入指令'); return; }
    term('&gt; ' + esc(cmd));
    input.value = '';
    setTimeout(function () {
      var c = cmd.toLowerCase();
      if (c === 'help') {
        term('可用指令：status · members · feed · help', 'ok');
      } else if (c === 'status') {
        term('SYSTEM OK · 42 members · 128 items · 0 alert', 'ok');
      } else if (c === 'members') {
        term('member registry · ' + data.members.length + ' loaded', 'ok');
      } else if (c === 'feed') {
        term('feed index · ' + data.posts.length + ' posts · 1 pinned', 'ok');
      } else {
        term('指令已执行 · 0 errors · ' + clock(), 'ok');
      }
    }, 420);
  }

  if ($('#termRun')) $('#termRun').addEventListener('click', runCommand);
  if ($('#termCmd')) $('#termCmd').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); runCommand(); }
  });

  (function fakeRows() {
    var box = $('#fakeRows');
    if (!box) return;
    data.members.slice(0, 4).forEach(function (m, i) {
      var row = document.createElement('div');
      row.className = 'fake-row';
      row.innerHTML = '<span class="av">' + esc(initial(m.name)) + '</span>' +
        '<span class="sp">' + esc(m.name) + ' <small>' + esc(m.id) + '</small></span>' +
        '<small class="ok">' + (i === 0 ? 'ADMIN' : 'ACTIVE') + '</small>';
      box.appendChild(row);
    });
  })();

  if ($('#decoyBack')) $('#decoyBack').addEventListener('click', function () {
    location.href = 'index.html';
  });

  /* ---------------- 五连击 ---------------- */
  function paintDots(side, n) {
    ['#dots' + side, '#dots' + side + '2'].forEach(function (sel) {
      var box = $(sel);
      if (!box) return;
      $$('i', box).forEach(function (d, i) { d.classList.toggle('on', i < n); });
      box.classList.toggle('show', n > 0);
    });
  }
  /* 静默手势：右上 7 下 → 左下 4 下，进入中级密钥校验 */
  var taps = { tr: 0, bl: 0, stage: 0 };
  var tapTimer = null;

  function resetTaps() { taps = { tr: 0, bl: 0, stage: 0 }; }
  function bump() {
    clearTimeout(tapTimer);
    tapTimer = setTimeout(resetTaps, 12000);
  }
  function tapDecoy(corner) {
    if (corner === 'tr') {
      taps.tr++;
      if (taps.tr >= 7) { taps.stage = 1; taps.bl = 0; }
    } else if (taps.stage === 1) {
      taps.bl++;
      if (taps.bl >= 4) { resetTaps(); openMid(); return; }
    }
    bump();
  }
  function openMid() {
    show('low');
    clearGate('low');
  }
  function openHigh() {
    show('high');
    clearGate('high');
  }

  if ($('#hotTR')) $('#hotTR').addEventListener('click', function () { tapDecoy('tr'); });
  if ($('#hotTR3')) $('#hotTR3').addEventListener('click', function () { tapDecoy('tr'); });
  if ($('#hotBL')) $('#hotBL').addEventListener('click', function () {
    if ($('#scr-decoy').classList.contains('on')) tapDecoy('bl');
  });

  /* ---------------- 密钥键盘 ---------------- */
  var keyState = { low: '', high: '' };
  var attempts = { low: 0, high: 0 };

  function dotsFor(level) { return $$(level === 'low' ? '#keyDots i' : '#keyDotsHigh i'); }
  function paintKey(level) {
    var k = keyState[level];
    dotsFor(level).forEach(function (d, i) { d.classList.toggle('on', i < k.length); });
  }
  function clearGate(level) {
    keyState[level] = '';
    paintKey(level);
    var input = level === 'low' ? $('#gateUser') : $('#gateUserHigh');
    if (input && !input.value) input.value = '';
    var msg = level === 'low' ? $('#gateMsg') : $('#gateMsgHigh');
    if (msg) { msg.textContent = ''; msg.classList.remove('show'); }
  }
  function gateMsg(level, text) {
    var msg = level === 'low' ? $('#gateMsg') : $('#gateMsgHigh');
    if (!msg) return;
    msg.textContent = text;
    msg.classList.add('show');
  }

  function bindPad(level) {
    var pad = $(level === 'low' ? '#keypad' : '#keypadHigh');
    if (!pad) return;
    pad.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-k]');
      if (!b) return;
      var k = b.dataset.k;
      if (k === 'del') {
        keyState[level] = keyState[level].slice(0, -1);
        paintKey(level);
        return;
      }
      if (k === 'clear') {
        keyState[level] = '';
        paintKey(level);
        return;
      }
      if (k === 'go') { submitGate(level); return; }
      if (!/^\d$/.test(k)) return;
      if (keyState[level].length >= 4) return;
      keyState[level] += k;
      paintKey(level);
      if (keyState[level].length === 4) {
        setTimeout(function () { submitGate(level); }, 240);
      }
    });

    var input = $(level === 'low' ? '#gateUser' : '#gateUserHigh');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitGate(level); }
      });
    }
  }
  bindPad('low');
  bindPad('high');

  function padOf(level) { return $(level === 'low' ? '#keypad' : '#keypadHigh'); }

  function failGate(level, why) {
    attempts[level]++;
    gateMsg(level, (why || '用户名或密钥不正确') + '（第 ' + attempts[level] + ' 次）');
    keyState[level] = '';
    paintKey(level);
    if (attempts[level] >= 5) {
      gateMsg(level, '安全策略：连续失败 5 次，请稍后再试');
      var pad = padOf(level);
      if (pad) pad.style.pointerEvents = 'none';
      setTimeout(function () {
        attempts[level] = 0;
        if (pad) pad.style.pointerEvents = '';
        gateMsg(level, '');
      }, 8000);
    }
  }

  function grant(level, acc) {
    attempts[level] = 0;
    state.user = acc.name || acc.user || state.user;
    state.accountLevel = acc.level || (level === 'high' ? 'high' : 'mid');
    state.accountId = acc.id || null;
    runVerify(level, state.user);
  }

  function submitGate(level) {
    var input = $(level === 'low' ? '#gateUser' : '#gateUserHigh');
    var user = (input.value || '').trim();
    var key = keyState[level];

    if (!user) { gateMsg(level, '请先输入用户名'); return; }
    if (key.length < 4) { gateMsg(level, '密钥需要 4 位数字（当前 ' + key.length + '/4）'); return; }

    var acceptLevels = level === 'high' ? ['high'] : ['junior', 'mid', 'high'];

    function localFallback() {
      var cfg = data.keys[level === 'high' ? 'high' : 'mid'];
      if (user === cfg.user && key === cfg.key) {
        grant(level, { name: user, level: level === 'high' ? 'high' : 'mid' });
      } else {
        failGate(level);
      }
    }

    if (!window.C74 || !C74.api) { localFallback(); return; }

    gateMsg(level, '正在核对账号…');
    C74.api('/api/login', { method: 'POST', body: { user: user, pass: key } })
      .then(function (res) {
        var u = res.user || {};
        if (acceptLevels.indexOf(u.level) < 0) {
          gateMsg(level, '这个账号没有' + (level === 'high' ? '高管' : '管理') + '权限');
          keyState[level] = ''; paintKey(level);
          return;
        }
        if (C74.setAuth) C74.setAuth(res.token, u);
        grant(level, u);
      })
      .catch(function (e) {
        if (e && (e.status === 401 || e.status === 403)) { failGate(level, '账号或密钥不正确'); return; }
        /* 网络问题 → 退回本地密钥，保证离线也能进 */
        localFallback();
      });
  }

  /* ---------------- 核验动画 ---------------- */
  var SLOW = /[?&]slow=1/.test(location.search) ? 2.6 : 1;
  var verify = $('#verify');
  var vTitle = $('#vTitle'), vEn = $('#vEn'), vBar = $('#vBar'), vNote = $('#vNote');
  var vCheck = $('.vcheck'), vBurst = $('#vBurst');
  var vTimers = [], vBarTimer = null, vPhase = 0, vLevel = 'low';

  function clearTimers() {
    vTimers.forEach(clearTimeout);
    vTimers = [];
    clearInterval(vBarTimer);
  }
  function later(fn, ms) { vTimers.push(setTimeout(fn, ms)); }

  function burst() {
    if (!vBurst) return;
    vBurst.innerHTML = '';
    for (var i = 0; i < 14; i++) {
      var s = document.createElement('i');
      s.style.setProperty('--a', (i * (360 / 14)) + 'deg');
      s.style.height = (10 + (i % 4) * 5) + 'px';
      vBurst.appendChild(s);
    }
    vBurst.classList.remove('go');
    void vBurst.offsetWidth;
    vBurst.classList.add('go');
  }

  function setBar(pct) { if (vBar) vBar.style.width = pct + '%'; }

  function runVerify(level, user) {
    vLevel = level;
    vPhase = 0;
    clearTimers();
    verify.classList.add('on');
    verify.setAttribute('data-phase', 'check');
    if (vCheck) vCheck.setAttribute('opacity', '0');
    vTitle.textContent = '正在核验身份信息…';
    vEn.textContent = 'VERIFYING IDENTITY…';
    vNote.textContent = 'CHALLENGE · ' + (level === 'high' ? 'LEVEL 02 · ROOT' : 'LEVEL 01') + ' · NODE 7-4';
    setBar(0);

    var pct = 0;
    vBarTimer = setInterval(function () {
      pct = Math.min(98, pct + 2 + Math.random() * 4);
      setBar(pct);
    }, 60);

    later(function () {
      clearInterval(vBarTimer);
      setBar(100);
      vPhase = 1;
      verify.setAttribute('data-phase', 'ok');
      if (vCheck) vCheck.setAttribute('opacity', '1');
      vTitle.textContent = '核验身份信息成功！';
      vEn.textContent = 'IDENTITY VERIFIED';
      vNote.textContent = 'KEY MATCH · ' + (level === 'high' ? 'ROOT ACCESS' : 'ADMIN ACCESS');
      burst();
    }, 1500 * SLOW);

    later(function () {
      vPhase = 2;
      verify.setAttribute('data-phase', 'welcome');
      var role = roleName(state.accountLevel || (level === 'high' ? 'high' : 'mid'));
      vTitle.textContent = '欢迎——' + user + '：' + role;
      vEn.textContent = 'WELCOME — ' + roman(user) + ' : ' + roleEn(state.accountLevel || (level === 'high' ? 'high' : 'mid'));
      vNote.textContent = 'SESSION GRANTED · ' + stamp();
      setBar(100);
    }, 2650 * SLOW);

    later(function () {
      finishVerify();
    }, 4500 * SLOW);
  }

  function roleName(lv) {
    return lv === 'high' ? '高级管理员' : lv === 'mid' ? '中级管理员' : '普通管理员';
  }
  function roleEn(lv) {
    return lv === 'high' ? 'SUPER ADMINISTRATOR' : lv === 'mid' ? 'ADMINISTRATOR' : 'JUNIOR ADMIN';
  }

  function roman(name) {
    var map = { '温泊': 'WENBO', '郭老师': 'TEACHER GUO', '李允正': 'LI YUNZHENG' };
    return map[name] || String(name).toUpperCase();
  }

  function finishVerify() {
    clearTimers();
    verify.classList.remove('on');
    verify.setAttribute('data-phase', 'check');
    try {
      sessionStorage.setItem('c74_admin_session', JSON.stringify({
        level: state.accountLevel || (vLevel === 'high' ? 'high' : 'mid'),
        user: state.user,
        accountId: state.accountId || null,
        at: Date.now()
      }));
    } catch (e) {}
    location.replace('index.html');
  }

  if (verify) {
    verify.addEventListener('click', function () {
      if (vPhase < 2) {
        clearTimers();
        verify.setAttribute('data-phase', 'welcome');
        if (vCheck) vCheck.setAttribute('opacity', '1');
        var role = roleName(state.accountLevel || (vLevel === 'high' ? 'high' : 'mid'));
        vTitle.textContent = '欢迎——' + state.user + '：' + role;
        vEn.textContent = 'WELCOME — ' + roman(state.user) + ' : ' + roleEn(state.accountLevel || (vLevel === 'high' ? 'high' : 'mid'));
        vNote.textContent = 'SESSION GRANTED · ' + stamp();
        setBar(100);
        vPhase = 2;
        vTimers.push(setTimeout(finishVerify, 1300));
      } else {
        finishVerify();
      }
    });
  }

  /* ---------------- 键盘输入（桌面） ---------------- */
  document.addEventListener('keydown', function (e) {
    var lowOn = $('#scr-gate-low').classList.contains('on');
    var highOn = $('#scr-gate-high').classList.contains('on');
    if (!lowOn && !highOn) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    var level = lowOn ? 'low' : 'high';
    if (/^\d$/.test(e.key)) {
      if (keyState[level].length < 4) {
        keyState[level] += e.key;
        paintKey(level);
        if (keyState[level].length === 4) setTimeout(function () { submitGate(level); }, 200);
      }
    } else if (e.key === 'Backspace') {
      keyState[level] = keyState[level].slice(0, -1);
      paintKey(level);
    } else if (e.key === 'Enter') {
      submitGate(level);
    }
  });

  /* ---------------- 启动 ---------------- */
  paintKey('low');
  paintKey('high');

  var wantHigh = /[?&]gate=high/.test(location.search);
  var adminSess = null;
  try { adminSess = JSON.parse(sessionStorage.getItem('c74_admin_session') || 'null'); } catch (e) {}
  if (wantHigh && adminSess && adminSess.level === 'mid') {
    show('high');
  } else {
    show('decoy');
  }

})();
