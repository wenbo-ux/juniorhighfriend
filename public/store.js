/* =========================================================
   七年四班 · 共享数据层
   index.html / admin.html 共用；纯前端演示，存 localStorage
   ========================================================= */
(function () {
  'use strict';
  var KEY = 'c74_admin_v1';

  function seed() {
    return {
      v: 3,
      keys: {
        mid: { user: '温泊', key: '2991' },
        high: { user: '温泊', key: '7413' }
      },
      members: [
        { id: '2404-01', name: '温泊', role: 'member' },
        { id: 'T-0704', name: '郭老师', role: 'teacher' },
        { id: '2404-18', name: '林小满', role: 'member' },
        { id: '2404-07', name: '文文', role: 'member' },
        { id: '2404-09', name: '欣欣', role: 'member' },
        { id: '2404-12', name: '陈星', role: 'member' },
        { id: '2404-03', name: '李明', role: 'member' },
        { id: '2404-21', name: '赵一诺', role: 'member' },
        { id: '2404-15', name: '周子涵', role: 'member' },
        { id: '2404-26', name: '吴桐', role: 'member' },
        { id: '2404-11', name: '郑好', role: 'member' },
        { id: '2404-33', name: '何雨', role: 'member' },
        { id: '2404-05', name: '孙可', role: 'member' },
        { id: '2404-29', name: '许知远', role: 'member' }
      ],
      notices: [
        { id: 'n_seed', text: '明天默写：U3 单词及 notes', author: '郭老师', urgent: true, pinned: true, at: '2026.11.02 08:12' }
      ],
      posts: [
        { id: 'p1', who: '文文 · 欣欣', text: '课间十分钟，走廊的光刚好斜进来。', date: '2026.11.02', pinned: false, hidden: false, comments: [] },
        { id: 'p2', who: '欣欣', text: '窗台上的绿萝又抽了一片新叶。', date: '2026.11.01', pinned: false, hidden: false, comments: [] },
        { id: 'p3', who: '文文', text: '运动会那天的天空，我到现在还记得。', date: '2026.10.03', pinned: false, hidden: false, comments: [] },
        { id: 'p4', who: '班级相册', text: '十月最后一天，走廊尽头拍的全班。', date: '2026.10.31', pinned: false, hidden: false, comments: [] }
      ],
      requests: [],
      logs: [
        { at: '2026.11.02 20:10', who: 'system', level: 'sys', text: '管理中枢初始化完成' }
      ]
    };
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return seed();
    var d = raw;
    if (!d.keys) d.keys = {};
    if (!d.keys.mid) d.keys.mid = (d.keys.low || { user: '温泊', key: '2991' });
    if (!d.keys.high) d.keys.high = { user: '温泊', key: '7413' };
    if (!Array.isArray(d.members)) d.members = [];
    d.members.forEach(function (m) {
      if (m.role === 'admin') m.role = 'member';
    });
    if (!Array.isArray(d.notices)) d.notices = [];
    if (!Array.isArray(d.posts)) d.posts = [];
    if (!Array.isArray(d.requests)) d.requests = [];
    if (!Array.isArray(d.logs)) d.logs = [];
    if (d.v !== 3) d.v = 3;
    return d;
  }

  var _cache = null;
  function load() {
    if (_cache) return _cache;
    var d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    var out = normalize(d);
    if (!d || d.v !== 3) save(out);
    _cache = out;
    return out;
  }
  function save(d) {
    _cache = d;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }
  function uid(p) {
    return p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp(d) {
    d = d || new Date();
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initial(name) { return String(name || '?').trim().charAt(0) || '?'; }


  /* ---------------- 在线 API 层 ---------------- */
  var API_BASE = '';
  var TOKEN_KEY = 'c74_token', ME_KEY = 'c74_me';

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function me() { try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch (e) { return null; } }
  function setAuth(t, u) {
    try { localStorage.setItem(TOKEN_KEY, t); localStorage.setItem(ME_KEY, JSON.stringify(u || null)); } catch (e) {}
  }
  function clearAuth() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ME_KEY); } catch (e) {}
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    return fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var err = new Error(d.error || ('HTTP ' + r.status));
          err.status = r.status;
          throw err;
        }
        return d;
      });
    });
  }

  var _boot = null;
  function boot() {
    if (!_boot) {
      _boot = api('/api/bootstrap').catch(function (e) { _boot = null; throw e; });
    }
    return _boot;
  }
  function refreshBoot() { _boot = null; return boot(); }


  window.C74 = {
    KEY: KEY,
    seed: seed,
    load: load,
    save: save,
    uid: uid,
    stamp: stamp,
    esc: esc,
    initial: initial,
    api: api,
    boot: boot,
    refreshBoot: refreshBoot,
    token: token,
    me: me,
    setAuth: setAuth,
    clearAuth: clearAuth,
    online: function () { return !!token(); }
  };
})();
