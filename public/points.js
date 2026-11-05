/* =========================================================
   七年四班 · 积分册
   - 50 个空位，名字只有中管 / 高管能填
   - 分数只有郭老师能加减
   - 顶部公告只有郭老师能发
   ========================================================= */
(function () {
  var view = document.getElementById('pointsView');
  if (!view) return;

  var listEl = document.getElementById('pvList');
  var subEl = document.getElementById('pvSub');
  var nText = document.getElementById('pvNoticeText');
  var nEdit = document.getElementById('pvNoticeEdit');
  var nActs = document.getElementById('pvNoticeActs');
  var nBtn = document.getElementById('pvNoticeEditBtn');
  var footEl = document.getElementById('pvFoot');

  var data = { rows: [], notice: '', can: { name: false, score: false, notice: false }, me: {} };
  var loaded = false;
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toast(t) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = t;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }
  function api(path, opts) {
    if (window.C74 && C74.api) return C74.api(path, opts);
    return Promise.reject(new Error('还没连上服务器'));
  }

  /* ---------- 渲染 ---------- */
  function renderHead() {
    var filled = data.rows.filter(function (r) { return r.name; }).length;
    subEl.textContent = filled + ' / ' + data.rows.length + ' 已登记';

    var hasNotice = !!(data.notice && data.notice.trim());
    nText.textContent = hasNotice ? data.notice : '还没有公告';
    nText.classList.toggle('empty', !hasNotice);
    nBtn.hidden = !data.can.notice;

    if (data.can.score) {
      footEl.textContent = '你是积分管理员：可以加减分、发公告。点名字右侧的 − / + 调整。';
    } else if (data.can.name) {
      footEl.textContent = '点任意一行可以填写名字（中管 / 高管）。分数由郭老师负责加减。';
    } else {
      footEl.textContent = '同一行右上的名字由中管 / 高管填写。';
    }
  }

  function rowHTML(r) {
    var score = Number(r.score || 0);
    var cls = score > 0 ? 'pos' : (score < 0 ? 'neg' : 'zero');
    var me = data.me && r.name && r.name === data.me.name;
    return '' +
      '<div class="prow' + (me ? ' me' : '') + '" data-slot="' + r.slot + '">' +
        '<span class="pno">' + pad(r.slot) + '</span>' +
        (data.can.name
          ? '<button class="pname' + (r.name ? '' : ' empty') + ' can" data-nslot="' + r.slot + '">' +
            (r.name ? esc(r.name) : '填写名字') + '</button>'
          : '<div class="pname' + (r.name ? '' : ' empty') + '">' + (r.name ? esc(r.name) : '—') + '</div>') +
        '<span class="psc ' + cls + '" data-sc="' + r.slot + '">' + score + '</span>' +
        '<button class="pbtn down" data-dec="' + r.slot + '"' + (data.can.score ? '' : ' hidden') + '>−</button>' +
        '<button class="pbtn up" data-inc="' + r.slot + '"' + (data.can.score ? '' : ' hidden') + '>+</button>' +
      '</div>';
  }

  function renderList() {
    if (!data.rows.length) {
      listEl.innerHTML = '<div class="pv-zero">还没有积分位，稍后再试</div>';
      return;
    }
    listEl.innerHTML = data.rows.map(rowHTML).join('');
  }

  function render() { renderHead(); renderList(); }

  /* ---------- 读取 ---------- */
  function load(silent) {
    if (busy) return Promise.resolve();
    busy = true;
    return api('/points').then(function (d) {
      data = d || data;
      loaded = true;
      busy = false;
      render();
    }).catch(function (e) {
      busy = false;
      if (!silent) toast(e.message || '加载失败');
    });
  }

  /* ---------- 改名字 ---------- */
  function startRename(btn) {
    var slot = parseInt(btn.getAttribute('data-nslot'), 10);
    var r = data.rows.filter(function (x) { return x.slot === slot; })[0] || { slot: slot, name: '' };
    var inp = document.createElement('input');
    inp.className = 'pname-input';
    inp.type = 'text';
    inp.maxLength = 12;
    inp.value = r.name || '';
    inp.placeholder = '输入名字';
    inp.setAttribute('inputmode', 'text');
    btn.replaceWith(inp);
    inp.focus();
    try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}

    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      var val = inp.value.trim();
      if (!save || val === (r.name || '')) { renderList(); return; }
      inp.disabled = true;
      api('/points/name', { method: 'POST', body: { slot: slot, name: val } }).then(function (d) {
        r.name = d.name || null;
        var filled = data.rows.filter(function (x) { return x.name; }).length;
        subEl.textContent = filled + ' / ' + data.rows.length + ' 已登记';
        renderList();
        toast(val ? '已填「' + val + '」' : '已清空');
      }).catch(function (e) {
        toast(e.message || '保存失败');
        renderList();
      });
    }
    inp.addEventListener('blur', function () { finish(true); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  }

  /* ---------- 加减分 ---------- */
  function bump(slot, delta) {
    var el = listEl.querySelector('[data-sc="' + slot + '"]');
    var r = data.rows.filter(function (x) { return x.slot === slot; })[0];
    if (!r) return;
    /* 先就地乐观更新，手感不掉帧 */
    r.score = Number(r.score || 0) + delta;
    if (el) {
      el.textContent = r.score;
      el.classList.remove('pos', 'neg', 'zero', 'pop');
      void el.offsetWidth;
      el.classList.add(r.score > 0 ? 'pos' : (r.score < 0 ? 'neg' : 'zero'), 'pop');
    }
    api('/points/score', { method: 'POST', body: { slot: slot, delta: delta } }).then(function (d) {
      if (el && typeof d.score === 'number' && d.score !== r.score) {
        r.score = d.score;
        el.textContent = d.score;
      }
    }).catch(function (e) {
      /* 回滚 */
      r.score = Number(r.score || 0) - delta;
      if (el) el.textContent = r.score;
      toast(e.message || '改分失败');
    });
  }

  /* ---------- 公告 ---------- */
  function editNotice(open) {
    if (open) {
      nEdit.value = data.notice || '';
      nEdit.hidden = false;
      nActs.hidden = false;
      nText.hidden = true;
      nBtn.hidden = true;
      nEdit.focus();
    } else {
      nEdit.hidden = true;
      nActs.hidden = true;
      nText.hidden = false;
      nBtn.hidden = !data.can.notice;
    }
  }

  function saveNotice() {
    var txt = nEdit.value.trim();
    api('/points/notice', { method: 'POST', body: { text: txt } }).then(function (d) {
      data.notice = d.notice || '';
      nText.textContent = data.notice || '还没有公告';
      nText.classList.toggle('empty', !data.notice);
      editNotice(false);
      toast(txt ? '公告已更新' : '公告已清空');
    }).catch(function (e) { toast(e.message || '发布失败'); });
  }

  /* ---------- 事件 ---------- */
  view.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : null;
    if (!t) return;
    var nameBtn = t.closest('.pname.can');
    if (nameBtn) { e.preventDefault(); startRename(nameBtn); return; }
    var inc = t.closest('[data-inc]');
    if (inc) { bump(parseInt(inc.getAttribute('data-inc'), 10), 1); return; }
    var dec = t.closest('[data-dec]');
    if (dec) { bump(parseInt(dec.getAttribute('data-dec'), 10), -1); return; }
    if (t.closest('#pvNoticeEditBtn')) { editNotice(true); return; }
    if (t.closest('#pngCancel')) { editNotice(false); return; }
    if (t.closest('#pngSave')) { saveNotice(); return; }
  });

  /* ---------- 对外 ---------- */
  window.C74Points = {
    open: function () {
      view.hidden = false;
      document.body.classList.add('pview-on');
      view.scrollTop = 0;
      if (!loaded) load();
      else load(true);
    },
    close: function () {
      view.hidden = true;
      document.body.classList.remove('pview-on');
    },
    reload: function () { loaded = false; load(); }
  };
})();
