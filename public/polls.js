/* =========================================================
   七年四班 · 班级投票
   - 出题：郭老师 + 高管
   - 投票：所有登录成员，一人一票（多选另算）
   - 只统计票数，不公开谁投了什么
   ========================================================= */
(function () {
  var view = document.getElementById('pollsView');
  if (!view) return;

  var listEl = document.getElementById('plList');
  var mkEl = document.getElementById('plMk');
  var newBtn = document.getElementById('plNewBtn');
  var form = document.getElementById('plForm');
  var fTitle = document.getElementById('plFTitle');
  var fDesc = document.getElementById('plFDesc');
  var fOpts = document.getElementById('plFOpts');
  var fMulti = document.getElementById('plFMulti');
  var fAdd = document.getElementById('plFAdd');
  var fSubmit = document.getElementById('plFSubmit');
  var fCancel = document.getElementById('plFCancel');

  var data = { polls: [], can: { create: false } };
  var loaded = false;
  var busy = false;
  var draft = {};          /* pollId -> 多选未提交的勾选 */
  var openForm = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(t) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = t;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 1900);
  }
  function api(path, opts) {
    if (window.C74 && C74.api) return C74.api(path, opts);
    return Promise.reject(new Error('还没连上服务器'));
  }
  function dayLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var open = data.polls.filter(function (p) { return p.status === 'open'; });
    var closed = data.polls.filter(function (p) { return p.status !== 'open'; });
    mkEl.textContent = open.length ? open.length + ' 个进行中' : '暂时没有投票';
    newBtn.hidden = !data.can.create;

    if (!data.polls.length) {
      listEl.innerHTML = '<div class="pl-empty">还没有投票。<br>' +
        (data.can.create ? '点右上角「发起投票」出一道。' : '等班委出题吧。') + '</div>';
      return;
    }

    listEl.innerHTML = open.map(card).join('') + closed.map(card).join('');
  }

  function card(p) {
    var mine = draft[p.id] || p.my || [];
    var isOpen = p.status === 'open';
    var total = p.total || 0;
    var max = 1;
    p.options.forEach(function (o) { if (o.count > max) max = o.count; });

    var opts = p.options.map(function (o) {
      var pct = total ? Math.round(o.count * 100 / total) : 0;
      var pick = mine.indexOf(o.k) >= 0;
      var cls = 'pl-opt' + (p.multi ? ' multi' : '') + (pick ? ' mine' : '') +
                (isOpen ? ' pickable' : '');
      return '<button class="' + cls + '" data-poll="' + p.id + '" data-opt="' + o.k + '"' +
        (isOpen ? '' : ' disabled') + '>' +
        '<i class="bar" style="width:' + (total ? Math.max(3, pct) : 0) + '%"></i>' +
        '<span class="row"><span class="mk"></span>' +
        '<span class="lb">' + esc(o.label) + '</span>' +
        '<span class="pc">' + o.count + ' · ' + pct + '%</span></span></button>';
    }).join('');

    var acts = '';
    if (isOpen && p.multi && draft[p.id]) {
      acts += '<button class="pl-btn ok" data-vote="' + p.id + '">提 交 选 择</button>';
    }
    if (p.canClose) {
      acts += isOpen
        ? '<button class="pl-btn" data-close="' + p.id + '">结束投票</button>'
        : '<button class="pl-btn" data-reopen="' + p.id + '">重新开放</button>';
      acts += '<button class="pl-btn danger" data-del="' + p.id + '">删除</button>';
    }

    var hint = '';
    if (!isOpen) hint = '已结束 · ' + total + ' 人参与';
    else if (p.multi) hint = '可多选 · ' + total + ' 人参与' + (p.my ? ' · 你已投' : '');
    else hint = total + ' 人参与' + (p.my ? ' · 你投了「' +
      esc((p.options.filter(function (o) { return p.my.indexOf(o.k) >= 0; })[0] || {}).label || '') + '」' : '');

    return '<div class="pl-card' + (isOpen ? '' : ' closed') + '">' +
      '<div class="pl-top"><div class="pl-title">' + esc(p.title) + '</div>' +
      '<span class="pl-tag' + (isOpen ? ' open' : '') + '">' + (isOpen ? '进行中' : '已结束') + '</span></div>' +
      (p.desc ? '<div class="pl-desc">' + esc(p.desc) + '</div>' : '') +
      '<div class="pl-opts">' + opts + '</div>' +
      '<div class="pl-meta">' + esc(p.created_name) + ' · ' + dayLabel(p.created_at) + ' · ' + hint + '</div>' +
      (acts ? '<div class="pl-acts">' + acts + '</div>' : '') +
      '</div>';
  }

  /* ---------- 数据 ---------- */
  function load() {
    api('/api/polls').then(function (d) {
      data.polls = d.polls || [];
      data.can = d.can || { create: false };
      loaded = true;
      render();
    }).catch(function (e) {
      mkEl.textContent = '加载失败';
      listEl.innerHTML = '<div class="pl-empty">' + esc(e.message || '网络不太顺，稍后再试') + '</div>';
    });
  }

  function vote(pollId, picks) {
    if (busy) return;
    busy = true;
    api('/api/polls/' + pollId + '/vote', { method: 'POST', body: { choice: picks } })
      .then(function () {
        delete draft[pollId];
        loaded = false;
        load();
        toast('投好了');
      })
      .catch(function (e) { toast(e.message || '没投上'); })
      .then(function () { busy = false; });
  }

  function act(url, okMsg) {
    api(url, { method: 'POST' }).then(function () {
      loaded = false; load(); toast(okMsg);
    }).catch(function (e) { toast(e.message || '操作失败'); });
  }

  /* ---------- 发起表单 ---------- */
  var MAX_OPT = 6;

  function optRow(val) {
    var row = document.createElement('div');
    row.className = 'opt-row';
    row.innerHTML = '<input maxlength="24" placeholder="选项" value="' + esc(val || '') + '">' +
      '<button class="del" type="button">×</button>';
    return row;
  }
  function syncOpts() {
    var rows = fOpts.querySelectorAll('.opt-row');
    fAdd.hidden = rows.length >= MAX_OPT;
    Array.prototype.forEach.call(rows, function (r) {
      r.querySelector('.del').hidden = rows.length <= 2;
    });
  }
  function resetForm() {
    fTitle.value = '';
    fDesc.value = '';
    fMulti.setAttribute('aria-pressed', 'false');
    fOpts.innerHTML = '';
    fOpts.appendChild(optRow(''));
    fOpts.appendChild(optRow(''));
    syncOpts();
  }
  function showForm(on) {
    openForm = on;
    form.hidden = !on;
    newBtn.textContent = on ? '收起' : '＋ 发起投票';
    if (on) { resetForm(); fTitle.focus(); }
  }
  function submitForm() {
    var title = fTitle.value.trim();
    var opts = Array.prototype.map.call(fOpts.querySelectorAll('input'), function (i) {
      return i.value.trim();
    }).filter(Boolean);
    if (title.length < 2) { toast('题目至少 2 个字'); return; }
    if (opts.length < 2) { toast('至少填两个选项'); return; }
    fSubmit.disabled = true;
    api('/api/polls', {
      method: 'POST',
      body: { title: title, desc: fDesc.value.trim(), options: opts,
              multi: fMulti.getAttribute('aria-pressed') === 'true' }
    }).then(function () {
      showForm(false);
      loaded = false; load(); toast('投票已发出');
    }).catch(function (e) { toast(e.message || '发布失败'); })
      .then(function () { fSubmit.disabled = false; });
  }

  /* ---------- 事件 ---------- */
  view.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target : null;
    if (!el) return;

    if (el.closest('#plNewBtn')) { showForm(!openForm); return; }
    if (el.closest('#plFCancel')) { showForm(false); return; }
    if (el.closest('#plFSubmit')) { submitForm(); return; }
    if (el.closest('#plFMulti')) {
      var on = fMulti.getAttribute('aria-pressed') === 'true';
      fMulti.setAttribute('aria-pressed', on ? 'false' : 'true');
      return;
    }
    if (el.closest('#plFAdd')) {
      if (fOpts.querySelectorAll('.opt-row').length < MAX_OPT) {
        fOpts.appendChild(optRow('')); syncOpts();
        var ins = fOpts.querySelectorAll('input');
        if (ins.length) ins[ins.length - 1].focus();
      }
      return;
    }
    var del = el.closest('.opt-row .del');
    if (del) { del.parentNode.remove(); syncOpts(); return; }

    var closeBtn = el.closest('[data-close]');
    if (closeBtn) { act('/api/polls/' + closeBtn.getAttribute('data-close') + '/close', '已结束'); return; }
    var reBtn = el.closest('[data-reopen]');
    if (reBtn) { act('/api/polls/' + reBtn.getAttribute('data-reopen') + '/reopen', '已重新开放'); return; }
    var delBtn = el.closest('[data-del]');
    if (delBtn) {
      var pid = delBtn.getAttribute('data-del');
      api('/api/polls/' + pid, { method: 'DELETE' }).then(function () {
        loaded = false; load(); toast('已删除');
      }).catch(function (err) { toast(err.message || '删不掉'); });
      return;
    }
    var sub = el.closest('[data-vote]');
    if (sub) {
      var id2 = sub.getAttribute('data-vote');
      var picks = draft[id2] || [];
      if (!picks.length) { toast('先选一个'); return; }
      vote(id2, picks);
      return;
    }

    var opt = el.closest('.pl-opt');
    if (opt && !opt.hasAttribute('disabled')) {
      var id = opt.getAttribute('data-poll');
      var key = opt.getAttribute('data-opt');
      var p = data.polls.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      if (p.multi) {
        var cur = (draft[id] || p.my || []).slice();
        var i = cur.indexOf(key);
        if (i >= 0) cur.splice(i, 1); else cur.push(key);
        draft[id] = cur;
        render();
      } else {
        vote(id, [key]);
      }
    }
  });

  /* ---------- 对外 ---------- */
  window.C74Polls = {
    open: function () {
      view.hidden = false;
      document.body.classList.add('pview-on');
      view.scrollTop = 0;
      showForm(false);
      load();
    },
    close: function () {
      view.hidden = true;
      document.body.classList.remove('pview-on');
    }
  };
})();
