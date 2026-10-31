const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const STOP = new Set('www com net org it co io app html htm php aspx index page view watch share the and per una con del della dei delle gli onrender vercel netlify github http https'.split(' '));

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS }); }
function cleanSlug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 52).replace(/-+$/g, '');
}
function fallbackSlug(raw) {
  const u = new URL(raw);
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.(onrender\.com|vercel\.app|netlify\.app|github\.io)$/, '');
  const hostName = host.split('.').slice(0, -1).join('-') || host.split('.')[0];
  const pathWords = decodeURIComponent(u.pathname).split('/').filter(Boolean).map(p => p.replace(/\.[a-z0-9]{1,6}$/i, ''));
  const queryWords = [...u.searchParams.entries()].filter(([k]) => !/^utm_|^(fbclid|gclid|ref)$/i.test(k)).map(([, v]) => v).filter(v => v.length > 2 && !/^[\da-f-]{8,}$/i.test(v));
  const words = [hostName, ...pathWords, ...queryWords].join('-').split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !STOP.has(w.toLowerCase()));
  return cleanSlug(words.slice(0, 7).join('-')) || 'il-mio-link';
}
function validHttpUrl(raw) {
  const u = new URL(String(raw || '').trim());
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Usa un indirizzo che inizi con https:// o http://.');
  return u.href;
}
async function bodyJson(request) {
  try { return await request.json(); } catch { throw new Error('Dati non validi.'); }
}
function authorized(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice(6));
    const supplied = decoded.slice(decoded.indexOf(':') + 1);
    return supplied === env.ADMIN_PASSWORD;
  } catch { return false; }
}
function requireAdmin(request, env) {
  if (authorized(request, env)) return null;
  return new Response('Autenticazione richiesta.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Linkora Dashboard", charset="UTF-8"', 'Cache-Control': 'no-store' } });
}
function slugAvailable(env, slug) { return env.DB.prepare('SELECT 1 FROM links WHERE slug = ?').bind(slug).first(); }
async function uniqueSlug(env, desired) {
  const base = cleanSlug(desired) || 'il-mio-link';
  let slug = base, suffix = 2;
  while (await slugAvailable(env, slug)) slug = `${base.slice(0, 47)}-${suffix++}`;
  return slug;
}
async function suggestSlug(url, env) {
  const fallback = fallbackSlug(url);
  if (!env.AI) return fallback;
  try {
    const result = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
      messages: [
        { role: 'system', content: 'Genera nomi brevi e riconoscibili per URL. Considera dominio, percorso e parole utili della query. Restituisci SOLO uno slug di 2-5 parole, minuscolo, con trattini, senza protocollo, estensione del dominio, virgolette o spiegazioni. Non copiare numeri casuali, identificatori o parametri di tracciamento.' },
        { role: 'user', content: `Crea uno slug breve per questo URL completo: ${url}` }
      ], max_tokens: 24, temperature: 0.2
    });
    const proposed = cleanSlug(result?.response || result?.result || '');
    if (proposed.length >= 2) return proposed;
  } catch {}
  return fallback;
}
async function dashboardData(env, origin) {
  const list = await env.DB.prepare(`SELECT l.slug, l.destination, l.created_at AS createdAt, COUNT(c.id) AS clickCount
    FROM links l LEFT JOIN clicks c ON c.link_id = l.id GROUP BY l.id ORDER BY l.created_at DESC`).all();
  const totals = await env.DB.prepare('SELECT COUNT(*) AS totalClicks FROM clicks').first();
  const weekStart = new Date(); weekStart.setUTCHours(0, 0, 0, 0); weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekRows = await env.DB.prepare(`SELECT substr(clicked_at,1,10) AS date, COUNT(*) AS count
    FROM clicks WHERE clicked_at >= ? GROUP BY substr(clicked_at,1,10)`).bind(weekStart.toISOString()).all();
  const counts = new Map((weekRows.results || []).map(row => [row.date, Number(row.count)]));
  const clicksByDay = Array.from({ length: 7 }, (_, i) => { const day = new Date(weekStart); day.setUTCDate(weekStart.getUTCDate() + i); const date = day.toISOString().slice(0, 10); return { date, count: counts.get(date) || 0 }; });
  const top = await env.DB.prepare(`SELECT l.slug FROM links l LEFT JOIN clicks c ON c.link_id = l.id
    GROUP BY l.id ORDER BY COUNT(c.id) DESC, l.created_at DESC LIMIT 1`).first();
  return { links: (list.results || []).map(link => ({ ...link, clickCount: Number(link.clickCount), clicks: [] })), origin,
    stats: { totalLinks: (list.results || []).length, totalClicks: Number(totals?.totalClicks || 0), clicksByDay, topLink: top?.slug || null } };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/healthz') return new Response('ok');

    if (path.startsWith('/api/')) {
      const auth = requireAdmin(request, env); if (auth) return auth;
      if (path === '/api/suggest-slug' && request.method === 'POST') {
        try { const data = await bodyJson(request); const destination = validHttpUrl(data.destination); return json({ slug: await suggestSlug(destination, env) }); }
        catch (error) { return json({ error: error.message || 'Non riesco a suggerire un nome.' }, 400); }
      }
      if (path === '/api/links' && request.method === 'GET') {
        try { return json(await dashboardData(env, url.origin)); }
        catch { return json({ error: 'Database non pronto. Avvia lo script di configurazione.' }, 503); }
      }
      if (path === '/api/links' && request.method === 'POST') {
        try {
          const data = await bodyJson(request); const destination = validHttpUrl(data.destination);
          const suggested = data.slug || await suggestSlug(destination, env); const slug = await uniqueSlug(env, suggested);
          const createdAt = new Date().toISOString();
          await env.DB.prepare('INSERT INTO links (slug, destination, created_at) VALUES (?, ?, ?)').bind(slug, destination, createdAt).run();
          return json({ link: { slug, destination, createdAt, clicks: [], clickCount: 0, shortUrl: `${url.origin}/${slug}` } }, 201);
        } catch (error) { return json({ error: error.message || 'Non riesco a creare il link.' }, 400); }
      }
      const match = path.match(/^\/api\/links\/([a-z0-9][a-z0-9-]{1,51})$/);
      if (match) {
        const slug = match[1];
        const current = await env.DB.prepare('SELECT id, slug, destination, created_at AS createdAt FROM links WHERE slug = ?').bind(slug).first();
        if (!current) return json({ error: 'Link non trovato.' }, 404);
        if (request.method === 'PATCH') {
          try {
            const data = await bodyJson(request); const destination = data.destination ? validHttpUrl(data.destination) : current.destination;
            let nextSlug = current.slug;
            if (data.slug) {
              nextSlug = cleanSlug(data.slug);
              if (nextSlug.length < 2) throw new Error('L’abbreviazione deve contenere almeno 2 caratteri.');
              if (nextSlug !== current.slug && await slugAvailable(env, nextSlug)) throw new Error('Questa abbreviazione esiste già.');
            }
            await env.DB.prepare('UPDATE links SET slug = ?, destination = ? WHERE id = ?').bind(nextSlug, destination, current.id).run();
            return json({ link: { slug: nextSlug, destination, createdAt: current.createdAt, clicks: [], shortUrl: `${url.origin}/${nextSlug}` } });
          } catch (error) { return json({ error: error.message || 'Modifica non valida.' }, 400); }
        }
        if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(current.id).run(); return json({ ok: true }); }
      }
      return json({ error: 'Endpoint non trovato.' }, 404);
    }

    const slug = path.slice(1);
    if (request.method === 'GET' && /^[a-z0-9][a-z0-9-]{1,51}$/.test(slug)) {
      const link = await env.DB.prepare('SELECT id, destination FROM links WHERE slug = ?').bind(slug).first();
      if (!link) return new Response('Link non trovato.', { status: 404 });
      await env.DB.prepare('INSERT INTO clicks (link_id, clicked_at) VALUES (?, ?)').bind(link.id, new Date().toISOString()).run();
      return Response.redirect(link.destination, 302);
    }
    return env.ASSETS.fetch(request);
  }
};
