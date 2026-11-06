/* =========================================================
   七年四班 · API（Cloudflare Pages Functions + D1）
   部署位置：functions/api/[[path]].js → 挂在 /api/*
   路由：
     GET  /api/ping
     POST /api/setup          { accounts:[], members:[] }  （需 x-setup-token）
     POST /api/login          { user, pass }
     POST /api/logout
     GET  /api/me
     GET  /api/members
     GET  /api/reports        按角色返回可见举报
     POST /api/reports        { target_type, target_id, target_name, reason, images }
     POST /api/reports/:id/review  { action:'ok'|'no', note, punish }
     GET  /api/logs
   绑定：D1 变量名必须是 DB
   环境变量：SETUP_TOKEN（初始化用，配好后删掉）
             ALLOWED_ORIGINS（可选，逗号分隔；不填 = *）
   ========================================================= */
const enc = new TextEncoder();
const RANK = { member: 0, junior: 1, mid: 2, high: 3 };
const ITER = 100000;

async function handle(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const cors = corsHeaders(req, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (path === '/api/ping') return json({ ok: true, ts: Date.now() }, 200, cors);

      if (path === '/api/setup' && req.method === 'POST') return await setup(req, env, cors);
      if (path === '/api/login' && req.method === 'POST') return await login(req, env, cors);
      if (path === '/api/gate-login' && req.method === 'POST') return await gateLogin(req, env, cors);
      if (path === '/api/logout' && req.method === 'POST') return await logout(req, env, cors);
      if (path === '/api/me') return await me(req, env, cors);
      if (path === '/api/members') return await members(req, env, cors);
      if (path === '/api/bootstrap') return await bootstrap(req, env, cors);
      if (path === '/api/posts' && req.method === 'GET') return await listPosts(req, env, cors);
      if (path === '/api/posts' && req.method === 'POST') return await createPost(req, env, cors);
      if (path === '/api/notices' && req.method === 'GET') return await listNotices(req, env, cors);
      const nrd = path.match(/^\/api\/notices\/([\w-]+)\/read$/);
      if (nrd && req.method === 'POST') return await readNotice(req, env, cors, nrd[1]);
      if (path === '/api/notices' && req.method === 'POST') return await createNotice(req, env, cors);
      if (path === '/api/register' && req.method === 'POST') return await register(req, env, cors);
      if (path === '/api/code/check' && req.method === 'POST') return await checkCode(req, env, cors);
      if (path === '/api/account/update' && req.method === 'POST') return await updateAccount(req, env, cors);
      if (path === '/api/account/avatar' && req.method === 'POST') return await saveAvatar(req, env, cors);
      if (path === '/api/tickets' && req.method === 'GET') return await listTickets(req, env, cors);
      if (path === '/api/tickets' && req.method === 'POST') return await createTicket(req, env, cors);
      const tk = path.match(/^\/api\/tickets\/([\w-]+)\/(vote|done)$/);
      if (tk && req.method === 'POST') return await voteTicket(req, env, cors, tk[1]);

      const am = path.match(/^\/api\/accounts\/([\w-]+)\/(level|reset|admin|restore)$/);
      if (am && req.method === 'POST') return await adminAccount(req, env, cors, am[1], am[2]);

      const dmAcc = path.match(/^\/api\/accounts\/([\w-]+)$/);
      if (dmAcc && req.method === 'DELETE') return await adminAccount(req, env, cors, dmAcc[1], 'delete');

      const dm = path.match(/^\/api\/posts\/([\w-]+)$/);
      if (dm && req.method === 'DELETE') return await deletePost(req, env, cors, dm[1]);

      const prs = path.match(/^\/api\/posts\/([\w-]+)\/restore$/);
      if (prs && req.method === 'POST') return await restorePost(req, env, cors, prs[1]);

      const ppin = path.match(/^\/api\/posts\/([\w-]+)\/pin$/);
      if (ppin && req.method === 'POST') return await pinPost(req, env, cors, ppin[1]);

      const npin = path.match(/^\/api\/notices\/([\w-]+)\/pin$/);
      if (npin && req.method === 'POST') return await pinNotice(req, env, cors, npin[1]);

      const ndel = path.match(/^\/api\/notices\/([\w-]+)$/);
      if (ndel && req.method === 'DELETE') return await deleteNotice(req, env, cors, ndel[1]);

      if (path === '/api/lock' && req.method === 'POST') return await setLock(req, env, cors);

      if (path === '/api/codes' && req.method === 'GET') return await listCodes(req, env, cors);
      if (path === '/api/codes' && req.method === 'POST') return await createCodes(req, env, cors);
      const cd = path.match(/^\/api\/codes\/([A-Z0-9]+)$/);
      if (cd && req.method === 'DELETE') return await dropCode(req, env, cors, cd[1]);

      if (path === '/api/points' && req.method === 'GET') return await getPoints(req, env, cors);
      if (path === '/api/points/name' && req.method === 'POST') return await setPointName(req, env, cors);
      if (path === '/api/points/score' && req.method === 'POST') return await addPointScore(req, env, cors);
      if (path === '/api/points/notice' && req.method === 'POST') return await setPointsNotice(req, env, cors);

      if (path === '/api/inbox' && req.method === 'GET') return await listInbox(req, env, cors);
      const ib = path.match(/^\/api\/inbox\/([\w-]+)\/read$/);
      if (ib && req.method === 'POST') return await readInbox(req, env, cors, ib[1]);

      if (path === '/api/logs') return await logs(req, env, cors);

      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ error: 'server', detail: String(e && e.message || e) }, 500, cors);
    }
}

