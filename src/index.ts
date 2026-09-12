import { Hono } from 'hono'
import { marked } from 'marked'

type Env = { DB: D1Database; ADMIN_PASSWORD: string; IMG: R2Bucket }
const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
})

const css = `*{margin:0;padding:0;box-sizing:border-box}html{scrollbar-gutter:stable}body{font-family:"Noto Serif SC","Songti SC",serif;background:#fff;color:#1a1a1a;max-width:700px;margin:0 auto;padding:32px 18px;line-height:1.9;letter-spacing:.02em}header{border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:baseline}header a{color:#111;text-decoration:none}header h1{font-size:21px;letter-spacing:.08em}nav a{font-size:13px;margin-left:14px;text-decoration:underline;text-underline-offset:3px}article{padding:12px 0;border:none}article h2{font-size:17px;margin:4px 0}time{font-size:12px;color:#999;letter-spacing:.04em}.md{font-size:15px;line-height:2;color:#222}.md h1{font-size:22px;margin:24px 0 12px;border-bottom:1px solid #eee;padding-bottom:8px}.md h2{font-size:19px;margin:22px 0 10px}.md h3{font-size:16px;margin:18px 0 8px}.md p{margin:14px 0}.md li{margin:6px 0 6px 20px}.md li:has(input[type="checkbox"]){list-style:none;margin-left:0}.md li input[type="checkbox"]{margin-right:6px;vertical-align:middle;width:auto}.md a{color:#1a1a1a;text-decoration:underline;text-underline-offset:3px}.md code{background:#f6f6f6;padding:2px 5px;font-size:13px;border-radius:3px}.md pre{background:#f6f6f6;padding:14px;overflow:auto;border-radius:6px;line-height:1.6}.md pre code{background:none;padding:0}.md img{max-width:100%;border-radius:4px;margin:12px 0}.md blockquote{border-left:3px solid #111;padding:6px 14px;margin:14px 0;color:#555;background:#fafafa}.md hr{border:none;border-top:1px solid #eee;margin:20px 0}form{display:flex;flex-direction:column;gap:14px;max-width:100%}label{display:flex;flex-direction:column;gap:6px;font-size:13px}input:not([type="checkbox"]),textarea{border:1px solid #bbb;padding:10px;font:inherit;width:100%;border-radius:4px}input[type="checkbox"]{width:auto;accent-color:#111}textarea{min-height:420px;resize:vertical}button{border:1px solid #111;background:#fff;color:#111;padding:8px 20px;cursor:pointer;align-self:flex-start;border-radius:4px}button:hover{background:#111;color:#fff}.md table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;line-height:1.7;display:block;overflow-x:auto;white-space:nowrap}.md th,.md td{border-bottom:1px solid #eee;padding:8px 10px;text-align:left}.md th{border-bottom:2px solid #111;white-space:nowrap}.md td{color:#333}`

