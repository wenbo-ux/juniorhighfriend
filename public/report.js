/* =========================================================
   七年四班 · 举报
   - 任何人可提交（成员 / 普管 / 中管 / 高管）
   - 只有两个高管账号能审，且需要两人都通过
   - 终审通过 → 站内信送到指定中管（默认郭老师），那边弹窗提示
   ========================================================= */
(function () {
  'use strict';

  var ME = null;
  try { ME = window.C74 ? C74.me() : null; } catch (e) {}

  function $(q, r) { return (r || document).querySelector(q); }
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

  /* ---------------- 提交举报 ---------------- */
  var imgs = [];
  var picker = null;

  function openForm() {
    if (!online()) { toast('离线状态不能举报，先联网登录'); return; }
    imgs = [];

    var html =
      '<div class="m-field"><label>举报类型 <span>TYPE</span></label>' +
        '<div class="m-pills" id="rpType">' +
          '<button class="m-pill" data-t="member" aria-pressed="true">成员</button>' +
          '<button class="m-pill" data-t="post" aria-pressed="false">动态</button>' +
          '<button class="m-pill" data-t="other" aria-pressed="false">其他</button>' +
        '</div></div>' +
      '<div class="m-field"><label>对象 <span>WHO / WHAT</span></label>' +
        '<div class="inp"><input id="rpTarget" maxlength="30" placeholder="写清楚是谁、哪条动态"></div></div>' +
      '<div class="m-field"><label>举报理由 <span>REASON · 至少 6 字</span></label>' +
        '<textarea id="rpReason" maxlength="300" placeholder="发生了什么、什么时候、影响是什么"></textarea></div>' +
      '<div class="m-field"><label>截图 <span>可选 · 最多 2 张</span></label>' +
        '<div class="m-act-row"><button class="m-btn" id="rpPick" type="button">选择图片</button>' +
        '<span class="m-note" id="rpCount" style="margin:0;align-self:center">未选择</span></div>' +
        '<div class="rp-thumbs" id="rpThumbs"></div></div>' +
      '<div class="m-act-row"><button class="m-btn solid" id="rpSend">提 交 举 报</button></div>' +
      '<p class="m-note">提交后会进入双人终审：温泊、李允正 两位高管都通过后才会转给郭老师处理。提交人自己不能审。</p>';

    C74Sheet.open('举报', 'REPORT · 双人终审', html);

    var type = 'member';
    $$('.m-pill', $('#rpType')).forEach(function (p) {
      p.addEventListener('click', function () {
        $$('.m-pill', $('#rpType')).forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        p.setAttribute('aria-pressed', 'true');
        type = p.getAttribute('data-t');
      });
    });

    $('#rpPick').addEventListener('click', pick);
    $('#rpSend').addEventListener('click', function () {
      var target = ($('#rpTarget').value || '').trim();
      var reason = ($('#rpReason').value || '').trim();
      if (target.length < 1) { toast('写一下举报对象'); return; }
      if (reason.length < 6) { toast('理由至少 6 个字'); return; }
      var btn = this;
      btn.disabled = true; btn.textContent = '提 交 中…';
      api('/api/reports', {
        method: 'POST',
        body: { target_type: type, target_id: target, target_name: target, reason: reason, images: imgs.slice() }
      }).then(function () {
        C74Sheet.close();
        toast('已提交，等待两位高管审核');
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = '提 交 举 报';
        toast(e.message || '提交失败');
      });
    });
  }

  function $$(q, r) { return Array.prototype.slice.call((r || document).querySelectorAll(q)); }

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
    var box = $('#rpThumbs');
    if (!box) return;
    box.innerHTML = imgs.map(function (u, i) {
      return '<span class="rp-th"><img src="' + u + '" alt=""><b data-rdel="' + i + '">×</b></span>';
    }).join('');
    $$('#rpThumbs [data-rdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        imgs.splice(parseInt(b.getAttribute('data-rdel'), 10), 1);
        thumbs();
      });
    });
    var c = $('#rpCount');
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

  /* ---------------- 审核面板（高管） ---------------- */
  function openReview() {
    if (!online()) { toast('离线状态看不了'); return; }
    api('/api/reports').then(function (d) {
      var list = (d.reports || []).filter(function (r) { return r.status === 'pending'; });
      var html;
      if (!list.length) {
        html = '<div class="m-empty">没有待审的举报</div>';
      } else {
        html = list.map(function (r) {
          var ap = (r.approvals || []).filter(function (a) { return a.action === 'ok'; });
          var mine = (r.approvals || []).some(function (a) { return a.id === (ME && ME.id); });
          var self = r.from_id === (ME && ME.id);
          return '<div class="m-sec" data-rid="' + esc(r.id) + '">' +
            '<div class="m-sec-h">' + esc(r.from_name) + ' 举报 · ' + esc(r.target_name || r.target_id) + '</div>' +
            '<p class="rp-reason">' + esc(r.reason).replace(/\n/g, '<br>') + '</p>' +
            (r.images && r.images.length
              ? '<div class="rp-imgs">' + r.images.map(function (u) { return '<img src="' + u + '" alt="">'; }).join('') + '</div>'
              : '') +
            '<div class="rp-meta">已通过 ' + ap.length + ' / ' + (r.required || 2) +
              ' · ' + esc(r.created_at || '').slice(0, 16).replace('T', ' ') + '</div>' +
            (self
              ? '<p class="m-note">这是你自己提交的，不能审。</p>'
              : mine
                ? '<p class="m-note">你已经投过票，等另一位高管。</p>'
                : '<div class="m-act-row">' +
                  '<button class="m-btn" data-rv="no">驳回</button>' +
                  '<button class="m-btn solid" data-rv="ok">通过</button></div>') +
            '</div>';
        }).join('');
      }
      C74Sheet.open('举报审核', 'HIGH · 双人终审', html);

      $$('[data-rv]').forEach(function (b) {
        b.addEventListener('click', function () {
          var box = b.closest('[data-rid]');
          var id = box.getAttribute('data-rid');
          var act = b.getAttribute('data-rv');
          b.disabled = true;
          api('/api/reports/' + encodeURIComponent(id) + '/approve', { method: 'POST', body: { action: act } })
            .then(function (res) {
              if (res.status === 'pending') toast('已通过，等另一位高管确认（' + res.approvals + '/' + res.required + '）');
              else if (res.status === 'ok') toast('终审通过，已通知郭老师');
              else toast('已驳回');
              openReview();
            })
            .catch(function (e) { b.disabled = false; toast(e.message || '操作失败'); });
        });
      });
    }).catch(function (e) {
      toast(e.message || '加载失败');
    });
  }

  /* ---------------- 站内信弹窗 ---------------- */
  function checkInbox() {
    if (!online()) return;
    api('/api/inbox').then(function (d) {
      var unread = (d.inbox || []).filter(function (x) { return !x.read; });
      if (!unread.length) return;
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
      });
    });
  }

  /* ---------------- 入口 ---------------- */
  var toolsBtn = document.getElementById('toolsBtn');
  if (toolsBtn) toolsBtn.addEventListener('click', openForm);

  window.C74Report = { openForm: openForm, openReview: openReview, checkInbox: checkInbox };

  setTimeout(checkInbox, 1500);
})();
