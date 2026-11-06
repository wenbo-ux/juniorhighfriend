/* =========================================================
   七年四班 · 小工具面板
   举报 / 申请 / 报备，都在这儿点
   ========================================================= */
(function () {
  'use strict';

  var toolsBtn = document.getElementById('toolsBtn');
  if (!toolsBtn) return;

  function icon(p) { return '<svg viewBox="0 0 24 24">' + p + '</svg>'; }

  var ICONS = {
    report: icon('<path d="M6 21V4"/><path d="M6 4.5h9.5l-1.6 4 1.6 4H6"/><path d="M3.5 21h5"/>'),
    apply: icon('<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M13.5 3.5v4.5H18"/><path d="M9.5 12h5"/><path d="M9.5 15.5h3.5"/>'),
    note: icon('<rect x="4" y="5" width="16" height="15" rx="2.4"/><path d="M8 3.5v3M16 3.5v3"/><path d="M4 10h16"/><path d="M9.5 14h5"/>'),
    queue: icon('<path d="M4 6.5h16"/><path d="M4 12h16"/><path d="M4 17.5h10"/><circle cx="18.2" cy="17.5" r="2.2"/>'),
    more: icon('<rect x="4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.6"/><path d="M16.7 13.4v6.6M13.4 16.7h6.6"/>')
  };

  var ITEMS = [
    { tool: 'report', cls: 'warn', name: '举报', desc: '不合适的内容 · 可匿名' },
    { tool: 'apply', cls: '', name: '申请', desc: '请假 · 换座位 · 活动' },
    { tool: 'note', cls: '', name: '报备', desc: '迟到 · 生病 · 临时情况' }
  ];

  function open() {
    var me = null;
    try { me = window.C74 ? C74.me() : null; } catch (e) {}
    var items = ITEMS.slice();
    if (me && me.level === 'high') {
      items.push({ tool: 'queue', cls: 'queue', name: '待处理', desc: '还没人看过的提交' });
    }

    var cards = items.map(function (it) {
      return '<button class="tl-item ' + it.cls + '" data-tool="' + it.tool + '">' +
        '<span class="tl-ic">' + ICONS[it.tool] + '</span>' +
        '<span class="tl-name">' + it.name + '</span>' +
        '<span class="tl-desc">' + it.desc + '</span>' +
      '</button>';
    }).join('');

    var html =
      '<p class="tl-intro">班里的杂事都放这儿了。写一句就行，想让谁知道、不想让谁知道，自己说了算。</p>' +
      '<div class="tl-grid">' + cards +
        '<div class="tl-item off">' +
          '<span class="tl-tag">待开放</span>' +
          '<span class="tl-ic">' + ICONS.more + '</span>' +
          '<span class="tl-name">更多工具</span>' +
          '<span class="tl-desc">陆续往里加</span>' +
        '</div>' +
      '</div>' +
      '<p class="tl-foot">三种都可以匿名提交，匿名后只显示「匿名同学」。</p>';

    if (window.C74Sheet && C74Sheet.open) C74Sheet.open('小工具', 'TOOLBOX', html);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var item = t.closest('[data-tool]');
    if (!item) return;
    var kind = item.getAttribute('data-tool');
    e.preventDefault();
    if (kind === 'queue') {
      if (window.C74Report && C74Report.openReview) C74Report.openReview();
      return;
    }
    if (window.C74Report && C74Report.open) {
      C74Report.open(kind);
    } else {
      var toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = '面板还没准备好';
        toast.classList.add('show');
        setTimeout(function () { toast.classList.remove('show'); }, 1600);
      }
    }
  });

  toolsBtn.addEventListener('click', open);

  window.C74Tools = { open: open };
})();
