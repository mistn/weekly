import { Hono } from 'hono'
import { marked } from 'marked'

type Env = { DB: D1Database; ADMIN_PASSWORD: string }
const app = new Hono<{ Bindings: Env }>()

const css = `*{margin:0;padding:0;box-sizing:border-box}html{scrollbar-gutter:stable}body{font-family:"Noto Serif SC","Songti SC",serif;background:#fff;color:#1a1a1a;max-width:700px;margin:0 auto;padding:32px 18px;line-height:1.9;letter-spacing:.02em}header{border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:baseline}header a{color:#111;text-decoration:none}header h1{font-size:21px;letter-spacing:.08em}nav a{font-size:13px;margin-left:14px;text-decoration:underline;text-underline-offset:3px}article{padding:12px 0;border:none}article h2{font-size:17px;margin:4px 0}time{font-size:12px;color:#999;letter-spacing:.04em}.md{font-size:15px;line-height:2;color:#222}.md h1{font-size:22px;margin:24px 0 12px;border-bottom:1px solid #eee;padding-bottom:8px}.md h2{font-size:19px;margin:22px 0 10px}.md h3{font-size:16px;margin:18px 0 8px}.md p{margin:14px 0}.md li{margin:6px 0 6px 20px}.md li:has(input[type="checkbox"]){list-style:none;margin-left:0}.md li input[type="checkbox"]{margin-right:6px;vertical-align:middle;width:auto}.md a{color:#1a1a1a;text-decoration:underline;text-underline-offset:3px}.md code{background:#f6f6f6;padding:2px 5px;font-size:13px;border-radius:3px}.md pre{background:#f6f6f6;padding:14px;overflow:auto;border-radius:6px;line-height:1.6}.md pre code{background:none;padding:0}.md img{max-width:100%;border-radius:4px;margin:12px 0}.md blockquote{border-left:3px solid #111;padding:6px 14px;margin:14px 0;color:#555;background:#fafafa}.md hr{border:none;border-top:1px solid #eee;margin:20px 0}form{display:flex;flex-direction:column;gap:14px;max-width:100%}label{display:flex;flex-direction:column;gap:6px;font-size:13px}input:not([type="checkbox"]),textarea{border:1px solid #bbb;padding:10px;font:inherit;width:100%;border-radius:4px}input[type="checkbox"]{width:auto;accent-color:#111}textarea{min-height:420px;resize:vertical}button{border:1px solid #111;background:#111;color:#fff;padding:8px 20px;cursor:pointer;align-self:flex-start;border-radius:4px}button:hover{background:#000}`