const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const layout = (title: string, body: string) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><link rel="alternate" type="application/rss+xml" title="周记 RSS" href="/rss.xml"><style>${css}</style><header><h1><a href="/">周记</a></h1><nav><a href="/">首页</a><a href="/d">日记</a><a href="/admin">写</a><a href="/rss.xml">RSS</a></nav></header><main>${body}</main>`

const ensure = async (db: D1Database) => {
  await db.prepare(`CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, date TEXT NOT NULL, kind TEXT DEFAULT 'weekly', visible INTEGER DEFAULT 1)`).run()
  try { await db.prepare(`ALTER TABLE entries ADD COLUMN kind TEXT DEFAULT 'weekly'`).run() } catch {}
  try { await db.prepare(`ALTER TABLE entries ADD COLUMN visible INTEGER DEFAULT 1`).run() } catch {}
}

const getCookie = (c: any, k: string) => (c.req.header('Cookie') || '').split('; ').find((x: string) => x.startsWith(k + '='))?.split('=')[1] || ''
const isAuth = (c: any) => !c.env.ADMIN_PASSWORD || getCookie(c, 'auth') === c.env.ADMIN_PASSWORD || (c.req.header('Authorization') || '').replace('Bearer ','') === c.env.ADMIN_PASSWORD || c.req.header('X-Auth') === c.env.ADMIN_PASSWORD

app.get('/login', c => {
  if (isAuth(c)) return c.redirect('/admin')
  return c.html(layout('登录', `<form method="post" action="/login" style="max-width:340px;margin:60px auto"><label style="gap:8px">密码<input name="password" type="password" required autofocus style="border:1px solid #111;border-radius:4px;padding:12px"></label></form>`))
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
  const admin = isAuth(c)
  const { results } = await c.env.DB.prepare(`SELECT id,title,date,visible FROM entries WHERE (kind='weekly' OR kind IS NULL) ORDER BY id DESC`).all()
  const list = (results as any[]).filter(r => r.visible || admin).map(r => `<article><time>${esc(r.date)}</time><h2><a href="/w/${r.id}">${esc(r.title)}</a>${r.visible ? '' : '（私密）'}</h2></article>`).join('') || `<p>还没有周记，<a href="/admin">写第一篇</a></p>`
  return c.html(layout('周记', list))
})

app.get('/d', async c => {
  await ensure(c.env.DB)
  const admin = isAuth(c)
  const { results } = await c.env.DB.prepare(`SELECT * FROM entries WHERE kind='diary' ORDER BY date DESC, id DESC`).all()
  const items = (results as any[]).filter(r => r.visible || admin)
  const body = (await Promise.all(items.map(async r => {
    const html = await marked.parse(r.content)
    const ctl = admin ? `<p style="font-size:13px"><a href="/admin/edit/${r.id}">编辑</a></p>` : ``
    return `<article><time>${esc(r.date)}</time><h2><a href="/w/${r.id}">${esc(r.title)}</a>${r.visible ? '' : '（私密）'}</h2><div class="md">${html}</div>${ctl}</article>`
  }))).join('') || `<p>还没有日记，<a href="/admin">写第一篇</a></p>`
  return c.html(layout('日记', body))
})

app.get('/w/:id', async c => {
  await ensure(c.env.DB)
  const id = c.req.param('id')
  const r = await c.env.DB.prepare(`SELECT * FROM entries WHERE id=?`).bind(id).first() as any
  if (!r) return c.notFound()
  const isAdmin = isAuth(c)
  if (!r.visible && !isAdmin) return c.notFound()
  const html = await marked.parse(r.content)
  const admin = isAdmin ? `<p style="margin-top:16px;font-size:13px"><a href="/admin/edit/${r.id}">编辑</a><span style="margin:0 8px;color:#ccc">·</span><form method="post" action="/admin/delete/${r.id}" style="display:inline" onsubmit="return confirm('删除?')"><button style="background:none;border:none;color:#999;text-decoration:underline;cursor:pointer;padding:0;font:inherit;font-size:13px">删除</button></form></p>` : ``
  return c.html(layout(r.title, `<article><time>${esc(r.date)}</time><h2>${esc(r.title)}</h2>${r.visible ? '' : `<p style="font-size:12px;color:#999">仅自己可见</p>`}<div class="md">${html}</div>${admin}</article><p><a href="/">← 返回</a></p>`))
})

app.get('/admin', async c => {
  return c.html(layout('写周记', `<form method="post" action="/admin"><label>标题<input name="title" required></label><label>日期<input name="date" type="date" value="${new Date().toISOString().slice(0,10)}"></label><div style="display:flex;gap:16px;font-size:13px"><label style="flex-direction:row;align-items:center;gap:6px">分类<select name="kind" id="kind" style="border:1px solid #bbb;padding:8px;border-radius:4px;font:inherit" onchange="if(this.value==='diary'){var t=document.querySelector('input[name=title]');if(t&&!t.value.trim())t.value=new Date().toISOString().slice(0,10)}"><option value="weekly">周记</option><option value="diary">日记</option></select></label><label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="visible" checked> 公开</label></div><div style="font-size:13px;color:#666"><div>图片 <input type="file" id="imgfile" accept="image/*"></div><label style="flex-direction:row;align-items:center;gap:6px;margin-top:8px;font-size:13px"><input type="checkbox" id="towebp" checked> 压缩成 webp（长边1600）</label><span id="imgmsg" style="font-size:12px;color:#999;margin-left:8px"></span></div><label>正文 (Markdown)</label><div style="display:flex;gap:16px;align-items:center;font-size:13px;margin:-8px 0 0"><button type="button" id="tab-write" style="background:none;border:none;padding:0;text-decoration:underline;text-underline-offset:3px;font-weight:bold;align-self:auto">写</button><button type="button" id="tab-prev" style="background:none;border:none;padding:0;color:#999;align-self:auto">预览</button><span id="prevmsg" style="font-size:12px;color:#999"></span></div><textarea id="content" name="content" required placeholder="# 本周小记&#10;&#10;- 做了什么..."></textarea><div id="preview" class="md" style="display:none;border:1px solid #eee;border-radius:4px;padding:14px;min-height:200px"></div><button>保存</button><p style="font-size:12px;color:#999;margin-top:8px"><a href="/logout">退出登录</a></p></form><script>
