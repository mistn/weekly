# Weekly · 极简周记

`Hono + D1 + R2 + marked` 服务端渲染 Markdown，部署在 **Cloudflare Workers**。

- 阅读：`/` 首页（周记）`/d` 日记流 `/w/:id` 详情，纯 HTML+CSS，无前端 JS
- 写作：`/admin` 写 Markdown，存 `D1`，支持编辑/删除，分类周记/日记
- 可见：公开勾掉即私密，列表/详情/RSS 全部不可见，登录后自己可见
- 图片：`/admin` 选图上传到 `R2`，自动插到光标处，可选压成 webp（长边 1600）
- 预览：`/admin` 写/预览切换
- 鉴权：`/admin*` 需登录（`ADMIN_PASSWORD`），其余公开
- 订阅：`/rss.xml` `/feed`
- 渲染：标题、列表、任务列表、代码块、引用、图片、表格

## 本地

```bash
pnpm install
pnpm dev
# http://127.0.0.1:8787
```

灌示例数据：
```bash
npx wrangler d1 execute weekly --local --file ./seed.sql
```

`.dev.vars`（不提交）：
```
ADMIN_PASSWORD=你的密码
```

## 部署

push 到 `main` 自动部署（`.github/workflows/deploy.yml`），`ADMIN_PASSWORD` 从 GitHub Secrets 同步。

Secrets（仓库 Settings → Secrets and variables → Actions）：
- `CLOUDFLARE_API_TOKEN`：用 “Edit Cloudflare Workers” 模板建，再手动加一行帐户 / D1 / 读取
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 后台链接里的 id
- `ADMIN_PASSWORD`
- `WEBDAV_URL`（末尾无斜杠）、`WEBDAV_USERNAME`、`WEBDAV_PASSWORD`

首次建站：
```bash
npx wrangler d1 create weekly
# database_id 填进 wrangler.toml

npx wrangler r2 bucket create weekly-img
```
表不用建，代码里 `ensure()` 首次访问自动建。

手动部署：
```bash
pnpm run deploy
```

## 写作

`/login` 登录 → `/admin` 选分类填标题/日期/正文 → 保存。日记标题默认当天日期。传图后进预览确认一眼再保存。

## 备份

- 本地：`pnpm run backup`，产物在 `backup/YYYY-MM-DD/`（不进 git）
- 云端：`.github/workflows/backup.yml` 每周一 02:00 自动备到 WebDAV，无更新自动跳过，只留最近 8 份，Actions 里也能手动 Run

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
