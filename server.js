const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const APP_DOMAIN = process.env.APP_DOMAIN || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'links.json');
const PAGE_FILE = [path.join(__dirname, 'linkora.html'), path.join(__dirname, '..', 'linkora.html')].find(file => fs.existsSync(file)) || path.join(__dirname, 'linkora.html');
let links = {};
try { links = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}

function save() { fs.writeFileSync(DB_FILE, JSON.stringify(links, null, 2)); }
function slugify(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 52).replace(/-+$/g, '');
}
const stop = new Set('www com net org it co io app html htm php aspx index page view watch share onrender vercel netlify github the and per una con del della dei delle gli https http'.split(' '));
function suggestSlug(raw) {
  const u = new URL(raw);
  const hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  const host = hostname.replace(/\.(onrender\.com|vercel\.app|netlify\.app|github\.io)$/, '').split('.').slice(0, -1).join('-') || hostname.split('.')[0];
  const pathWords = decodeURIComponent(u.pathname).split('/').filter(Boolean).map(p => p.replace(/\.[a-z0-9]{1,6}$/i, ''));
  const queryWords = [...u.searchParams.entries()].filter(([k]) => !/^(utm_|fbclid|gclid|ref$)/i.test(k)).map(([, v]) => v);
  const words = [host, ...pathWords, ...queryWords].join('-').split(/[^\p{L}\p{N}]+/u).map(slugify).filter(w => w && !stop.has(w));
  let base = slugify(words.slice(0, 7).join('-')) || 'il-mio-link';
  base = base.slice(0, 52).replace(/-+$/g, '');
  let candidate = base, n = 2;
  while (links[candidate]) candidate = `${base.slice(0, 47)}-${n++}`;
  return candidate;
}
function originFor(req) {
  if (APP_DOMAIN) return /^https?:\/\//i.test(APP_DOMAIN) ? APP_DOMAIN.replace(/\/$/, '') : `https://${APP_DOMAIN}`;
  return `http://${req.headers.host || `localhost:${PORT}`}`;
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 15000) reject(new Error('Richiesta troppo grande')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Dati non validi')); } });
    req.on('error', reject);
  });
}
function sorted() { return Object.values(links).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
function getStats() {
  const allClicks = Object.values(links).flatMap(link => link.clicks || []);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - i));
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: allClicks.filter(c => c.at.slice(0, 10) === key).length };
  });
  return { totalLinks: Object.keys(links).length, totalClicks: allClicks.length, clicksByDay: days,
    topLink: sorted().sort((a, b) => (b.clicks || []).length - (a.clicks || []).length)[0]?.slug || null };
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  if (req.method === 'GET' && pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (pathname.startsWith('/api/') && ADMIN_PASSWORD) {
    const auth = req.headers.authorization || '';
    const encoded = auth.startsWith('Basic ') ? auth.slice(6) : '';
    let supplied = '';
    try { supplied = Buffer.from(encoded, 'base64').toString('utf8').split(':').slice(1).join(':'); } catch {}
    const a = Buffer.from(supplied), b = Buffer.from(ADMIN_PASSWORD);
    if (a.length !== b.length || !require('node:crypto').timingSafeEqual(a, b)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Linkora Dashboard", charset="UTF-8"', 'Cache-Control': 'no-store' }); res.end('Autenticazione richiesta.'); return;
    }
  }
  if (req.method === 'GET' && pathname === '/') {
    fs.readFile(PAGE_FILE, (err, data) => {
      if (err) { res.writeHead(500); res.end('Impossibile caricare la pagina.'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(data);
    }); return;
  }
  if (pathname === '/api/links' && req.method === 'GET') { send(res, 200, { links: sorted().map(({ clicks, ...link }) => ({ ...link, clicks: clicks || [] })), stats: getStats(), origin: originFor(req) }); return; }
  if (pathname === '/api/suggest-slug' && req.method === 'POST') {
    try { const data = await parseBody(req); const destination = new URL(String(data.destination || '').trim()); if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('Usa un indirizzo http o https.'); send(res, 200, { slug: suggestSlug(destination.href) }); }
    catch (e) { send(res, 400, { error: e.message || 'Indirizzo non valido.' }); }
    return;
  }
  if (pathname === '/api/links' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const destination = new URL(String(data.destination || '').trim());
      if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('Usa un indirizzo che inizi con https:// o http://.');
      let slug = slugify(data.slug || suggestSlug(destination.href));
      if (!slug || slug.length < 2) throw new Error('L’abbreviazione deve contenere almeno 2 caratteri.');
      if (links[slug]) { const base = slug; let suffix = 2; while (links[slug]) slug = `${base.slice(0, 47)}-${suffix++}`; }
      const link = { slug, destination: destination.href, createdAt: new Date().toISOString(), clicks: [] };
      links[slug] = link; save();
      send(res, 201, { link: { ...link, shortUrl: `${originFor(req)}/${slug}` } });
    } catch (e) { send(res, 400, { error: e.message || 'Indirizzo non valido.' }); }
    return;
  }
  if (pathname.startsWith('/api/links/')) {
    const slug = pathname.slice('/api/links/'.length);
    const link = links[slug];
    if (!link) { send(res, 404, { error: 'Link non trovato.' }); return; }
    if (req.method === 'PATCH') {
      try {
        const data = await parseBody(req);
        if (data.destination) { const u = new URL(data.destination); if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Usa un indirizzo http o https.'); link.destination = u.href; }
        if (data.slug) {
          const updated = slugify(data.slug);
          if (updated.length < 2) throw new Error('L’abbreviazione deve contenere almeno 2 caratteri.');
          if (updated !== slug && links[updated]) throw new Error('Questa abbreviazione esiste già.');
          delete links[slug]; link.slug = updated; links[updated] = link;
        }
        save(); send(res, 200, { link: { ...link, shortUrl: `${originFor(req)}/${link.slug}` } });
      } catch (e) { send(res, 400, { error: e.message || 'Modifica non valida.' }); }
      return;
    }
    if (req.method === 'DELETE') { delete links[slug]; save(); send(res, 200, { ok: true }); return; }
  }
  if (req.method === 'GET' && /^[a-z0-9][a-z0-9-]{1,51}$/.test(pathname.slice(1))) {
    const slug = pathname.slice(1); const link = links[slug];
    if (link) { link.clicks ||= []; link.clicks.push({ at: new Date().toISOString() }); save(); res.writeHead(302, { Location: link.destination, 'Cache-Control': 'no-store' }); res.end(); return; }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Pagina o link non trovato.');
});
server.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`Linkora è pronto su http://localhost:${PORT}`));
