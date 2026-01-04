function jsonResponse(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers
    }
  })
}

function getClientIp(request) {
  // Cloudflare sets this header for proxied requests.
  const cfIp = request.headers.get('CF-Connecting-IP')
  if (cfIp) return cfIp

  const xff = request.headers.get('X-Forwarded-For')
  if (xff) return String(xff).split(',')[0].trim()

  return 'unknown'
}

async function enforceRateLimit({ request, env, key, max, windowSeconds }) {
  // Best-effort rate limiting (KV increments are not atomic). This is mainly to
  // deter casual abuse, not to be perfect under concurrency.
  const ip = getClientIp(request)
  const rlKey = `rl:${key}:${ip}`
  const currentRaw = await env.SHARES.get(rlKey)
  const current = Number(currentRaw || '0') || 0
  if (current >= max) {
    return { allowed: false }
  }
  await env.SHARES.put(rlKey, String(current + 1), { expirationTtl: windowSeconds })
  return { allowed: true }
}

function withCors(headers = {}) {
  // Public-by-link sharing: allow cross-origin fetch from the SlugGo app.
  // If you want to lock this down later, replace '*' with your app origin.
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    ...headers
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeAppUrl(appUrl) {
  const raw = String(appUrl || '').trim()
  if (!raw) return 'https://jimminiglitch.github.io/sluggo/'
  return raw.endsWith('/') ? raw : `${raw}/`
}

function randomId() {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  // URL-safe base64 (short-ish)
  const b64 = btoa(String.fromCharCode(...bytes))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function isValidSharePayload(payload) {
  if (!payload || typeof payload !== 'object') return false
  if (typeof payload.fileName !== 'string') return false
  if (!payload.data || typeof payload.data !== 'object') return false
  if (typeof payload.data.content !== 'string') return false
  if (!payload.data.metadata || typeof payload.data.metadata !== 'object') return false
  return true
}

function buildShareTitle({ title = '', author = '' } = {}) {
  const t = String(title || '').trim()
  const a = String(author || '').trim()
  if (t && a) return `${t} — ${a}`
  return t || a || 'Shared SlugGo Script'
}

function buildShareHtml({ appUrl, id, title, author }) {
  const app = normalizeAppUrl(appUrl)
  const shareTitle = buildShareTitle({ title, author })
  const safeTitle = escapeHtml(shareTitle)
  const safeDesc = escapeHtml('Open this shared script in SlugGo.')
  const shareUrl = `https://PLACEHOLDER_HOST/s/${encodeURIComponent(id)}`

  // We want OG tags for previews. Crawlers will request /s/:id, not the app.
  // Image is static (SlugGo logo) to keep the backend minimal.
  const ogImage = `${app}sluggo.png`

  // The app will fetch the payload using shareId.
  const openUrl = `${app}?shareId=${encodeURIComponent(id)}`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${safeTitle}</title>

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />

  <meta name="referrer" content="strict-origin-when-cross-origin" />
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeDesc}</p>
  <p><a href="${escapeHtml(openUrl)}">Open in SlugGo</a></p>
  <p style="opacity:0.7">If that doesn’t work, copy this link into your browser:</p>
  <p><code>${escapeHtml(openUrl)}</code></p>
</body>
</html>`
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: withCors() })
    }

    // POST /api/share
    if (request.method === 'POST' && path === '/api/share') {
      const rl = await enforceRateLimit({ request, env, key: 'share', max: 30, windowSeconds: 60 * 60 })
      if (!rl.allowed) {
        return jsonResponse({ error: 'Rate limited' }, { status: 429, headers: withCors({ 'cache-control': 'no-store' }) })
      }

      let payload
      try {
        payload = await request.json()
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON' }, { status: 400, headers: withCors({ 'cache-control': 'no-store' }) })
      }

      if (!isValidSharePayload(payload)) {
        return jsonResponse({ error: 'Invalid share payload' }, { status: 400, headers: withCors({ 'cache-control': 'no-store' }) })
      }

      const raw = JSON.stringify(payload)
      // Basic size guard (KV item size limits exist; keep it conservative).
      if (raw.length > 900_000) {
        return jsonResponse({ error: 'Script too large to share' }, { status: 413, headers: withCors({ 'cache-control': 'no-store' }) })
      }

      const id = randomId()
      const createdAt = Date.now()
      const record = {
        id,
        createdAt,
        title: String(payload.title || '').slice(0, 200),
        author: String(payload.author || '').slice(0, 200),
        fileName: String(payload.fileName || '').slice(0, 260),
        data: payload.data
      }

      // Optional TTL (90 days) to reduce long-term storage/abuse.
      await env.SHARES.put(id, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 })

      return jsonResponse({ id }, { status: 200, headers: withCors({ 'cache-control': 'no-store' }) })
    }

    // GET /api/share/:id
    if (request.method === 'GET' && path.startsWith('/api/share/')) {
      const id = decodeURIComponent(path.slice('/api/share/'.length))
      const raw = await env.SHARES.get(id)
      if (!raw) return jsonResponse({ error: 'Not found' }, { status: 404, headers: withCors({ 'cache-control': 'no-store' }) })

      // Return only what's needed.
      try {
        const record = JSON.parse(raw)
        return jsonResponse(
          { id: record.id, createdAt: record.createdAt, fileName: record.fileName, data: record.data },
          { headers: withCors({ 'cache-control': 'no-store' }) }
        )
      } catch (_) {
        return jsonResponse({ error: 'Corrupt record' }, { status: 500, headers: withCors({ 'cache-control': 'no-store' }) })
      }
    }

    // GET /s/:id  (preview card + open link)
    if (request.method === 'GET' && path.startsWith('/s/')) {
      const id = decodeURIComponent(path.slice('/s/'.length))
      const raw = await env.SHARES.get(id)
      if (!raw) return new Response('Not found', { status: 404 })

      let record
      try {
        record = JSON.parse(raw)
      } catch (_) {
        return new Response('Corrupt record', { status: 500 })
      }

      const html = buildShareHtml({
        appUrl: env.APP_URL,
        id,
        title: record.title || '',
        author: record.author || ''
      }).replace('https://PLACEHOLDER_HOST', `${url.protocol}//${url.host}`)

      return new Response(html, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'x-content-type-options': 'nosniff',
          'x-robots-tag': 'noindex, nofollow',
          'content-security-policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
          'cache-control': 'public, max-age=300'
        }
      })
    }

    return new Response('Not found', { status: 404 })
  }
}
