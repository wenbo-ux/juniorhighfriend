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
      if (path === '/api/logout' && req.method === 'POST') return await logout(req, env, cors);
      if (path === '/api/me') return await me(req, env, cors);
      if (path === '/api/members') return await members(req, env, cors);
      if (path === '/api/bootstrap') return await bootstrap(req, env, cors);
      if (path === '/api/posts' && req.method === 'GET') return await listPosts(req, env, cors);
      if (path === '/api/posts' && req.method === 'POST') return await createPost(req, env, cors);
      if (path === '/api/notices' && req.method === 'GET') return await listNotices(req, env, cors);
      if (path === '/api/notices' && req.method === 'POST') return await createNotice(req, env, cors);
      if (path === '/api/register' && req.method === 'POST') return await register(req, env, cors);
      if (path === '/api/code/check' && req.method === 'POST') return await checkCode(req, env, cors);
      if (path === '/api/account/update' && req.method === 'POST') return await updateAccount(req, env, cors);
      if (path === '/api/reports' && req.method === 'GET') return await listReports(req, env, cors);
      if (path === '/api/reports' && req.method === 'POST') return await createReport(req, env, cors);

      const am = path.match(/^\/api\/accounts\/([\w-]+)\/(level|reset)$/);
      if (am && req.method === 'POST') return await adminAccount(req, env, cors, am[1], am[2]);

      const dm = path.match(/^\/api\/posts\/([\w-]+)$/);
      if (dm && req.method === 'DELETE') return await deletePost(req, env, cors, dm[1]);

      const m = path.match(/^\/api\/reports\/([\w-]+)\/review$/);
      if (m && req.method === 'POST') return await reviewReport(req, env, cors, m[1]);

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
    `SELECT s.token, s.expires_at, a.id, a.user, a.name, a.level
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
    if (!a.user || !a.pass || !a.level) continue;
    const hash = await makePass(String(a.pass));
    const exist = await env.DB.prepare('SELECT id FROM accounts WHERE user = ?').bind(a.user).first();
    if (exist) {
      await env.DB.prepare('UPDATE accounts SET name=?, level=?, pass=? WHERE id=?')
        .bind(a.name || a.user, a.level, hash, exist.id).run();
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
async function listReports(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  const onlyMine = new URL(req.url).searchParams.get('mine') === '1';

  let sql, binds;
  if (u.level === 'high') {
    sql = 'SELECT * FROM reports ORDER BY created_at DESC LIMIT 200';
    binds = [];
  } else if (onlyMine) {
    sql = 'SELECT * FROM reports WHERE from_id = ? ORDER BY created_at DESC LIMIT 100';
    binds = [u.id];
  } else {
    // 中管/普管：自己举报的 + 自己名下成员被举报的 + 自己处理过的
    sql = `SELECT r.* FROM reports r
             LEFT JOIN members m ON m.id = r.target_id AND r.target_type = 'member'
            WHERE r.from_id = ? OR m.owner = ? OR r.handler_id = ?
            ORDER BY r.created_at DESC LIMIT 100`;
    binds = [u.id, u.id, u.id];
  }

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const list = (results || []).map(r => Object.assign({}, r, {
    images: r.images ? JSON.parse(r.images) : []
  }));
  const pending = list.filter(r => r.status === 'pending').length;

  return json({ ok: true, reports: list, pending }, 200, cors);
}

async function createReport(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  if (reason.length < 4) return json({ error: '理由至少 4 个字' }, 400, cors);

  let images = Array.isArray(body.images) ? body.images.slice(0, 2) : [];
  images = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
  if (images.join('').length > 900000) return json({ error: '图片太大，换小一点或只放一张' }, 413, cors);

  const id = uid('r_');
  await env.DB.prepare(
    `INSERT INTO reports (id,from_id,from_name,from_level,target_type,target_id,target_name,reason,images,status,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, u.id, u.name || u.user, u.level,
    String(body.target_type || 'member'), String(body.target_id || ''), String(body.target_name || ''),
    reason, JSON.stringify(images), 'pending', nowISO()).run();

  await env.DB.prepare('INSERT INTO logs (id,at,actor,level,text) VALUES (?,?,?,?,?)')
    .bind(uid('l_'), nowISO(), u.name || u.user, u.level, '提交举报：' + (body.target_name || body.target_id || '')).run();

  return json({ ok: true, id }, 200, cors);
}

