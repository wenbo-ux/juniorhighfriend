/* =========================================================
   七年四班 · 上传面板
   文字区：只能发文字 + emoji（无图片）
   照片区：照片 + 文案，照片必须配一句文案
   ========================================================= */
(function () {
  'use strict';

  var ME = '同学';
  try {
    var ss = JSON.parse(sessionStorage.getItem('c74_session') || '{}');
    ME = ss.name || ss.id || '同学';
  } catch (e) {}

  var data = null;
  try { data = window.C74 ? C74.load() : null; } catch (e) {}

  function $(q, r) { return (r || document).querySelector(q); }
  function esc(s) { return window.C74 ? C74.esc(s) : String(s); }

  var toastEl = document.getElementById('toast'), tt = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(tt);
    tt = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }

  function isAdmin() {
    try { return !!JSON.parse(sessionStorage.getItem('c74_admin_session') || 'null'); }
    catch (e) { return false; }
  }
  function locked() {
    var b = document.getElementById('lockBtn');
    return !!(b && b.classList.contains('on'));
  }

  var EMOJI = ('😀 😄 😁 😆 😊 🙂 😉 😍 🥰 😎 🤩 😭 😂 🤣 😅 😴 🤔 😮 😱 🥳 😇 🙃 ' +
    '😋 🤗 😌 😔 😤 😡 🥺 🤯 💪 👍 👏 🙌 ✌️ 🤝 🙏 ❤️ 💙 💚 🧡 💜 🖤 💛 ✨ 🌟 ⭐️ 🔥 🎉 🎊 ' +
    '🌈 ☀️ 🌙 ⛅️ 🍀 🌸 🌼 🍎 🏀 ⚽️ 📚 ✏️ 🎵 ☕️ 🍜 🐱 🐶').split(' ');

  var ICON = {
    like: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.6-7 9-7 9z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 4.5l2.3 4.9 5.2.7-3.8 3.7 1 5.2-4.7-2.6-4.7 2.6 1-5.2L4.5 10l5.2-.7z"/></svg>',
    cmt: '<svg viewBox="0 0 24 24"><path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.2-2.9-.5L4 20l1.2-3.4A6.4 6.4 0 014 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5z"/></svg>'
  };

  /* ---------------- 卡片 ---------------- */
  function avHTML(p) {
    var url = p.who_avatar || ((window.C74Avatars || {})[p.who_id] || '');
    if (url) return '<span class="av av-img"><img src="' + url + '" alt=""></span>';
    return '<span class="av">' + esc(C74.initial(p.who)) + '</span>';
  }
  /* 有管理数据时以它为准（管理端可能隐藏/置顶过） */
  function inspectCard(card) {
    var id = card.getAttribute('data-post');
    if (data && Array.isArray(data.posts)) {
      var p = null;
      data.posts.forEach(function (x) { if (x.id === id) p = x; });
      if (!p) return 'orphan';
      if (p.hidden) return 'hide';
    }
    return 'keep';
  }

  function cardHTML(p) {
    var head = '<div class="who">' + avHTML(p) + esc(p.who) +
      '<span class="up-time">' + esc(p.at || '') + '</span></div>';
    var bar = '<div class="bar">' +
      '<button class="act like">' + ICON.like + '<span class="n">0</span></button>' +
      '<button class="act star">' + ICON.star + '<span class="n">0</span></button>' +
      '<button class="act cmt">' + ICON.cmt + '<span class="n">' + ((p.comments || []).length) + '</span></button>' +
      '</div>';

    if (p.type === 'photo' && p.images && p.images.length) {
      var imgs = p.images.slice(0, 4);
      var media = imgs.length === 1
        ? '<button class="ph-open" data-img="0"><img class="ph-one" src="' + imgs[0] + '" alt=""></button>'
        : '<div class="ph-grid n' + imgs.length + '">' + imgs.map(function (u, i) {
            return '<button class="ph-open" data-img="' + i + '"><img src="' + u + '" alt=""></button>';
          }).join('') + '</div>';
      return '<article class="card pop" data-post="' + p.id + '">' +
        '<div class="ph">' + media +
        '<span class="ph-date">' + esc(p.date) + '</span>' +
        '<span class="ph-no">' + esc(p.no || 'IMG') + '</span></div>' +
        '<div class="body">' + head +
        '<p class="cap up-full">' + esc(p.text) + '</p>' + bar + '</div></article>';
    }

    return '<article class="card txt pop" data-post="' + p.id + '">' +
      '<div class="body">' + head +
      '<p class="up-text">' + esc(p.text) + '</p>' + bar + '</div></article>';
  }

  function isMine(p) { return !!(p && (p.mine || /^u/.test(p.id))); }

  function insertCard(p) {
    var feed = $('.feed');
    if (!feed) return null;
    var cols = feed.querySelectorAll('.col');
    var col = cols[0];
    if (cols.length > 1 && cols[1].getBoundingClientRect().height < cols[0].getBoundingClientRect().height) {
      col = cols[1];
    }
    var tmp = document.createElement('div');
    tmp.innerHTML = cardHTML(p);
    var card = tmp.firstElementChild;
    if (isMine(p)) {
      var del = document.createElement('button');
      del.className = 'up-del';
      del.setAttribute('data-udel', p.id);
      del.setAttribute('aria-label', '删除');
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      card.appendChild(del);
    }
    card.__images = (p.images || []).slice();
    col.insertBefore(card, col.firstChild);
    if (window.C74Cmt) window.C74Cmt.register(p);
    return card;
  }

  /* ---------------- 面板 ---------------- */
  var mask = document.createElement('div');
  mask.className = 'up-mask';
  mask.id = 'upMask';
  var sheet = document.createElement('section');
  sheet.className = 'up-sheet';
  sheet.id = 'upSheet';
  sheet.innerHTML =
    '<div class="up-in">' +
      '<header class="up-hd"><span class="k" id="upKicker">TEXT</span>' +
      '<b id="upTitle">上传文字</b>' +
      '<button class="x" id="upX" aria-label="关闭"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '</header>' +
      '<div class="up-body" id="upBody"></div>' +
      '<footer class="up-ft"><span class="up-count" id="upCount">0 / 200</span>' +
      '<button class="up-send" id="upSend" disabled>发 布</button></footer>' +
    '</div>';
  document.body.appendChild(mask);
  document.body.appendChild(sheet);

  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  var state = { mode: 'text', images: [], limit: 4, maxText: 200 };

  function tip(icon, text, warn) {
    return '<div class="up-tip' + (warn ? ' warn' : '') + '">' + icon + text + '</div>';
  }
  var I_INFO = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.4"/><path d="M12 7.8h.01"/></svg>';
  var I_PHOTO = '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2.4"/><circle cx="9" cy="10" r="1.8"/><path d="M4.5 16.5l5-4.6 4 3.4 2.6-2.2 3.4 3"/></svg>';

  function emoTray() {
    return '<div class="up-emo" id="upEmo">' + EMOJI.map(function (e) {
      return '<button type="button" data-emo="' + e + '">' + e + '</button>';
    }).join('') + '</div>';
  }

  function buildBody() {
    var body = $('#upBody');
    if (state.mode === 'text') {
      body.innerHTML =
        '<textarea class="up-ta" id="upTa" maxlength="200" placeholder="写点什么…课间、作业、球场、走廊上的光"></textarea>' +
        tip(I_INFO, '纯文字区：只支持文字和 emoji，不能带图片') +
        emoTray();
      state.maxText = 200;
    } else {
      body.innerHTML =
        '<div class="up-drop" id="upDrop">' + I_PHOTO +
          '<div>选择照片<small>TAP TO PICK · 最多 4 张</small></div></div>' +
        '<div class="up-thumbs" id="upThumbs"></div>' +
        '<textarea class="up-ta" id="upTa" maxlength="120" style="margin-top:10px;min-height:78px" ' +
          'placeholder="给照片写一句文案（必填）"></textarea>' +
        tip(I_INFO, '照片区：照片 + 文案，<b>没写文案不能发</b>', true) +
        emoTray();
      state.maxText = 120;
      renderThumbs();
      $('#upDrop').addEventListener('click', pick);
    }

    var ta = $('#upTa');
    ta.addEventListener('input', refresh);
    body.querySelectorAll('[data-emo]').forEach(function (b) {
      b.addEventListener('click', function () { insertEmo(b.dataset.emo); });
    });
    refresh();
  }

  function insertEmo(e) {
    var ta = $('#upTa');
    if (!ta) return;
    var s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
    var t = ta.selectionEnd == null ? ta.value.length : ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + e + ta.value.slice(t);
    var pos = s + e.length;
    try { ta.setSelectionRange(pos, pos); } catch (err) {}
    refresh();
    if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) ta.focus();
  }

  function renderThumbs() {
    var box = $('#upThumbs');
    if (!box) return;
    box.innerHTML = state.images.map(function (u, i) {
      return '<div class="up-th"><img src="' + u + '" alt="">' +
        '<span class="lbl">' + (i + 1) + '</span>' +
        '<b data-del="' + i + '">×</b></div>';
    }).join('');
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        state.images.splice(parseInt(b.dataset.del, 10), 1);
        renderThumbs();
        refresh();
      });
    });
  }

  function refresh() {
    var ta = $('#upTa');
    var txt = ta ? ta.value : '';
    var len = txt.length;
    var c = $('#upCount');
    if (c) {
      c.textContent = len + ' / ' + state.maxText;
      c.classList.toggle('hot', len > state.maxText - 20);
    }
    var s = $('#upSend');
    if (s) s.disabled = false;
  }

  /* ---------------- 图片处理 ---------------- */
  function pick() {
    fileInput.value = '';
    fileInput.click();
  }

  fileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInput.files || []);
    if (!files.length) return;
    var room = state.limit - state.images.length;
    if (room <= 0) { toast('最多 4 张照片'); return; }
    files = files.slice(0, room);
    var i = 0;
    var drop = $('#upDrop');
    if (drop) drop.style.opacity = '.5';
    (function next() {
      if (i >= files.length) {
        if (drop) drop.style.opacity = '';
        renderThumbs();
        refresh();
        return;
      }
      readFile(files[i]).then(shrink).then(function (url) {
        state.images.push(url);
        i++;
        next();
      }).catch(function () { i++; next(); });
    })();
  });

  function readFile(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  function shrink(url) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var max = 1000;
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var k = Math.min(1, max / Math.max(w, h));
        var cw = Math.round(w * k), ch = Math.round(h * k);
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var cx = cv.getContext('2d');
        cx.fillStyle = '#070c16';
        cx.fillRect(0, 0, cw, ch);
        cx.drawImage(img, 0, 0, cw, ch);
        var out = null;
        try { out = cv.toDataURL('image/jpeg', 0.78); } catch (e) {}
        res(out && out.length < url.length ? out : url);
      };
      img.onerror = function () { res(url); };
      img.src = url;
    });
  }

  /* ---------------- 打开 / 关闭 ---------------- */
  function open(mode) {
    if (locked() && !isAdmin()) { toast('班级已锁定，只有中管及以上能发布'); return; }
    state.mode = mode;
    state.images = [];
    $('#upKicker').textContent = mode === 'photo' ? 'PHOTO' : 'TEXT';
    $('#upTitle').textContent = mode === 'photo' ? '上传照片' : '上传文字';
    buildBody();
    mask.classList.add('on');
    sheet.classList.add('on');
  }
  function close() {
    mask.classList.remove('on');
    sheet.classList.remove('on');
    sheet.style.bottom = '';
    sheet.style.removeProperty('--upbody');
    state.images = [];
  }

  mask.addEventListener('click', close);
  $('#upX').addEventListener('click', close);

  /* 键盘弹起时把面板顶到键盘上方 */
  if (window.visualViewport) {
    var vv = window.visualViewport;
    var fit = function () {
      if (!sheet.classList.contains('on')) return;
      var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      sheet.style.bottom = kb + 'px';
      sheet.style.setProperty('--upbody', Math.max(110, vv.height - 214) + 'px');
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }

  /* ---------------- 发布 ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function afterInsert(post, msg) {
    var card = insertCard(post);
    close();
    toast(msg);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function publishLocal(post) {
    if (!data) { toast('数据没准备好，刷新一下'); return; }
    data.posts.unshift(post);
    var size = 0;
    try { size = JSON.stringify(data).length; } catch (e) {}
    if (size > 4e6) { data.posts.shift(); toast('本地空间满了，删几条老动态再发'); return; }
    C74.save(data);
    afterInsert(post, post.type === 'photo' ? '照片已发到班级空间' : '已发布');
  }

  $('#upSend').addEventListener('click', function () {
    var ta = $('#upTa');
    var txt = (ta ? ta.value : '').trim();
    if (!txt) { toast(state.mode === 'photo' ? '照片必须配一句文案' : '写点内容再发'); return; }
    if (state.mode === 'photo' && !state.images.length) { toast('先选一张照片'); return; }

    var d = new Date();
    var local = {
      id: 'u' + d.getTime().toString(36) + Math.random().toString(36).slice(2, 5),
      who: ME,
      text: txt,
      type: state.mode,
      images: state.mode === 'photo' ? state.images.slice() : [],
      date: d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()),
      at: pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
      no: 'IMG ' + ('00' + ((data ? data.posts.length : 0) + 1)).slice(-3),
      pinned: false, hidden: false, mine: true, comments: []
    };

    if (!window.C74 || !C74.online || !C74.online()) {
      publishLocal(local);
      return;
    }

    var btn = $('#upSend');
    btn.disabled = true; btn.textContent = '发 送 中';
    C74.api('/api/posts', {
      method: 'POST',
      body: { text: txt, type: state.mode, images: local.images }
    }).then(function (res) {
      btn.disabled = false; btn.textContent = '发 布';
      var p = res.post;
      p.mine = true;
      p.no = local.no;
      try { p.who_avatar = (C74.me() || {}).avatar || ''; } catch (e) {}
      if (data) { data.posts.unshift(p); C74.save(data); }
      afterInsert(p, p.type === 'photo' ? '照片已发到班级空间' : '已发布');
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = '发 布';
      toast('发送失败：' + (err.message || '网络异常'));
    });
  });

  /* 删自己的动态 */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-udel]');
    if (!b) return;
    var id = b.getAttribute('data-udel');
    if (data) {
      data.posts.forEach(function (p) { if (p.id === id) p.hidden = true; });
      C74.save(data);
    }
    var card = b.closest('.card');
    if (card) card.remove();
    toast('已删除');
    if (window.C74 && C74.online && C74.online()) {
      C74.api('/api/posts/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
        if (window.C74Undo) window.C74Undo.set({ type: 'post.delete', id: id });
      }).catch(function () {});
    }
  });

  /* ---------------- 入口 ---------------- */
  var textBtn = document.getElementById('textBtn');
  var photoBtn = document.getElementById('photoBtn');
  if (textBtn) textBtn.addEventListener('click', function () { open('text'); });
  if (photoBtn) photoBtn.addEventListener('click', function () { open('photo'); });

  /* ---------------- 刷新后还原已发的动态（仅离线） ---------------- */
  if (data && Array.isArray(data.posts) && !(window.C74 && C74.online && C74.online())) {
    var have = {};
    document.querySelectorAll('.card[data-post]').forEach(function (c) {
      have[c.getAttribute('data-post')] = 1;
    });
    var mine = data.posts.filter(function (p) { return !have[p.id]; });
    mine.slice().reverse().forEach(function (p) {
      if (p.hidden) return;
      insertCard(p);
    });
    /* 清理已失效（被管理端隐藏 / 数据里已不存在）的卡片，避免整列塌成 0 高 */
    document.querySelectorAll('.card[data-post]').forEach(function (c) {
      var st = inspectCard(c);
      if (st === 'orphan') { c.remove(); return; }
      if (st === 'hide') { c.hidden = true; return; }
      c.hidden = false;
    });
  }

  /* ---------------- 图片查看 / 下载 ---------------- */
  var bm = null, bimg = null;

  function ensureViewer() {
    if (bm) return;
    bm = document.createElement('div');
    bm.className = 'bv-mask';
    bm.innerHTML =
      '<div class="bv-top"><span id="bvCount">1 / 1</span>' +
        '<button class="bv-btn" id="bvSave"><svg viewBox="0 0 24 24"><path d="M12 4v10"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>保存</button>' +
        '<button class="bv-btn" id="bvClose"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '</div>' +
      '<div class="bv-stage"><img id="bvImg" alt=""></div>' +
      '<div class="bv-tip">长按图片也可以「存储到照片」</div>';
    document.body.appendChild(bm);
    bimg = bm.querySelector('#bvImg');

    bm.querySelector('#bvClose').addEventListener('click', function () { bm.classList.remove('on'); });
    bm.addEventListener('click', function (e) { if (e.target === bm) bm.classList.remove('on'); });
  }

  var bvList = [], bvIdx = 0;

  function showImage(list, idx) {
    ensureViewer();
    bvList = list || [];
    bvIdx = idx || 0;
    paintViewer();
    bm.classList.add('on');
  }

  function paintViewer() {
    if (!bvList.length) return;
    bimg.src = bvList[bvIdx];
    var c = bm.querySelector('#bvCount');
    if (c) c.textContent = (bvIdx + 1) + ' / ' + bvList.length;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.ph-open');
    if (!b) return;
    var card = b.closest('.card');
    var list = (card && card.__images) || [];
    if (!list.length) return;
    showImage(list, parseInt(b.getAttribute('data-img'), 10) || 0);
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#bvSave')) return;
    var src = bvList[bvIdx];
    if (!src) return;
    downloadImg(src, 'class7-' + Date.now() + '.jpg');
  });

  function downloadImg(dataUrl, name) {
    try {
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); }, 100);
      toast('已开始保存，长按图片也可存到相册');
    } catch (err) {
      toast('保存失败，长按图片试试');
    }
  }

  /* ---------------- 从服务器同步（在线模式） ---------------- */
  function syncServer() {
    if (!window.C74 || !C74.online || !C74.online()) return;
    C74.boot().then(function (d) {
      /* 公告：交给 manage.js 渲染，这样管理按钮还在 */
      if (window.C74Notices && Array.isArray(d.notices)) {
        window.C74NoticeTotal = d.accountTotal || (d.accounts || []).length;
        window.C74Notices.set(d.notices.map(function (n) {
          return {
            id: n.id, text: n.text, author: n.author,
            urgent: !!n.urgent, pinned: !!n.pinned,
            images: n.images || [], at: (n.at || '').slice(0, 16), reads: n.reads || 0
          };
        }));
      }
      /* 动态：以服务器为准，先清空再重绘 */
      document.querySelectorAll('.card[data-post]').forEach(function (c) { c.remove(); });
      var meNow = (C74.me && C74.me()) || null;
      (d.posts || []).slice().reverse().forEach(function (p) {
        p.mine = !!(meNow && meNow.id === p.who_id);
        insertCard(p);
      });

      /* 头像映射 */
      var map = {};
      (d.accounts || []).forEach(function (a) { if (a.avatar) map[a.id] = a.avatar; });
      window.C74Avatars = map;

      /* 封面统计跟随服务器 */
      var accs = d.accounts || [];
      var posts = d.posts || [];
      var setTxt = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
      setTxt('statMembers', accs.length);
      setTxt('statPosts', posts.length);
      setTxt('statPins', posts.filter(function (p) { return p.pinned; }).length);
      setTxt('feedCount', posts.length);
    }).catch(function () {});
  }
  syncServer();
})();
