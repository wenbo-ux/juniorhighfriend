/* =========================================================
   七年四班 · 行内管理 manage.js
   验证通过 → 回主站 → 按等级直接在界面上操作
   等级：junior 普通管理 / mid 中级管理 / high 高级管理
   ========================================================= */
(function () {
  'use strict';

  var data = window.C74 ? C74.load() : null;
  if (!data) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var session = {};
  try { session = JSON.parse(sessionStorage.getItem('c74_session') || '{}'); } catch (e) {}
  var adminSession = null;
  try { adminSession = JSON.parse(sessionStorage.getItem('c74_admin_session') || 'null'); } catch (e) {}

  function findMember() {
    if (!session || (!session.id && !session.name)) return null;
    return data.members.filter(function (m) {
      return m.id === session.id || m.name === session.name;
    })[0] || null;
  }
  var me = findMember();

  /* 登录的账号若只是普通成员，丢弃残留的管理态（换号登录常见） */
  (function () {
    var acc = null;
    try { acc = (window.C74 && C74.me) ? C74.me() : null; } catch (e) {}
    if (acc && acc.level === 'member' && adminSession) {
      adminSession = null;
      try { sessionStorage.removeItem('c74_admin_session'); } catch (e) {}
    }
  })();

  var level = 'none';
  if (adminSession && (adminSession.level === 'junior' || adminSession.level === 'mid' || adminSession.level === 'high')) {
    level = adminSession.level;
  } else if (me && me.role === 'junior') {
    level = 'junior';
  }
  /* 账号等级自动授权（登录时已写 admin_session，这里再兜底一次） */
  (function () {
    var acc = null;
    try { acc = (window.C74 && C74.me) ? C74.me() : null; } catch (e) {}
    if (level === 'none' && acc && acc.level && acc.level !== 'member') {
      level = acc.level;
      try {
        sessionStorage.setItem('c74_admin_session', JSON.stringify({
          level: acc.level, user: acc.name || acc.user, accountId: acc.id, at: Date.now()
        }));
      } catch (e) {}
    }
  })();

  var LV_NAME = { junior: '普通管理', mid: '中级管理', high: '高级管理' };
  var LV_SHORT = { junior: '普管', mid: '中管', high: '高管' };
  var rank = { none: 0, junior: 1, mid: 2, high: 3 };
  function can(atLeast) { return rank[level] >= rank[atLeast]; }
  function isBlocked() {
    return !!(me && (me.muted || me.banned)) || !!(session && (session.muted || session.banned));
  }

  function save() { C74.save(data); }
  function log(text) {
    data.logs.unshift({ at: C74.stamp(), who: (session.name || session.id || '—'), level: level, text: text });
    data.logs = data.logs.slice(0, 120);
    save();
  }
  function initial(n) { return C74.initial(n); }
  function esc(s) { return C74.esc(s); }

  /* ---------------- toast ---------------- */
  var mt = document.createElement('div');
  mt.className = 'm-toast';
  document.body.appendChild(mt);
  var mtTimer = null;
  function toast(msg) {
    mt.textContent = msg;
    mt.classList.add('on');
    clearTimeout(mtTimer);
    mtTimer = setTimeout(function () { mt.classList.remove('on'); }, 1900);
  }

  /* ---------------- 抽屉 ---------------- */
  var mask = document.createElement('div');
  mask.className = 'm-mask';
  var sheet = document.createElement('div');
  sheet.className = 'm-sheet';
  sheet.innerHTML = '<div class="m-in"><div class="m-hd"><div><b id="mTitle">管理</b><small id="mSub"></small></div>' +
    '<span class="sp"></span><button class="m-x" id="mClose" aria-label="关闭">' +
    '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
    '<div class="m-body" id="mBody"></div></div>';
  document.body.appendChild(mask);
  document.body.appendChild(sheet);
  var mTitle = $('#mTitle'), mSub = $('#mSub'), mBody = $('#mBody');

  function openSheet(title, sub, html) {
    mTitle.textContent = title;
    mSub.textContent = sub || '';
    mBody.innerHTML = html;
    mask.classList.add('on');
    sheet.classList.add('on');
  }
  var sheetClosedAt = 0;
  function closeSheet() {
    mask.classList.remove('on');
    sheet.classList.remove('on');
    mBody.innerHTML = '';
    sheetClosedAt = Date.now();   /* 面板刚关闭，短时间内忽略卡片上的点击 */
  }
  function ghostClick() { return Date.now() - sheetClosedAt < 700; }
  $('#mClose').addEventListener('click', closeSheet);
  mask.addEventListener('click', closeSheet);

  /* ---------------- 等级标识 ---------------- */
  function mountChip() {
    if (level === 'none') return;
    var right = document.querySelector('.nav .nav-side:last-child');
    if (!right || right.querySelector('.m-chip')) return;
    var chip = document.createElement('button');
    chip.className = 'm-chip' + (level === 'high' ? ' high' : level === 'junior' ? ' jr' : '');
    chip.innerHTML = '<i></i>' + LV_SHORT[level];

    /* 长按 = 打开管理菜单；短点不计菜单，10 秒内累计 11 次 → 高级密钥校验 */
    var taps = 0, tapTimer = null, pressTimer = null, longFired = false;

    chip.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    chip.addEventListener('pointerdown', function () {
      longFired = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        longFired = true;
        openAdminMenu();
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
      }, 520);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      chip.addEventListener(ev, function () { clearTimeout(pressTimer); });
    });

    chip.addEventListener('click', function () {
      if (longFired) { longFired = false; return; }
      if (level !== 'mid') return;
      taps++;
      clearTimeout(tapTimer);
      if (taps >= 11) {
        taps = 0;
        location.href = 'admin.html?gate=high';
        return;
      }
      tapTimer = setTimeout(function () { taps = 0; }, 10000);
    });
    right.insertBefore(chip, right.firstChild);
  }

  /* ---------------- 公告 ---------------- */
  /* 发布一条公告（置顶会挤掉旧的置顶） */
  function publishNotice(o) {
    if (window.C74 && C74.online && C74.online() && C74.api) {
      C74.api('/api/notices', {
        method: 'POST',
        body: { text: o.text, urgent: !!o.urgent, pinned: true, images: o.images || [] }
      }).catch(function () {});
    }
    data.notices.forEach(function (x) { x.pinned = false; });
    data.notices.unshift({
      id: C74.uid('n_'), text: o.text, author: o.author,
      urgent: !!o.urgent, pinned: true, images: (o.images || []).slice(0, 3), at: C74.stamp()
    });
  }

  function renderNotices() {
    var feed = document.getElementById('noticeFeed');
    if (!feed) return;
    var list = data.notices.slice().sort(function (a, b) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    }).slice(0, 3);
    if (!list.length) { feed.innerHTML = ''; return; }
    feed.innerHTML = list.map(function (n) {
      var text = esc(n.text).replace(/\n/g, '<br>');
      var acts = '';
      if (level !== 'none') {
        acts = '<div class="adm-bar">';
        if (can('mid')) acts += '<button class="adm-act' + (n.pinned ? ' on' : '') + '" data-nact="pin" data-nid="' + n.id + '">' + (n.pinned ? '取消置顶' : '置顶') + '</button>';
        acts += '<button class="adm-act danger" data-nact="del" data-nid="' + n.id + '">删除</button></div>';
      }
      return '<article class="card notice fade" data-nid="' + n.id + '">' +
        '<div class="n-head"><span class="n-tag">' + (n.urgent ? '重要' : '公示') + '</span>' +
        (n.pinned ? '<span class="n-pin">PINNED · ' + esc(n.author) + '</span>' : '') + '</div>' +
        '<div class="n-body"><div class="n-who">' + esc(n.author) + '</div>' +
        '<p class="n-text">' + text + '</p>' +
        ((n.images && n.images.length)
          ? '<div class="n-imgs' + (n.images.length > 1 ? ' multi' : '') + '">' +
            n.images.slice(0, 3).map(function (u, i) {
              return '<img src="' + u + '" alt="图片' + (i + 1) + '">';
            }).join('') + '</div>'
          : '') +
        (n.urgent ? '<span class="n-warn">重 要 ！ ！ ！</span>' : '') + acts + '</div>' +
        '<div class="n-foot"><span class="ok">已读 38 / 42</span><span>· ' + (n.pinned ? '置顶' : '公告') + '</span></div>' +
        '</article>';
    }).join('');
  }

  /* 供在线同步层写入服务器公告 */
  window.C74Notices = {
    set: function (list) {
      if (!Array.isArray(list)) return;
      data.notices = list.slice();
      renderNotices();
    }
  };

  $('#noticeFeed') && $('#noticeFeed').addEventListener('click', function (e) {
    var b = e.target.closest('[data-nact]');
    if (!b) return;
    if (ghostClick()) return;   /* 防止发布后面板底的点击落到"删除"上 */
    var n = data.notices.filter(function (x) { return x.id === b.dataset.nid; })[0];
    if (!n) return;
    if (b.dataset.nact === 'pin') {
      if (!can('mid')) { toast('普通管理不能置顶'); return; }
      var want = !n.pinned;
      var apply = function () {
        n.pinned = want;
        if (want) data.notices.forEach(function (o) { if (o !== n) o.pinned = false; });
        log((want ? '置顶公告：' : '取消置顶：') + n.text.slice(0, 14));
        renderNotices();
        toast(want ? '已置顶' : '已取消置顶');
      };
      if (window.C74 && C74.online && C74.online()) {
        C74.api('/api/notices/' + encodeURIComponent(n.id) + '/pin', { method: 'POST', body: { pinned: want } })
          .then(function () { apply(); C74.refreshBoot && C74.refreshBoot(); })
          .catch(function (err) { toast(err.message || '操作失败'); });
      } else { apply(); save(); }
    } else {
      if (level === 'none') return;
      var drop = function () {
        data.notices = data.notices.filter(function (x) { return x !== n; });
        log('删除公告：' + n.text.slice(0, 14));
        renderNotices();
        toast('公告已删除');
      };
      if (window.C74 && C74.online && C74.online()) {
        C74.api('/api/notices/' + encodeURIComponent(n.id), { method: 'DELETE' })
          .then(function () { drop(); C74.refreshBoot && C74.refreshBoot(); })
          .catch(function (err) { toast(err.message || '删除失败'); });
      } else { drop(); save(); }
    }
  });

  /* ---------------- 动态上的管理按钮 ---------------- */
  function postBar(card, p) {
    var bar = card.querySelector('.bar');
    if (!bar || bar.querySelector('.adm-bar') || level === 'none') return;
    var box = document.createElement('div');
    box.className = 'adm-bar';
    if (can('mid')) {
      var pin = document.createElement('button');
      pin.className = 'adm-act' + (p.pinned ? ' on' : '');
      pin.dataset.pact = 'pin';
      pin.textContent = p.pinned ? '取消置顶' : '置顶';
      box.appendChild(pin);
    }
    var del = document.createElement('button');
    del.className = 'adm-act danger';
    del.dataset.pact = 'del';
    del.textContent = '删除';
    box.appendChild(del);
    bar.appendChild(box);
  }

  function pinFlag(card, on) {
    var f = card.querySelector('.pin-flag');
    if (on && !f) {
      var s = document.createElement('span');
      s.className = 'pin-flag';
      s.textContent = '置顶';
      card.appendChild(s);
    } else if (!on && f) {
      f.remove();
    }
    card.classList.toggle('pinned', !!on);
  }

  function decoratePosts() {
    $$('.card[data-post]').forEach(function (card) {
      var id = card.getAttribute('data-post');
      var p = data.posts.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      if (p.hidden) { card.hidden = true; return; }
      card.hidden = false;
      pinFlag(card, p.pinned);
      postBar(card, p);
    });
  }

  document.querySelector('.feed') && document.querySelector('.feed').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pact]');
    if (!b) return;
    if (ghostClick()) return;
    var card = b.closest('[data-post]');
    if (!card) return;
    var p = data.posts.filter(function (x) { return x.id === card.getAttribute('data-post'); })[0];
    if (!p) return;
    if (b.dataset.pact === 'pin') {
      if (!can('mid')) { toast('普通管理不能置顶'); return; }
      var wantP = !p.pinned;
      var applyP = function () {
        p.pinned = wantP;
        if (wantP) data.posts.forEach(function (o) { if (o !== p) o.pinned = false; });
        log((wantP ? '置顶动态：' : '取消置顶：') + p.who);
        decoratePosts();
        toast(wantP ? '已置顶到首页' : '已取消置顶');
      };
      if (window.C74 && C74.online && C74.online()) {
        C74.api('/api/posts/' + encodeURIComponent(p.id) + '/pin', { method: 'POST', body: { pinned: wantP } })
          .then(function () { applyP(); C74.refreshBoot && C74.refreshBoot(); })
          .catch(function (err) { toast(err.message || '操作失败'); });
      } else { applyP(); save(); }
    } else {
      var dropP = function () {
        p.hidden = true; p.pinned = false;
        log('删除动态：' + p.who + ' · ' + p.text.slice(0, 12));
        decoratePosts();
        toast('消息已删除');
      };
      if (window.C74 && C74.online && C74.online()) {
        C74.api('/api/posts/' + encodeURIComponent(p.id), { method: 'DELETE' })
          .then(function () {
            dropP();
            if (window.C74Undo) C74Undo.set({ type: 'post.delete', id: p.id });
            C74.refreshBoot && C74.refreshBoot();
          })
          .catch(function (err) { toast(err.message || '删除失败'); });
      } else { dropP(); save(); }
    }
  });

  /* ---------------- 成员 ---------------- */
  function roleLabel(m) {
    if (m.role === 'junior') return { t: '普管', c: 'jr' };
    if (m.role === 'mid') return { t: '中管', c: 'hi' };
    if (m.role === 'high') return { t: '高管', c: 'hi' };
    if (m.role === 'teacher') return { t: '老师', c: '' };
    return { t: '成员', c: '' };
  }

  var accountList = [];

  function levelBadge(lv) {
    if (lv === 'high') return { t: '高管', c: 'lv-high' };
    if (lv === 'mid') return { t: '中管', c: 'lv-mid' };
    if (lv === 'junior') return { t: '普管', c: 'lv-junior' };
    if (lv === 'teacher') return { t: '老师', c: 'lv-teacher' };
    return { t: '普通成员', c: 'lv-member' };
  }

  function memberRows() {
    /* 只认服务器上的账号，不再掺本地名册 */
    return accountList.map(function (a) {
      return {
        id: a.id, accountId: a.id, user: a.user,
        name: a.name || a.user, level: a.level, account: true,
        muted: a.muted, banned: a.banned
      };
    });
  }

  function openMembers() {
    var draw = function () {
      var rows = memberRows();
      if (!rows.length) {
        openSheet('成员名单', '0 人', '<div class="m-empty">暂无成员，等大家用注册码加入</div>');
        return;
      }
      var html = rows.map(function (r) {
        var b = levelBadge(r.level);
        return '<button class="m-row" data-mid="' + esc(r.id) + '">' +
          '<span class="av">' + esc(initial(r.name)) + '</span>' +
          '<span class="mi"><b>' + esc(r.name) +
            '<span class="lv ' + b.c + '">' + b.t + '</span></b>' +
            '<span>' + esc(r.user || r.id) + '</span></span>' +
          (r.muted ? '<span class="m-tag mute">禁言</span>' : '') +
          (r.banned ? '<span class="m-tag mute">封禁</span>' : '') +
          '</button>';
      }).join('');
      openSheet('成员名单', rows.length + ' 人 · 点击查看', html);
    };

    if (window.C74 && C74.online && C74.online()) {
      C74.boot().then(function (d) {
        accountList = d.accounts || [];
        draw();
      }).catch(draw);
    } else {
      draw();
    }
  }

  /* 账户详情：资料 / 禁言 / 封禁 / 删除 / 权限 / 重置密码 */
  function openAccountAdmin(id) {
    var a = accountList.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var b = levelBadge(a.level);
    var self = ((C74.me && C74.me()) || {}).id === a.id;
    var isHigh = a.level === 'high';

    var html = '<div class="m-row" style="border:0;padding-top:0">' +
      '<span class="av">' + esc(initial(a.name || a.user)) + '</span>' +
      '<span class="mi"><b>' + esc(a.name || a.user) +
      '<span class="lv ' + b.c + '">' + b.t + '</span></b>' +
      '<span>' + esc(a.user) + (a.muted ? ' · 已禁言' : '') + (a.banned ? ' · 已封禁' : '') + '</span></span></div>';

    if (self) {
      html += '<p class="m-note">这是你自己的账号。改昵称/密码在底部「我的」里操作。</p>';
      openSheet(a.name || a.user, a.user + ' · ' + b.t, html);
      return;
    }
    if (isHigh) {
      html += '<p class="m-note">高管账号之间不能互相调整，避免误操作把根权限改掉。</p>';
      openSheet(a.name || a.user, a.user + ' · ' + b.t, html);
      return;
    }

    var canMid = can('mid'), canHigh = level === 'high';

    if (canMid) {
      html += '<div class="m-sec"><div class="m-sec-h">资料</div>' +
        '<div class="m-field"><div class="inp"><input id="acName2" maxlength="16" value="' + esc(a.name || a.user) + '"></div></div>' +
        '<div class="m-act-row"><button class="m-btn" data-aact="rename">保存昵称</button></div></div>';
    }

    html += '<div class="m-sec"><div class="m-sec-h">处置</div><div class="m-act-row">' +
      '<button class="m-btn" data-aact="' + (a.muted ? 'unmute' : 'mute') + '">' + (a.muted ? '解除禁言' : '禁言') + '</button>' +
      (canHigh ? '<button class="m-btn danger" data-aact="' + (a.banned ? 'unban' : 'ban') + '">' + (a.banned ? '解除封禁' : '封禁') + '</button>' : '') +
      '<button class="m-btn danger" data-aact="del">删除账户</button></div></div>';

    if (canHigh) {
      html += '<div class="m-sec"><div class="m-sec-h">授予权限</div><div class="m-act-row">' +
        '<button class="m-btn" data-alv="junior">普通管理</button>' +
        '<button class="m-btn" data-alv="mid">中级管理</button>' +
        '<button class="m-btn" data-alv="member">普通成员</button></div>' +
        '<p class="m-note">高管权限只能由本人账号持有，这里不能授予。</p></div>' +
        '<div class="m-sec"><div class="m-sec-h">重置密码</div>' +
        '<div class="m-field"><div class="inp"><input id="arPass" placeholder="新密码，至少 4 位"></div></div>' +
        '<div class="m-act-row"><button class="m-btn danger" data-aact="reset">重置并踢下线</button></div></div>';
    }

    openSheet(a.name || a.user, a.user + ' · ' + b.t, html);

    function call(action, extra) {
      var body = Object.assign({}, extra || {});
      return C74.api('/api/accounts/' + encodeURIComponent(a.id) + '/' + action, { method: 'POST', body: body });
    }

    mBody.querySelectorAll('[data-alv]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lv = btn.getAttribute('data-alv');
        var prevLv = a.level;
        call('level', { level: lv }).then(function () {
          setUndo({ type: 'acc.level', id: a.id, prev: prevLv });
          a.level = lv;
          toast('已设为' + levelBadge(lv).t);
          C74.refreshBoot && C74.refreshBoot();
          closeSheet(); openMembers();
        }).catch(function (e) { toast(e.message || '操作失败'); });
      });
    });

    mBody.querySelectorAll('[data-aact]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-aact');
        if (act === 'rename') {
          var nm = ($('#acName2').value || '').trim();
          if (nm.length < 2) { toast('名字至少 2 个字'); return; }
          call('admin', { action: 'rename', name: nm }).then(function () {
            toast('昵称已改');
            C74.refreshBoot && C74.refreshBoot();
            closeSheet(); openMembers();
          }).catch(function (e) { toast(e.message || '失败'); });
          return;
        }
        if (act === 'reset') {
          var p = ($('#arPass').value || '').trim();
          if (p.length < 4) { toast('至少 4 位'); return; }
          call('reset', { pass: p }).then(function () { toast('密码已重置，对方需重新登录'); closeSheet(); })
            .catch(function (e) { toast(e.message || '失败'); });
          return;
        }
        if (act === 'del') {
          if (!confirm('确定删除「' + (a.name || a.user) + '」的账户？该账号将无法再登录。')) return;
          C74.api('/api/accounts/' + encodeURIComponent(a.id), { method: 'DELETE' })
            .then(function () {
              setUndo({ type: 'acc.delete', id: a.id });
              toast('账户已删除，可点左上角撤销');
              C74.refreshBoot && C74.refreshBoot();
              closeSheet(); openMembers();
            }).catch(function (e) { toast(e.message || '失败'); });
          return;
        }
        call('admin', { action: act }).then(function (r) {
          if (act === 'mute') { a.muted = 1; setUndo({ type: 'acc.mute', id: a.id, prev: 0 }); }
          if (act === 'unmute') { a.muted = 0; setUndo({ type: 'acc.mute', id: a.id, prev: 1 }); }
          if (act === 'ban') { a.banned = 1; setUndo({ type: 'acc.ban', id: a.id, prev: 0 }); }
          if (act === 'unban') { a.banned = 0; setUndo({ type: 'acc.ban', id: a.id, prev: 1 }); }
          toast({ mute: '已禁言', unmute: '已解除禁言', ban: '已封禁', unban: '已解除封禁' }[act] || '已完成');
          C74.refreshBoot && C74.refreshBoot();
          closeSheet(); openMembers();
        }).catch(function (e) { toast(e.message || '失败'); });
      });
    });
  }

  $('#mBody') && $('#mBody').addEventListener('click', function (e) {
    var row = e.target.closest('[data-mid]');
    if (!row) return;
    var id = row.getAttribute('data-mid');
    if (accountList.some(function (x) { return x.id === id; })) { openAccountAdmin(id); return; }
    openMember(id);
  });

  function openMember(id) {
    var m = data.members.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var r = roleLabel(m);
    var html = '<div class="m-row" style="border:0;padding-top:0">' +
      '<span class="av ' + r.c + '">' + esc(initial(m.name)) + '</span>' +
      '<span class="mi"><b>' + esc(m.name) + '</b><span>' + esc(m.id) + ' · ' + r.t +
      (m.muted ? ' · 已禁言' : '') + (m.banned ? ' · 已封禁' : '') + '</span></span></div>';

    if (can('mid')) {
      html += '<div class="m-field"><label>昵称 <span>NAME</span></label>' +
        '<div class="inp"><input id="mmName" maxlength="12" value="' + esc(m.name) + '"></div></div>' +
        '<div class="m-field"><label>学号 <span>ID</span></label>' +
        '<div class="inp"><input id="mmId" maxlength="12" value="' + esc(m.id) + '"></div></div>' +
        '<div class="m-act-row"><button class="m-btn solid" data-mact="save">保存修改</button></div>';
    } else if (level === 'junior') {
      html += '<p class="m-note">普通管理可以删除成员、禁言，但不能修改成员资料。</p>';
    }

    if (level !== 'none') {
      html += '<div class="m-sec"><div class="m-sec-h">操作</div><div class="m-act-row">' +
        '<button class="m-btn" data-mact="mute">' + (m.muted ? '解除禁言' : '禁言') + '</button>' +
        (can('mid') ? '<button class="m-btn" data-mact="junior">' + (m.role === 'junior' ? '撤销普通管理' : '设为普通管理') + '</button>' : '') +
        (level === 'high' ? '<button class="m-btn danger" data-mact="ban">' + (m.banned ? '解除封禁' : '封禁成员') + '</button>' : '') +
        '<button class="m-btn danger" data-mact="del">删除成员</button>' +
        '</div></div>';
    }
    openSheet(m.name, m.id + ' · ' + r.t, html);

    mBody.querySelectorAll('[data-mact]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.mact;
        if (act === 'save') {
          if (!can('mid')) return;
          var name = ($('#mmName').value || '').trim();
          var sid = ($('#mmId').value || '').trim().toUpperCase();
          if (name.length < 1) { toast('昵称不能为空'); return; }
          if (!/^[A-Z0-9-]{3,12}$/.test(sid)) { toast('学号格式：字母数字 3–12 位'); return; }
          if (data.members.some(function (x) { return x.id === sid && x !== m; })) { toast('学号已被占用'); return; }
          var old = m.name;
          m.name = name; m.id = sid;
          save(); log('修改成员：' + old + ' → ' + name + '（' + sid + '）');
          renderNotices(); toast('资料已更新'); openMember(sid);
        } else if (act === 'mute') {
          if (level === 'none') return;
          m.muted = !m.muted;
          save(); log((m.muted ? '禁言 ' : '解除禁言 ') + m.name);
          toast(m.muted ? '已禁言 ' + m.name : '已解除禁言');
          openMember(m.id);
        } else if (act === 'ban') {
          if (level !== 'high') { toast('仅高级管理可封禁'); return; }
          m.banned = !m.banned;
          save(); log((m.banned ? '封禁 ' : '解除封禁 ') + m.name);
          toast(m.banned ? '已封禁 ' + m.name : '已解除封禁');
          openMember(m.id);
        } else if (act === 'junior') {
          if (!can('mid')) return;
          m.role = m.role === 'junior' ? 'member' : 'junior';
          save(); log((m.role === 'junior' ? '任命普通管理：' : '撤销普通管理：') + m.name);
          toast(m.role === 'junior' ? '已任命 ' + m.name + ' 为普通管理' : '已撤销');
          openMember(m.id);
        } else if (act === 'del') {
          data.members = data.members.filter(function (x) { return x !== m; });
          save(); log('删除成员：' + m.name + '（' + m.id + '）');
          toast('已删除 ' + m.name);
          openMembers();
        }
      });
    });
  }

  /* ---------------- 发布公告 ---------------- */
  function openCompose() {
    if (!can('mid')) { toast('只有中级及以上可以发公告'); return; }
    openSheet('发布公告', 'MID / HIGH · PUBLIC NOTICE',
      '<div class="m-field"><label>内容 <span>NOTICE</span></label>' +
      '<textarea id="mcText" maxlength="160" placeholder="写点什么，全班都会看到……"></textarea></div>' +
      '<div class="m-pills">' +
      '<button class="m-pill" id="mcPin" aria-pressed="true">置顶</button>' +
      '<button class="m-pill" id="mcUrgent" aria-pressed="false">重要</button></div>' +
      '<div class="m-act-row"><button class="m-btn solid" id="mcSend">发 布</button></div>' +
      '<p class="m-note">发布后会出现在首页公告位；置顶会挤掉当前置顶。</p>');

    $('#mcPin').addEventListener('click', function () {
      this.setAttribute('aria-pressed', this.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    });
    $('#mcUrgent').addEventListener('click', function () {
      this.setAttribute('aria-pressed', this.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    });
    $('#mcSend').addEventListener('click', function () {
      var text = ($('#mcText').value || '').trim();
      if (text.length < 2) { toast('至少写两个字'); return; }
      var pinned = $('#mcPin').getAttribute('aria-pressed') === 'true';
      var payload = {
        text: text, urgent: $('#mcUrgent').getAttribute('aria-pressed') === 'true', pinned: pinned
      };
      if (window.C74 && C74.online && C74.online()) {
        C74.api('/api/notices', { method: 'POST', body: payload }).then(function (res) {
          var n = res.notice || {};
          data.notices.unshift({
            id: n.id || C74.uid('n_'), text: text, author: session.name || '管理员',
            urgent: !!payload.urgent, pinned: pinned, images: [], at: C74.stamp()
          });
          if (pinned) data.notices.forEach(function (o) { o.pinned = false; });
          log('发布公告：' + text.slice(0, 16));
          renderNotices(); closeSheet(); toast('公告已发布');
          if (C74.refreshBoot) C74.refreshBoot();
          /* 以服务器为准刷新一次 */
          C74.refreshBoot().then(function (fresh) {
            if (window.C74Notices && fresh && Array.isArray(fresh.notices)) {
              window.C74Notices.set(fresh.notices.map(function (x) {
                return {
                  id: x.id, text: x.text, author: x.author, urgent: !!x.urgent,
                  pinned: !!x.pinned, images: x.images || [], at: (x.at || '').slice(0, 16)
                };
              }));
            }
          }).catch(function () {});
        }).catch(function (err) {
          toast('发布失败：' + (err.message || '网络异常'));
        });
      } else {
        save(); log('发布公告：' + text.slice(0, 16));
        renderNotices(); closeSheet(); toast('公告已发布');
      }
    });
  }

  /* ---------------- 管理菜单 ---------------- */
  function openAdminMenu() {
    var pending = data.requests.filter(function (r) { return r.status === 'pending'; }).length;
    var html = '<div class="m-row" style="border:0;padding-top:0">' +
      '<span class="av hi">' + esc(initial(session.name || '管')) + '</span>' +
      '<span class="mi"><b>' + esc(session.name || '管理员') + '</b><span>' + LV_NAME[level] + ' · 已授权</span></span></div>';

    if (can('junior')) {
      html += menuRow('review', '审核申请', pending ? pending + ' 条待处理' : '暂无待处理') +
        menuRow('members', '成员管理', '禁言 / 删除 / 任命') +
        (can('mid') ? menuRow('compose', '发布公告', '公开发布 / 置顶') : '') +
        (level === 'high' ? menuRow('highset', '高管设置', '密钥 / 清空区域') : '') +
        '<div class="m-sec"><div class="m-sec-h">Session</div>' +
        '<div class="m-act-row"><button class="m-btn danger" id="mExit">退出管理</button></div></div>';
    } else {
      html += '<div class="m-empty">你还没有管理权限</div>';
    }
    openSheet('管理中心', LV_NAME[level] + ' · 行内权限', html);

    mBody.querySelectorAll('[data-menu]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.menu;
        if (k === 'review') openReviews();
        else if (k === 'members') openMembers();
        else if (k === 'compose') openCompose();
        else if (k === 'highset') openHighSettings();
      });
    });
    var ex = $('#mExit');
    if (ex) ex.addEventListener('click', function () {
      try { sessionStorage.removeItem('c74_admin_session'); } catch (e) {}
      closeSheet();
      toast('已退出管理');
      location.reload();
    });
  }
  function menuRow(k, title, sub) {
    return '<button class="m-row" data-menu="' + k + '">' +
      '<span class="mi"><b>' + title + '</b><span>' + sub + '</span></span>' +
      '<span class="m-tag">›</span></button>';
  }

  /* ---------------- 审核 ---------------- */
  function openReviews() {
    var list = data.requests.filter(function (r) { return r.status === 'pending'; });
    var html = list.length ? list.map(function (r) {
      return '<div class="m-sec" data-rid="' + r.id + '">' +
        '<div class="m-sec-h">' + esc(r.by) + ' · ' + esc(r.type) + ' · ' + esc(r.at) + '</div>' +
        '<p style="margin:0 0 8px;font-size:12.5px;line-height:1.7;color:#cfdcef">' + esc(r.text) + '</p>' +
        '<div class="m-act-row"><button class="m-btn" data-r="no">驳回</button>' +
        '<button class="m-btn solid" data-r="ok">通过并发布</button></div></div>';
    }).join('') : '<div class="m-empty">没有待审核的申请</div>';
    openSheet('审核申请', 'JUNIOR / MID / HIGH', html);

    mBody.querySelectorAll('[data-r]').forEach(function (b) {
      b.addEventListener('click', function () {
        var box = b.closest('[data-rid]');
        var r = data.requests.filter(function (x) { return x.id === box.dataset.rid; })[0];
        if (!r) return;
        if (b.dataset.r === 'no') {
          r.status = 'no';
          save(); log('驳回申请：' + r.by + ' · ' + r.text.slice(0, 12));
          toast('已驳回'); openReviews();
          return;
        }
        r.status = 'ok';
        publishNotice({ text: r.text, author: r.by, urgent: r.type === '寻人启事', images: r.images || [] });
        save(); log('通过申请并发布：' + r.by + ' · ' + r.text.slice(0, 12));
        renderNotices(); toast('已通过并发布'); openReviews();
      });
    });
  }

  /* ---------------- 申请 ---------------- */
  var reqImgs = [];
  var reqPicker = null;

  function shrinkImg(url) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var max = 1000;
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        var cx = cv.getContext('2d');
        cx.fillStyle = '#070c16'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        var out = null;
        try { out = cv.toDataURL('image/jpeg', .78); } catch (e) {}
        res(out && out.length < url.length ? out : url);
      };
      img.onerror = function () { res(url); };
      img.src = url;
    });
  }

  function ensureReqPicker() {
    if (reqPicker) return reqPicker;
    reqPicker = document.createElement('input');
    reqPicker.type = 'file';
    reqPicker.accept = 'image/*';
    reqPicker.multiple = true;
    reqPicker.style.display = 'none';
    document.body.appendChild(reqPicker);
    reqPicker.addEventListener('change', function () {
      var room = 3 - reqImgs.length;
      var files = Array.prototype.slice.call(reqPicker.files || []).slice(0, Math.max(0, room));
      if (!files.length) return;
      var i = 0;
      (function next() {
        if (i >= files.length) { renderReqThumbs(); return; }
        var fr = new FileReader();
        fr.onload = function () {
          shrinkImg(fr.result).then(function (u) { reqImgs.push(u); next(); });
        };
        fr.onerror = function () { next(); };
        fr.readAsDataURL(files[i++]);
      })();
    });
    return reqPicker;
  }

  function renderReqThumbs() {
    var box = $('#mrThumbs');
    if (!box) return;
    box.innerHTML = reqImgs.map(function (u, i) {
      return '<span class="mr-th"><img src="' + u + '" alt="">' +
        '<b data-rdel="' + i + '">×</b></span>';
    }).join('');
    $$('#mrThumbs [data-rdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        reqImgs.splice(parseInt(b.getAttribute('data-rdel'), 10), 1);
        renderReqThumbs();
      });
    });
    var c = $('#mrCount');
    if (c) c.textContent = reqImgs.length ? reqImgs.length + ' / 3 张' : '未选择';
  }

  function openRequest() {
    if (isBlocked()) { toast('你已被限制，暂时不能申请'); return; }
    reqImgs = [];
    var mine = data.requests.filter(function (r) { return r.by === (session.name || session.id); }).slice(0, 3);
    var html = '<div class="m-field"><label>申请类型 <span>TYPE</span></label>' +
      '<div class="m-pills" id="mrType">' +
      '<button class="m-pill" data-t="公告" aria-pressed="true">发公告</button>' +
      '<button class="m-pill" data-t="置顶消息" aria-pressed="false">置顶消息</button>' +
      '<button class="m-pill" data-t="寻人启事" aria-pressed="false">寻人启事</button></div></div>' +
      '<div class="m-field"><label>内容 <span>REQUEST</span></label>' +
      '<textarea id="mrText" maxlength="160" placeholder="写清楚要发什么、为什么置顶……"></textarea></div>' +
      '<div class="m-field" id="mrPhoto" hidden><label>照片 <span>PHOTO · 最多 3 张</span></label>' +
      '<div class="m-act-row"><button class="m-btn" id="mrPick" type="button">选择照片</button>' +
      '<span class="m-note" id="mrCount" style="margin:0;align-self:center">未选择</span></div>' +
      '<div class="mr-thumbs" id="mrThumbs"></div></div>' +
      '<div class="m-act-row"><button class="m-btn solid" id="mrSend">提交申请</button></div>' +
      '<p class="m-note" id="mrHint">有审核权限的账号（普通管理及以上）提交后会直接发布，不用再审自己。</p>';

    if (mine.length) {
      html += '<div class="m-sec"><div class="m-sec-h">我的申请</div>' + mine.map(function (r) {
        return '<div class="m-row" style="cursor:default"><span class="mi"><b>' + esc(r.type) + '</b>' +
          '<span>' + esc(r.text.slice(0, 30)) + '</span></span>' +
          '<span class="m-tag">' + (r.status === 'pending' ? '待审' : r.status === 'ok' ? '已发布' : '已驳回') + '</span></div>';
      }).join('') + '</div>';
    }
    openSheet('申请', can('junior') ? '你负责审核 · 发布即生效' : '提交给普通管理审核', html);

    var type = '公告';
    var photoField = $('#mrPhoto');
    if (can('junior')) {
      var hint = $('#mrHint');
      if (hint) hint.textContent = '你本身有审核权限，提交后直接发布。';
    }

    mBody.querySelectorAll('#mrType .m-pill').forEach(function (p) {
      p.addEventListener('click', function () {
        mBody.querySelectorAll('#mrType .m-pill').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        p.setAttribute('aria-pressed', 'true');
        type = p.getAttribute('data-t');
        if (photoField) photoField.hidden = (type !== '寻人启事');
      });
    });

    $('#mrPick') && $('#mrPick').addEventListener('click', function () {
      var p = ensureReqPicker();
      p.value = '';
      p.click();
    });

    $('#mrSend').addEventListener('click', function () {
      var text = ($('#mrText').value || '').trim();
      if (text.length < 2) { toast('至少写两个字'); return; }
      var imgs = type === '寻人启事' ? reqImgs.slice() : [];
      var by = session.name || session.id || '同学';
      var auto = can('junior');

      data.requests.unshift({
        id: C74.uid('r_'), type: type, text: text, images: imgs,
        by: by, at: C74.stamp(), status: auto ? 'ok' : 'pending'
      });

      if (auto) {
        publishNotice({ text: text, author: by, urgent: type === '寻人启事', images: imgs });
        save();
        log('发布' + type + '：' + text.slice(0, 12));
        renderNotices();
        decoratePosts();
        closeSheet();
        toast((LV_SHORT[level] || LV_NAME[level]) + '权限：已直接发布');
      } else {
        save();
        log('提交申请：' + type);
        closeSheet();
        toast('申请已提交，等待审核');
      }
    });
  }

  /* ---------------- 高级操作 ---------------- */
  function openHighSettings() {
    if (level !== 'high') { toast('仅高级管理可进入'); return; }
    var k = data.keys;
    openSheet('高管设置', 'ROOT · 密钥与区域',
      '<div class="m-sec"><div class="m-sec-h">修改中级密钥</div>' +
      '<div class="m-field"><label>旧密钥 <span>OLD KEY</span></label><div class="inp"><input id="omKey" maxlength="6" inputmode="numeric" placeholder="先输入旧密钥"></div></div>' +
      '<div class="m-field"><label>新密钥 <span>NEW KEY</span></label><div class="inp"><input id="nmKey" maxlength="6" inputmode="numeric" placeholder="4–6 位数字"></div></div></div>' +
      '<div class="m-sec"><div class="m-sec-h">修改高级密钥</div>' +
      '<div class="m-field"><label>旧密钥 <span>OLD KEY</span></label><div class="inp"><input id="ohKey" maxlength="6" inputmode="numeric" placeholder="先输入旧密钥"></div></div>' +
      '<div class="m-field"><label>新密钥 <span>NEW KEY</span></label><div class="inp"><input id="nhKey" maxlength="6" inputmode="numeric" placeholder="4–6 位数字"></div></div></div>' +
      '<div class="m-act-row"><button class="m-btn solid" id="hsSave">保存密钥</button></div>' +
      '<div class="m-sec"><div class="m-sec-h">危险操作</div>' +
      '<p class="m-note" style="margin-top:0">清空区域内所有公告和动态，成员与密钥保留。</p>' +
      '<div class="m-act-row"><button class="m-btn danger" id="hsPurge">清空区域内所有消息</button></div>' +
      '<div id="hsConfirm" style="display:none;margin-top:10px">' +
      '<p class="m-note" style="color:#ff9bb0">确定要清空吗？此操作不可撤销。</p>' +
      '<div class="m-act-row"><button class="m-btn" id="hsCancel">取消</button>' +
      '<button class="m-btn danger" id="hsYes">确认清空</button></div></div></div>' +
      '<p class="m-note">密钥只保存在本机；接后端后由服务端校验并存哈希。</p>');

    $('#hsSave').addEventListener('click', function () {
      var om = ($('#omKey').value || '').trim(), nm = ($('#nmKey').value || '').trim();
      var oh = ($('#ohKey').value || '').trim(), nh = ($('#nhKey').value || '').trim();
      if (!om || !oh) { toast('请先输入两个旧密钥'); return; }
      if (om !== data.keys.mid.key) { toast('中级旧密钥不正确'); return; }
      if (oh !== data.keys.high.key) { toast('高级旧密钥不正确'); return; }
      if (!/^\d{4,6}$/.test(nm) || !/^\d{4,6}$/.test(nh)) { toast('新密钥需 4–6 位数字'); return; }
      if (nm === nh) { toast('两级密钥不能相同'); return; }
      data.keys.mid.key = nm;
      data.keys.high.key = nh;
      save(); log('更换了中级/高级密钥');
      toast('密钥已更新'); closeSheet();
    });

    $('#hsPurge').addEventListener('click', function () {
      $('#hsConfirm').style.display = 'block';
      this.style.display = 'none';
    });
    $('#hsCancel').addEventListener('click', function () {
      $('#hsConfirm').style.display = 'none';
      $('#hsPurge').style.display = '';
    });
    $('#hsYes').addEventListener('click', function () {
      data.notices = [];
      data.posts.forEach(function (p) { p.hidden = true; p.pinned = false; });
      save(); log('清空了区域内所有消息');
      renderNotices(); decoratePosts(); closeSheet(); toast('已清空区域内所有消息');
    });
  }

  /* ---------------- 禁言拦截 ---------------- */
  function blockIfMuted(e) {
    if (!isBlocked()) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    toast('你已被限制，不能评论');
  }
  var sendBtn = document.getElementById('cSend');
  var cInput = document.getElementById('cInput');
  if (sendBtn) sendBtn.addEventListener('click', blockIfMuted, true);
  if (cInput) cInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') blockIfMuted(e);
  }, true);

  /* ---------------- 撤销最近一次管理操作 ---------------- */
  var UNDO_KEY = 'c74_undo_v1';

  function setUndo(rec) {
    try { sessionStorage.setItem(UNDO_KEY, JSON.stringify(rec)); } catch (e) {}
    paintUndo();
  }
  function getUndo() {
    try { return JSON.parse(sessionStorage.getItem(UNDO_KEY) || 'null'); } catch (e) { return null; }
  }
  function clearUndo() {
    try { sessionStorage.removeItem(UNDO_KEY); } catch (e) {}
    paintUndo();
  }
  function undoLabel(r) {
    if (!r) return '';
    var map = {
      'acc.delete': '删除账户',
      'acc.mute': '禁言',
      'acc.ban': '封禁',
      'acc.level': '改权限',
      'post.delete': '删除动态',
      'notice.delete': '删除公告'
    };
    return '撤销：' + (map[r.type] || '操作');
  }
  function paintUndo() {
    var btn = document.getElementById('undoBtn');
    var txt = document.getElementById('undoTxt');
    if (!btn || !txt) return;
    var r = getUndo();
    if (level === 'none' || !r) { btn.hidden = true; return; }
    btn.hidden = false;
    txt.textContent = undoLabel(r);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#undoBtn');
    if (!btn) return;
    var r = getUndo();
    if (!r) { paintUndo(); return; }
    var id = encodeURIComponent(r.id);
    var p;
    if (r.type === 'acc.delete') p = C74.api('/api/accounts/' + id + '/restore', { method: 'POST', body: {} });
    else if (r.type === 'acc.mute') p = C74.api('/api/accounts/' + id + '/admin', { method: 'POST', body: { action: r.prev ? 'unmute' : 'mute' } });
    else if (r.type === 'acc.ban') p = C74.api('/api/accounts/' + id + '/admin', { method: 'POST', body: { action: r.prev ? 'unban' : 'ban' } });
    else if (r.type === 'acc.level') p = C74.api('/api/accounts/' + id + '/level', { method: 'POST', body: { level: r.prev } });
    else if (r.type === 'post.delete') p = C74.api('/api/posts/' + id + '/restore', { method: 'POST', body: {} });
    else p = Promise.reject(new Error('这个操作不支持撤销'));

    p.then(function () {
      toast('已撤销');
      clearUndo();
      C74.refreshBoot && C74.refreshBoot();
      setTimeout(function () { location.reload(); }, 500);
    }).catch(function (err) {
      toast(err.message || '撤销失败');
    });
  });

  /* ---------------- 我的账户（改昵称 / 改密码） ---------------- */
  var LV_FULL = { high: '高级管理', mid: '中级管理', junior: '普通管理', teacher: '老师', member: '班级成员' };

  function openAccount() {
    var u = C74.me() || {};
    if (!u.id) { toast('离线模式：先联网登录再改'); return; }
    var lv = LV_FULL[u.level] || '班级成员';
    var html =
      '<div class="m-row" style="border:0;padding-top:0">' +
        '<span class="av hi">' + esc(initial(u.name || u.user || '?')) + '</span>' +
        '<span class="mi"><b>' + esc(u.name || u.user) + '</b><span>' + esc(u.user) + ' · ' + lv + '</span></span>' +
      '</div>' +
      '<div class="m-field"><label>昵称 <span>NAME</span></label>' +
        '<input class="m-inp" id="acName" maxlength="16" value="' + esc(u.name || u.user || '') + '"></div>' +
      '<div class="m-field"><label>原密码 <span>REQUIRED · 必填</span></label>' +
        '<input class="m-inp" id="acOld" type="password" autocomplete="current-password" placeholder="输入当前密码"></div>' +
      '<div class="m-field"><label>新密码 <span>NEW · 不改留空</span></label>' +
        '<input class="m-inp" id="acNew" type="password" autocomplete="new-password" placeholder="至少 4 位"></div>' +
      '<div class="m-act-row"><button class="m-btn solid" id="acSave">保 存 修 改</button></div>' +
      (u.level === 'high'
        ? '<div class="m-sec"><div class="m-sec-h">管理员</div><div class="m-act-row">' +
          '<button class="m-btn" id="acReview">举报审核</button>' +
          '<button class="m-btn" id="acCodes">注册码管理</button></div></div>'
        : '') +
      '<p class="m-note">改密码后，其它设备上的登录会失效，需要重新登录。改昵称只影响以后显示的内容。</p>';

    openSheet('我的账户', 'ACCOUNT', html);

    var acBtn = $('#acCodes');
    if (acBtn) acBtn.addEventListener('click', function () { openCodes(); });
    var rvBtn = $('#acReview');
    if (rvBtn) rvBtn.addEventListener('click', function () {
      if (window.C74Report) window.C74Report.openReview();
      else toast('举报模块还没加载完');
    });

    $('#acSave').addEventListener('click', function () {
      var name = ($('#acName').value || '').trim();
      var oldP = $('#acOld').value || '';
      var newP = $('#acNew').value || '';
      if (!oldP) { toast('请先输入原密码'); $('#acOld').focus(); return; }
      if (!name && !newP) { toast('没有要改的内容'); return; }
      if (newP && newP.length < 4) { toast('新密码至少 4 位'); return; }

      var btn = this;
      btn.disabled = true; btn.textContent = '保 存 中…';
      C74.api('/api/account/update', {
        method: 'POST',
        body: { oldPass: oldP, name: name, newPass: newP }
      }).then(function (res) {
        var nu = res.user || {};
        C74.setAuth(C74.token(), nu);
        try {
          var sess = JSON.parse(sessionStorage.getItem('c74_session') || '{}');
          sess.name = nu.name; sess.role = nu.level; sess.level = nu.level;
          sessionStorage.setItem('c74_session', JSON.stringify(sess));
          var ad = JSON.parse(sessionStorage.getItem('c74_admin_session') || 'null');
          if (ad) { ad.user = nu.name; sessionStorage.setItem('c74_admin_session', JSON.stringify(ad)); }
        } catch (e) {}
        C74.refreshBoot && C74.refreshBoot();
        closeSheet();
        toast('已保存，正在刷新…');
        setTimeout(function () { location.reload(); }, 700);
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = '保 存 修 改';
        toast(err.message || '保存失败');
      });
    });
  }

  /* ---------------- 注册码管理（高管） ---------------- */
  function openCodes() {
    C74.api('/api/codes').then(renderCodes).catch(function (e) {
      toast(e.message || '加载失败');
    });
  }

  function renderCodes(d) {
    var groups = (d.groups || []).map(function (g) {
      return '<span class="cd-chip">' + esc(g.batch || '未分组') + ' <b>' + g.used + '/' + g.total + '</b></span>';
    }).join('');

    var rows = (d.codes || []).map(function (c) {
      return '<div class="cd-row">' +
        '<span class="cd-code' + (c.used ? ' used' : '') + '">' + esc(c.code) + '</span>' +
        '<span class="cd-tag ' + (c.used ? 'no' : 'ok') + '">' + (c.used ? '已用' : '可用') + '</span>' +
        '<span class="cd-tag" style="color:#7c8ba6;background:none;border:1px solid rgba(120,185,255,.14)">' + esc(c.batch || '未分组') + '</span>' +
        (c.used ? '' : '<button class="cd-del" data-cdel="' + esc(c.code) + '" aria-label="删除">×</button>') +
        '</div>';
    }).join('') || '<p class="m-note">还没有注册码</p>';

    var html =
      '<div class="m-sec"><div class="m-sec-h">概况</div>' +
        '<p class="m-note" style="margin-top:0">共 ' + d.total + ' 个 · 已用 ' + d.used +
        ' · 可用 ' + (d.total - d.used) + '</p>' +
        '<div class="cd-group">' + groups + '</div></div>' +

      '<div class="m-sec"><div class="m-sec-h">生成新码</div>' +
        '<div class="m-act-row">' +
          '<div class="inp" style="flex:0 0 96px"><input id="cgCount" type="number" min="1" max="50" value="10"></div>' +
          '<div class="inp" style="flex:1;margin-left:6px"><input id="cgBatch" maxlength="20" placeholder="分组名，如 B 批"></div>' +
        '</div>' +
        '<div class="m-act-row"><button class="m-btn solid" id="cgMake">生 成</button></div>' +
        '<p class="m-note">生成后自动分到该组；同组的码在列表里会挨着显示。</p></div>' +

      '<div class="m-sec"><div class="m-sec-h">全部注册码</div>' + rows + '</div>';

    openSheet('注册码管理', 'HIGH · INVITE CODES', html);

    $('#cgMake') && $('#cgMake').addEventListener('click', function () {
      var n = parseInt($('#cgCount').value, 10) || 10;
      var batch = ($('#cgBatch').value || '').trim() || '未分组';
      this.disabled = true; this.textContent = '生 成 中…';
      C74.api('/api/codes', { method: 'POST', body: { count: n, batch: batch } })
        .then(function (res) {
          toast('已生成 ' + res.created.length + ' 个');
          openCodes();
        }).catch(function (err) {
          toast(err.message || '生成失败');
          openCodes();
        });
    });

    $$('[data-cdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-cdel');
        if (!confirm('删除注册码 ' + code + '？')) return;
        C74.api('/api/codes/' + encodeURIComponent(code), { method: 'DELETE' })
          .then(function () { toast('已删除'); openCodes(); })
          .catch(function (e) { toast(e.message || '删除失败'); });
      });
    });
  }

  /* ---------------- 发布锁定（中管及以上） ---------------- */
  (function initLock() {
    var btn = document.getElementById('lockBtn');
    var label = document.getElementById('lockLabel');
    if (!btn) return;

    function paint(locked) {
      btn.classList.toggle('on', !!locked);
      if (label) label.textContent = locked ? '已锁定' : '锁定';
      btn.title = locked ? '班级已锁定，只有中管及以上能发布' : '锁定发布';
    }

    if (window.C74 && C74.online && C74.online()) {
      C74.boot().then(function (d) {
        if (d && d.lock) paint(d.lock.locked);
      }).catch(function () {});
    }

    btn.addEventListener('click', function () {
      if (!(window.C74 && C74.online && C74.online())) {
        paint(!btn.classList.contains('on'));
        toast('离线模式：锁定只在当前设备生效');
        return;
      }
      var want = !btn.classList.contains('on');
      btn.disabled = true;
      C74.api('/api/lock', { method: 'POST', body: { locked: want } })
        .then(function (r) {
          btn.disabled = false;
          paint(r.locked);
          toast(r.locked ? '已锁定：只有中管及以上能发布' : '已解除锁定');
          C74.refreshBoot && C74.refreshBoot();
        })
        .catch(function (e) {
          btn.disabled = false;
          toast(e.message || '操作失败');
        });
    });
  })();

  window.C74Sheet = { open: openSheet, close: closeSheet };
  window.C74Undo = { set: setUndo, clear: clearUndo };
  window.C74Account = { open: openAccount };

  /* ---------------- 申请入口 ---------------- */
  function mountRequestEntry() {
    var sub = document.querySelector('.sec .subline');
    if (!sub || document.getElementById('reqBtn')) return;
    var b = document.createElement('button');
    b.className = 'req-link';
    b.id = 'reqBtn';
    b.innerHTML = '<b>申请</b> 置顶 / 公告 / 寻人启事';
    b.addEventListener('click', openRequest);
    sub.parentNode.appendChild(b);
  }

  /* ---------------- 启动 ---------------- */
  paintUndo();

  var mb = document.getElementById('membersBtn');
  if (mb) mb.addEventListener('click', openMembers);

  mountChip();
  mountRequestEntry();
  renderNotices();
  decoratePosts();
})();