const ta = document.getElementById('content');
const fi = document.getElementById('imgfile');
const msg = document.getElementById('imgmsg');
function insertText(t) {
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + t + ta.value.slice(e);
  ta.focus();
}
function compress(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1600;
      let w = img.width, h = img.height;
      if (w > max || h > max) {
        const r = Math.min(max / w, max / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob((b) => b ? resolve(new File([b], file.name.replace(/\\.[^.]+$/, '') + '.webp', { type: 'image/webp' })) : reject(new Error('compress failed')), 'image/webp', 0.82);
    };
    img.onerror = () => reject(new Error('decode failed'));
    img.src = url;
  });
}
fi.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  msg.textContent = '上传中...';
  try {
    let up = f;
    const wantWebp = document.getElementById('towebp').checked;
    if (wantWebp && f.type !== 'image/webp' && f.type !== 'image/gif') up = await compress(f);
    const fd = new FormData();
    fd.append('file', up, up.name || 'img');
    const r = await fetch('/admin/upload', { method: 'POST', body: fd });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || ('http ' + r.status));
    insertText('\\n![](' + j.url + ')\\n');
    msg.textContent = '已插入 ' + j.url;
    e.target.value = '';
    ta.dispatchEvent(new Event('input'));
    if (typeof updatePreview === 'function' && typeof mode !== 'undefined' && mode === 'prev') updatePreview();
  } catch (err) { msg.textContent = '失败: ' + err.message; }
});
const pv = document.getElementById('preview');
const tabW = document.getElementById('tab-write');
const tabP = document.getElementById('tab-prev');
const prevmsg = document.getElementById('prevmsg');
let mode = 'write';
let deb = null;
function setMode(m) {
  mode = m;
  const isPrev = m === 'prev';
  pv.style.display = isPrev ? 'block' : 'none';
  ta.style.display = isPrev ? 'none' : 'block';
  tabW.style.fontWeight = isPrev ? 'normal' : 'bold';
  tabW.style.color = isPrev ? '#999' : '#111';
  tabW.style.textDecoration = 'underline';
  tabP.style.fontWeight = isPrev ? 'bold' : 'normal';
  tabP.style.color = isPrev ? '#111' : '#999';
  tabP.style.textDecoration = 'underline';
  if (isPrev) updatePreview();
}
async function updatePreview() {
  const md = ta.value.trim();
  if (!md) { pv.innerHTML = '<p style="color:#999;font-size:13px">还没有内容</p>'; return; }
  prevmsg.textContent = '渲染中...';
  try {
    const r = await fetch('/admin/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: ta.value }) });
    pv.innerHTML = await r.text();
    prevmsg.textContent = '';
  } catch (err) { prevmsg.textContent = '预览失败'; }
}
tabW.addEventListener('click', () => setMode('write'));
tabP.addEventListener('click', () => setMode('prev'));
ta.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { if (mode === 'prev') updatePreview(); }, 500); });
</script>`))
})

app.post('/admin', async c => {
  await ensure(c.env.DB)
  const f = await c.req.parseBody()
  const kind = String(f.kind || '') === 'diary' ? 'diary' : 'weekly'
  const visible = f.visible ? 1 : 0
  const date = String(f.date || new Date().toISOString().slice(0,10))
  let title = String(f.title || '').trim()
  const content = String(f.content || '').trim()
  if (!title && kind === 'diary') title = date
  if (!title || !content) return c.text('title/content required', 400)
  await c.env.DB.prepare(`INSERT INTO entries (title,content,date,kind,visible) VALUES (?,?,?,?,?)`).bind(title, content, date, kind, visible).run()
  return c.redirect(kind === 'diary' ? '/d' : '/')
})

app.post('/admin/preview', async c => {
  if (!isAuth(c)) return c.text('unauthorized', 401)
  const b: any = await c.req.json().catch(async () => await c.req.parseBody())
  const md = String(b.content ?? b.md ?? '')
  const html = await marked.parse(md)
  return c.html(String(html))
})

app.get('/admin/edit/:id', async c => {
  await ensure(c.env.DB)
  const r = await c.env.DB.prepare(`SELECT * FROM entries WHERE id=?`).bind(c.req.param('id')).first() as any
  if (!r) return c.notFound()
  return c.html(layout('编辑', `<form method="post" action="/admin/edit/${r.id}"><label>标题<input name="title" value="${esc(r.title)}" required></label><label>日期<input name="date" type="date" value="${esc(r.date)}"></label><div style="display:flex;gap:16px;font-size:13px"><label style="flex-direction:row;align-items:center;gap:6px">分类<select name="kind" style="border:1px solid #bbb;padding:8px;border-radius:4px;font:inherit"><option value="weekly"${r.kind === 'diary' ? '' : ' selected'}>周记</option><option value="diary"${r.kind === 'diary' ? ' selected' : ''}>日记</option></select></label><label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="visible"${r.visible === 0 ? '' : ' checked'}> 公开</label></div><div style="font-size:13px;color:#666"><div>图片 <input type="file" id="imgfile" accept="image/*"></div><label style="flex-direction:row;align-items:center;gap:6px;margin-top:8px;font-size:13px"><input type="checkbox" id="towebp" checked> 压缩成 webp（长边1600）</label><span id="imgmsg" style="font-size:12px;color:#999;margin-left:8px"></span></div><label>正文 (Markdown)</label><div style="display:flex;gap:16px;align-items:center;font-size:13px;margin:-8px 0 0"><button type="button" id="tab-write" style="background:none;border:none;padding:0;text-decoration:underline;text-underline-offset:3px;font-weight:bold;align-self:auto">写</button><button type="button" id="tab-prev" style="background:none;border:none;padding:0;color:#999;align-self:auto">预览</button><span id="prevmsg" style="font-size:12px;color:#999"></span></div><textarea id="content" name="content" required>${esc(r.content)}</textarea><div id="preview" class="md" style="display:none;border:1px solid #eee;border-radius:4px;padding:14px;min-height:200px"></div><button>更新</button></form><script>
