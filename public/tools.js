/* =========================================================
   七年四班 · 小工具面板
   目前只有「举报」，其他工具留位，后续往里加
   ========================================================= */
(function () {
  'use strict';

  var toolsBtn = document.getElementById('toolsBtn');
  if (!toolsBtn) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ICON_REPORT =
    '<svg viewBox="0 0 24 24"><path d="M6 21V4"/><path d="M6 4.5h9.5l-1.6 4 1.6 4H6"/>' +
    '<path d="M3.5 21h5"/></svg>';
  var ICON_MORE =
    '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.6" height="6.6" rx="1.6"/>' +
    '<rect x="13.4" y="4" width="6.6" height="6.6" rx="1.6"/>' +
    '<rect x="4" y="13.4" width="6.6" height="6.6" rx="1.6"/>' +
    '<path d="M16.7 13.4v6.6M13.4 16.7h6.6"/></svg>';

  function open() {
    var html =
      '<p class="tl-intro">班里的杂事都放这儿了。点开就能用，不用记路径。</p>' +
      '<div class="tl-grid">' +
        '<button class="tl-item warn" data-tool="report">' +
          '<span class="tl-ic">' + ICON_REPORT + '</span>' +
          '<span class="tl-name">举报</span>' +
          '<span class="tl-desc">违规内容 · 双人终审</span>' +
        '</button>' +
        '<div class="tl-item off">' +
          '<span class="tl-tag">待开放</span>' +
          '<span class="tl-ic">' + ICON_MORE + '</span>' +
          '<span class="tl-name">更多工具</span>' +
          '<span class="tl-desc">陆续往里加</span>' +
        '</div>' +
      '</div>' +
      '<p class="tl-foot">举报会送到高管那里，两个人分别看过才会处理。</p>';

    if (window.C74Sheet && C74Sheet.open) C74Sheet.open('小工具', 'TOOLBOX', html);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var item = t.closest('[data-tool="report"]');
    if (!item) return;
    e.preventDefault();
    if (window.C74Report && C74Report.openForm) {
      C74Report.openForm();
    } else {
      var toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = '举报面板还没准备好';
        toast.classList.add('show');
        setTimeout(function () { toast.classList.remove('show'); }, 1600);
      }
    }
  });

  toolsBtn.addEventListener('click', open);

  window.C74Tools = { open: open };
})();