/* Pages Functions 入口：/api/* 全部交给 handle */
export const onRequest = (ctx) => handle(ctx.request, ctx.env);
export const onRequestGet = onRequest;
export const onRequestPost = onRequest;

/* ---------------- 基础 ---------------- */
function corsHeaders(req, env) {
  const allow = (env.ALLOWED_ORIGINS || '*').trim();
  let origin = '*';
  if (allow !== '*') {
    const list = allow.split(',').map(s => s.trim()).filter(Boolean);
    const o = req.headers.get('Origin') || '';
    origin = list.includes(o) ? o : list[0] || '*';
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-setup-token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors)
  });
}
function nowISO() { return new Date().toISOString(); }
function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function hashPass(pass, saltHex, iter) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter || ITER, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}
async function makePass(pass) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const h = await hashPass(pass, salt, ITER);
  return `pbkdf2$${ITER}$${salt}$${h}`;
}
async function checkPass(pass, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4) return false;
  const iter = parseInt(parts[1], 10) || ITER;
  const h = await hashPass(pass, parts[2], iter);
  return h === parts[3];
}

async function auth(req, env) {
  const h = req.headers.get('Authorization') || '';
  const token = h.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT s.token, s.expires_at, a.id, a.user, a.name, a.level, a.muted, a.banned
       FROM sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.token = ?`
  ).bind(token).first();
  if (!row) return null;
  if (row.expires_at && row.expires_at < nowISO()) return null;
  return row;
}
function need(user, minLevel) {
  return user && (RANK[user.level] || 0) >= (RANK[minLevel] || 0);
}

/* ---------------- 初始化 ---------------- */
async function setup(req, env, cors) {
  if (!env.SETUP_TOKEN) return json({ error: 'SETUP_TOKEN 未设置' }, 400, cors);
  if (req.headers.get('x-setup-token') !== env.SETUP_TOKEN) return json({ error: 'setup token 不对' }, 403, cors);

  const body = await req.json().catch(() => ({}));
  const accounts = Array.isArray(body.accounts) ? body.accounts : [];
  const mems = Array.isArray(body.members) ? body.members : [];
  let accN = 0, memN = 0;

  for (const a of accounts) {
    /* 只设置管理密钥（不动登录密码） */
    if (a.user && a.gate && !a.pass) {
      const target = await env.DB.prepare('SELECT id FROM accounts WHERE user = ?').bind(a.user).first();
      if (target) {
        const gh = await makePass(String(a.gate));
        await env.DB.prepare('UPDATE accounts SET gate_key = ? WHERE id = ?').bind(gh, target.id).run();
        accN++;
      }
      continue;
    }
    if (!a.user || !a.pass || !a.level) continue;
    const hash = await makePass(String(a.pass));
    const exist = await env.DB.prepare('SELECT id FROM accounts WHERE user = ?').bind(a.user).first();
    if (exist) {
      if (a.gate) {
        const gh = await makePass(String(a.gate));
        await env.DB.prepare('UPDATE accounts SET name=?, level=?, pass=?, gate_key=? WHERE id=?')
          .bind(a.name || a.user, a.level, hash, gh, exist.id).run();
      } else {
        await env.DB.prepare('UPDATE accounts SET name=?, level=?, pass=? WHERE id=?')
          .bind(a.name || a.user, a.level, hash, exist.id).run();
      }
    } else {
      await env.DB.prepare('INSERT INTO accounts (id,user,name,level,pass,created_at) VALUES (?,?,?,?,?,?)')
        .bind(uid('a_'), a.user, a.name || a.user, a.level, hash, nowISO()).run();
    }
    accN++;
  }

  for (const m of mems) {
    if (!m.id) continue;
    await env.DB.prepare(
      `INSERT INTO members (id,name,role,owner) VALUES (?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, owner=excluded.owner`
    ).bind(m.id, m.name || m.id, m.role || 'member', m.owner || null).run();
    memN++;
  }

  return json({ ok: true, accounts: accN, members: memN }, 200, cors);
}

/* ---------------- 登录 ---------------- */
async function login(req, env, cors) {
  const body = await req.json().catch(() => ({}));
  const user = String(body.user || '').trim();
  const pass = String(body.pass || '');
  if (!user || !pass) return json({ error: '账号密码都要填' }, 400, cors);

  /* 先按登录名精确匹配，再退到昵称，避免重名歧义 */
  let acc = await env.DB.prepare('SELECT * FROM accounts WHERE user = ?').bind(user).first();
  if (!acc) acc = await env.DB.prepare('SELECT * FROM accounts WHERE name = ?').bind(user).first();
  if (!acc || !(await checkPass(pass, acc.pass))) return json({ error: '账号或密码不对' }, 401, cors);
  if (acc.deleted) return json({ error: '账号不存在' }, 401, cors);
  if (acc.banned) return json({ error: '这个账号已被封禁，联系管理员' }, 403, cors);

  const token = uid('t_') + hex(crypto.getRandomValues(new Uint8Array(12)));
  const exp = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(); // 14 天
  await env.DB.prepare('INSERT INTO sessions (token,account_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(token, acc.id, nowISO(), exp).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowISO()).run();

  return json({
    ok: true, token, expires_at: exp,
    user: { id: acc.id, user: acc.user, name: acc.name, level: acc.level }
  }, 200, cors);
}

async function gateLogin(req, env, cors) {
  const b = await req.json().catch(() => ({}));
  const user = String(b.user || '').trim();
  const key = String(b.key || '').trim();
  if (!user || key.length < 4) return json({ error: '用户名或管理密钥不完整' }, 400, cors);

  let acc = await env.DB.prepare('SELECT * FROM accounts WHERE user = ?').bind(user).first();
  if (!acc) acc = await env.DB.prepare('SELECT * FROM accounts WHERE name = ?').bind(user).first();
  if (!acc || acc.deleted) return json({ error: '账号不存在' }, 401, cors);

  const target = acc.gate_key || acc.pass;
  if (!(await checkPass(key, target))) return json({ error: '管理密钥不对' }, 401, cors);
  if (['junior', 'mid', 'high'].indexOf(acc.level) < 0) return json({ error: '这个账号没有管理权限' }, 403, cors);

  const token = uid('t_') + hex(crypto.getRandomValues(new Uint8Array(12)));
  const exp = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token,account_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(token, acc.id, nowISO(), exp).run();

  return json({
    ok: true, token, expires_at: exp,
    user: { id: acc.id, user: acc.user, name: acc.name, level: acc.level }
  }, 200, cors);
}

async function logout(req, env, cors) {
  const h = req.headers.get('Authorization') || '';
  const token = h.replace(/^Bearer\s+/i, '').trim();
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true }, 200, cors);
}

async function me(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  return json({ ok: true, user: { id: u.id, user: u.user, name: u.name, level: u.level } }, 200, cors);
}

/* ---------------- 成员 ---------------- */
async function members(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  const { results } = await env.DB.prepare('SELECT id,name,role,owner,muted,banned FROM members ORDER BY id').all();
  return json({ ok: true, members: results || [] }, 200, cors);
}

/* ---------------- 举报 ---------------- */
async function deletePost(req, env, cors, id) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  const p = await env.DB.prepare('SELECT id, who_id FROM posts WHERE id = ?').bind(id).first();
  if (!p) return json({ error: '不存在' }, 404, cors);
  const mine = p.who_id === u.id;
  if (!mine && !need(u, 'junior')) return json({ error: '只能删自己的动态' }, 403, cors);
  await env.DB.prepare('UPDATE posts SET hidden = 1 WHERE id = ?').bind(id).run();
  return json({ ok: true }, 200, cors);
}

/* ---------------- 发布锁定 ---------------- */
async function getLock(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'lock'").first();
    if (!row || !row.value) return { locked: false };
    const v = JSON.parse(row.value);
    return { locked: !!v.locked, by: v.by || '', at: v.at || '' };
  } catch (e) {
    return { locked: false };
  }
}

async function setLock(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'mid')) return json({ error: '只有中管及以上能锁定班级' }, 403, cors);

  const b = await req.json().catch(() => ({}));
  const locked = !!b.locked;
  const val = JSON.stringify({ locked, by: u.name || u.user, at: nowISO() });
  await env.DB.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('lock',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(val, nowISO()).run();

  await env.DB.prepare('INSERT INTO logs (id,at,actor,level,text) VALUES (?,?,?,?,?)')
    .bind(uid('l_'), nowISO(), u.name || u.user, u.level, locked ? '锁定班级发布' : '解除锁定').run();

  return json({ ok: true, locked, by: u.name || u.user }, 200, cors);
}

/* ---------------- 动态 / 公告 ---------------- */
function parseImages(v) {
  if (!v) return [];
  try { var a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

async function listPosts(req, env, cors) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM posts WHERE hidden = 0 ORDER BY created_at DESC LIMIT 100').all();
  const posts = (results || []).map(p => Object.assign({}, p, { images: parseImages(p.images) }));
  return json({ ok: true, posts }, 200, cors);
}

async function listNotices(req, env, cors) {
  const { results } = await env.DB.prepare(
    `SELECT n.*, (SELECT COUNT(*) FROM notice_reads r WHERE r.notice_id = n.id) AS reads
       FROM notices n ORDER BY n.pinned DESC, n.created_at DESC LIMIT 50`).all();
  const notices = (results || []).map(n => Object.assign({}, n, { images: parseImages(n.images) }));
  return json({ ok: true, notices }, 200, cors);
}

async function bootstrap(req, env, cors) {
  const u = await auth(req, env);
  const [p, n, m, a] = await Promise.all([
    env.DB.prepare(`SELECT p.*, a.avatar AS who_avatar FROM posts p
                      LEFT JOIN accounts a ON a.id = p.who_id
                     WHERE p.hidden = 0 ORDER BY p.created_at DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT n.*, a.avatar AS author_avatar,
                      (SELECT COUNT(*) FROM notice_reads r WHERE r.notice_id = n.id) AS reads
                      FROM notices n LEFT JOIN accounts a ON a.id = n.author_id
                     ORDER BY n.pinned DESC, n.created_at DESC LIMIT 50`).all(),
    env.DB.prepare('SELECT id,name,role,owner,muted,banned FROM members ORDER BY id').all(),
    env.DB.prepare('SELECT id,user,name,level,muted,banned,avatar FROM accounts WHERE deleted = 0 ORDER BY name').all()
  ]);
  return json({
    ok: true,
    lock: await getLock(env),
    user: u ? { id: u.id, user: u.user, name: u.name, level: u.level } : null,
    posts: (p.results || []).map(x => Object.assign({}, x, { images: parseImages(x.images) })),
    notices: (n.results || []).map(x => Object.assign({}, x, { images: parseImages(x.images) })),
    members: m.results || [],
    accounts: u ? (a.results || []) : [],
    accountTotal: (a.results || []).length
  }, 200, cors);
}

async function createPost(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (u.muted) return json({ error: '你已被禁言，暂时不能发动态' }, 403, cors);
  const lock = await getLock(env);
  if (lock.locked && !need(u, 'mid')) {
    return json({ error: '班级已锁定' + (lock.by ? '（' + lock.by + '）' : '') + '，暂时只有中管及以上能发布' }, 403, cors);
  }

  const b = await req.json().catch(() => ({}));
  const text = String(b.text || '').trim();
  const type = b.type === 'photo' ? 'photo' : 'text';
  let images = Array.isArray(b.images) ? b.images.slice(0, 3) : [];
  images = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
  if (!text) return json({ error: '内容不能为空' }, 400, cors);
  if (text.length > 500) return json({ error: '太长了' }, 400, cors);
  if (type === 'photo' && !images.length) return json({ error: '照片必须配文案和图片' }, 400, cors);
  if (images.join('').length > 1800000) return json({ error: '图片太大，请少放或换小图' }, 413, cors);

  const d = new Date();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  const id = 'u' + d.getTime().toString(36) + Math.random().toString(36).slice(2, 5);
  const date = d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  const at = pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());

  await env.DB.prepare(
    `INSERT INTO posts (id,who,who_id,type,text,images,date,at,pinned,hidden,created_at)
     VALUES (?,?,?,?,?,?,?,?,0,0,?)`
  ).bind(id, u.name || u.user, u.id, type, text, JSON.stringify(images), date, at, new Date().toISOString()).run();

  const post = { id, who: u.name || u.user, who_id: u.id, type, text, images, date, at, pinned: 0, hidden: 0,
                 created_at: new Date().toISOString() };
  return json({ ok: true, post }, 200, cors);
}

async function readNotice(req, env, cors, id) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  await env.DB.prepare(
    'INSERT INTO notice_reads (notice_id, account_id, at) VALUES (?,?,?) ON CONFLICT(notice_id, account_id) DO NOTHING'
  ).bind(id, u.id, nowISO()).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM notice_reads WHERE notice_id = ?').bind(id).first();
  return json({ ok: true, reads: row ? row.c : 0 }, 200, cors);
}

async function createNotice(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'mid')) return json({ error: '中级及以上才能发公告' }, 403, cors);

  const b = await req.json().catch(() => ({}));
  const text = String(b.text || '').trim();
  if (text.length < 2) return json({ error: '至少写两个字' }, 400, cors);
  let images = Array.isArray(b.images) ? b.images.slice(0, 3) : [];
  images = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
  if (images.join('').length > 1800000) return json({ error: '图片太大' }, 413, cors);

  const pinned = b.pinned !== false;
  if (pinned) await env.DB.prepare('UPDATE notices SET pinned = 0').run();

  const id = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const iso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO notices (id,text,author,author_id,urgent,pinned,images,at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(id, text, u.name || u.user, u.id, b.urgent ? 1 : 0, pinned ? 1 : 0,
    JSON.stringify(images), iso.slice(0, 16).replace('T', ' '), iso).run();

  return json({ ok: true, notice: { id, text, author: u.name || u.user, urgent: b.urgent ? 1 : 0,
    pinned: pinned ? 1 : 0, images } }, 200, cors);
}

async function updateAccount(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);

  const b = await req.json().catch(() => ({}));
  const oldPass = String(b.oldPass || '');
  if (!oldPass) return json({ error: '请输入原密码' }, 400, cors);

  const acc = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(u.id).first();
  if (!acc) return json({ error: '账户不存在' }, 404, cors);
  if (!(await checkPass(oldPass, acc.pass))) return json({ error: '原密码不对' }, 403, cors);

  const name = String(b.name || '').trim();
  const newPass = String(b.newPass || '');

  if (!name && !newPass) return json({ error: '没有要改的内容' }, 400, cors);

  if (name) {
    if (name.length < 2 || name.length > 16) return json({ error: '名字需要 2–16 个字' }, 400, cors);
    if (name !== acc.name) {
      const dup = await env.DB.prepare('SELECT id FROM accounts WHERE name = ? AND id <> ?').bind(name, acc.id).first();
      if (dup) return json({ error: '这个名字已经被用了' }, 409, cors);
    }
  }
  if (newPass && newPass.length < 4) return json({ error: '新密码至少 4 位' }, 400, cors);

  let hash = null;
  if (newPass) hash = await makePass(newPass);

  await env.DB.prepare(
    'UPDATE accounts SET name = ?, pass = ? WHERE id = ?'
  ).bind(name || acc.name, hash || acc.pass, acc.id).run();

  /* 改密码后让其它会话失效，只保留当前这把 */
  if (hash) {
    const h = req.headers.get('Authorization') || '';
    const keep = h.replace(/^Bearer\s+/i, '').trim();
    await env.DB.prepare('DELETE FROM sessions WHERE account_id = ? AND token <> ?').bind(acc.id, keep).run();
  }

  return json({ ok: true, user: {
    id: acc.id, user: acc.user,
    name: name || acc.name,
    level: acc.level
  } }, 200, cors);
}

async function saveAvatar(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  const b = await req.json().catch(() => ({}));
  const img = String(b.image || '');
  if (!img.startsWith('data:image/')) return json({ error: '图片格式不对' }, 400, cors);
  if (img.length > 400000) return json({ error: '头像太大，换一张小点的' }, 413, cors);
  await env.DB.prepare('UPDATE accounts SET avatar = ? WHERE id = ?').bind(img, u.id).run();
  return json({ ok: true, avatar: img }, 200, cors);
}

async function findCode(env, code) {
  const c = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c) return null;
  const row = await env.DB.prepare('SELECT * FROM codes WHERE code = ?').bind(c).first();
  return row || null;
}

async function checkCode(req, env, cors) {
  const b = await req.json().catch(() => ({}));
  const row = await findCode(env, b.code);
  if (!row) return json({ ok: true, valid: false, error: '注册码无效' }, 200, cors);
  if (row.used) return json({ ok: true, valid: false, error: '这个注册码已经被用过了' }, 200, cors);
  return json({ ok: true, valid: true, note: row.note || '班级成员', batch: row.batch || '2026 秋季' }, 200, cors);
}

async function register(req, env, cors) {
  const b = await req.json().catch(() => ({}));
  const user = String(b.user || '').trim();
  const pass = String(b.pass || '');
  const code = String(b.code || '').trim().toUpperCase();
  if (!user || pass.length < 6) return json({ error: '昵称或密码不合规' }, 400, cors);

  const row = await findCode(env, code);
  if (!row) return json({ error: '注册码无效' }, 403, cors);
  if (row.used) return json({ error: '这个注册码已经被用过了' }, 409, cors);

  const exist = await env.DB.prepare('SELECT id FROM accounts WHERE user = ?').bind(user).first();
  if (exist) return json({ error: '这个学号已经注册过了' }, 409, cors);
  const dispName = String(b.name || user).slice(0, 20);
  const dupName = await env.DB.prepare('SELECT id FROM accounts WHERE name = ?').bind(dispName).first();
  if (dupName) return json({ error: '这个昵称已经被用了，换一个' }, 409, cors);

  const hash = await makePass(pass);
  const id = uid('a_');
  await env.DB.prepare('INSERT INTO accounts (id,user,name,level,pass,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id, user, String(b.name || user).slice(0, 20), 'member', hash, new Date().toISOString()).run();
  await env.DB.prepare('UPDATE codes SET used = 1, used_by = ?, used_at = ? WHERE code = ?')
    .bind(user, new Date().toISOString(), String(code).replace(/[^A-Z0-9]/g, '')).run();
  return json({ ok: true, user: { id, user, name: String(b.name || user).slice(0, 20), level: 'member' } }, 200, cors);
}

async function adminAccount(req, env, cors, id, action) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'junior')) return json({ error: '没有管理权限' }, 403, cors);

  const acc = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
  if (!acc) return json({ error: '账户不存在' }, 404, cors);

  const self = acc.id === u.id;
  const targetHigh = acc.level === 'high';
  const b = req.method === 'DELETE' ? {} : await req.json().catch(() => ({}));

  function deny(msg) { return json({ error: msg }, 403, cors); }
  function logIt(text) {
    return env.DB.prepare('INSERT INTO logs (id,at,actor,level,text) VALUES (?,?,?,?,?)')
      .bind(uid('l_'), nowISO(), u.name || u.user, u.level, text).run();
  }

  /* 等级调整：只有高管可以，且不能碰其他高管 */
  if (action === 'level') {
    if (!need(u, 'high')) return deny('只有高管能调整权限');
    if (self) return deny('不能改自己的等级');
    if (targetHigh) return deny('不能调整其他高管的权限');
    const lv = String(b.level || '');
    if (['member', 'junior', 'mid'].indexOf(lv) < 0) return deny('只能设为普通成员 / 普通管理 / 中级管理');
    await env.DB.prepare('UPDATE accounts SET level = ? WHERE id = ?').bind(lv, id).run();
    await logIt('调整等级：' + (acc.name || acc.user) + ' → ' + lv);
    return json({ ok: true, level: lv }, 200, cors);
  }

  /* 重置密码：只有高管 */
  if (action === 'reset') {
    if (!need(u, 'high')) return deny('只有高管能重置密码');
    if (targetHigh && !self) return deny('不能重置其他高管的密码');
    const pass = String(b.pass || '');
    if (pass.length < 4) return json({ error: '密码至少 4 位' }, 400, cors);
    const hash = await makePass(pass);
    await env.DB.prepare('UPDATE accounts SET pass = ? WHERE id = ?').bind(hash, id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(id).run();
    await logIt('重置密码：' + (acc.name || acc.user));
    return json({ ok: true }, 200, cors);
  }

  /* 删除账户（软删除，可撤销） */
  if (action === 'delete') {
    if (self) return deny('不能删除自己');
    if (targetHigh) return deny('不能删除其他高管');
    if (!need(u, 'mid') && acc.level !== 'member') return deny('普通管理只能移除普通成员');
    await env.DB.prepare('UPDATE accounts SET deleted = 1 WHERE id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(id).run();
    await logIt('删除账户：' + (acc.name || acc.user));
    return json({ ok: true, undo: { type: 'account.delete', id: id } }, 200, cors);
  }

  /* 撤销删除 */
  if (action === 'restore') {
    if (!need(u, 'junior')) return deny('没有管理权限');
    if (targetHigh && !self) return deny('不能处置其他高管');
    await env.DB.prepare('UPDATE accounts SET deleted = 0 WHERE id = ?').bind(id).run();
    await logIt('恢复账户：' + (acc.name || acc.user));
    return json({ ok: true }, 200, cors);
  }

  /* 禁言 / 封禁 / 改名 */
  if (action === 'admin') {
    if (!need(u, 'junior')) return deny('没有管理权限');
    if (targetHigh && !self) return deny('不能处置其他高管');
    const act = String(b.action || '');
    if (act === 'rename') {
      if (!need(u, 'mid')) return deny('普通管理不能改资料');
      const name = String(b.name || '').trim();
      if (name.length < 2 || name.length > 16) return json({ error: '名字需要 2–16 个字' }, 400, cors);
      const dup = await env.DB.prepare('SELECT id FROM accounts WHERE name = ? AND id <> ?').bind(name, id).first();
      if (dup) return json({ error: '这个名字已经被用了' }, 409, cors);
      await env.DB.prepare('UPDATE accounts SET name = ? WHERE id = ?').bind(name, id).run();
      await logIt('改昵称：' + (acc.name || acc.user) + ' → ' + name);
      return json({ ok: true, name }, 200, cors);
    }
    if (act === 'mute' || act === 'unmute') {
      await env.DB.prepare('UPDATE accounts SET muted = ? WHERE id = ?').bind(act === 'mute' ? 1 : 0, id).run();
      await logIt((act === 'mute' ? '禁言：' : '解除禁言：') + (acc.name || acc.user));
      return json({ ok: true, muted: act === 'mute' ? 1 : 0 }, 200, cors);
    }
    if (act === 'ban' || act === 'unban') {
      if (!need(u, 'high')) return deny('只有高管能封禁');
      await env.DB.prepare('UPDATE accounts SET banned = ? WHERE id = ?').bind(act === 'ban' ? 1 : 0, id).run();
      if (act === 'ban') await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(id).run();
      await logIt((act === 'ban' ? '封禁：' : '解封：') + (acc.name || acc.user));
      return json({ ok: true, banned: act === 'ban' ? 1 : 0 }, 200, cors);
    }
    return json({ error: '未知操作' }, 400, cors);
  }

  return json({ error: '未知操作' }, 400, cors);
}

async function restorePost(req, env, cors, id) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'junior')) return json({ error: '没有管理权限' }, 403, cors);
  await env.DB.prepare('UPDATE posts SET hidden = 0 WHERE id = ?').bind(id).run();
  return json({ ok: true }, 200, cors);
}

async function pinPost(req, env, cors, id) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'mid')) return json({ error: '普通管理不能置顶动态' }, 403, cors);
  const b = await req.json().catch(() => ({}));
  const on = !!b.pinned;
  if (on) await env.DB.prepare('UPDATE posts SET pinned = 0').run();
  await env.DB.prepare('UPDATE posts SET pinned = ? WHERE id = ?').bind(on ? 1 : 0, id).run();
  return json({ ok: true, pinned: on }, 200, cors);
}

async function pinNotice(req, env, cors, id) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'mid')) return json({ error: '普通管理不能置顶公告' }, 403, cors);
  const b = await req.json().catch(() => ({}));
  const on = !!b.pinned;
  if (on) await env.DB.prepare('UPDATE notices SET pinned = 0').run();
  await env.DB.prepare('UPDATE notices SET pinned = ? WHERE id = ?').bind(on ? 1 : 0, id).run();
  return json({ ok: true, pinned: on }, 200, cors);
}

async function deleteNotice(req, env, cors, id) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'junior')) return json({ error: '没有删除公告的权限' }, 403, cors);
  await env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(id).run();
  await env.DB.prepare('INSERT INTO logs (id,at,actor,level,text) VALUES (?,?,?,?,?)')
    .bind(uid('l_'), nowISO(), u.name || u.user, u.level, '删除公告 ' + id).run();
  return json({ ok: true }, 200, cors);
}

/* ---------------- 注册码管理 ---------------- */
async function listCodes(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'high')) return json({ error: '只有高管能管理注册码' }, 403, cors);

  const { results } = await env.DB.prepare(
    'SELECT code,used,used_by,used_at,created_at,note,batch FROM codes ORDER BY used ASC, created_at DESC'
  ).all();

  const rows = results || [];
  const groups = {};
  rows.forEach(r => {
    const k = r.batch || '未分组';
    groups[k] = groups[k] || { batch: k, total: 0, used: 0 };
    groups[k].total++;
    if (r.used) groups[k].used++;
  });

  return json({
    ok: true,
    codes: rows,
    groups: Object.keys(groups).map(k => groups[k]),
    total: rows.length,
    used: rows.filter(r => r.used).length
  }, 200, cors);
}

function genCode(n) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  const buf = crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) out += A[buf[i] % A.length];
  return out;
}

async function createCodes(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'high')) return json({ error: '只有高管能生成注册码' }, 403, cors);

  const b = await req.json().catch(() => ({}));
  const count = Math.max(1, Math.min(50, parseInt(b.count, 10) || 1));
  const batch = String(b.batch || '未分组').slice(0, 20);
  const note = String(b.note || '班级成员').slice(0, 20);
  const len = Math.max(8, Math.min(16, parseInt(b.length, 10) || 10));
  const iso = nowISO();

  const created = [];
  for (let i = 0; i < count; i++) {
    let code = genCode(len), tries = 0;
    while (tries++ < 5) {
      const dup = await env.DB.prepare('SELECT code FROM codes WHERE code = ?').bind(code).first();
      if (!dup) break;
      code = genCode(len);
    }
    await env.DB.prepare(
      'INSERT INTO codes (code,used,created_at,note,batch) VALUES (?,0,?,?,?)'
    ).bind(code, iso, note, batch).run();
    created.push(code);
  }
  return json({ ok: true, created, batch }, 200, cors);
}

async function dropCode(req, env, cors, code) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'high')) return json({ error: '只有高管能删除注册码' }, 403, cors);

  const row = await env.DB.prepare('SELECT * FROM codes WHERE code = ?').bind(code).first();
  if (!row) return json({ error: '注册码不存在' }, 404, cors);
  if (row.used) return json({ error: '已经用过的码不能删除' }, 409, cors);
  await env.DB.prepare('DELETE FROM codes WHERE code = ?').bind(code).run();
  return json({ ok: true }, 200, cors);
}

/* ---------------- 举报 / 申请 / 报备（tickets） ----------------
   任何登录同学都能提交，可以匿名。
   提交后先进入待处理队列，由有审核权限的账号看过之后才会转给老师；
   界面上不写这些，只是流程上确实过一遍。                               */
const TICKET_LABEL = { report: '举报', apply: '申请', note: '报备' };

async function notifyAccount(env) {
  let name = '郭老师';
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'report_notify'").first();
    if (row && row.value) name = row.value;
  } catch (e) {}
  return await env.DB.prepare('SELECT id FROM accounts WHERE user = ? OR name = ?')
    .bind(name, name).first();
}

function ticketText(t) {
  const who = t.anonymous ? '匿名同学' : (t.from_name || '同学');
  return who + (t.target ? ' · ' + t.target : '') + '\n' + t.text;
}

async function createTicket(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);

  const b = await req.json().catch(() => ({}));
  const kind = TICKET_LABEL[b.kind] ? b.kind : 'report';
  const type = String(b.type || 'other').slice(0, 20);
  const target = String(b.target || '').trim().slice(0, 60);
  const text = String(b.text || b.reason || '').trim();
  const min = kind === 'report' ? 4 : 2;
  if (text.length < min) return json({ error: '说明至少 ' + min + ' 个字' }, 400, cors);

  let images = Array.isArray(b.images) ? b.images.slice(0, 2) : [];
  images = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
  if (images.join('').length > 900000) return json({ error: '图片太大，换小一点或只放一张' }, 413, cors);

  /* 只有举报能匿名；申请、报备一律实名 */
  const anonymous = (kind === 'report' && b.anonymous) ? 1 : 0;
  const id = uid('t_');
  await env.DB.prepare(
    `INSERT INTO tickets (id,kind,type,target,text,images,anonymous,from_id,from_name,status,created_at,approvals,required)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, kind, type, target, text, JSON.stringify(images), anonymous,
    u.id, anonymous ? null : (u.name || u.user), 'pending', nowISO(), '[]', 2).run();

  await env.DB.prepare('INSERT INTO logs (id,at,actor,level,text) VALUES (?,?,?,?,?)')
    .bind(uid('l_'), nowISO(), u.name || u.user, u.level,
      '提交' + TICKET_LABEL[kind] + (anonymous ? '（匿名）' : '')).run();

  /* 进待处理队列：通知有审核权限的账号（站内不出现身份相关的字样） */
  const revs = await env.DB.prepare(
    "SELECT id FROM accounts WHERE level = 'high' AND deleted = 0"
  ).all();
  for (const h of (revs.results || [])) {
    await pushInbox(env, h.id, 'ticket', id,
      '有新的' + TICKET_LABEL[kind] + '待处理',
      ticketText({ anonymous: anonymous, from_name: (u.name || u.user), target: target, text: text }),
      images);
  }

  return json({ ok: true, id }, 200, cors);
}