const ta = document.getElementById('content');
const fi = document.getElementById('imgfile');
const msg = document.getElementById('imgmsg');
function insertText(t) {
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + t + ta.value.slice(e);
  ta.focus();
}
function compress(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1600;
      let w = img.width, h = img.height;
      if (w > max || h > max) {
        const r = Math.min(max / w, max / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob((b) => b ? resolve(new File([b], file.name.replace(/\\.[^.]+$/, '') + '.webp', { type: 'image/webp' })) : reject(new Error('compress failed')), 'image/webp', 0.82);
    };
    img.onerror = () => reject(new Error('decode failed'));
    img.src = url;
  });
}
fi.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  msg.textContent = '上传中...';
  try {
    let up = f;
    const wantWebp = document.getElementById('towebp').checked;
    if (wantWebp && f.type !== 'image/webp' && f.type !== 'image/gif') up = await compress(f);
    const fd = new FormData();
    fd.append('file', up, up.name || 'img');
    const r = await fetch('/admin/upload', { method: 'POST', body: fd });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || ('http ' + r.status));
    insertText('\\n![](' + j.url + ')\\n');
    msg.textContent = '已插入 ' + j.url;
    e.target.value = '';
    ta.dispatchEvent(new Event('input'));
    if (typeof updatePreview === 'function' && typeof mode !== 'undefined' && mode === 'prev') updatePreview();
  } catch (err) { msg.textContent = '失败: ' + err.message; }
});
const pv = document.getElementById('preview');
const tabW = document.getElementById('tab-write');
const tabP = document.getElementById('tab-prev');
const prevmsg = document.getElementById('prevmsg');
let mode = 'write';
let deb = null;
function setMode(m) {
  mode = m;
  const isPrev = m === 'prev';
  pv.style.display = isPrev ? 'block' : 'none';
  ta.style.display = isPrev ? 'none' : 'block';
  tabW.style.fontWeight = isPrev ? 'normal' : 'bold';
  tabW.style.color = isPrev ? '#999' : '#111';
  tabW.style.textDecoration = 'underline';
  tabP.style.fontWeight = isPrev ? 'bold' : 'normal';
  tabP.style.color = isPrev ? '#111' : '#999';
  tabP.style.textDecoration = 'underline';
  if (isPrev) updatePreview();
}
async function updatePreview() {
  const md = ta.value.trim();
  if (!md) { pv.innerHTML = '<p style="color:#999;font-size:13px">还没有内容</p>'; return; }
  prevmsg.textContent = '渲染中...';
  try {
    const r = await fetch('/admin/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: ta.value }) });
    pv.innerHTML = await r.text();
    prevmsg.textContent = '';
  } catch (err) { prevmsg.textContent = '预览失败'; }
}
tabW.addEventListener('click', () => setMode('write'));
tabP.addEventListener('click', () => setMode('prev'));
ta.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { if (mode === 'prev') updatePreview(); }, 500); });
</script>`))
})

app.post('/admin/edit/:id', async c => {
  await ensure(c.env.DB)
  const f = await c.req.parseBody()
  const kind = String(f.kind || '') === 'diary' ? 'diary' : 'weekly'
  const visible = f.visible ? 1 : 0
  await c.env.DB.prepare(`UPDATE entries SET title=?,content=?,date=?,kind=?,visible=? WHERE id=?`).bind(String(f.title), String(f.content), String(f.date), kind, visible, c.req.param('id')).run()
  return c.redirect(`/w/${c.req.param('id')}`)
})

app.post('/admin/delete/:id', async c => {
  await ensure(c.env.DB)
  await c.env.DB.prepare(`DELETE FROM entries WHERE id=?`).bind(c.req.param('id')).run()
  return c.redirect('/')
})

app.post('/admin/upload', async c => {
  if (!isAuth(c)) return c.json({ ok: false, error: 'unauthorized' }, 401)
  if (!c.env.IMG) return c.json({ ok: false, error: 'R2 not bound, check wrangler.toml' }, 500)
  const f = await c.req.parseBody()
  const file = f.file as unknown as File
  if (!file || typeof (file as any).arrayBuffer !== 'function') return c.json({ ok: false, error: 'no file' }, 400)
  if (!file.type.startsWith('image/')) return c.json({ ok: false, error: 'not image' }, 400)
  if (file.type === 'image/svg+xml') return c.json({ ok: false, error: 'svg not allowed' }, 400)
  if (file.size > 10 * 1024 * 1024) return c.json({ ok: false, error: 'too large, max 10MB' }, 400)
  const ext = file.type.includes('webp') ? 'webp' : file.type.includes('png') ? 'png' : file.type.includes('gif') ? 'gif' : 'jpg'
  const key = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  await c.env.IMG.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
  return c.json({ ok: true, url: `/img/${key}` })
})

app.get('/img/*', async c => {
  if (!c.env.IMG) return c.text('R2 not bound', 500)
  const key = c.req.path.replace(/^\/img\//, '')
  if (!key || key.includes('..')) return c.text('bad key', 400)
  const obj = await c.env.IMG.get(key)
  if (!obj) return c.text('not found', 404)
  const h = new Headers()
  obj.writeHttpMetadata(h)
  h.set('Cache-Control', 'public, max-age=31536000, immutable')
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('ETag', obj.httpEtag)
  return new Response(obj.body, { headers: h })
})

const rss = async (db: D1Database, url: string) => {
  await ensure(db)
  const { results } = await db.prepare(`SELECT * FROM entries WHERE visible=1 ORDER BY id DESC LIMIT 20`).all() as any
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

app.use('/api/*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Headers', 'Authorization, X-Auth, Content-Type')
  if (c.req.method === 'OPTIONS') return c.text('', 204)
  await next()
})
app.post('/api/login', async c => {
  const b: any = await c.req.json().catch(async () => await c.req.parseBody())
  const p = b.password || b.auth
  if (p !== c.env.ADMIN_PASSWORD) return c.json({ ok: false }, 401)
  return c.json({ ok: true })
})
app.get('/api/entries', async c => {
  await ensure(c.env.DB)
  const admin = isAuth(c)
  const { results } = await c.env.DB.prepare(`SELECT id,title,date,content,kind,visible FROM entries ORDER BY id DESC`).all()
  return c.json((results as any[]).filter(r => r.visible || admin))
})
app.get('/api/entries/:id', async c => {
  await ensure(c.env.DB)
  const r = await c.env.DB.prepare(`SELECT * FROM entries WHERE id=?`).bind(c.req.param('id')).first() as any
  if (!r) return c.json({ error: 'not found' }, 404)
  if (!r.visible && !isAuth(c)) return c.json({ error: 'not found' }, 404)
  return c.json(r)
})
app.post('/api/entries', async c => {
  if (!isAuth(c)) return c.json({ error: 'unauthorized' }, 401)
  await ensure(c.env.DB)
  const b: any = await c.req.json()
  const kind = b.kind === 'diary' ? 'diary' : 'weekly'
  const visible = b.visible ? 1 : 0
  await c.env.DB.prepare(`INSERT INTO entries (title,content,date,kind,visible) VALUES (?,?,?,?,?)`).bind(b.title, b.content, b.date || new Date().toISOString().slice(0,10), kind, visible).run()
  return c.json({ ok: true })
})
app.put('/api/entries/:id', async c => {
  if (!isAuth(c)) return c.json({ error: 'unauthorized' }, 401)
  await ensure(c.env.DB)
  const b: any = await c.req.json()
  const kind = b.kind === 'diary' ? 'diary' : 'weekly'
  const visible = b.visible ? 1 : 0
  await c.env.DB.prepare(`UPDATE entries SET title=?,content=?,date=?,kind=?,visible=? WHERE id=?`).bind(b.title, b.content, b.date, kind, visible, c.req.param('id')).run()
  return c.json({ ok: true })
})
app.delete('/api/entries/:id', async c => {
  if (!isAuth(c)) return c.json({ error: 'unauthorized' }, 401)
  await ensure(c.env.DB)
  await c.env.DB.prepare(`DELETE FROM entries WHERE id=?`).bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

export default app