async function reviewReport(req, env, cors, id) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'high')) return json({ error: '只有高管能审核举报' }, 403, cors);

  const r = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first();
  if (!r) return json({ error: '举报不存在' }, 404, cors);

  const body = await req.json().catch(() => ({}));
  const action = body.action === 'ok' ? 'ok' : 'no';
  const note = String(body.note || '').slice(0, 300);
  const punish = String(body.punish || '').slice(0, 20);

  await env.DB.prepare(
    `UPDATE reports SET status=?, handler_id=?, handler_name=?, action=?, note=?, handled_at=? WHERE id=?`
  ).bind(action, u.id, u.name || u.user, punish, note, nowISO(), id).run();

  // 处罚落到成员表
  if (action === 'ok' && r.target_type === 'member' && r.target_id && punish) {
    if (punish === 'mute') {
      await env.DB.prepare('UPDATE members SET muted = 1 WHERE id = ?').bind(r.target_id).run();
    } else if (punish === 'ban') {
      await env.DB.prepare('UPDATE members SET banned = 1 WHERE id = ?').bind(r.target_id).run();
    }
  }

  await env.DB.prepare('INSERT INTO logs (id,at,actor,level,text) VALUES (?,?,?,?,?)')
    .bind(uid('l_'), nowISO(), u.name || u.user, u.level,
      (action === 'ok' ? '举报成立：' : '举报驳回：') + (r.target_name || r.target_id)).run();

  return json({ ok: true }, 200, cors);
}

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
    'SELECT * FROM notices ORDER BY pinned DESC, created_at DESC LIMIT 50').all();
  const notices = (results || []).map(n => Object.assign({}, n, { images: parseImages(n.images) }));
  return json({ ok: true, notices }, 200, cors);
}

async function bootstrap(req, env, cors) {
  const u = await auth(req, env);
  const [p, n, m, a] = await Promise.all([
    env.DB.prepare('SELECT * FROM posts WHERE hidden = 0 ORDER BY created_at DESC LIMIT 100').all(),
    env.DB.prepare('SELECT * FROM notices ORDER BY pinned DESC, created_at DESC LIMIT 50').all(),
    env.DB.prepare('SELECT id,name,role,owner,muted,banned FROM members ORDER BY id').all(),
    env.DB.prepare('SELECT id,user,name,level FROM accounts ORDER BY name').all()
  ]);
  return json({
    ok: true,
    user: u ? { id: u.id, user: u.user, name: u.name, level: u.level } : null,
    posts: (p.results || []).map(x => Object.assign({}, x, { images: parseImages(x.images) })),
    notices: (n.results || []).map(x => Object.assign({}, x, { images: parseImages(x.images) })),
    members: m.results || [],
    accounts: u ? (a.results || []) : []
  }, 200, cors);
}

async function createPost(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);

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
  if (!need(u, 'high')) return json({ error: '只有高管能改账户等级或重置密码' }, 403, cors);

  const acc = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
  if (!acc) return json({ error: '账户不存在' }, 404, cors);

  const b = await req.json().catch(() => ({}));

  if (action === 'level') {
    const lv = String(b.level || '');
    if (['member', 'junior', 'mid', 'high'].indexOf(lv) < 0) return json({ error: '等级不对' }, 400, cors);
    if (acc.id === u.id && lv !== acc.level) return json({ error: '不能改自己的等级' }, 400, cors);
    await env.DB.prepare('UPDATE accounts SET level = ? WHERE id = ?').bind(lv, id).run();
    await env.DB.prepare('INSERT INTO logs (id,at,actor,level,text) VALUES (?,?,?,?,?)')
      .bind(uid('l_'), nowISO(), u.name || u.user, u.level, '调整等级：' + (acc.name || acc.user) + ' → ' + lv).run();
    return json({ ok: true, level: lv }, 200, cors);
  }

  const pass = String(b.pass || '');
  if (pass.length < 4) return json({ error: '密码至少 4 位' }, 400, cors);
  const hash = await makePass(pass);
  await env.DB.prepare('UPDATE accounts SET pass = ? WHERE id = ?').bind(hash, id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(id).run();
  return json({ ok: true }, 200, cors);
}

/* ---------------- 日志 ---------------- */
async function logs(req, env, cors) {
  const u = await auth(req, env);
  if (!u) return json({ error: '未登录' }, 401, cors);
  if (!need(u, 'junior')) return json({ error: '没有权限' }, 403, cors);
  const { results } = await env.DB.prepare('SELECT * FROM logs ORDER BY at DESC LIMIT 100').all();
  return json({ ok: true, logs: results || [] }, 200, cors);
}
