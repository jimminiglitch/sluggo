Skryptonite
Industry-standard(ish) screenwriting in the browser.

Skryptonite is a fast, offline-friendly screenplay editor built with vanilla JS + Vite. It’s designed to feel like a real desktop tool: menu bar, keyboard shortcuts, pagination, scene sidebar, autosave, and multiple scripts open at once via in-app tabs.

Features
Screenplay formatting: Scene headings, action, character, parenthetical, dialogue, transitions.
Pagination: Pages are laid out as 8.5"×11" and overflow is moved to the next page.
Scene sidebar: Scene headings are detected and listed for quick navigation.
Tabs: Work on multiple scripts at once (New/Open create new tabs).
Autosave backup: Periodic backup to localStorage.
Save/Open:
Uses the File System Access API when available (best experience).
Falls back to download/upload when not supported.
PWA: Installable; includes a minimal service worker cache.
Print / Save as PDF: Print-friendly layout + optional page numbers.
Quick start
Prereqs: Node.js 18+ recommended.

npm install
npm run dev
Then open the URL Vite prints (usually http://localhost:5173).

Build
npm run build
npm run preview
The production build goes to dist/.

Using the editor
Menu / shortcuts
New Script: Ctrl+N (opens a new tab)
Open…: Ctrl+O (opens in a new tab)
Save: Ctrl+S
Save As…: Ctrl+Shift+S
Settings: Ctrl+,
Toggle sidebar: Ctrl+B
Dark paper mode: Ctrl+D
Format current line:
Tab cycles element type
Ctrl+1..6 sets a specific type
Settings
Open via View → Settings….

Include title page when printing
Show page numbers (starts on page 2)
Printing / PDF tips
Skryptonite uses the browser print dialog for PDF output.

For best results in Chrome/Edge:

Set paper size to Letter
Disable browser Headers and footers
Avoid “Fit to page” scaling (use default / 100%)
Note: Different browsers can render print layout slightly differently.

File formats
.skrypt
A .skrypt file is JSON with:

metadata: title page fields
content: serialized HTML for screenplay pages
This makes the editor simple and fast, but also means .skrypt is currently Skryptonite-specific.

Text export
Plain text export is meant for readability and quick sharing.

FDX export (experimental)
FDX export is currently a minimal/experimental output and may not round-trip cleanly with Final Draft.

Browser support notes
Best experience: Chromium-based browsers (Chrome/Edge) because of File System Access API support.
Other browsers still work via download/upload fallback.
Development notes
Project layout:

index.html — app shell + menus/modals
src/main.js — editor logic, tabs, save/open/export
src/style.css — UI + print styling
public/manifest.json / public/service-worker.js — PWA assets
License
MIT — see LICENSE.