async function listTickets(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);

  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const reviewer = need(u, 'high');
  const mineOnly = url.searchParams.get('mine') === '1' || !reviewer;

  let sql = 'SELECT * FROM tickets';
  const where = [], binds = [];
  if (kind && TICKET_LABEL[kind]) { where.push('kind = ?'); binds.push(kind); }
  if (mineOnly) { where.push('from_id = ?'); binds.push(u.id); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const list = (results || []).map(r => Object.assign({}, r, {
    images: r.images ? JSON.parse(r.images) : [],
    approvals: r.approvals ? JSON.parse(r.approvals) : [],
    from_name: r.anonymous ? '匿名' : (r.from_name || '同学')
  }));
  const pend = list.filter(t => t.status === 'pending');
  const counts = { all: pend.length, report: 0, apply: 0, note: 0 };
  pend.forEach(t => { if (counts[t.kind] != null) counts[t.kind]++; });
  return json({
    ok: true,
    tickets: list,
    pending: pend.length,
    counts: counts,
    can: { review: reviewer }
  }, 200, cors);
}

/* 审核：两人都通过才算通过；任一人驳回立即结束 */
async function voteTicket(req, env, cors, id) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'high')) return json({ error: '没有权限' }, 403, cors);

  const t = await env.DB.prepare('SELECT * FROM tickets WHERE id = ?').bind(id).first();
  if (!t) return json({ error: '不存在' }, 404, cors);
  if (t.status !== 'pending') return json({ error: '这条已经处理过了' }, 409, cors);

  const b = await req.json().catch(() => ({}));
  const action = b.action === 'no' ? 'no' : 'ok';

  let approvals = t.approvals ? JSON.parse(t.approvals) : [];
  if (approvals.some(a => a.id === u.id)) return json({ error: '你已经处理过了' }, 409, cors);
  approvals.push({ id: u.id, name: u.name || u.user, at: nowISO(), action: action });

  if (action === 'no') {
    await env.DB.prepare(
      "UPDATE tickets SET status = 'no', approvals = ?, handled_by = ?, handled_at = ? WHERE id = ?"
    ).bind(JSON.stringify(approvals), u.name || u.user, nowISO(), id).run();
    return json({ ok: true, status: 'no', approvals: approvals.length }, 200, cors);
  }

  const required = t.required || 2;
  const oks = approvals.filter(a => a.action === 'ok').length;
  if (oks < required) {
    await env.DB.prepare('UPDATE tickets SET approvals = ? WHERE id = ?')
      .bind(JSON.stringify(approvals), id).run();
    return json({ ok: true, status: 'pending', approvals: oks, required: required }, 200, cors);
  }

  await env.DB.prepare(
    "UPDATE tickets SET status = 'ok', approvals = ?, handled_by = ?, handled_at = ? WHERE id = ?"
  ).bind(JSON.stringify(approvals), u.name || u.user, nowISO(), id).run();

  /* 通过后转给老师 */
  const acc = await notifyAccount(env);
  if (acc && acc.id) {
    await pushInbox(env, acc.id, 'ticket', id,
      TICKET_LABEL[t.kind] + '已处理',
      ticketText(t), t.images ? JSON.parse(t.images) : []);
  }
  return json({ ok: true, status: 'ok', approvals: oks }, 200, cors);
}

