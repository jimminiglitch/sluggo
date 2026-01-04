# SlugGo Share Service (Minimal)

This is an optional, no-signup backend that provides **short share links** with **real OpenGraph/Twitter preview cards**.

It is intentionally minimal:

- No accounts
- No collaboration
- No editing
- Public-by-link shares (anyone with the link can open)

## Important notes (public deployment)

This service is effectively a small public pastebin for SlugGo scripts.

- **Privacy**: Shared scripts are stored server-side (in Cloudflare KV) and are **not end-to-end encrypted**.
- **Abuse**: Without auth, it can be abused to store arbitrary JSON/text. The Worker includes a small IP rate limit and a TTL, but you should still assume some abuse is possible.
- **Cost**: KV read/write requests can incur cost at scale.

If you want to lock it down more:

- Restrict CORS in `src/index.js` to only your SlugGo origin (instead of `*`).
- Add stricter rate limits.
- Add bot protection / WAF rules in Cloudflare.

## What it does

- `POST /api/share` stores a share payload and returns an id.
- `GET /s/:id` returns an HTML page with OG tags (preview cards) + an “Open in SlugGo” link.
- `GET /api/share/:id` returns the stored payload for SlugGo to import.

## Deploy (Cloudflare Workers + KV)

Prereqs:

- Cloudflare account
- `wrangler` installed

Steps:

- Create a KV namespace:
  - `wrangler kv namespace create SHARES`
  - `wrangler kv namespace create SHARES --preview`
- Update `wrangler.toml` with the namespace ids.
- Configure `APP_URL` (SlugGo app URL) in `wrangler.toml`.
- Deploy:
  - `wrangler deploy`

## Frontend wiring

Set `VITE_SHARE_SERVICE_BASE` at build time for the SlugGo frontend (e.g. `https://sluggo-share.example.com`).

When set:

- Share Script uploads to the service and shares `.../s/<id>` (short + preview).
- Opening `.../s/<id>` gives a preview card and an “Open in SlugGo” link.
