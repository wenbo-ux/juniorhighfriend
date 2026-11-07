/* =========================================================
   七年四班 · 举报 / 申请 / 报备
   - 任何登录的同学都能提交
   - 都可以匿名：匿名后对方只看到「匿名同学」
   - 不需要别人审核，提交后直接进老师那边的通知
   ========================================================= */
(function () {
  'use strict';

  var ME = null;
  try { ME = window.C74 ? C74.me() : null; } catch (e) {}

  function $(q, r) { return (r || document).querySelector(q); }
  function $$(q, r) { return Array.prototype.slice.call((r || document).querySelectorAll(q)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  }); }
  function api(p, opt) { return C74.api(p, opt); }

  var toastEl = document.getElementById('toast'), tt = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(tt);
    tt = setTimeout(function () { toastEl.classList.remove('show'); }, 1900);
  }

  function online() { return !!(window.C74 && C74.online && C74.online()); }

  /* ---------------- 三种表单的配置 ---------------- */
  var KINDS = {
    report: {
      title: '举报', sub: 'REPORT',
      intro: '看到不合适的内容，或者有人被欺负，都可以在这里说。',
      types: [['member', '成员'], ['post', '动态'], ['other', '其他']],
      target: '涉及谁 · 可选',
      targetPh: '写清楚是谁、哪条动态',
      ph: '发生了什么、什么时候、影响是什么（至少 4 个字）',
      min: 4, canAnon: true, anonDefault: true, btn: '提 交 举 报', done: '已提交，谢谢你说出来'
    },
    apply: {
      title: '申请', sub: 'APPLY',
      intro: '想请假、换座位、办个活动，写在这儿就行。',
      types: [['leave', '请假'], ['seat', '换座位'], ['event', '活动'], ['other', '其他']],
      target: '给谁看 · 可选',
      targetPh: '比如：班主任、班长',
      ph: '要申请什么、为什么、大概什么时候',
      min: 2, canAnon: false, anonDefault: false, btn: '提 交 申 请', done: '申请已提交'
    },
    appeal: {
      title: '意见申诉', sub: 'APPEAL',
      intro: '对处理结果有想法，或者觉得哪件事不太公平，都可以写在这里。',
      types: [['punish', '对处罚有异议'], ['result', '对结果不满'], ['advice', '意见反馈'], ['other', '其他']],
      target: '关于什么事 · 可选',
      targetPh: '比如：上周的扣分、被禁言',
      ph: '说说你的情况和想法（至少 4 个字）',
      min: 4, canAnon: true, anonDefault: true, btn: '提 交 申 诉', done: '已提交'
    },
    note: {
      title: '报备', sub: 'NOTICE',
      intro: '迟到、请假、身体不舒服，先留一句，省得大家找你。',
      types: [['late', '迟到'], ['leave', '请假'], ['sick', '身体不适'], ['other', '其他']],
      target: '时间 · 可选',
      targetPh: '比如：今天第 2 节、明天上午',
      ph: '几点、什么事、大概耽误多久',
      min: 2, canAnon: false, anonDefault: false, btn: '提 交 报 备', done: '已报备'
    }
  };

  /* ---------------- 表单 ---------------- */
  var imgs = [];
  var picker = null;

  function open(kind) {
    var K = KINDS[kind] || KINDS.report;
    if (!online()) { toast('离线上不能提交，先联网登录'); return; }
    imgs = [];

    var html =
      '<p class="tk-intro">' + esc(K.intro) + '</p>' +
      '<div class="m-field"><label>类型 <span>TYPE</span></label>' +
        '<div class="m-pills" id="tkType">' +
          K.types.map(function (t, i) {
            return '<button class="m-pill" data-t="' + t[0] + '" aria-pressed="' + (i === 0) + '">' + t[1] + '</button>';
          }).join('') +
        '</div></div>' +
      '<div class="m-field"><label>' + esc(K.target) + '</label>' +
        '<div class="inp"><input id="tkTarget" maxlength="30" placeholder="' + esc(K.targetPh) + '"></div></div>' +
      '<div class="m-field"><label>说明 <span>TEXT</span></label>' +
        '<textarea id="tkText" maxlength="300" placeholder="' + esc(K.ph) + '"></textarea></div>' +
      '<div class="m-field"><label>图片 <span>可选 · 最多 2 张</span></label>' +
        '<div class="m-act-row"><button class="m-btn" id="tkPick" type="button">选择图片</button>' +
        '<span class="m-note" id="tkCount" style="margin:0;align-self:center">未选择</span></div>' +
        '<div class="rp-thumbs" id="tkThumbs"></div></div>' +
      (K.canAnon
        ? '<div class="tk-anon" id="tkAnonRow">' +
            '<div class="tk-anon-txt"><b>匿名提交</b><span id="tkAnonHint">对方只会看到「匿名同学」</span></div>' +
            '<button class="tk-sw" id="tkAnon" aria-pressed="' + (K.anonDefault ? 'true' : 'false') + '"><i></i></button>' +
          '</div>'
        : '<div class="tk-real"><b>实名提交</b><span>会带上你的名字：' +
          esc((ME && (ME.name || ME.user)) || '同学') + '</span></div>') +
      '<div class="m-act-row"><button class="m-btn solid" id="tkSend">' + K.btn + '</button></div>';

    C74Sheet.open(K.title, K.sub, html);

    var type = K.types[0][0];
    $$('#tkType .m-pill').forEach(function (p) {
      p.addEventListener('click', function () {
        $$('#tkType .m-pill').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        p.setAttribute('aria-pressed', 'true');
        type = p.getAttribute('data-t');
      });
    });

    var anonOn = false;
    if (K.canAnon) {
      anonOn = !!K.anonDefault;
      var anonBtn = $('#tkAnon');
      anonBtn.addEventListener('click', function () {
        anonOn = !anonOn;
        anonBtn.setAttribute('aria-pressed', anonOn ? 'true' : 'false');
        var hint = $('#tkAnonHint');
        if (hint) hint.textContent = anonOn ? '对方只会看到「匿名同学」' : '会显示你的名字：' + ((ME && (ME.name || ME.user)) || '同学');
      });
      if (!K.anonDefault) {
        var h = $('#tkAnonHint');
        if (h) h.textContent = '会显示你的名字：' + ((ME && (ME.name || ME.user)) || '同学');
      }
    }

    $('#tkPick').addEventListener('click', pick);
    $('#tkSend').addEventListener('click', function () {
      var target = ($('#tkTarget').value || '').trim();
      var text = ($('#tkText').value || '').trim();
      if (text.length < K.min) { toast('说明至少 ' + K.min + ' 个字'); return; }
      var btn = this;
      btn.disabled = true; btn.textContent = '提 交 中…';
      api('/api/tickets', {
        method: 'POST',
        body: { kind: kind, type: type, target: target, text: text, images: imgs.slice(), anonymous: K.canAnon ? anonOn : false }
      }).then(function () {
        C74Sheet.close();
        toast(K.canAnon && anonOn ? K.done + '（匿名）' : K.done);
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = K.btn;
        toast(e.message || '提交失败');
      });
    });
  }

  function pick() {
    if (!picker) {
      picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/*';
      picker.multiple = true;
      picker.style.display = 'none';
      document.body.appendChild(picker);
      picker.addEventListener('change', function () {
        var files = Array.prototype.slice.call(picker.files || []).slice(0, 2 - imgs.length);
        var i = 0;
        (function next() {
          if (i >= files.length) { thumbs(); return; }
          var fr = new FileReader();
          fr.onload = function () {
            shrink(fr.result).then(function (u) { imgs.push(u); i++; next(); });
          };
          fr.onerror = function () { i++; next(); };
          fr.readAsDataURL(files[i]);
        })();
      });
    }
    picker.value = '';
    picker.click();
  }

  function thumbs() {
    var box = $('#tkThumbs');
    if (!box) return;
    box.innerHTML = imgs.map(function (u, i) {
      return '<span class="rp-th"><img src="' + u + '" alt=""><b data-tdel="' + i + '">×</b></span>';
    }).join('');
    $$('#tkThumbs [data-tdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        imgs.splice(parseInt(b.getAttribute('data-tdel'), 10), 1);
        thumbs();
      });
    });
    var c = $('#tkCount');
    if (c) c.textContent = imgs.length ? imgs.length + ' / 2 张' : '未选择';
  }

  function shrink(url) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var max = 900, w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        var cx = cv.getContext('2d');
        cx.fillStyle = '#070c16'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        var out = null;
        try { out = cv.toDataURL('image/jpeg', 0.72); } catch (e) {}
        res(out && out.length < url.length ? out : url);
      };
      img.onerror = function () { res(url); };
      img.src = url;
    });
  }

  /* ---------------- 待处理队列（有权限的账号才看得到） ---------------- */
  function openReview(kind) {
    if (!online()) { toast('离线上看不了'); return; }
    var k = kind || 'all';
    var path = (k === 'all') ? '/api/tickets' : '/api/tickets?kind=' + encodeURIComponent(k);
    api(path).then(function (d) {
      var list = (d.tickets || []).filter(function (t) { return t.status === 'pending'; });
      var html;
      if (!list.length) {
        html = '<div class="m-empty">都处理完了</div>';
      } else {
        html = '<p class="tk-intro">确认过之后再往下走，两个人看过才算数。</p>' +
          list.map(function (t) {
            var mine = (t.approvals || []).some(function (a) { return a.id === (ME && ME.id); });
            var oks = (t.approvals || []).filter(function (a) { return a.action === 'ok'; }).length;
            return '<div class="m-sec" data-tid="' + esc(t.id) + '">' +
              '<div class="m-sec-h">' + esc(KINDS[t.kind] ? KINDS[t.kind].title : '提交') +
                ' · ' + esc(t.from_name) + (t.target ? ' · ' + esc(t.target) : '') + '</div>' +
              '<p class="rp-reason">' + esc(t.text).replace(/\n/g, '<br>') + '</p>' +
              (t.images && t.images.length
                ? '<div class="rp-imgs">' + t.images.map(function (u) { return '<img src="' + u + '" alt="">'; }).join('') + '</div>'
                : '') +
              '<div class="rp-meta">' + esc(String(t.created_at || '').slice(0, 16).replace('T', ' ')) +
                ' · 已通过 ' + oks + ' / 2</div>' +
              (mine
                ? '<p class="m-note">你已经看过了，等另一位确认。</p>'
                : '<div class="m-act-row">' +
                  '<button class="m-btn" data-tv="no">驳 回</button>' +
                  '<button class="m-btn solid" data-tv="ok">通 过</button></div>') +
            '</div>';
          }).join('');
      }
      var heading = (k === 'all') ? '待处理' : ((KINDS[k] ? KINDS[k].title : '提交') + ' · 待处理');
      C74Sheet.open(heading, 'QUEUE', html);

      $$('[data-tv]').forEach(function (b) {
        b.addEventListener('click', function () {
          var box = b.closest('[data-tid]');
          var id = box.getAttribute('data-tid');
          var act = b.getAttribute('data-tv');
          b.disabled = true;
          api('/api/tickets/' + encodeURIComponent(id) + '/vote', { method: 'POST', body: { action: act } })
            .then(function (res) {
              if (res.status === 'pending') toast('记下了，等另一位确认（' + res.approvals + '/' + res.required + '）');
              else if (res.status === 'ok') toast('已处理');
              else toast('已驳回');
              openReview(kind);
            })
            .catch(function (e) { b.disabled = false; toast(e.message || '操作失败'); });
        });
      });
    }).catch(function (e) {
      toast(e.message || '加载失败');
    });
  }

  /* ---------------- 站内信（提交后的通知） ---------------- */
  var lastInboxSig = '';

  function paintDot(n) {
    var tab = document.querySelector('.tab[data-tab="我的"]');
    if (!tab) return;
    var dot = tab.querySelector('.tab-dot');
    if (!n) { if (dot) dot.remove(); return; }
    if (!dot) {
      dot = document.createElement('i');
      dot.className = 'tab-dot';
      tab.appendChild(dot);
    }
    dot.textContent = n > 9 ? '9+' : String(n);
  }

  function checkInbox(force) {
    if (!online()) return;
    api('/api/inbox').then(function (d) {
      var unread = (d.inbox || []).filter(function (x) { return !x.read; });
      paintDot(unread.length);
      if (!unread.length) return;
      var sig = unread.map(function (x) { return x.id; }).join(',');
      if (!force && sig === lastInboxSig) return;
      lastInboxSig = sig;
      showInbox(unread);
    }).catch(function () {});
  }

  function showInbox(list) {
    var html = list.map(function (m) {
      return '<div class="m-sec" data-iid="' + esc(m.id) + '">' +
        '<div class="m-sec-h">' + esc(m.title) + '</div>' +
        '<p class="rp-reason">' + esc(m.body).replace(/\n/g, '<br>') + '</p>' +
        (m.images && m.images.length
          ? '<div class="rp-imgs">' + m.images.map(function (u) { return '<img src="' + u + '" alt="">'; }).join('') + '</div>'
          : '') +
        '</div>';
    }).join('');
    html += '<div class="m-act-row"><button class="m-btn solid" id="ibOk">知 道 了</button></div>';
    C74Sheet.open('通知', 'INBOX · ' + list.length + ' 条未读', html);

    $('#ibOk').addEventListener('click', function () {
      var ps = list.map(function (m) {
        return api('/api/inbox/' + encodeURIComponent(m.id) + '/read', { method: 'POST', body: {} }).catch(function () {});
      });
      Promise.all(ps).then(function () {
        C74Sheet.close();
        toast('已读');
        lastInboxSig = '';
        checkInbox(true);
      });
    });
  }

  /* ---------------- 对外 ---------------- */
  window.C74Report = {
    open: open,
    openReview: openReview,
    openForm: function () { open('report'); },
    openApply: function () { open('apply'); },
    openAppeal: function () { open('appeal'); },
    openNote: function () { open('note'); },
    checkInbox: checkInbox
  };

  setTimeout(function () { checkInbox(); }, 1500);
  setInterval(function () { checkInbox(); }, 60000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkInbox();
  });
  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('.tab[data-tab="我的"]');
    if (tab) setTimeout(function () { checkInbox(true); }, 300);
  });
})();