async function pushInbox(env, accountId, type, refId, title, body, images) {
  if (!accountId) return;
  await env.DB.prepare(
    'INSERT INTO inbox (id,account_id,type,ref_id,title,body,images,read,created_at) VALUES (?,?,?,?,?,?,?,0,?)'
  ).bind(uid('i_'), accountId, type, refId, title, body, JSON.stringify(images || []), nowISO()).run();
}

async function listInbox(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  const { results } = await env.DB.prepare(
    'SELECT * FROM inbox WHERE account_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(u.id).all();
  const rows = (results || []).map(x => Object.assign({}, x, {
    images: x.images ? JSON.parse(x.images) : []
  }));
  return json({ ok: true, inbox: rows, unread: rows.filter(x => !x.read).length }, 200, cors);
}

async function readInbox(req, env, cors, id) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  await env.DB.prepare('UPDATE inbox SET read = 1 WHERE id = ? AND account_id = ?').bind(id, u.id).run();
  return json({ ok: true }, 200, cors);
}

/* ---------------- 日志 ---------------- */

/* ---------------- 积分册 ---------------- */
/* 加减分 / 公告：只有「积分管理员」（默认郭老师）能改；名字：中管及以上能改 */
async function pointOwnerIds(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'points_owner'").first();
  if (row && row.value) {
    try { const a = JSON.parse(row.value); if (Array.isArray(a) && a.length) return a; } catch (e) {}
  }
  return [];
}
async function isPointOwner(u, env) {
  if (!u || !need(u, 'mid')) return false;
  const ids = await pointOwnerIds(env);
  if (ids.length) return ids.indexOf(u.id) >= 0;
  return (u.name === '郭老师') || (u.user === '郭老师');
}
async function getPoints(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  const { results } = await env.DB.prepare(
    'SELECT slot,name,score,updated_at FROM points ORDER BY slot ASC'
  ).all();
  const nRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'points_notice'").first();
  let notice = '';
  try { notice = nRow ? (JSON.parse(nRow.value).text || '') : ''; } catch (e) { notice = nRow ? String(nRow.value) : ''; }
  const owner = await isPointOwner(u, env);
  return json({
    ok: true,
    rows: results || [],
    notice: notice,
    can: { name: need(u, 'mid'), score: owner, notice: owner },
    me: { name: u.name || u.user, level: u.level }
  }, 200, cors);
}
async function setPointName(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'mid')) return json({ error: '只有中管及以上能填名字' }, 403, cors);
  const b = await req.json().catch(() => ({}));
  const slot = parseInt(b.slot, 10);
  if (!(slot >= 1 && slot <= 50)) return json({ error: '序号不对' }, 400, cors);
  const name = String(b.name == null ? '' : b.name).trim().slice(0, 12);
  await env.DB.prepare('UPDATE points SET name = ?, updated_at = ? WHERE slot = ?')
    .bind(name || null, nowISO(), slot).run();
  return json({ ok: true, slot, name: name }, 200, cors);
}
async function addPointScore(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!(await isPointOwner(u, env))) return json({ error: '只有郭老师能加减分' }, 403, cors);
  const b = await req.json().catch(() => ({}));
  const slot = parseInt(b.slot, 10);
  const delta = parseInt(b.delta, 10);
  if (!(slot >= 1 && slot <= 50)) return json({ error: '序号不对' }, 400, cors);
  if (!delta || Math.abs(delta) > 1000) return json({ error: '分值不对' }, 400, cors);
  const cur = await env.DB.prepare('SELECT score FROM points WHERE slot = ?').bind(slot).first();
  if (!cur) return json({ error: '没有这一行' }, 404, cors);
  const score = (cur.score || 0) + delta;
  await env.DB.prepare('UPDATE points SET score = ?, updated_at = ? WHERE slot = ?')
    .bind(score, nowISO(), slot).run();
  return json({ ok: true, slot, score }, 200, cors);
}
async function setPointsNotice(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!(await isPointOwner(u, env))) return json({ error: '只有郭老师能发积分公告' }, 403, cors);
  const b = await req.json().catch(() => ({}));
  const text = String(b.text == null ? '' : b.text).trim().slice(0, 500);
  const val = JSON.stringify({ text: text, by: u.name || u.user, at: nowISO() });
  await env.DB.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('points_notice',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).bind(val, nowISO()).run();
  return json({ ok: true, notice: text }, 200, cors);
}
async function logs(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'junior')) return json({ error: '没有权限' }, 403, cors);
  const { results } = await env.DB.prepare('SELECT * FROM logs ORDER BY at DESC LIMIT 100').all();
  return json({ ok: true, logs: results || [] }, 200, cors);
}
