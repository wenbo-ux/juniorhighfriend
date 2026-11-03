# 部署步骤（GitHub → Cloudflare Pages）

目标：静态站和 API 同一个域名
`https://juniorhighfriend.pages.dev` + `https://juniorhighfriend.pages.dev/api/*`

好处：国内可直连（不用梯子）、不用 CORS、不碰 workers.dev。

---

## 仓库结构（已经在工作区建好）

```
our7class-pages/
├─ public/                ← 13 个静态文件（html/css/js）
│  ├─ index.html  auth.html  admin.html
│  ├─ store.js  manage.js  upload.js  admin.js  auth.js
│  └─ upload.css  manage.css  admin.css  auth.css
├─ functions/
│  └─ api/
│     └─ [[path]].js      ← API，自动挂到 /api/*
├─ schema.sql
├─ wrangler.toml
└─ README.md
```

> `[[path]].js` 是 Pages 的「通配路由」写法，`/api/login`、`/api/reports/xxx/review` 都由它接。

---

## 第 1 步：建 GitHub 仓库

1. 打开 https://github.com/new
2. 仓库名：`our7class`
3. 选 **Private**（私有，代码不公开）
4. 不要勾 README / .gitignore（保持空仓库）
5. Create repository

然后在仓库页点 **Add file → Upload files**，把 `our7class-pages` 里的
`public/`、`functions/`、`schema.sql`、`wrangler.toml`、`README.md` 整个拖进去，Commit。

> 拖文件夹时要注意保持层级：`public/index.html` 不能被拖成根目录的 `index.html`。
> 上传后确认页面上能看到 `public` 和 `functions` 两个文件夹。

---

## 第 2 步：处理旧的 Pages 项目

现在 `juniorhighfriend.pages.dev` 被一个 **Direct Upload** 项目占着，而 Direct Upload **不能**改成连 Git。

两个选择：

**A. 想继续用 juniorhighfriend.pages.dev（推荐）**
1. Pages 里先**删掉**旧项目（数据在浏览器 localStorage，站点文件在 GitHub，删了不丢东西）
2. 新建项目时名字还叫 `juniorhighfriend`，域名就回来了

**B. 不想删**
新项目换个名字，比如 `our7class`，地址变成 `our7class.pages.dev`。
代价：旧域名里的 localStorage 数据不跟过来（成员、公告、动态要重新录）。

---

## 第 3 步：连 Git 建 Pages 项目

1. 打开 https://dash.cloudflare.com/?to=/:account/workers-and-pages
2. **Create** → **Pages** → **Connect to Git**
3. 授权 GitHub，选仓库 `our7class`
4. 构建设置：

| 项 | 填什么 |
|---|---|
| Framework preset | **None** |
| Build command | **留空** |
| Build output directory | `public` |
| Root directory | 留空 |

5. **Save and Deploy**

等 1–2 分钟，构建日志里出现 `Success: Your site was deployed!` 就好了。

---

## 第 4 步：绑 D1 数据库

Pages 项目 → **Settings** → **Functions** → **D1 database bindings** → **Add**

| 字段 | 值 |
|---|---|
| Variable name | `DB` ← 必须大写 |
| D1 database | `our7class` |

然后去 **Deployments** 标签，对最新一次部署点 **Retry deployment**（改绑定必须重新部署才生效）。

---

## 第 5 步：加初始化口令

**Settings** → **Variables and Secrets** → **Add**

| 名称 | 值 | 类型 |
|---|---|---|
| `SETUP_TOKEN` | 自己编一串，如 `q7Xm2pK9vL` | Secret |

保存后同样 **Retry deployment**。

---

## 第 6 步：验证接口

浏览器直接打开（国内可直连）：

```
https://juniorhighfriend.pages.dev/api/ping
```

看到 `{"ok":true,"ts":...}` → 函数通了。

如果返回 `404` 或 HTML 首页 → `functions/api/[[path]].js` 路径放错了，检查层级。

如果返回 `{"error":"server","detail":"D1_ERROR..."}` → D1 绑定没生效或变量名不是 `DB`。

---

## 第 7 步：初始化账户

```bash
curl -X POST https://juniorhighfriend.pages.dev/api/setup \
  -H "Content-Type: application/json" \
  -H "x-setup-token: q7Xm2pK9vL" \
  -d '{
    "accounts":[
      {"user":"温泊","name":"温泊","level":"high","pass":"你的高管密码"},
      {"user":"郭老师","name":"郭老师","level":"mid","pass":"老师密码"},
      {"user":"林小满","name":"林小满","level":"mid","pass":"另一个中管密码"}
    ]
  }'
```

返回 `{"ok":true,"accounts":3}` 成功。

然后测登录：

```bash
curl -X POST https://juniorhighfriend.pages.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"user":"郭老师","pass":"老师密码"}'
```

---

## 第 8 步：收尾

1. 删掉 `SETUP_TOKEN`（不然别人能重置账户）
2. 加变量 `ALLOWED_ORIGINS` = `https://juniorhighfriend.pages.dev`（同域其实不用，但加了更保险）
3. 每次改代码 `git push` → Pages 自动重新部署，30 秒生效

---

## 排错

| 现象 | 原因 |
|---|---|
| 构建成功但 /api/ping 是 404 | functions 目录层级错，必须是 `functions/api/[[path]].js` |
| /api/ping 返回 HTML | 同上，请求被当成静态文件了 |
| D1_ERROR: no such table | 建表脚本没在对应库里执行 |
| D1_ERROR: binding not found | 绑定变量名不是 `DB`，或没 Retry deployment |
| 登录 401 | 没跑 setup，或密码错 |
| 改了绑定没反应 | Pages 必须 Retry deployment，改设置不会自动生效 |
