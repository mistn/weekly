# Diary · 极简日记

`Hono + D1 + R2 + marked` 服务端渲染 Markdown，部署在 **Cloudflare Workers**（`diary.miuarc.com`）。

- 阅读：`/` 日记全文流，`/w/:id` 详情，纯 HTML+CSS，无前端 JS（`/d` 跳 `/`，仅兼容老链接）
- 写作：`/admin` 写 Markdown，标题可空（不填只显示日期），支持编辑/删除，存 `D1`
- 可见：公开勾掉即私密，列表/详情/RSS 全不可见，登录后自己可见
- 图片：`/admin` 选图上传 `R2`，自动压 webp（长边 1600）并插到光标处
- 预览：`/admin` 写/预览切换；鉴权：`/admin*` 需登录（`ADMIN_PASSWORD`），其余公开
- 订阅：`/rss.xml` `/feed`；渲染：标题、列表、任务列表、代码块、引用、图片、表格
- App：原生安卓端在 `diary-android/` 目录，对接 `/api/*`

## 本地

```bash
pnpm install
pnpm dev  # http://127.0.0.1:8787
npx wrangler d1 execute weekly --local --file ./seed.sql  # 示例数据
```

`.dev.vars`（不提交）：`ADMIN_PASSWORD=你的密码`

## 部署

push 到 `main` 自动部署。Secrets：`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `ADMIN_PASSWORD` / `TURNSTILE_SECRET`（登录人机校验）/ `WEBDAV_URL` + `WEBDAV_USERNAME` + `WEBDAV_PASSWORD`（备份用）。

首次建站：`npx wrangler d1 create weekly`（id 填进 `wrangler.toml`）+ `npx wrangler r2 bucket create weekly-img`，表由代码 `ensure()` 自动建。

## 备份

- 本地：`pnpm run backup`，产物在 `backup/YYYY-MM-DD/`（不进 git）
- 云端：每周一 02:00 自动备到 WebDAV，只留最近 8 份

## 目录

```
src/index.ts                  # 路由 + 渲染 + 上传/预览
scripts/backup.mjs            # 本地备份
.github/workflows/deploy.yml  # 自动部署
.github/workflows/backup.yml  # 云端备份
wrangler.toml                 # Worker + D1 + R2
seed.sql                      # 示例数据
```

改样式：编辑 `src/index.ts` 的 `css`，`pnpm dev` 看效果。
