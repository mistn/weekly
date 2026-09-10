# Weekly · 极简周记

0 JS 阅读页，`Hono + D1 + marked` 服务端渲染 Markdown，可部署到 **Cloudflare Workers**，在线写周记。

- 阅读：`/` 首页 `/w/:id` 详情，纯 HTML+CSS，无前端 JS
- 写作：`/admin` 表单提交 Markdown，后台 `Hono` 存 `D1`，支持编辑/删除
- 鉴权：首页/详情公开，`/admin*` 需 `Basic Auth`（`ADMIN_PASSWORD`）
- 激励：首页顶部挂件显示墨墨背词 `今日 / 连续打卡`（`MAIMEMO_TOKEN`）
- 订阅：`/rss.xml` `/feed`

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

## 配置

`.dev.vars`（本地，不提交）：
```
ADMIN_PASSWORD=你的密码
MAIMEMO_TOKEN=墨墨open.maimemo.com的token
```
`wrangler.toml` 保持空，线上用加密变量。

`.gitignore` 已含 `.dev.vars` / `node_modules` / `.wrangler`。

## 部署到 Cloudflare Workers

1. 创建 D1：
```bash
npx wrangler d1 create weekly
# 复制 database_id 填到 wrangler.toml 的 [[d1_databases]] database_id
```

2. 设线上密钥（明文不要提交）：
```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put MAIMEMO_TOKEN
```

3. 部署：
```bash
pnpm deploy
# 或 npx wrangler deploy
```

远程建表（首次）：
```bash
npx wrangler d1 execute weekly --remote --command "CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, date TEXT NOT NULL)"
```

## 写作

- 访问 `/admin` 弹密码框 → 填 `标题 / 日期 / Markdown正文` → 保存
- Markdown 服务端用 `marked` 渲染，支持标题、列表、代码块、引用、图片

## 目录

```
src/index.ts   # Hono 路由 + 渲染
wrangler.toml  # Worker + D1 配置
seed.sql       # 3篇示例
.dev.vars      # 本地密钥（不提交）
```

## 更新

改样式直接编辑 `src/index.ts` 的 `css` 变量，`pnpm dev` 实时预览。
