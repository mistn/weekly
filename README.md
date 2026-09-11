# Weekly · 极简周记

`Hono + D1 + R2 + marked` 服务端渲染 Markdown，可部署到 **Cloudflare Workers**，在线写周记，顺手记碎碎念。

- 阅读：`/` 首页 `/w/:id` 详情，纯 HTML+CSS，无前端 JS
- 写作：`/admin` 表单提交 Markdown，后台存 `D1`，支持编辑/删除
- 图片：`/admin` 直接选图上传到 `R2`，自动插 `![](url)` 到光标处
  - 勾选 `压缩成 webp（长边1600）` 即浏览器端 `canvas` 压图（默认开，gif 不压），不勾则原图直传
  - 服务端只校验 `image/*、≤10MB`，读图走 `GET /img/:key`（长缓存）
- 预览：`/admin` 写/预览切换，输入停 500ms 自动 `POST /admin/preview` 复用服务端 `marked` 渲染，不引新依赖
- 鉴权：首页/详情/`/img/*` 公开，`/admin*` 需表单登录（`ADMIN_PASSWORD`）
- 订阅：`/rss.xml` `/feed`
- 渲染：标题、列表（含任务列表）、代码块、引用、图片、分割线、表格（极简细线风）

## 本地预览

```bash
cd D:\project2\weekly
pnpm install
pnpm dev
# http://127.0.0.1:8787  首页 /admin 写周记 /w/1 详情
```

`D1` 本地自动建表，示例数据：
```bash
npx wrangler d1 execute weekly --local --file ./seed.sql
```

`R2` 本地随 `wrangler dev` 自动模拟，无需额外命令。

## 配置

`.dev.vars`（本地，不提交）：
```
ADMIN_PASSWORD=你的密码
```

`wrangler.toml` 已含 `D1 + R2` 绑定：
```toml
[[d1_databases]]
binding = "DB"
database_name = "weekly"
database_id = "你的id"

[[r2_buckets]]
binding = "IMG"
bucket_name = "weekly-img"
```

`.gitignore` 已含 `.dev.vars` / `node_modules` / `.wrangler`。

## 部署到 Cloudflare Workers

1. 创建 D1（一次）：
```bash
npx wrangler d1 create weekly
# 复制 database_id 填到 wrangler.toml
```

2. 创建 R2（一次）：
```bash
npx wrangler r2 bucket create weekly-img
# binding 名 IMG 必须跟代码 c.env.IMG 一致，不用填 id
```

3. 设线上密钥（明文不要提交）：
```bash
npx wrangler secret put ADMIN_PASSWORD
```

4. 部署：
```bash
pnpm run deploy
# 或 npx wrangler deploy
```

远程建表（首次）：
```bash
npx wrangler d1 execute weekly --remote --command "CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, date TEXT NOT NULL)"
```

## 写作

- 访问 `/login` 登录 → `/admin` 填 `标题 / 日期 / Markdown正文` → 保存
- 传图：点 `图片` 选文件，传完自动插到光标处，`预览` 确认后再保存
- Markdown 服务端用 `marked` 渲染，支持标题、列表、任务列表、代码块、引用、图片、表格

## 目录

```
src/index.ts   # Hono 路由 + 渲染 + 上传/预览
wrangler.toml  # Worker + D1 + R2 配置
seed.sql       # 3篇示例
.dev.vars      # 本地密钥（不提交）
```

## 更新

改样式直接编辑 `src/index.ts` 的 `css` 变量，`pnpm dev` 实时预览。
