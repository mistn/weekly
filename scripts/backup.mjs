// 一键全量备份：D1 导出为 .sql + 正文里引用的 R2 图片逐个下载
// 用法：pnpm run backup   产物在 backup/YYYY-MM-DD/（已进 .gitignore，不会 push）
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const run = (cmd) => execSync(cmd, { stdio: 'inherit', shell: true })

const stamp = new Date().toISOString().slice(0, 10)
const dir = path.join('backup', stamp)
mkdirSync(path.join(dir, 'img'), { recursive: true })

console.log('1/2 导出 D1 ...')
run(`npx wrangler d1 export weekly --remote --output "${path.join(dir, 'weekly.sql')}"`)

const sql = readFileSync(path.join(dir, 'weekly.sql'), 'utf8')
const keys = [...new Set([...sql.matchAll(/\/img\/([^\s"'()]+)/g)].map((m) => m[1]))]
console.log(`找到 ${keys.length} 张图片`)

console.log('2/2 下载 R2 ...')
for (const key of keys) {
  const dest = path.join(dir, 'img', ...key.split('/'))
  mkdirSync(path.dirname(dest), { recursive: true })
  run(`npx wrangler r2 object get "weekly-img/${key}" --file "${dest}"`)
}

console.log(`完成：${dir}（weekly.sql + img/）`)