const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const layout = (title: string, body: string) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><link rel="alternate" type="application/rss+xml" title="周记 RSS" href="/rss.xml"><style>${css}</style><header><h1><a href="/">周记</a></h1><nav><a href="/">首页</a><a href="/admin">写</a><a href="/rss.xml">RSS</a></nav></header><main>${body}</main>`

const ensure = async (db: D1Database) => {
  await db.prepare(`CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, date TEXT NOT NULL)`).run()
}

const getCookie = (c: any, k: string) => (c.req.header('Cookie') || '').split('; ').find((x: string) => x.startsWith(k + '='))?.split('=')[1] || ''
const isAuth = (c: any) => !c.env.ADMIN_PASSWORD || getCookie(c, 'auth') === c.env.ADMIN_PASSWORD

app.get('/login', c => {
  if (isAuth(c)) return c.redirect('/admin')
  return c.html(layout('登录', `<form method="post" action="/login" style="max-width:340px;margin:60px auto"><label style="gap:8px">密码<input name="password" type="password" required autofocus style="border:none;border-bottom:1px solid #111;border-radius:0;padding:10px 0"></label><button style="background:#fff;color:#111;border:1px solid #111;margin-top:8px">登录</button></form>`))
})
app.post('/login', async c => {
  const f = await c.req.parseBody()
  if (String(f.password) !== c.env.ADMIN_PASSWORD) return c.html(layout('登录', `<p style="color:#c00">密码错误</p><p><a href="/login">重试</a></p>`))
  return new Response(null, { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': `auth=${c.env.ADMIN_PASSWORD}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` } })
})
app.get('/logout', c => new Response(null, { status: 302, headers: { 'Location': '/', 'Set-Cookie': `auth=; Path=/; Max-Age=0` } }))

app.use('/admin*', async (c, next) => {
  if (isAuth(c)) return next()
  return c.redirect('/login')
})

app.get('/', async c => {
  await ensure(c.env.DB)
  const { results } = await c.env.DB.prepare(`SELECT id,title,date FROM entries ORDER BY id DESC`).all()
  const list = (results as any[]).map(r => `<article><time>${esc(r.date)}</time><h2><a href="/w/${r.id}">${esc(r.title)}</a></h2></article>`).join('') || `<p>还没有周记，<a href="/admin">写第一篇</a></p>`
  return c.html(layout('周记', list))
})

app.get('/w/:id', async c => {
  await ensure(c.env.DB)
  const id = c.req.param('id')
  const r = await c.env.DB.prepare(`SELECT * FROM entries WHERE id=?`).bind(id).first() as any
  if (!r) return c.notFound()
  const html = await marked.parse(r.content)
  const isAdmin = isAuth(c)
  const admin = isAdmin ? `<p style="margin-top:16px;font-size:13px"><a href="/admin/edit/${r.id}">编辑</a><span style="margin:0 8px;color:#ccc">·</span><form method="post" action="/admin/delete/${r.id}" style="display:inline" onsubmit="return confirm('删除?')"><button style="background:none;border:none;color:#999;text-decoration:underline;cursor:pointer;padding:0;font:inherit;font-size:13px">删除</button></form></p>` : ``
  return c.html(layout(r.title, `<article><time>${esc(r.date)}</time><h2>${esc(r.title)}</h2><div class="md">${html}</div>${admin}</article><p><a href="/">← 返回</a></p>`))
})

app.get('/admin', async c => {
  return c.html(layout('写周记', `<form method="post" action="/admin"><label>标题<input name="title" required></label><label>日期<input name="date" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>正文 (Markdown)<textarea name="content" required placeholder="# 本周小记&#10;&#10;- 做了什么..."></textarea></label><button>保存</button><p style="font-size:12px;color:#999;margin-top:8px"><a href="/logout">退出登录</a></p></form>`))
})

app.post('/admin', async c => {
  await ensure(c.env.DB)
  const f = await c.req.parseBody()
  const title = String(f.title || '').trim()
  const content = String(f.content || '').trim()
  const date = String(f.date || new Date().toISOString().slice(0,10))
  if (!title || !content) return c.text('title/content required', 400)
  await c.env.DB.prepare(`INSERT INTO entries (title,content,date) VALUES (?,?,?)`).bind(title, content, date).run()
  return c.redirect('/')
})

app.get('/admin/edit/:id', async c => {
  await ensure(c.env.DB)
  const r = await c.env.DB.prepare(`SELECT * FROM entries WHERE id=?`).bind(c.req.param('id')).first() as any
  if (!r) return c.notFound()
  return c.html(layout('编辑', `<form method="post" action="/admin/edit/${r.id}"><label>标题<input name="title" value="${esc(r.title)}" required></label><label>日期<input name="date" type="date" value="${esc(r.date)}"></label><label>正文<textarea name="content" required>${esc(r.content)}</textarea></label><button>更新</button></form>`))
})

app.post('/admin/edit/:id', async c => {
  await ensure(c.env.DB)
  const f = await c.req.parseBody()
  await c.env.DB.prepare(`UPDATE entries SET title=?,content=?,date=? WHERE id=?`).bind(String(f.title), String(f.content), String(f.date), c.req.param('id')).run()
  return c.redirect(`/w/${c.req.param('id')}`)
})

app.post('/admin/delete/:id', async c => {
  await ensure(c.env.DB)
  await c.env.DB.prepare(`DELETE FROM entries WHERE id=?`).bind(c.req.param('id')).run()
  return c.redirect('/')
})

const rss = async (db: D1Database, url: string) => {
  await ensure(db)
  const { results } = await db.prepare(`SELECT * FROM entries ORDER BY id DESC LIMIT 20`).all() as any
  const items = (results as any[]).map(r => {
    const link = `${url}/w/${r.id}`
    const desc = esc(r.content.slice(0, 200))
    const pub = new Date(r.date).toUTCString()
    return `<item><title>${esc(r.title)}</title><link>${link}</link><guid>${link}</guid><pubDate>${pub}</pubDate><description><![CDATA[${r.content}]]></description></item>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>周记</title><link>${url}</link><description>weekly</description>${items}</channel></rss>`
}

app.get('/rss.xml', async c => {
  const url = new URL(c.req.url).origin
  return new Response(await rss(c.env.DB, url), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
})
app.get('/feed', c => c.redirect('/rss.xml'))

export default app
