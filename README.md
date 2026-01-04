# SlugGo

Industry-standard(ish) screenwriting in the browser.

SlugGo is a fast, offline-friendly screenplay editor built with vanilla JS + Vite. It’s designed to feel like a real desktop tool: menu bar, keyboard shortcuts, pagination, scene sidebar, autosave, and multiple scripts open at once via in-app tabs.

Note: the Vite app lives in the nested folder `./sluggo/`.

## Features

- **Screenplay formatting**: Scene headings, action, character, parenthetical, dialogue, transitions.
- **Standard screenplay typography**: `Courier New` at `12pt` for screenplay pages and print/PDF.
- **Quick format toolbar**: One-click format buttons.
- **View toggles**: Quick **Title** and **Body** toggles in the top-right.
- **Pagination**: Pages are laid out as 8.5"×11" and overflow is moved to the next page.
- **Scene sidebar**: Scene headings are detected and listed for quick navigation.
- **Tabs**: Work on multiple scripts at once (New/Open create new tabs).
- **Autosave backup**: Periodic backup to `localStorage`.
- **History**: Formatting-aware undo/redo plus a History viewer.
- **Save/Open**:
	- Uses the **File System Access API** when available (best experience).
	- Falls back to download/upload when not supported.
- **Native file type**: Uses `.sluggo` as the default script extension (legacy `.skrypt` still opens).
- **PWA**: Installable.
- **Print / Save as PDF**: Print-friendly layout + optional page numbers.

## Quick start (from repo root)

Prereqs: **Node.js 18+** recommended.

```bash
npm run install:app
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Quick start (from app folder)

```bash
cd sluggo
npm install
npm run dev
```

## Build

From repo root:

```bash
npm run build
npm run preview
```

The production build goes to `sluggo/dist/`.

## Optional: Share Service (OG Preview Cards)

SlugGo can optionally use a minimal backend share service to generate short links with real OpenGraph/Twitter preview cards (needed for email/social clients that don’t execute JS).

- Backend lives in `share-service/` (Cloudflare Worker + KV)
- Frontend opt-in via `VITE_SHARE_SERVICE_BASE` (build-time)

### Frontend configuration

Set `VITE_SHARE_SERVICE_BASE` to your Worker’s base URL (no trailing slash). Example:

```bash
# PowerShell
$env:VITE_SHARE_SERVICE_BASE="https://your-worker.example.workers.dev"
npm --prefix ./sluggo run dev
```

When configured, **Share Script…** will create a short link like `https://.../s/<id>` and copy/share that URL. Opening the link loads SlugGo using `?shareId=<id>`.

### GitHub Pages build configuration

If you deploy SlugGo via GitHub Pages (Actions), set this repository secret so the Pages build includes the backend URL:

- Secret name: `VITE_SHARE_SERVICE_BASE`
- Secret value: `https://<your-share-service>.workers.dev`

Note: Cloudflare’s default `workers.dev` hostname includes your account subdomain. If you don’t want that public-facing, put the Worker behind a custom domain and use that URL as the secret value.

## Deploy (recommended)

This repo includes GitHub Actions workflows:

- **CI build** on every push/PR
- **GitHub Pages deploy** on pushes to `main`

To enable Pages:

1. In GitHub: **Settings → Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**

Once enabled, every merge/push to `main` will publish the site.

Shareable link (GitHub Pages):

- https://jimminiglitch.github.io/sluggo/

That link is just the hosted app — people don’t need a GitHub account or to “use GitHub” to open it.

If you’re on a fork, the URL is:

- `https://<your-github-username>.github.io/<repo-name>/`

Want a “cleaner” link for socials?

- **Custom domain**: Point a domain you own to GitHub Pages (GitHub: **Settings → Pages → Custom domain**). Add a `CNAME` file at the site root (for Vite, put it in `sluggo/public/CNAME` so it gets copied into the build).
- **Short link**: Use any URL shortener to make a memorable link that redirects to the Pages URL.

## Using the editor

### Quick toolbar

Under the tabs there’s a quick toolbar for:

- **Scene / Action / Character / Paren / Dialogue / Trans** format buttons

The active format button lights up based on your current line.

### Menu / shortcuts

- **New Script**: `Ctrl+N` (opens a new tab)
- **Open…**: `Ctrl+O` (opens in a new tab)
- **Save**: `Ctrl+S`
- **Save As…**: `Ctrl+Shift+S`
- **Settings**: `Ctrl+,`
- **Toggle sidebar**: `Ctrl+B`
- **Dark paper mode**: `Ctrl+D`
- **History**: `Edit → History...`
- **Check for updates**: `Help → Check for Updates...`
- **Format current line**:
	- `Tab` cycles element type
	- `Ctrl+1..6` sets a specific type

### Settings

Open via **View → Settings…**.

- **Include title page when printing**
- **Show page numbers** (starts on page 2)

## Printing / PDF tips

SlugGo uses the browser print dialog for PDF output.

For best results in Chrome/Edge:

- Set paper size to **Letter**
- Disable browser **Headers and footers**
- Keep scaling at **100%**

## License

MIT — see `LICENSE`.

## Support

SlugGo is free and open source. If you’d like to support development, you can sponsor the project on GitHub:

- https://github.com/sponsors/jimminiglitch

Or tip via Venmo:

- https://venmo.com/u/lilbbboy
