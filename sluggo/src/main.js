import './style.css'

// ============================================
// SLUGGO - Industry-Standard Screenplay Editor
// ============================================

// Injected at build time by Vite (see vite.config.js).
// Falls back to 0.0.0 if not defined for any reason.
// eslint-disable-next-line no-undef
const APP_VERSION = (typeof __SLUGGO_APP_VERSION__ === 'string' && __SLUGGO_APP_VERSION__) ? __SLUGGO_APP_VERSION__ : '0.0.0'

function normalizeVersion(raw) {
  return String(raw || '')
    .trim()
    .replace(/^v/i, '')
    // Drop semver pre-release/build metadata when comparing.
    .split(/[+-]/)[0]
}

const aboutVersionEl = document.getElementById('about-version')
if (aboutVersionEl) aboutVersionEl.textContent = normalizeVersion(APP_VERSION)

let saveStatusFlashTimeout = null

function flashSaveStatus(message, { ms = 2200, accent = true } = {}) {
  if (!saveStatusDisplay) return

  if (saveStatusFlashTimeout) {
    clearTimeout(saveStatusFlashTimeout)
    saveStatusFlashTimeout = null
  }

  saveStatusDisplay.textContent = String(message || '')
  saveStatusDisplay.classList.toggle('saving', !!accent)

  saveStatusFlashTimeout = setTimeout(() => {
    saveStatusFlashTimeout = null
    updateSaveStatusUI()
  }, ms)
}

function getShareUrl() {
  // Prefer canonical so sharing always points at the deployed app.
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
  if (canonical) return canonical

  // Fall back to the app base URL.
  try {
    return new URL(import.meta.env.BASE_URL || '/', window.location.origin).href
  } catch (_) {
    return window.location.href
  }
}

function getShareServiceBase() {
  const raw = String(import.meta.env.VITE_SHARE_SERVICE_BASE || '').trim()
  if (!raw) return ''
  return raw.replace(/\/+$/, '')
}

async function createBackendShare({ fileName, title, author, data }) {
  const base = getShareServiceBase()
  if (!base) return null

  const res = await fetch(`${base}/api/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName, title, author, data })
  })

  if (!res.ok) {
    throw new Error(`Share service returned ${res.status}`)
  }

  const out = await res.json()
  const id = String(out?.id || '').trim()
  if (!id) throw new Error('Share service returned no id')
  return {
    id,
    url: `${base}/s/${encodeURIComponent(id)}`
  }
}

function base64UrlEncodeFromBytes(bytes) {
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecodeToBytes(b64url) {
  const cleaned = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = cleaned.length % 4
  const padded = pad ? cleaned + '='.repeat(4 - pad) : cleaned
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function gzipStringToBase64Url(text) {
  const raw = new TextEncoder().encode(String(text ?? ''))

  if (typeof CompressionStream !== 'function') {
    return `js:${base64UrlEncodeFromBytes(raw)}`
  }

  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return `gz:${base64UrlEncodeFromBytes(new Uint8Array(buf))}`
}

async function ungzipBase64UrlToString(encoded) {
  const raw = String(encoded || '')
  const m = raw.match(/^(gz|js):(.+)$/)
  const kind = m?.[1] || 'js'
  const payload = m?.[2] || raw
  const bytes = base64UrlDecodeToBytes(payload)

  if (kind !== 'gz') {
    return new TextDecoder().decode(bytes)
  }

  if (typeof DecompressionStream !== 'function') {
    throw new Error('Compressed share link not supported in this browser.')
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return new TextDecoder().decode(new Uint8Array(buf))
}

function getBaseShareUrl() {
  // Ensure we share the app URL without any existing hash.
  const base = getShareUrl()
  return String(base).split('#')[0]
}

function formatAuthorListForTitle(lines) {
  const items = (Array.isArray(lines) ? lines : [])
    .map(s => String(s || '').trim())
    .filter(Boolean)

  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} & ${items[1]}`
  return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`
}

function buildEmailShareSnippet({ title, author, url }) {
  const t = String(title || '').trim()
  const a = String(author || '').trim()
  const u = String(url || '').trim()

  const lines = []
  if (t) lines.push(t)
  if (a) lines.push(`by ${a}`)
  lines.push('')
  lines.push(u)
  return lines.filter((_, i) => i !== lines.length - 1 || u).join('\n')
}

async function shareCurrentScript() {
  persistActiveTabState()
  const tab = getActiveTab()
  if (!tab?.data) return

  // Share should reflect how the document appears (baked casing),
  // without mutating the live editor text.
  const bakedData = getScriptDataForSave()

  const title = String(tab.data?.metadata?.title || '').trim()
  const authorRaw = String(tab.data?.metadata?.author || '').trim()
  const authorLines = authorRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const authorLabel = formatAuthorListForTitle(authorLines)

  const defaultName = [title, authorLabel ? `by ${authorLabel}` : '']
    .filter(Boolean)
    .join(' ')
    .trim() || stripScriptExtension(tab.fileName) || 'SlugGo Script'

  // Optional: let writers override what gets pasted into email/Canvas.
  const promptValue = window.prompt('Share title (shown when you paste):', defaultName)
  if (promptValue === null) return
  const name = String(promptValue || '').trim() || defaultName

  const payload = {
    v: 1,
    fileName: tab.fileName,
    data: bakedData
  }

  // Preferred (optional) path: short link + real OG preview card.
  // Requires configuring VITE_SHARE_SERVICE_BASE at build time.
  try {
    const backend = await createBackendShare({
      fileName: tab.fileName,
      title: name,
      author: authorLabel,
      data: tab.data
    })

    if (backend?.url) {
      const shareUrl = backend.url
      const shareText = buildEmailShareSnippet({ title: name, author: authorLabel, url: shareUrl })

      // Try share sheet if available (may be blocked on some platforms after async work).
      if (navigator.share) {
        try {
          const shareBody = authorLabel ? `${name}\nby ${authorLabel}` : name
          await navigator.share({ title: name, text: shareBody, url: shareUrl })
          flashSaveStatus('Shared')
          return
        } catch (_) {
          // Fall through to clipboard.
        }
      }

      const copied = await copyToClipboard(shareText)
      if (copied) {
        flashSaveStatus('Share link copied')
      } else {
        window.prompt('Copy share text:', shareText)
      }
      return
    }
  } catch (_) {
    // If the backend is misconfigured/unavailable, fall back to no-backend sharing below.
  }

  // If the platform supports the native share sheet, call it immediately from
  // this click handler (no awaits beforehand) so the browser treats it as a
  // user gesture. For this path we use synchronous (uncompressed) encoding.
  if (navigator.share) {
    try {
      const raw = JSON.stringify(payload)
      const bytes = new TextEncoder().encode(raw)
      const encoded = `js:${base64UrlEncodeFromBytes(bytes)}`
      const url = `${getBaseShareUrl()}#share=${encoded}`

      // Extremely long URLs won’t paste reliably everywhere; warn early.
      if (url.length > 200000) {
        alert('This script is too large to share as a single link. Use Save/Export instead.')
        return
      }

      await navigator.share({
        title: name,
        text: name,
        url
      })
      flashSaveStatus('Shared')
      return
    } catch (_) {
      // User can cancel share; treat as no-op.
      return
    }
  }

  // Clipboard fallback: allow async compression to keep URLs shorter.
  const encoded = await gzipStringToBase64Url(JSON.stringify(payload))
  const url = `${getBaseShareUrl()}#share=${encoded}`
  const shareText = buildEmailShareSnippet({ title: name, author: authorLabel, url })

  // Extremely long URLs won’t paste reliably everywhere; warn early.
  if (url.length > 200000) {
    alert('This script is too large to share as a single link. Use Save/Export instead.')
    return
  }

  const copied = await copyToClipboard(shareText)
  if (copied) {
    flashSaveStatus('Share link copied')
  } else {
    window.prompt('Copy share text:', shareText)
  }
}

function getSharedScriptTokenFromUrl() {
  const hash = String(window.location.hash || '')
  const m = hash.match(/#(?:.*?)(?:share=)([^&]+)/)
  return m?.[1] ? decodeURIComponent(m[1]) : null
}

function getSharedScriptIdFromQuery() {
  try {
    const url = new URL(window.location.href)
    const id = url.searchParams.get('shareId')
    return id ? String(id).trim() : null
  } catch (_) {
    return null
  }
}

async function tryImportSharedScriptFromBackend() {
  const id = getSharedScriptIdFromQuery()
  if (!id) return false

  const base = getShareServiceBase()
  if (!base) {
    alert('This link requires a share service, but it is not configured for this build.')
    return false
  }

  try {
    const res = await fetch(`${base}/api/share/${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const payload = await res.json()
    const data = payload?.data
    if (!data || typeof data !== 'object' || typeof data.content !== 'string') {
      throw new Error('Invalid share payload')
    }

    const fileName = withPrimaryScriptExtension(payload?.fileName || `Shared${PRIMARY_SCRIPT_EXTENSION}`)
    openScriptInNewTab({ fileName, fileHandle: null, data })
    flashSaveStatus('Opened shared script')

    // Prevent re-import on refresh.
    try {
      const clean = `${window.location.origin}${window.location.pathname}`
      window.history.replaceState(null, '', clean)
    } catch (_) {
      // Ignore
    }

    return true
  } catch (err) {
    console.warn('Failed to import backend share:', err)
    alert('Could not open that shared script link.')
    return false
  }
}

async function tryImportSharedScriptFromUrl() {
  const token = getSharedScriptTokenFromUrl()
  if (!token) return false

  try {
    const json = await ungzipBase64UrlToString(token)
    const payload = JSON.parse(json)

    const data = payload?.data
    if (!data || typeof data !== 'object' || typeof data.content !== 'string') {
      throw new Error('Invalid shared script payload')
    }

    const fileName = withPrimaryScriptExtension(payload?.fileName || `Shared${PRIMARY_SCRIPT_EXTENSION}`)
    openScriptInNewTab({ fileName, fileHandle: null, data })
    flashSaveStatus('Opened shared script')

    // Prevent re-import on refresh.
    try {
      const base = `${window.location.origin}${window.location.pathname}${window.location.search}`
      window.history.replaceState(null, '', base)
    } catch (_) {
      // Ignore
    }
    return true
  } catch (err) {
    console.warn('Failed to import shared script:', err)
    alert('Could not open shared script link. It may be corrupted or too new for this browser.')
    return false
  }
}

async function copyToClipboard(text) {
  const value = String(text || '')
  if (!value) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch (_) {
    // Fall through to execCommand.
  }

  try {
    const el = document.createElement('textarea')
    el.value = value
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return !!ok
  } catch (_) {
    return false
  }
}

async function shareApp() {
  const url = getShareUrl()

  // Best experience on mobile (iOS/Android): native share sheet.
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'SlugGo',
        text: 'Fast, no-bloat screenwriting in the browser.',
        url
      })
      flashSaveStatus('Shared')
      return
    }
  } catch (_) {
    // User can cancel share; treat as no-op.
    return
  }

  const copied = await copyToClipboard(url)
  if (copied) {
    flashSaveStatus('Link copied')
  } else {
    // Last-resort fallback.
    window.prompt('Copy link:', url)
  }
}

// DOM Elements
const editor = document.getElementById('editor')
const sceneList = document.getElementById('scene-list')
const wordCountDisplay = document.getElementById('word-count')
const pageCountDisplay = document.getElementById('page-count')
const currentElementDisplay = document.getElementById('current-element')
const saveStatusDisplay = document.getElementById('save-status')
const sidebar = document.getElementById('sidebar')
const titlePageView = document.getElementById('title-page-view')
const tabBar = document.getElementById('tab-bar')

// When the user clicks the menu bar, the browser selection moves out of the editor.
// Keep the last known editor selection so format actions can still apply.
let lastEditorSelectionRange = null

function isNodeInsideEditor(node) {
  if (!node || !editor) return false
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
  return !!(el && editor.contains(el))
}

function rememberEditorSelection() {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  if (!isNodeInsideEditor(selection.anchorNode)) return
  // Title page uses native inputs; we only track selection in the body pages.
  if (isTitlePageCaretActive()) return
  try {
    lastEditorSelectionRange = selection.getRangeAt(0).cloneRange()
  } catch (_) {
    // Ignore
  }
}

function restoreEditorSelectionIfNeeded() {
  const selection = window.getSelection()
  if (selection?.rangeCount && isNodeInsideEditor(selection.anchorNode)) return true
  if (!lastEditorSelectionRange) return false

  try {
    selection.removeAllRanges()
    selection.addRange(lastEditorSelectionRange)
    return true
  } catch (_) {
    return false
  }
}

const SIDEBAR_HIDDEN_KEY = 'sluggo_sidebar_hidden'

function isSidebarHidden() {
  // Note: On desktop this means "collapsed to rail"; on mobile it means "hidden".
  return !!sidebar?.classList.contains('hidden')
}

function setSidebarHidden(hidden, { persist = true } = {}) {
  if (!sidebar) return
  sidebar.classList.toggle('hidden', !!hidden)
  if (persist) {
    try {
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, hidden ? '1' : '0')
    } catch (_) {
      // Ignore
    }
  }
}

function loadSidebarHiddenPreference() {
  try {
    const raw = localStorage.getItem(SIDEBAR_HIDDEN_KEY)
    if (raw === null) return null
    return raw === '1'
  } catch (_) {
    return null
  }
}

function applyInitialSidebarState() {
  const pref = loadSidebarHiddenPreference()
  if (pref === null) {
    const isNarrow = window.matchMedia?.('(max-width: 720px)')?.matches
    setSidebarHidden(!!isNarrow, { persist: false })
    return
  }
  setSidebarHidden(pref, { persist: false })
}

function toggleSidebar() {
  setSidebarHidden(!isSidebarHidden())
}

const darkModeToggleBtn = document.getElementById('darkmode-toggle')
const titleToggleBtn = document.getElementById('title-toggle')
const bodyToggleBtn = document.getElementById('body-toggle')
const pageNumbersToggle = document.getElementById('page-numbers-toggle')
const pageJumpSelect = document.getElementById('page-jump')

const VIEW_PAGE_NUMBERS_KEY = 'sluggo_view_page_numbers'

function isDarkPaperEnabled() {
  return document.body.classList.contains('dark-paper')
}

function updateDarkModeToggleUI() {
  if (!darkModeToggleBtn) return
  const enabled = isDarkPaperEnabled()
  darkModeToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false')
  darkModeToggleBtn.textContent = enabled ? 'Dark' : 'Dark'
  darkModeToggleBtn.title = enabled ? 'Dark paper mode: On (Ctrl+D)' : 'Dark paper mode: Off (Ctrl+D)'
}

function toggleDarkPaperMode() {
  document.body.classList.toggle('dark-paper')
  updateDarkModeToggleUI()
}

function isTitlePageVisible() {
  return !!titlePageView?.classList?.contains('active')
}

function isBodyVisible() {
  return !editor?.classList?.contains('hide-body')
}

function updateViewToggleUI() {
  titleToggleBtn?.setAttribute('aria-pressed', isTitlePageVisible() ? 'true' : 'false')
  bodyToggleBtn?.setAttribute('aria-pressed', isBodyVisible() ? 'true' : 'false')
}

function setTitlePageVisible(visible) {
  titlePageView?.classList?.toggle('active', !!visible)
  updateViewToggleUI()
  scheduleQuickBarUpdate()
}

function setBodyVisible(visible) {
  editor?.classList?.toggle('hide-body', !visible)
  updateViewToggleUI()
  scheduleQuickBarUpdate()
}

function isViewPageNumbersEnabled() {
  return document.body.classList.contains('view-page-numbers')
}

function setViewPageNumbersEnabled(enabled) {
  document.body.classList.toggle('view-page-numbers', !!enabled)
  if (pageNumbersToggle) pageNumbersToggle.checked = !!enabled
  try {
    localStorage.setItem(VIEW_PAGE_NUMBERS_KEY, enabled ? '1' : '0')
  } catch (_) {
    // Ignore
  }
}

function loadViewPageNumbersPreference() {
  try {
    return localStorage.getItem(VIEW_PAGE_NUMBERS_KEY) === '1'
  } catch (_) {
    return false
  }
}

function updatePageJumpOptions() {
  if (!pageJumpSelect) return
  const pages = Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view)'))
  const prevValue = pageJumpSelect.value

  pageJumpSelect.innerHTML = ''
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = (pages.length || titlePageView) ? 'Page…' : 'No pages'
  pageJumpSelect.appendChild(placeholder)

  if (titlePageView) {
    const opt = document.createElement('option')
    opt.value = 'title'
    opt.textContent = 'Title'
    pageJumpSelect.appendChild(opt)
  }

  pages.forEach((_, idx) => {
    const n = idx + 1
    const opt = document.createElement('option')
    opt.value = String(n)
    opt.textContent = `Page ${n}`
    pageJumpSelect.appendChild(opt)
  })

  // Preserve selection if still valid.
  if (prevValue === 'title' && titlePageView) {
    pageJumpSelect.value = prevValue
  } else if (prevValue && Number(prevValue) >= 1 && Number(prevValue) <= pages.length) {
    pageJumpSelect.value = prevValue
  } else {
    pageJumpSelect.value = ''
  }
}

function jumpToPage(pageNumber) {
  if (pageNumber === 'title') {
    if (!titlePageView) return
    if (!isTitlePageVisible()) setTitlePageVisible(true)
    titlePageView.scrollIntoView({ block: 'start' })
    return
  }

  const n = Number(pageNumber)
  if (!Number.isFinite(n) || n < 1) return
  const pages = Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view)'))
  const page = pages[n - 1]
  if (!page) return
  page.scrollIntoView({ block: 'start' })
}

// Modals
const tutorialModal = document.getElementById('tutorial-modal')

// Autocomplete
const autocompleteBox = document.createElement('div')
autocompleteBox.className = 'autocomplete-box'
document.body.appendChild(autocompleteBox)

const shortcutsModal = document.getElementById('shortcuts-modal')
const aboutModal = document.getElementById('about-modal')
const licenseModal = document.getElementById('license-modal')
const docsModal = document.getElementById('docs-modal')
const settingsModal = document.getElementById('settings-modal')
const findModal = document.getElementById('find-modal')
const historyModal = document.getElementById('history-modal')
const historyListEl = document.getElementById('history-list')

const findEls = {
  title: document.getElementById('find-modal-title'),
  query: document.getElementById('find-query'),
  replace: document.getElementById('find-replace'),
  replaceRow: document.getElementById('replace-row'),
  next: document.getElementById('find-next'),
  replaceOne: document.getElementById('replace-one'),
  replaceAll: document.getElementById('replace-all'),
  close: document.getElementById('close-find'),
  status: document.getElementById('find-status')
}

const settingsEls = {
  includeTitlePage: document.getElementById('setting-include-title-page'),
  pageNumbers: document.getElementById('setting-page-numbers'),
  pageNumbersStart2: document.getElementById('setting-page-numbers-start-2'),
  printHeaderStyle: document.getElementById('setting-print-header-style'),
  printWatermarkDraft: document.getElementById('setting-print-watermark-draft'),
  marginPreset: document.getElementById('setting-margin-preset'),
  sceneIntExtQuickPick: document.getElementById('setting-scene-intext-quickpick'),
  sceneIntExtStyle: document.getElementById('setting-scene-intext-style'),
  parentheticalAutoParens: document.getElementById('setting-parenthetical-auto-parens'),
  smartBlankLineDefaults: document.getElementById('setting-smart-blank-line-defaults')
}

function renderHistoryList() {
  if (!historyListEl) return
  historyListEl.innerHTML = ''

  const addSection = (title) => {
    const el = document.createElement('div')
    el.className = 'history-section-title'
    el.textContent = title
    historyListEl.appendChild(el)
  }

  const addEmptyRow = (message) => {
    const row = document.createElement('div')
    row.className = 'history-row'
    const meta = document.createElement('div')
    meta.className = 'history-meta'
    const sub = document.createElement('div')
    sub.className = 'history-subtext'
    sub.textContent = message
    meta.appendChild(sub)
    row.appendChild(meta)
    row.appendChild(document.createElement('div'))
    historyListEl.appendChild(row)
  }

  const addRow = (state, { allowRestore = true } = {}) => {
    const row = document.createElement('div')
    row.className = 'history-row'

    const meta = document.createElement('div')
    meta.className = 'history-meta'

    const labelInput = document.createElement('input')
    labelInput.className = 'history-label'
    labelInput.type = 'text'

    const fallback = getHistoryFallbackLabel(state)
    labelInput.value = (state.label || fallback)
    labelInput.placeholder = fallback
    labelInput.disabled = !allowRestore
    labelInput.addEventListener('input', () => {
      state.label = (labelInput.value || '').trim()
    })

    const sub = document.createElement('div')
    sub.className = 'history-subtext'
    const ts = formatHistoryTimestamp(state.createdAt)
    const tag = (state.inputType || '').trim()
    sub.textContent = [ts, tag].filter(Boolean).join(' • ')

    meta.appendChild(labelInput)
    meta.appendChild(sub)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'history-restore'
    btn.textContent = 'Restore'
    btn.disabled = !allowRestore
    btn.addEventListener('click', () => {
      restoreFromHistory(state)
      closeModal(historyModal)
    })

    row.appendChild(meta)
    row.appendChild(btn)
    historyListEl.appendChild(row)
  }

  addSection('Current')
  addRow(captureHistoryState({ inputType: 'current', label: 'Current' }), { allowRestore: false })

  addSection('Undo')
  if (historyUndoStack.length === 0) {
    addEmptyRow('No undo history yet.')
  } else {
    historyUndoStack.slice().reverse().forEach(s => addRow(s))
  }

  addSection('Redo')
  if (historyRedoStack.length === 0) {
    addEmptyRow('No redo history.')
  } else {
    historyRedoStack.slice().reverse().forEach(s => addRow(s))
  }
}

function openHistoryModal() {
  renderHistoryList()
  openModal(historyModal)
}

const DEFAULT_SETTINGS = {
  includeTitlePageInPrint: true,
  showPageNumbersInPrint: true,
  pageNumbersStartOnPage2: true,
  printHeaderStyle: 'none',
  printWatermarkDraft: false,
  marginPreset: 'standard',
  sceneHeadingsIntExtQuickPick: true,
  sceneHeadingsIntExtStyle: 'INT./EXT.',
  parentheticalsAutoParens: true,
  smartBlankLineDefaults: true
}

let settings = { ...DEFAULT_SETTINGS }

function loadSettings() {
  try {
    const raw = localStorage.getItem('sluggo_settings')
    if (!raw) return
    const parsed = JSON.parse(raw)
    settings = { ...DEFAULT_SETTINGS, ...(parsed || {}) }
  } catch (_) {
    // Ignore
  }
}

function saveSettings() {
  try {
    localStorage.setItem('sluggo_settings', JSON.stringify(settings))
  } catch (_) {
    // Ignore
  }
}

function applySettingsToUI() {
  settingsEls.includeTitlePage && (settingsEls.includeTitlePage.checked = !!settings.includeTitlePageInPrint)
  settingsEls.pageNumbers && (settingsEls.pageNumbers.checked = !!settings.showPageNumbersInPrint)
  settingsEls.pageNumbersStart2 && (settingsEls.pageNumbersStart2.checked = !!settings.pageNumbersStartOnPage2)
  settingsEls.printHeaderStyle && (settingsEls.printHeaderStyle.value = settings.printHeaderStyle || 'none')
  settingsEls.printWatermarkDraft && (settingsEls.printWatermarkDraft.checked = !!settings.printWatermarkDraft)
  settingsEls.marginPreset && (settingsEls.marginPreset.value = settings.marginPreset || 'standard')
  settingsEls.sceneIntExtQuickPick && (settingsEls.sceneIntExtQuickPick.checked = !!settings.sceneHeadingsIntExtQuickPick)
  settingsEls.sceneIntExtStyle && (settingsEls.sceneIntExtStyle.value = settings.sceneHeadingsIntExtStyle || 'INT./EXT.')
  settingsEls.parentheticalAutoParens && (settingsEls.parentheticalAutoParens.checked = !!settings.parentheticalsAutoParens)
  settingsEls.smartBlankLineDefaults && (settingsEls.smartBlankLineDefaults.checked = !!settings.smartBlankLineDefaults)

  document.body.classList.toggle('print-include-title-page', !!settings.includeTitlePageInPrint)
  document.body.classList.toggle('print-page-numbers', !!settings.showPageNumbersInPrint)
  document.body.classList.toggle('print-header-title', (settings.printHeaderStyle || 'none') === 'title')
  document.body.classList.toggle('print-watermark-draft', !!settings.printWatermarkDraft)

  applyMarginPreset(settings.marginPreset || 'standard')
  updatePageNumberAttributes()
}

function ensurePrintWatermarkElements() {
  // Insert overlays only for the print session so they never affect editing/pagination.
  const created = []
  document.querySelectorAll('.screenplay-page:not(.title-page-view)').forEach((page) => {
    if (page.querySelector(':scope > .page-watermark')) return
    const el = document.createElement('div')
    el.className = 'page-watermark'
    el.textContent = 'DRAFT'
    page.appendChild(el)
    created.push(el)
  })

  return () => {
    created.forEach(el => el.remove())
  }
}

function getDialogueBlockFromLine(line) {
  if (!line) return null
  const page = line.parentElement
  if (!page?.classList?.contains('screenplay-page') || page.classList.contains('title-page-view')) return null

  const isDialogueish = (el) => !!el?.classList && (el.classList.contains('el-character') || el.classList.contains('el-parenthetical') || el.classList.contains('el-dialogue'))
  const isCharacter = (el) => !!el?.classList?.contains('el-character')

  // Find the start character line for this block.
  let start = line
  while (start && start.previousElementSibling && isDialogueish(start.previousElementSibling) && !isCharacter(start)) {
    start = start.previousElementSibling
  }
  // Walk up until we hit a character line.
  while (start && !isCharacter(start) && start.previousElementSibling) {
    start = start.previousElementSibling
  }
  if (!isCharacter(start)) {
    // If caret is already on a character line, start is correct. Otherwise, no block.
    if (!isCharacter(line)) return null
    start = line
  }

  // Collect lines until the next character or a non-dialogue element.
  const lines = []
  let cursor = start
  while (cursor && isDialogueish(cursor)) {
    lines.push(cursor)
    cursor = cursor.nextElementSibling
  }

  // Must contain at least one dialogue line to be meaningful.
  if (!lines.some(el => el.classList.contains('el-dialogue'))) return null
  return { start, end: lines[lines.length - 1], lines }
}

function getLineFromNode(node) {
  if (!node) return null
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
  while (el && el !== document.body) {
    const parent = el.parentElement
    if (parent?.classList?.contains?.('screenplay-page')) return el
    el = parent
  }
  return null
}

function compareDomOrder(a, b) {
  if (a === b) return 0
  if (!a || !b) return 0
  const pos = a.compareDocumentPosition(b)
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
  return 0
}

function clearDualGroupId(groupId, scope) {
  if (!groupId || !scope?.querySelectorAll) return
  const sel = `[data-dual-group="${CSS.escape(groupId)}"]`
  scope.querySelectorAll(sel).forEach((el) => {
    delete el.dataset.dualGroup
    delete el.dataset.dualSide
  })
}

function getSelectedDialogueBlocks() {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  if (selection.isCollapsed) return null

  // Use the actual range so backwards selections behave correctly.
  let range = null
  try {
    range = selection.getRangeAt(0)
  } catch (_) {
    return null
  }
  if (!range) return null

  const startLine = getLineFromNode(range.startContainer)
  const endLine = getLineFromNode(range.endContainer)
  if (!startLine || !endLine) return null

  const page = startLine.parentElement
  if (!page || page !== endLine.parentElement) return null

  // Walk from earliest to latest line within the same page.
  const forward = compareDomOrder(startLine, endLine) <= 0
  const first = forward ? startLine : endLine
  const last = forward ? endLine : startLine

  const selectedLines = []
  let cursor = first
  while (cursor) {
    selectedLines.push(cursor)
    if (cursor === last) break
    cursor = cursor.nextElementSibling
  }
  if (selectedLines.length === 0) return null

  // Determine which distinct dialogue blocks intersect the selection.
  const blocksByStart = new Map()
  for (const line of selectedLines) {
    const block = getDialogueBlockFromLine(line)
    if (!block?.start) continue
    blocksByStart.set(block.start, block)
    if (blocksByStart.size > 2) return null
  }

  const blocks = Array.from(blocksByStart.values())
  if (blocks.length !== 2) return null

  blocks.sort((a, b) => compareDomOrder(a.start, b.start))
  return blocks
}

function getNextDialogueBlock(block) {
  if (!block?.end) return null
  let cursor = block.end.nextElementSibling
  while (cursor) {
    // Skip purely blank action lines.
    const isBlank = (cursor.textContent || '').trim() === ''
    if (cursor.classList?.contains('el-action') && isBlank) {
      cursor = cursor.nextElementSibling
      continue
    }
    break
  }
  if (!cursor) return null
  // Next block must start at character.
  if (!cursor.classList?.contains('el-character')) return null
  return getDialogueBlockFromLine(cursor)
}

function getPrevDialogueBlock(block) {
  if (!block?.start) return null
  let cursor = block.start.previousElementSibling
  while (cursor) {
    // Skip purely blank action lines.
    const isBlank = (cursor.textContent || '').trim() === ''
    if (cursor.classList?.contains('el-action') && isBlank) {
      cursor = cursor.previousElementSibling
      continue
    }
    break
  }
  if (!cursor) return null

  // Walk backward until we find the previous character line.
  while (cursor && !cursor.classList?.contains('el-character')) {
    cursor = cursor.previousElementSibling
  }
  if (!cursor) return null
  return getDialogueBlockFromLine(cursor)
}

function clearDualDialogueAttrs(block) {
  if (!block?.lines?.length) return
  block.lines.forEach((el) => {
    delete el.dataset.dualGroup
    delete el.dataset.dualSide
  })
}

function applyDualDialogueAttrs(block, { groupId, side }) {
  if (!block?.lines?.length) return
  block.lines.forEach((el) => {
    el.dataset.dualGroup = groupId
    el.dataset.dualSide = side
  })
}

function toggleDualDialogueAtCursor() {
  if (isTitlePageCaretActive() || !isBodyVisible()) return

  // Menu clicks move focus away from the editor; restore last known caret.
  restoreEditorSelectionIfNeeded()

  // Selection has priority: if exactly two dialogue blocks are selected, toggle those.
  const selectedBlocks = getSelectedDialogueBlocks()
  if (selectedBlocks) {
    const [left, right] = selectedBlocks
    const page = left.start?.parentElement
    if (!page) return

    recordHistoryCheckpoint({ inputType: 'format' })

    const leftGroup = left.lines?.[0]?.dataset?.dualGroup
    const rightGroup = right.lines?.[0]?.dataset?.dualGroup
    const isAlreadyDualPair = leftGroup && rightGroup && leftGroup === rightGroup

    if (isAlreadyDualPair) {
      clearDualGroupId(leftGroup, page)
      flashSaveStatus('Dual dialogue: Off', { accent: false })
      markDirty()
      return
    }

    // If either side is already part of some dual group, clear those groups first.
    if (leftGroup) clearDualGroupId(leftGroup, page)
    if (rightGroup && rightGroup !== leftGroup) clearDualGroupId(rightGroup, page)

    const groupId = `dual_${Date.now()}_${Math.random().toString(16).slice(2)}`
    applyDualDialogueAttrs(left, { groupId, side: 'left' })
    applyDualDialogueAttrs(right, { groupId, side: 'right' })
    flashSaveStatus('Dual dialogue: On', { accent: false })
    markDirty()
    return
  }

  const line = getCurrentLine() || ensureLineExists()
  if (!line) return

  // If we're already inside a dual group, toggling should turn it off.
  const activeGroup = line?.dataset?.dualGroup
  if (activeGroup) {
    recordHistoryCheckpoint({ inputType: 'format' })
    const page = getCurrentPage()
    const scope = (page && page.classList?.contains('screenplay-page')) ? page : editor
    clearDualGroupId(activeGroup, scope)
    flashSaveStatus('Dual dialogue: Off', { accent: false })
    markDirty()
    return
  }

  const a = getDialogueBlockFromLine(line)
  if (!a) {
    flashSaveStatus('Dual dialogue: place cursor in dialogue')
    return
  }

  // Prefer pairing current block with the next one; if none, try previous+current.
  let left = a
  let right = getNextDialogueBlock(a)
  if (!right) {
    const prev = getPrevDialogueBlock(a)
    if (prev) {
      left = prev
      right = a
    }
  }

  if (!right) {
    flashSaveStatus('Dual dialogue: needs two nearby dialogue blocks')
    return
  }

  recordHistoryCheckpoint({ inputType: 'format' })

  const groupId = `dual_${Date.now()}_${Math.random().toString(16).slice(2)}`
  applyDualDialogueAttrs(left, { groupId, side: 'left' })
  applyDualDialogueAttrs(right, { groupId, side: 'right' })
  flashSaveStatus('Dual dialogue: On', { accent: false })

  markDirty()
}

function prepareDualDialogueForPrint() {
  const wrapped = []

  const pages = Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view)'))
  pages.forEach((page) => {
    const children = Array.from(page.children).filter(el => el.tagName === 'DIV' && !el.classList.contains('page-watermark'))

    for (let i = 0; i < children.length; i++) {
      const el = children[i]
      const group = el?.dataset?.dualGroup
      if (!group) continue

      // Collect consecutive nodes for this group.
      const nodesInOrder = []
      const left = []
      const right = []

      let j = i
      while (j < children.length && children[j]?.dataset?.dualGroup === group) {
        const node = children[j]
        nodesInOrder.push(node)
        if (node.dataset.dualSide === 'right') right.push(node)
        else left.push(node)
        j++
      }

      if (nodesInOrder.length > 0 && (left.length > 0 || right.length > 0)) {
        const wrapper = document.createElement('div')
        wrapper.className = 'dual-dialogue'
        wrapper.dataset.dualGroup = group

        const leftCol = document.createElement('div')
        leftCol.className = 'dual-col dual-left'
        const rightCol = document.createElement('div')
        rightCol.className = 'dual-col dual-right'

        wrapper.appendChild(leftCol)
        wrapper.appendChild(rightCol)

        page.insertBefore(wrapper, nodesInOrder[0])
        left.forEach(n => leftCol.appendChild(n))
        right.forEach(n => rightCol.appendChild(n))

        wrapped.push({ page, wrapper, nodesInOrder })
      }

      // Skip past what we consumed.
      i = j - 1
    }
  })

  const restore = () => {
    wrapped.forEach(({ wrapper, nodesInOrder }) => {
      const page = wrapper.parentElement
      if (!page) return
      nodesInOrder.forEach((n) => page.insertBefore(n, wrapper))
      wrapper.remove()
    })
  }

  return restore
}

function applyMarginPreset(preset) {
  const presets = {
    standard: { left: '1.5in', right: '1in', top: '1in', bottom: '1in' },
    narrow: { left: '1.25in', right: '1in', top: '1in', bottom: '1in' },
    wide: { left: '1.75in', right: '1in', top: '1in', bottom: '1in' }
  }
  const chosen = presets[preset] || presets.standard
  document.documentElement.style.setProperty('--left-margin', chosen.left)
  document.documentElement.style.setProperty('--right-margin', chosen.right)
  document.documentElement.style.setProperty('--top-margin', chosen.top)
  document.documentElement.style.setProperty('--bottom-margin', chosen.bottom)
}

function openSettings() {
  openModal(settingsModal)
}

function closeSettings() {
  closeModal(settingsModal)
}

function printScript() {
  applySettingsToUI()
  const restoreWatermarks = ensurePrintWatermarkElements()
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => closeModal(m))

  const restoreDual = prepareDualDialogueForPrint()

  const restore = () => {
    restoreDual?.()
    restoreWatermarks?.()
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)

  window.print()
}

// ============================================
// ACCESSIBILITY: MODALS (focus trap + ESC)
// ============================================
let activeModal = null
let modalReturnFocusEl = null

function getFocusableElements(container) {
  if (!container) return []
  const selectors = [
    'button',
    '[href]',
    'input',
    'select',
    'textarea',
    '[tabindex]:not([tabindex="-1"])'
  ]
  return Array.from(container.querySelectorAll(selectors.join(',')))
    .filter(el => !el.hasAttribute('disabled'))
    .filter(el => {
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden'
    })
}

function closeAllModals() {
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => {
    m.classList.add('hidden')
    m.setAttribute('aria-hidden', 'true')
  })
  activeModal = null
}

function ensureDialogAria(modal) {
  if (!modal) return
  if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog')
  if (!modal.hasAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true')
  if (!modal.hasAttribute('aria-hidden')) modal.setAttribute('aria-hidden', modal.classList.contains('hidden') ? 'true' : 'false')
  const heading = modal.querySelector('.modal-content h2')
  if (heading && !heading.id) {
    heading.id = `${modal.id || 'modal'}-title`
  }
  if (heading && !modal.hasAttribute('aria-labelledby')) {
    modal.setAttribute('aria-labelledby', heading.id)
  }
}

function openModal(modal, { focusEl = null } = {}) {
  if (!modal) return
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => {
    if (m !== modal) m.classList.add('hidden')
  })

  ensureDialogAria(modal)

  modalReturnFocusEl = document.activeElement
  activeModal = modal

  modal.classList.remove('hidden')
  modal.setAttribute('aria-hidden', 'false')

  const content = modal.querySelector('.modal-content')
  const focusables = getFocusableElements(content)
  const target = focusEl || focusables[0] || content
  if (target && typeof target.focus === 'function') target.focus()
}

function closeModal(modal) {
  if (!modal) return
  modal.classList.add('hidden')
  modal.setAttribute('aria-hidden', 'true')

  if (activeModal === modal) activeModal = null

  const candidate = modalReturnFocusEl
  modalReturnFocusEl = null
  if (candidate && document.contains(candidate) && typeof candidate.focus === 'function') {
    candidate.focus()
  } else {
    editor?.focus()
  }
}

document.addEventListener('keydown', (e) => {
  if (!activeModal || activeModal.classList.contains('hidden')) return

  if (e.key === 'Escape') {
    e.preventDefault()
    closeModal(activeModal)
    return
  }

  if (e.key !== 'Tab') return

  const content = activeModal.querySelector('.modal-content')
  const focusables = getFocusableElements(content)
  if (focusables.length === 0) return

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const current = document.activeElement

  if (e.shiftKey && current === first) {
    e.preventDefault()
    last.focus()
    return
  }

  if (!e.shiftKey && current === last) {
    e.preventDefault()
    first.focus()
  }
}, true)

// ============================================
// STATE
// ============================================
let currentElement = 'action'
let zoomLevel = 1
let tabs = []
let activeTabId = null
let untitledCounter = 1

// ============================================
// FILE EXTENSIONS
// ============================================
const PRIMARY_SCRIPT_EXTENSION = '.sluggo'
const LEGACY_SCRIPT_EXTENSION = '.skrypt'

function withPrimaryScriptExtension(fileName) {
  const name = String(fileName || '').trim()
  if (!name) return `Untitled ${untitledCounter}${PRIMARY_SCRIPT_EXTENSION}`
  if (name.toLowerCase().endsWith(PRIMARY_SCRIPT_EXTENSION)) return name
  if (name.toLowerCase().endsWith(LEGACY_SCRIPT_EXTENSION)) {
    return name.slice(0, -LEGACY_SCRIPT_EXTENSION.length) + PRIMARY_SCRIPT_EXTENSION
  }
  return name + PRIMARY_SCRIPT_EXTENSION
}

function stripScriptExtension(fileName) {
  const name = String(fileName || '')
  return name
    .replace(/\.sluggo$/i, '')
    .replace(/\.skrypt$/i, '')
}

function isNativeScriptFileName(fileName) {
  const lower = String(fileName || '').toLowerCase()
  return lower.endsWith(PRIMARY_SCRIPT_EXTENSION) || lower.endsWith(LEGACY_SCRIPT_EXTENSION)
}

// ============================================
// UNDO / REDO (custom history to include formatting)
// ============================================
const HISTORY_LIMIT = 200
let historyUndoStack = []
let historyRedoStack = []
let historyIsRestoring = false
let historyLastRecordAt = 0
let historyLastInputType = ''
let historyIdCounter = 1

function createHistoryId() {
  historyIdCounter += 1
  return `${Date.now()}-${historyIdCounter}-${Math.random().toString(16).slice(2)}`
}

function getDomPath(node, root) {
  const path = []
  let cur = node
  while (cur && cur !== root) {
    const parent = cur.parentNode
    if (!parent) break
    const idx = Array.prototype.indexOf.call(parent.childNodes, cur)
    path.unshift(idx)
    cur = parent
  }
  return cur === root ? path : null
}

function getNodeByPath(root, path) {
  let cur = root
  for (const idx of path) {
    if (!cur || !cur.childNodes || idx < 0 || idx >= cur.childNodes.length) return null
    cur = cur.childNodes[idx]
  }
  return cur
}

function captureSelectionSnapshot() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const container = range.startContainer
  if (!editor || !editor.contains(container)) return null
  const path = getDomPath(container, editor)
  if (!path) return null
  return {
    path,
    offset: range.startOffset
  }
}

function restoreSelectionSnapshot(snapshot) {
  if (!snapshot) return
  const node = getNodeByPath(editor, snapshot.path)
  if (!node) return
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()

  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.max(0, Math.min(snapshot.offset, node.nodeValue?.length ?? 0)))
  } else {
    const max = node.childNodes?.length ?? 0
    range.setStart(node, Math.max(0, Math.min(snapshot.offset, max)))
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

function captureHistoryState({ inputType = '', label = '' } = {}) {
  // Only capture body content + metadata (formatting lives in body DOM).
  const scriptData = getScriptData()
  const selection = captureSelectionSnapshot()
  return {
    id: createHistoryId(),
    createdAt: Date.now(),
    inputType: inputType || '',
    label: label || '',
    scriptData,
    selection
  }
}

function restoreHistoryState(state) {
  if (!state) return
  historyIsRestoring = true
  try {
    loadScriptData(state.scriptData)
    configureLoadedPages()
    updatePageNumberAttributes()
    // Try to restore caret; fall back to focusing editor.
    restoreSelectionSnapshot(state.selection)
    editor?.focus?.()
  } finally {
    historyIsRestoring = false
  }
}

function recordHistoryCheckpoint({ inputType = '' } = {}) {
  if (historyIsRestoring) return

  // Coalesce rapid typing into a single undo step.
  const now = Date.now()
  const coalesce = inputType && inputType === historyLastInputType && (now - historyLastRecordAt) < 750
  if (coalesce) return

  const state = captureHistoryState({ inputType })
  const last = historyUndoStack[historyUndoStack.length - 1]
  // Avoid duplicates.
  if (last && last.scriptData?.content === state.scriptData?.content && JSON.stringify(last.scriptData?.metadata) === JSON.stringify(state.scriptData?.metadata)) {
    return
  }

  historyUndoStack.push(state)
  if (historyUndoStack.length > HISTORY_LIMIT) historyUndoStack.shift()
  historyRedoStack = []
  historyLastRecordAt = now
  historyLastInputType = inputType || ''
}

function pushUndoState(state, { clearRedo = true } = {}) {
  if (!state) return
  historyUndoStack.push(state)
  if (historyUndoStack.length > HISTORY_LIMIT) historyUndoStack.shift()
  if (clearRedo) historyRedoStack = []
}

function formatHistoryTimestamp(ms) {
  if (!ms) return ''
  try {
    const d = new Date(ms)
    return d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch (_) {
    return ''
  }
}

function getHistoryFallbackLabel(state) {
  const inputType = String(state?.inputType || '')
  if (!inputType) return 'Edit'
  if (inputType === 'format') return 'Format'
  if (inputType === 'history-restore') return 'Restore'
  if (inputType === 'undo') return 'Undo'
  if (inputType === 'redo') return 'Redo'
  if (inputType === 'current') return 'Current'
  if (inputType.startsWith('insert')) return 'Typing'
  if (inputType.startsWith('delete')) return 'Delete'
  return inputType
}

function historyUndo() {
  if (historyUndoStack.length === 0) return
  const current = captureHistoryState({ inputType: 'undo' })
  const prev = historyUndoStack.pop()
  historyRedoStack.push(current)
  restoreHistoryState(prev)
}

function historyRedo() {
  if (historyRedoStack.length === 0) return
  const current = captureHistoryState({ inputType: 'redo' })
  const next = historyRedoStack.pop()
  pushUndoState(current, { clearRedo: false })
  restoreHistoryState(next)
}

function restoreFromHistory(state) {
  if (!state) return
  pushUndoState(captureHistoryState({ inputType: 'history-restore', label: 'Before restore' }))
  restoreHistoryState(state)
}

function getDefaultAutocompleteData() {
  return {
    characters: new Set(),
    locations: new Set(['INT. ', 'EXT. ', 'INT/EXT. ', 'INT./EXT. ', 'EST. '])
  }
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) || null
}

function getTabTitle(tab) {
  const dirtyMark = tab.isDirty ? '•' : ''
  return `${dirtyMark}${tab.fileName}`
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function configureLoadedPages() {
  document.querySelectorAll('.screenplay-page:not(.title-page-view)').forEach(page => {
    page.classList.add('screenplay-page')
    page.contentEditable = true
    page.spellcheck = true

    // Match createNewPage() behavior so empty pages can be handled consistently.
    if (!page.__sluggoConfigured) {
      page.__sluggoConfigured = true
      page.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && page.innerText.trim() === '') {
          // Handle merge logic if needed, usually complicated
        }
      })
    }
  })
}

function rebuildAutocompleteDataFromEditor() {
  const data = getDefaultAutocompleteData()
  const characters = Array.from(editor.querySelectorAll('.el-character')).map(el => el.textContent.trim().toUpperCase())
  const headings = Array.from(editor.querySelectorAll('.el-scene-heading')).map(el => el.textContent.trim().toUpperCase())

  characters.forEach(c => { if (c) data.characters.add(c) })
  headings.forEach(h => {
    if (h.includes(' ')) {
      const parts = h.split(' ')
      if (parts.length > 1) data.locations.add(parts.slice(1).join(' '))
    }
  })

  return data
}

function renderTabs() {
  if (!tabBar) return
  tabBar.innerHTML = tabs.map(tab => {
    const isActive = tab.id === activeTabId
    const title = getTabTitle(tab)
    return `
      <div class="tab ${isActive ? 'active' : ''}" role="tab" aria-selected="${isActive}" tabindex="0" data-tab-id="${tab.id}">
        <span class="tab-title">${escapeHtml(title)}</span>
        <button class="tab-close" type="button" aria-label="Close ${escapeHtml(tab.fileName)}" data-tab-close="${tab.id}">×</button>
      </div>
    `
  }).join('')
}

function ensureAtLeastOneTab() {
  if (tabs.length > 0) return
  createNewTabFromTemplate()
}

function persistActiveTabState() {
  const tab = getActiveTab()
  if (!tab) return
  tab.data = getScriptData()
  tab.autocompleteData = autocompleteData
}

function activateTab(tabId) {
  if (tabId === activeTabId) return
  persistActiveTabState()
  activeTabId = tabId
  const tab = getActiveTab()
  if (!tab) return

  autocompleteData = tab.autocompleteData || getDefaultAutocompleteData()

  loadScriptData(tab.data)
  configureLoadedPages()
  updateUI()
  // Ensure suggestions are tab-scoped.
  autocompleteData = rebuildAutocompleteDataFromEditor()
  tab.autocompleteData = autocompleteData
  updateSaveStatusUI()
  renderTabs()
}

function closeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId)
  if (!tab) return
  if (tab.isDirty && !confirm(`Close "${tab.fileName}"? Unsaved changes will be lost.`)) return

  const idx = tabs.findIndex(t => t.id === tabId)
  const wasActive = tabId === activeTabId
  tabs = tabs.filter(t => t.id !== tabId)

  if (tabs.length === 0) {
    activeTabId = null
    createNewTabFromTemplate()
    return
  }

  if (wasActive) {
    const nextTab = tabs[Math.min(idx, tabs.length - 1)]
    activeTabId = nextTab.id
    loadScriptData(nextTab.data)
    updateUI()
    updateAutocompleteData()
    updateSaveStatusUI()
  }

  renderTabs()
}

function createTab({ fileName, fileHandle = null, data, isDirty = false }) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  tabs.push({
    id,
    fileName,
    fileHandle,
    data,
    isDirty,
    autocompleteData: getDefaultAutocompleteData()
  })
  return id
}

function createNewTabFromTemplate() {
  persistActiveTabState()
  const fileName = `Untitled ${untitledCounter++}${PRIMARY_SCRIPT_EXTENSION}`
  const titleBase = stripScriptExtension(fileName)
  const todayIso = new Date().toISOString().slice(0, 10)
  const data = getTemplateScriptData({ title: titleBase.toUpperCase(), date: todayIso })
  const id = createTab({ fileName, data, isDirty: false })
  activeTabId = id
  autocompleteData = getActiveTab().autocompleteData
  loadScriptData(data)
  configureLoadedPages()
  updateUI()
  autocompleteData = rebuildAutocompleteDataFromEditor()
  getActiveTab().autocompleteData = autocompleteData
  updateSaveStatusUI()
  renderTabs()
  editor.focus()
}

function openScriptInNewTab({ fileName, fileHandle, data }) {
  persistActiveTabState()
  const id = createTab({ fileName, fileHandle, data, isDirty: false })
  activeTabId = id
  autocompleteData = getActiveTab().autocompleteData
  loadScriptData(data)
  configureLoadedPages()
  updateUI()
  autocompleteData = rebuildAutocompleteDataFromEditor()
  getActiveTab().autocompleteData = autocompleteData
  updateSaveStatusUI()
  renderTabs()
  editor.focus()
}

function updateSaveStatusUI() {
  const tab = getActiveTab()
  if (!tab) return
  saveStatusDisplay.textContent = tab.isDirty ? 'Unsaved' : 'Saved'
  saveStatusDisplay.classList.toggle('saving', tab.isDirty)
  document.title = `${tab.isDirty ? '*' : ''}${tab.fileName} - SlugGo`
}

let autocompleteData = getDefaultAutocompleteData()
let selectedSuggestionIndex = 0
let filteredSuggestions = []

const ELEMENT_ORDER = ['scene-heading', 'action', 'character', 'parenthetical', 'dialogue', 'transition']
const ELEMENT_CLASSES = {
  'scene-heading': 'el-scene-heading',
  'action': 'el-action',
  'character': 'el-character',
  'parenthetical': 'el-parenthetical',
  'dialogue': 'el-dialogue',
  'transition': 'el-transition',
  'fade-in': 'el-fade-in'
}

// ============================================
// PWA INSTALL / UNINSTALL (best-effort)
// ============================================
let deferredInstallPrompt = null

// ============================================
// PWA FILE HANDLING (best-effort)
// ============================================
async function openFileHandleViaPwa(fileHandle) {
  if (!fileHandle) return
  try {
    const file = await fileHandle.getFile()
    const content = await file.text()
    const data = isNativeScriptFileName(file.name)
      ? JSON.parse(content)
      : parsePlainTextToScriptData(content)
    openScriptInNewTab({ fileName: file.name, fileHandle, data })
  } catch (err) {
    console.error('Failed to open file from PWA handler:', err)
    alert('Could not open that file.')
  }
}

if (window.launchQueue && typeof window.launchQueue.setConsumer === 'function') {
  window.launchQueue.setConsumer(async (launchParams) => {
    const files = launchParams?.files
    if (!files || !files.length) return
    for (const fh of files) {
      await openFileHandleViaPwa(fh)
    }
  })
}

function updateInstallMenuVisibility() {
  const installBtn = document.querySelector('[data-action="install-app"]')
  const uninstallBtn = document.querySelector('[data-action="uninstall-app"]')
  if (!installBtn || !uninstallBtn) return

  // Dev ergonomics: the install prompt isn't meaningful on Vite dev server and
  // can be disruptive if triggered accidentally.
  if (import.meta.env.DEV) {
    installBtn.hidden = true
    uninstallBtn.hidden = true
    return
  }

  const standalone = isRunningStandalone()
  installBtn.hidden = standalone
  uninstallBtn.hidden = !standalone
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Store the event so we can trigger it from a user gesture (menu click).
  e.preventDefault()
  deferredInstallPrompt = e
  updateInstallMenuVisibility()
})

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null
  updateInstallMenuVisibility()
})

function isRunningStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// Initialize after we know isRunningStandalone() exists.
updateInstallMenuVisibility()

async function promptInstall() {
  if (import.meta.env.DEV) {
    flashSaveStatus('Install available in preview/build')
    return
  }

  if (!deferredInstallPrompt) {
    // No prompt available: either already installed, unsupported, or not yet eligible.
    // Keep it simple and point the user to the browser's install UI.
    openModal(aboutModal)
    alert('To install: use your browser menu (Install app / Add to Home Screen). If you do not see it, your browser may not support installation for this site yet.')
    return
  }

  try {
    await deferredInstallPrompt.prompt()
    // Chrome returns a promise via userChoice; other browsers may not.
    await deferredInstallPrompt.userChoice?.catch(() => {})
  } finally {
    // Prompt can only be used once.
    deferredInstallPrompt = null
    updateInstallMenuVisibility()
  }
}

function showUninstallHelp() {
  if (!isRunningStandalone()) {
    openModal(aboutModal)
    alert('This app is not currently installed as an app. To uninstall later, you would remove it from your browser-installed apps or your device home screen.')
    return
  }

  alert(
    'Uninstall steps (varies by device):\n\n' +
    '• Desktop (Chrome/Edge): open the installed app and use the menu to “Uninstall”, or remove it from your OS app list.\n' +
    '• Android: long-press the app icon → Uninstall.\n' +
    '• iOS: long-press the app icon → Remove App.'
  )
}

// ============================================
// MENU ACTIONS
// ============================================
const menuActions = {
  // File
  'new': () => {
    createNewTabFromTemplate()
  },
  'open': () => openScript(),
  'save': () => saveScript(),
  'save-as': () => saveScript(true),
  'export-pdf': () => printScript(),
  'export-fdx': () => exportFDX(),
  'export-txt': () => exportPlainText(),
  'share-script': () => {
    shareCurrentScript()
  },

  // Edit
  'undo': () => historyUndo(),
  'redo': () => historyRedo(),
  'history': () => openHistoryModal(),
  'cut': () => document.execCommand('cut'),
  'copy': () => document.execCommand('copy'),
  'paste': () => document.execCommand('paste'),
  'find': () => {
    openFindModal(false)
  },
  'replace': () => openFindModal(true),
  'select-all': () => {
    const range = document.createRange()
    range.selectNodeContents(editor)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  },

  // Format Text
  'bold': () => document.execCommand('bold'),
  'italic': () => document.execCommand('italic'),
  'underline': () => document.execCommand('underline'),

  // View
  'toggle-sidebar': () => toggleSidebar(),
  'toggle-dark-mode': () => toggleDarkPaperMode(),
  'zoom-in': () => setZoom(zoomLevel + 0.1),
  'zoom-out': () => setZoom(zoomLevel - 0.1),
  'zoom-reset': () => setZoom(1),
  'title-page': () => toggleTitlePage(),
  'toggle-body': () => setBodyVisible(!isBodyVisible()),

  // Format
  'el-scene-heading': () => applyElementToCurrentLine('scene-heading'),
  'el-action': () => applyElementToCurrentLine('action'),
  'el-character': () => applyElementToCurrentLine('character'),
  'el-parenthetical': () => applyElementToCurrentLine('parenthetical'),
  'el-dialogue': () => applyElementToCurrentLine('dialogue'),
  'el-transition': () => applyElementToCurrentLine('transition'),
  'toggle-dual-dialogue': () => toggleDualDialogueAtCursor(),

  // Help
  'show-shortcuts': () => shortcutsModal.classList.remove('hidden'),
  'show-tutorial': () => tutorialModal.classList.remove('hidden'),
  'share-app': () => shareApp(),
  'check-updates': () => checkForUpdates(),
  'docs': () => openModal(docsModal),
  'license': () => openModal(licenseModal),
  'about': () => openModal(aboutModal),
  'install-app': () => {
    promptInstall()
  },
  'uninstall-app': () => {
    showUninstallHelp()
  },

  // Settings
  'settings': () => openSettings()
}

// ============================================
// UPDATE CHECK (best-effort; GitHub-hosted)
// ============================================
const GITHUB_REPO = 'jimminiglitch/sluggo'
const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`

function compareSemver(a, b) {
  const pa = normalizeVersion(a).split('.').map(n => parseInt(n, 10))
  const pb = normalizeVersion(b).split('.').map(n => parseInt(n, 10))
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return null
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0
    const bv = pb[i] ?? 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}

async function fetchJsonWithTimeout(url, { timeoutMs = 6000 } = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.github+json'
      }
    })
    return res
  } finally {
    clearTimeout(t)
  }
}

async function getLatestVersionFromRepoPackageJson() {
  // Works even when the repo has no tags/releases yet.
  const candidateUrls = [
    `https://raw.githubusercontent.com/${GITHUB_REPO}/main/sluggo/package.json`,
    `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@main/sluggo/package.json`
  ]

  for (const url of candidateUrls) {
    try {
      const res = await fetchJsonWithTimeout(url)
      if (!res.ok) continue
      const data = await res.json()
      const version = data?.version
      if (version) {
        return {
          version: normalizeVersion(version),
          url: `${GITHUB_REPO_URL}/blob/main/sluggo/package.json`,
          source: 'package.json'
        }
      }
    } catch (_) {
      // try next url
    }
  }

  return null
}

async function getLatestVersionFromGitHub() {
  // Prefer releases if present.
  const releaseUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
  let lastApiStatus = null
  try {
    const res = await fetchJsonWithTimeout(releaseUrl)
    lastApiStatus = res.status
    if (res.ok) {
      const data = await res.json()
      const version = data?.tag_name || data?.name
      const pageUrl = data?.html_url || `${GITHUB_REPO_URL}/releases`
      if (version) return { version: normalizeVersion(version), url: pageUrl, source: 'release' }
    }
    // If the repo has no releases, GitHub returns 404.
  } catch (_) {
    // ignore and try tags
  }

  // Fall back to latest tag.
  const tagsUrl = `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=1`
  try {
    const res = await fetchJsonWithTimeout(tagsUrl)
    lastApiStatus = res.status
    if (res.ok) {
      const tags = await res.json()
      const first = Array.isArray(tags) ? tags[0] : null
      const version = first?.name
      const pageUrl = `${GITHUB_REPO_URL}/tags`
      if (version) return { version: normalizeVersion(version), url: pageUrl, source: 'tag' }
    }
  } catch (_) {
    // ignore
  }

  const pkg = await getLatestVersionFromRepoPackageJson()
  if (pkg) return pkg

  const reason = lastApiStatus === 403
    ? 'GitHub API rate limited (403).'
    : (lastApiStatus ? `GitHub API returned ${lastApiStatus}.` : 'Network/API error.')

  return { version: null, url: GITHUB_REPO_URL, source: 'unknown', reason }
}

async function checkForUpdates() {
  if (!navigator.onLine) {
    alert('You appear to be offline. Connect to the internet to check for updates.')
    return
  }

  const current = normalizeVersion(APP_VERSION)
  try {
    const latest = await getLatestVersionFromGitHub()
    if (!latest.version) {
      const extra = latest.reason ? `\n\nDetails: ${latest.reason}` : ''
      const open = confirm(
        `Could not determine the latest version automatically.\n\nCurrent: v${current}${extra}\n\nOpen SlugGo on GitHub?`
      )
      if (open) window.open(latest.url, '_blank', 'noopener')
      return
    }

    const cmp = compareSemver(current, latest.version)
    const latestLabel = `v${latest.version}`
    const currentLabel = `v${current}`

    if (cmp === null) {
      const open = confirm(
        `Latest: ${latestLabel}\nCurrent: ${currentLabel}\n\nOpen releases/tags page?`
      )
      if (open) window.open(latest.url, '_blank', 'noopener')
      return
    }

    if (cmp < 0) {
      const open = confirm(
        `Update available!\n\nLatest: ${latestLabel}\nCurrent: ${currentLabel}\n\nOpen download page?`
      )
      if (open) window.open(latest.url, '_blank', 'noopener')
      return
    }

    alert(`You're up to date.\n\nCurrent: ${currentLabel}\nLatest: ${latestLabel}`)
  } catch (err) {
    console.error('Update check failed:', err)
    alert('Update check failed. Try again later.')
  }
}

// Hover intent state
let isMenuOpen = false

const menuBar = document.querySelector('.menu-bar')
let lastOpenedMenuTrigger = null

// Attach menu handlers
document.querySelectorAll('.menu-item').forEach(item => {
  const trigger = item.querySelector('.menu-trigger')
  const dropdown = item.querySelector('.menu-dropdown')

  // Basic ARIA for menus
  if (trigger && dropdown) {
    if (!dropdown.id) dropdown.id = `menu-${trigger.textContent.toLowerCase()}-${Math.random().toString(16).slice(2)}`
    trigger.setAttribute('aria-haspopup', 'menu')
    trigger.setAttribute('aria-expanded', 'false')
    trigger.setAttribute('aria-controls', dropdown.id)
    dropdown.setAttribute('role', 'menu')
    dropdown.querySelectorAll('button').forEach(btn => btn.setAttribute('role', 'menuitem'))

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        trigger.click()
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        trigger.click()
        const first = dropdown.querySelector('button')
        first?.focus()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        isMenuOpen = false
        closeAllMenus()
        trigger.focus()
      }
    })
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation()
    const isExpanded = trigger.getAttribute('aria-expanded') === 'true'
    if (isExpanded) {
      isMenuOpen = false
      closeAllMenus()
      return
    }

    closeAllMenus()
    isMenuOpen = true
    lastOpenedMenuTrigger = trigger
    item.querySelector('.menu-dropdown').style.display = 'block'
    trigger.setAttribute('aria-expanded', 'true')
  })

  item.addEventListener('mouseover', () => {
    if (isMenuOpen) {
      closeAllMenus()
      item.querySelector('.menu-dropdown').style.display = 'block'
      trigger?.setAttribute('aria-expanded', 'true')
      lastOpenedMenuTrigger = trigger
    }
  })
})

document.querySelectorAll('[data-action]').forEach(btn => {
  // For quick format buttons, prevent the button from stealing focus so the
  // current selection/line stays stable.
  btn.addEventListener('mousedown', (e) => {
    const action = btn.dataset.action
    if (typeof action === 'string' && action.startsWith('el-')) e.preventDefault()
  })

  btn.addEventListener('click', () => {
    const action = btn.dataset.action
    if (menuActions[action]) {
      menuActions[action]()
      if (typeof action === 'string' && action.startsWith('el-')) {
        // Keep writing flow: return focus to the editor after applying format.
        editor?.focus?.()
      }
      closeAllMenus()
    }
  })
})

function closeAllMenus() {
  document.querySelectorAll('.menu-dropdown').forEach(el => el.style.display = '')
  document.querySelectorAll('.menu-trigger[aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded', 'false'))
}

// Close menus when leaving the menu bar (mouse navigation).
menuBar?.addEventListener('mouseleave', () => {
  isMenuOpen = false
  closeAllMenus()
})

// Close menus when focus leaves the menu bar (keyboard navigation).
menuBar?.addEventListener('focusout', (e) => {
  const next = e.relatedTarget
  if (next && menuBar.contains(next)) return
  isMenuOpen = false
  closeAllMenus()
})

// Close menus on Escape anywhere within the menu bar.
menuBar?.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  e.preventDefault()
  isMenuOpen = false
  closeAllMenus()
  lastOpenedMenuTrigger?.focus?.()
})

// Close menus on outside click
document.addEventListener('click', () => {
  isMenuOpen = false
  closeAllMenus()
})

// Keep quick format buttons in sync with caret movement.
document.addEventListener('selectionchange', () => {
  rememberEditorSelection()
  scheduleQuickBarUpdate()
})

// Extra coverage: on some browsers, selectionchange doesn’t fire for every tap/click.
editor?.addEventListener('mouseup', () => rememberEditorSelection())
editor?.addEventListener('keyup', () => rememberEditorSelection())

darkModeToggleBtn?.addEventListener('click', () => {
  toggleDarkPaperMode()
})

updateViewToggleUI()

document.getElementById('input-author')?.addEventListener('input', () => {
  scheduleTitlePageTextareaResize()
})

window.addEventListener('resize', () => {
  scheduleTitlePageTextareaResize()
})

// Page numbers + jump-to-page UI
pageNumbersToggle?.addEventListener('change', () => {
  setViewPageNumbersEnabled(!!pageNumbersToggle.checked)
})

pageJumpSelect?.addEventListener('change', () => {
  const value = pageJumpSelect.value
  if (!value) return
  jumpToPage(value)
  // Reset to placeholder so it behaves like a "jump" control.
  pageJumpSelect.value = ''
})

setViewPageNumbersEnabled(loadViewPageNumbersPreference())
updatePageJumpOptions()

// Scroll handler for sidebar highlighting
const editorWrapper = document.querySelector('.editor-container')
editorWrapper.addEventListener('scroll', () => {
  highlightActiveScene()
})

// Modal close handlers
document.getElementById('close-tutorial')?.addEventListener('click', () => {
  closeModal(tutorialModal)
  localStorage.setItem('sluggo_tutorial', 'done')
})

document.getElementById('close-shortcuts')?.addEventListener('click', () => {
  closeModal(shortcutsModal)
})

document.getElementById('close-about')?.addEventListener('click', () => {
  closeModal(aboutModal)
})

document.getElementById('close-license')?.addEventListener('click', () => {
  closeModal(licenseModal)
})

document.getElementById('close-docs')?.addEventListener('click', () => {
  closeModal(docsModal)
})

document.getElementById('close-settings')?.addEventListener('click', () => {
  closeSettings()
})

findEls.close?.addEventListener('click', () => {
  closeModal(findModal)
})

document.getElementById('close-history')?.addEventListener('click', () => {
  closeModal(historyModal)
})

settingsEls.includeTitlePage?.addEventListener('change', () => {
  settings.includeTitlePageInPrint = !!settingsEls.includeTitlePage.checked
  applySettingsToUI()
  saveSettings()
})

settingsEls.pageNumbers?.addEventListener('change', () => {
  settings.showPageNumbersInPrint = !!settingsEls.pageNumbers.checked
  applySettingsToUI()
  saveSettings()
})

settingsEls.pageNumbersStart2?.addEventListener('change', () => {
  settings.pageNumbersStartOnPage2 = !!settingsEls.pageNumbersStart2.checked
  applySettingsToUI()
  saveSettings()
})

settingsEls.printHeaderStyle?.addEventListener('change', () => {
  settings.printHeaderStyle = settingsEls.printHeaderStyle.value || 'none'
  applySettingsToUI()
  saveSettings()
})

settingsEls.printWatermarkDraft?.addEventListener('change', () => {
  settings.printWatermarkDraft = !!settingsEls.printWatermarkDraft.checked
  applySettingsToUI()
  saveSettings()
})

settingsEls.marginPreset?.addEventListener('change', () => {
  settings.marginPreset = settingsEls.marginPreset.value || 'standard'
  applySettingsToUI()
  saveSettings()
})

settingsEls.sceneIntExtQuickPick?.addEventListener('change', () => {
  settings.sceneHeadingsIntExtQuickPick = !!settingsEls.sceneIntExtQuickPick.checked
  applySettingsToUI()
  saveSettings()
})

settingsEls.sceneIntExtStyle?.addEventListener('change', () => {
  const v = String(settingsEls.sceneIntExtStyle.value || '').trim()
  settings.sceneHeadingsIntExtStyle = (v === 'INT/EXT.' || v === 'INT./EXT.') ? v : 'INT./EXT.'
  applySettingsToUI()
  saveSettings()
})

settingsEls.parentheticalAutoParens?.addEventListener('change', () => {
  settings.parentheticalsAutoParens = !!settingsEls.parentheticalAutoParens.checked
  applySettingsToUI()
  saveSettings()
})

settingsEls.smartBlankLineDefaults?.addEventListener('change', () => {
  settings.smartBlankLineDefaults = !!settingsEls.smartBlankLineDefaults.checked
  applySettingsToUI()
  saveSettings()
})

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal)
    }
  })
})


// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  // Don't intercept if typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return

  const ctrl = e.ctrlKey || e.metaKey
  const shift = e.shiftKey

  // Ctrl shortcuts
  if (ctrl) {
    switch (e.key.toLowerCase()) {
      case 'z':
        e.preventDefault()
        if (shift) {
          historyRedo()
        } else {
          historyUndo()
        }
        break
      case 'y':
        e.preventDefault()
        historyRedo()
        break
      case 'n':
        e.preventDefault()
        menuActions['new']()
        break
      case 'o':
        e.preventDefault()
        menuActions['open']()
        break
      case 's':
        e.preventDefault()
        if (shift) {
          menuActions['save-as']()
        } else {
          menuActions['save']()
        }
        break
      case 'b':
        e.preventDefault()
        menuActions['toggle-sidebar']()
        break
      case 'i':
        e.preventDefault()
        menuActions['italic']()
        break
      case 'u':
        e.preventDefault()
        menuActions['underline']()
        break
      case '\\':
        e.preventDefault()
        menuActions['toggle-sidebar']()
        break
      case 'f':
        e.preventDefault()
        openFindModal(false)
        break
      case 'h':
        e.preventDefault()
        openFindModal(true)
        break
      case 'p':
        e.preventDefault()
        menuActions['export-pdf']()
        break
      case ',':
        e.preventDefault()
        openSettings()
        break
      case 'd':
        e.preventDefault()
        menuActions['toggle-dark-mode']()
        break
      case 'l':
        if (!shift) break
        e.preventDefault()
        menuActions['toggle-dual-dialogue']()
        break

// ============================================
// FIND / REPLACE
// ============================================
let findState = {
  isReplace: false,
  lastQuery: '',
  lastIndex: -1
}

function setFindStatus(message) {
  if (findEls.status) findEls.status.textContent = message || ''
}

function getScriptTextNodes() {
  const rootPages = editor.querySelectorAll('.screenplay-page:not(.title-page-view)')
  const nodes = []
  rootPages.forEach(page => {
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      nodes.push(node)
      node = walker.nextNode()
    }
  })
  return nodes
}

function buildSearchIndex() {
  const nodes = getScriptTextNodes()
  const starts = new Map()
  let text = ''
  nodes.forEach(n => {
    starts.set(n, text.length)
    text += n.nodeValue || ''
  })
  return { nodes, starts, text }
}

function getSelectionGlobalOffset(search) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  const offset = range.startOffset
  if (search.starts.has(node)) return search.starts.get(node) + offset
  // If selection isn't in a text node we indexed, start at 0.
  return 0
}

function setSelectionFromGlobalRange(search, start, end) {
  const sel = window.getSelection()
  if (!sel) return

  function locate(pos) {
    for (let i = search.nodes.length - 1; i >= 0; i--) {
      const n = search.nodes[i]
      const s = search.starts.get(n)
      const len = (n.nodeValue || '').length
      if (pos >= s && pos <= s + len) {
        return { node: n, offset: Math.max(0, Math.min(len, pos - s)) }
      }
    }
    return null
  }

  const a = locate(start)
  const b = locate(end)
  if (!a || !b) return

  const range = document.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
  sel.removeAllRanges()
  sel.addRange(range)
  editor.focus()
}

function findNext(query, { wrap = true } = {}) {
  const q = String(query || '')
  if (!q) {
    setFindStatus('Enter text to find.')
    return false
  }

  const search = buildSearchIndex()
  if (!search.text) {
    setFindStatus('Nothing to search.')
    return false
  }

  const from = Math.max(0, getSelectionGlobalOffset(search))
  let idx = search.text.indexOf(q, from)
  if (idx === -1 && wrap) {
    idx = search.text.indexOf(q, 0)
  }
  if (idx === -1) {
    setFindStatus('No matches.')
    return false
  }

  setSelectionFromGlobalRange(search, idx, idx + q.length)
  setFindStatus(`Match found.`)
  findState.lastQuery = q
  findState.lastIndex = idx
  return true
}

function selectionMatchesQuery(query) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  return (sel.toString() || '') === query
}

function replaceCurrent(query, replacement) {
  const q = String(query || '')
  const r = String(replacement ?? '')
  if (!q) {
    setFindStatus('Enter text to find.')
    return false
  }

  if (!selectionMatchesQuery(q)) {
    // If current selection isn't a match, find next first.
    const found = findNext(q)
    if (!found) return false
  }

  document.execCommand('insertText', false, r)
  markDirty()
  checkPageOverflow()
  updateUI()
  setFindStatus('Replaced.')
  return true
}

function replaceAll(query, replacement) {
  const q = String(query || '')
  const r = String(replacement ?? '')
  if (!q) {
    setFindStatus('Enter text to find.')
    return 0
  }

  let count = 0
  const lines = Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view) > div'))
  lines.forEach(line => {
    const text = line.textContent || ''
    if (!text.includes(q)) return
    const parts = text.split(q)
    if (parts.length <= 1) return
    count += parts.length - 1
    const nextText = parts.join(r)
    if (nextText.trim() === '') {
      line.innerHTML = '<br>'
    } else {
      line.textContent = nextText
    }
  })

  if (count > 0) {
    markDirty()
    checkPageOverflow()
    updateUI()
    setFindStatus(`Replaced ${count} occurrence${count === 1 ? '' : 's'}.`)
  } else {
    setFindStatus('No matches.')
  }
  return count
}

function openFindModal(isReplace) {
  findState.isReplace = !!isReplace
  if (findEls.title) findEls.title.textContent = isReplace ? 'Find & Replace' : 'Find'
  if (findEls.replaceRow) findEls.replaceRow.style.display = isReplace ? '' : 'none'
  if (findEls.replaceOne) findEls.replaceOne.style.display = isReplace ? '' : 'none'
  if (findEls.replaceAll) findEls.replaceAll.style.display = isReplace ? '' : 'none'
  setFindStatus('')
  openModal(findModal, { focusEl: findEls.query })
}

findEls.next?.addEventListener('click', () => {
  findNext(findEls.query?.value || '')
})

findEls.replaceOne?.addEventListener('click', () => {
  replaceCurrent(findEls.query?.value || '', findEls.replace?.value || '')
  findNext(findEls.query?.value || '')
})

findEls.replaceAll?.addEventListener('click', () => {
  replaceAll(findEls.query?.value || '', findEls.replace?.value || '')
})

findEls.query?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    findNext(findEls.query.value || '')
  }
})

findEls.replace?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    replaceCurrent(findEls.query?.value || '', findEls.replace?.value || '')
    findNext(findEls.query?.value || '')
  }
})
        break
      case ',':
        e.preventDefault()
        menuActions['settings']()
        break
      case '/':
        e.preventDefault()
        menuActions['show-shortcuts']()
        break
      case '1':
        e.preventDefault()
        menuActions['el-scene-heading']()
        break
      case '2':
        e.preventDefault()
        menuActions['el-action']()
        break
      case '3':
        e.preventDefault()
        menuActions['el-character']()
        break
      case '4':
        e.preventDefault()
        menuActions['el-parenthetical']()
        break
      case '5':
        e.preventDefault()
        menuActions['el-dialogue']()
        break
      case '6':
        e.preventDefault()
        menuActions['el-transition']()
        break
      case '=':
      case '+':
        e.preventDefault()
        menuActions['zoom-in']()
        break
      case '-':
        e.preventDefault()
        menuActions['zoom-out']()
        break
      case '0':
        e.preventDefault()
        menuActions['zoom-reset']()
        break
    }
  }

  // Escape to close modals
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'))
  }
})

// Tabs bar handlers
tabBar?.addEventListener('click', (e) => {
  const closeId = e.target?.dataset?.tabClose
  if (closeId) {
    e.stopPropagation()
    closeTab(closeId)
    return
  }
  const tabId = e.target?.closest?.('[data-tab-id]')?.dataset?.tabId
  if (tabId) activateTab(tabId)
})

tabBar?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  const tabId = e.target?.closest?.('[data-tab-id]')?.dataset?.tabId
  if (!tabId) return
  e.preventDefault()
  activateTab(tabId)
})

// ============================================
// ZOOM
// ============================================
function setZoom(level) {
  zoomLevel = Math.max(0.5, Math.min(2, level))
  document.documentElement.style.setProperty('--zoom', zoomLevel)
}

// ============================================
// TITLE PAGE
// ============================================
function toggleTitlePage() {
  setTitlePageVisible(!isTitlePageVisible())
}

// ============================================
// ELEMENT MANAGEMENT
// ============================================
function setElement(element) {
  currentElement = element
  const displayName = element.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  currentElementDisplay.textContent = displayName
  scheduleQuickBarUpdate()
}

// ============================================
// QUICK TOOLBAR (active format highlight)
// ============================================
let quickBarUpdatePending = false

function scheduleQuickBarUpdate() {
  if (quickBarUpdatePending) return
  quickBarUpdatePending = true
  requestAnimationFrame(() => {
    quickBarUpdatePending = false
    updateQuickBarActiveState()
  })
}

function getActiveElementFromCurrentLine() {
  const line = getCurrentLine()
  if (!line) return null

  // Find the first matching known element class.
  for (const [element, cls] of Object.entries(ELEMENT_CLASSES)) {
    if (element === 'fade-in') continue
    if (line.classList?.contains?.(cls)) return element
  }

  return null
}

function updateQuickBarActiveState() {
  const quickBar = document.querySelector('.quick-bar')
  if (!quickBar) return

  const titlePageView = document.getElementById('title-page-view')
  const isTitlePageActive = Boolean(titlePageView?.classList?.contains('active'))
  const caretInTitle = isTitlePageCaretActive()
  const bodyHidden = !isBodyVisible()

  // Reset
  quickBar.querySelectorAll('.quick-btn.is-active').forEach(btn => btn.classList.remove('is-active'))

  // Title page button state
  const titleBtn = quickBar.querySelector('[data-action="title-page"]')
  if (titleBtn) titleBtn.classList.toggle('is-active', isTitlePageActive)

  // If we're editing the title page (native inputs) or body is hidden, don't highlight a screenplay line format.
  if (caretInTitle || bodyHidden) return

  // Dual dialogue button state (cursor inside a dual group)
  const currentLine = getCurrentLine()
  const inDual = !!(currentLine?.dataset?.dualGroup)
  const dualBtn = quickBar.querySelector('[data-action="toggle-dual-dialogue"]')
  if (dualBtn) dualBtn.classList.toggle('is-active', inDual)

  const activeElement = getActiveElementFromCurrentLine() || currentElement
  const action = `el-${activeElement}`
  const activeBtn = quickBar.querySelector(`[data-action="${CSS.escape(action)}"]`)
  if (activeBtn) activeBtn.classList.add('is-active')
}

function getElementClass(element) {
  return ELEMENT_CLASSES[element] || 'el-action'
}

function getCurrentPage() {
  const selection = window.getSelection()
  if (!selection.rangeCount) return null
  let node = selection.anchorNode
  while (node && node !== document.body) {
    if (node.classList && node.classList.contains('screenplay-page')) return node
    node = node.parentElement
  }
  return editor.querySelector('.screenplay-page:not(.title-page-view)')
}

function getCurrentLine() {
  const selection = window.getSelection()
  if (!selection.rangeCount) return null

  let node = selection.anchorNode
  const page = getCurrentPage()

  if (!page) return null
  if (node === page) return null

  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement

  while (node && node.parentElement !== page) {
    node = node.parentElement
  }

  if (node && node.parentElement === page) return node
  return null
}

function ensureLineExists() {
  const selection = window.getSelection()

  let currentLine = getCurrentLine()
  let page = getCurrentPage()

  if (!page) {
    page = createNewPage()
  }

  if (!currentLine) {
    const allLines = page.querySelectorAll(':scope > div')

    if (allLines.length === 0) {
      currentLine = document.createElement('div')
      currentLine.className = getElementClass(currentElement)
      currentLine.innerHTML = '<br>'
      page.appendChild(currentLine)
    } else {
      currentLine = allLines[allLines.length - 1]
    }

    // Safety check for selection
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      range.selectNodeContents(currentLine)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  return currentLine
}

function applyElementToCurrentLine(element) {
  if (isTitlePageCaretActive() || !isBodyVisible()) return

  recordHistoryCheckpoint({ inputType: 'format' })

  let line = getCurrentLine()
  if (!line) line = ensureLineExists()
  if (!line) {
    setElement(element)
    return
  }

  const newClass = getElementClass(element)
  const selection = window.getSelection()
  const range = selection.getRangeAt(0)

  const getElementForLine = (lineEl) => {
    if (!lineEl) return 'action'
    for (const [elem, cls] of Object.entries(ELEMENT_CLASSES)) {
      if (lineEl.classList.contains(cls)) return elem
    }
    return 'action'
  }

  const getCaretTextOffsetWithin = (containerEl, currentRange) => {
    try {
      const node = currentRange?.startContainer
      if (!node || !containerEl || !containerEl.contains(node)) return null
      if (node.nodeType !== Node.TEXT_NODE) return null

      let offset = 0
      const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT)
      let cur = walker.nextNode()
      while (cur) {
        if (cur === node) {
          return offset + Math.max(0, Math.min(currentRange.startOffset, cur.nodeValue?.length ?? 0))
        }
        offset += cur.nodeValue?.length ?? 0
        cur = walker.nextNode()
      }
      return null
    } catch (_) {
      return null
    }
  }

  const setCaretTextOffsetWithin = (containerEl, targetOffset) => {
    if (!containerEl) return false
    const sel = window.getSelection()
    if (!sel) return false

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

    const textNodes = []
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT)
    let cur = walker.nextNode()
    while (cur) {
      textNodes.push(cur)
      cur = walker.nextNode()
    }

    // If the line has no text nodes (e.g. <br>), create a text node.
    if (textNodes.length === 0) {
      const t = document.createTextNode(containerEl.textContent || '')
      containerEl.textContent = ''
      containerEl.appendChild(t)
      textNodes.push(t)
    }

    const fullLen = (containerEl.textContent || '').length
    let remaining = clamp(Number(targetOffset) || 0, 0, fullLen)

    for (const t of textNodes) {
      const len = t.nodeValue?.length ?? 0
      if (remaining <= len) {
        const r = document.createRange()
        r.setStart(t, clamp(remaining, 0, len))
        r.collapse(true)
        sel.removeAllRanges()
        sel.addRange(r)
        return true
      }
      remaining -= len
    }

    // Fallback: end of last node
    const last = textNodes[textNodes.length - 1]
    const r = document.createRange()
    r.setStart(last, last.nodeValue?.length ?? 0)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
    return true
  }

  // Save cursor
  const savedOffset = range.startOffset
  const savedNode = range.startContainer
  const savedTextOffsetInLine = getCaretTextOffsetWithin(line, range)
  const prevElement = getElementForLine(line)

  // Update class
  Object.values(ELEMENT_CLASSES).forEach(cls => line.classList.remove(cls))
  line.classList.add(newClass)

  // Parenthetical helper (optional):
  // - When switching TO parenthetical: wrap existing text in ( ... ) (or insert "()" if empty).
  // - When switching OFF parenthetical: remove the outer parentheses.
  let didOverrideCaretRestore = false
  if (settings.parentheticalsAutoParens) {
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
    const isWrapped = (s) => {
      const t = String(s || '').trim()
      return t.length >= 2 && t.startsWith('(') && t.endsWith(')')
    }

    if (element === 'parenthetical') {
      const raw = String(line.textContent || '').trim()
      const nextText = !raw ? '()' : (isWrapped(raw) ? raw : `(${raw})`)
      line.textContent = nextText

      // Keep caret inside the parentheses.
      const endInside = Math.max(1, nextText.length - 1)
      const desired = savedTextOffsetInLine === null
        ? endInside
        : clamp(savedTextOffsetInLine + 1, 1, endInside)

      setCaretTextOffsetWithin(line, desired)
      didOverrideCaretRestore = true
    } else if (prevElement === 'parenthetical') {
      const raw = String(line.textContent || '').trim()
      if (isWrapped(raw)) {
        const inner = raw.slice(1, -1).trim()
        if (!inner) {
          line.innerHTML = '<br>'
        } else {
          line.textContent = inner
        }

        const desired = savedTextOffsetInLine === null
          ? (inner ? clamp(inner.length, 0, inner.length) : 0)
          : clamp(savedTextOffsetInLine - 1, 0, inner.length)

        if (inner) setCaretTextOffsetWithin(line, desired)
        didOverrideCaretRestore = true
      }
    }
  }

  // Restore cursor
  try {
    if (!didOverrideCaretRestore && savedNode.parentElement) {
      range.setStart(savedNode, Math.min(savedOffset, savedNode.length || 0))
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  } catch (e) {
    if (!didOverrideCaretRestore) {
      range.selectNodeContents(line)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  setElement(element)
  markDirty()
}

function cycleElementOnCurrentLine() {
  let line = getCurrentLine()
  if (!line) line = ensureLineExists()
  if (!line) return

  let lineElement = 'action'
  for (const [elem, cls] of Object.entries(ELEMENT_CLASSES)) {
    if (line.classList.contains(cls)) {
      lineElement = elem
      break
    }
  }

  const idx = ELEMENT_ORDER.indexOf(lineElement)
  const nextElement = ELEMENT_ORDER[(idx + 1) % ELEMENT_ORDER.length]
  applyElementToCurrentLine(nextElement)
}

// ============================================
// EDITOR EVENT HANDLERS
// ============================================
function isFormFieldTarget(target) {
  if (!target || !target.tagName) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function isInsideTitlePage(target) {
  return !!(titlePageView && target && titlePageView.contains(target))
}

function isTitlePageCaretActive() {
  const active = document.activeElement
  return isFormFieldTarget(active) && isInsideTitlePage(active)
}

editor.addEventListener('keydown', (e) => {
  // Title page uses native inputs/textareas; don't hijack keys like Tab/Enter.
  if (isFormFieldTarget(e.target) || isInsideTitlePage(e.target)) return

  if (autocompleteBox.style.display === 'block') {
    if (handleAutocompleteKeydown(e)) return
  }

  if (e.key === 'Tab') {
    e.preventDefault()
    cycleElementOnCurrentLine()
  } else if (e.key === 'Enter') {
    handleEnter(e)
  } else if (e.key === 'Backspace') {
    handleBackspace(e)
  } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    // Optional: Custom navigation if default behavior fails
    // handleArrowKeys(e) 
  }
})

// Capture history before any browser edit is applied to the contenteditable body.
editor.addEventListener('beforeinput', (e) => {
  if (historyIsRestoring) return
  // Ignore IME composition + native history events.
  if (e.isComposing) return
  if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') return
  recordHistoryCheckpoint({ inputType: e.inputType || '' })
}, { capture: true })

function handleBackspace(e) {
  const selection = window.getSelection()
  if (!selection.isCollapsed) return

  const page = getCurrentPage()
  if (!page) return

  // If at start of page (cursor 0 of first child)
  if (selection.anchorOffset === 0) {
    const line = getCurrentLine()
    if (line === page.firstElementChild) {
      // We are at start of page
      const prevPage = page.previousElementSibling
      if (prevPage && prevPage.classList.contains('screenplay-page') && !prevPage.classList.contains('title-page-view')) {
        e.preventDefault()
        // Move cursor to end of previous page
        const lastLine = prevPage.lastElementChild
        if (lastLine) {
          const range = document.createRange()
          range.selectNodeContents(lastLine)
          range.collapse(false)
          selection.removeAllRanges()
          selection.addRange(range)

          // If page is empty, delete it?
          if (page.innerText.trim() === '') {
            page.remove()
            updateUI()
          }
          markDirty()
        }
      }
    }
  }
}

// Pagination Logic
function createNewPage(afterPage = null) {
  const page = document.createElement('div')
  page.className = 'screenplay-page'
  page.contentEditable = true
  page.spellcheck = true

  if (afterPage && afterPage.nextSibling) {
    editor.insertBefore(page, afterPage.nextSibling)
  } else {
    editor.appendChild(page)
  }

  // Add page deletion listener on backspace empty
  page.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && page.innerText.trim() === '') {
      // Handle merge logic if needed, usually complicated
    }
  })

  return page
}

function checkPageOverflow() {
  const pages = editor.querySelectorAll('.screenplay-page:not(.title-page-view)')

  pages.forEach((page, index) => {
    // 11in height = 1056px approx. Padding is 1in top/bottom.
    // Content area is approx 9in.
    // Let's use scrollHeight > clientHeight to be safe.

    if (page.scrollHeight > page.clientHeight) {
      let nextPage = pages[index + 1]
      if (!nextPage) {
        nextPage = createNewPage(page)
      }

      // Move elements until fits
      while (page.scrollHeight > page.clientHeight) {
        const lastChild = page.lastElementChild
        if (!lastChild) break // Should not happen

        // Screenplay formatting rule (common): if dialogue spills to next page,
        // a parenthetical should not be left dangling at the bottom. Move the
        // parenthetical (and character name if immediately above) with the dialogue.
        let moveGroup = [lastChild]
        let continuationCharacterText = null
        if (lastChild.classList?.contains('el-dialogue')) {
          const maybeParen = lastChild.previousElementSibling
          if (maybeParen?.classList?.contains('el-parenthetical')) {
            moveGroup = [lastChild, maybeParen]
            const maybeCharacter = maybeParen.previousElementSibling
            if (maybeCharacter?.classList?.contains('el-character')) {
              moveGroup.push(maybeCharacter)
            }
          }

          // If we are moving dialogue but NOT moving the character name line,
          // the dialogue is continuing from the previous page. Repeat the
          // character name on the next page with (CONT'D).
          const isMovingCharacter = moveGroup.some(n => n?.classList?.contains?.('el-character'))
          if (!isMovingCharacter) {
            let cursor = lastChild.previousElementSibling
            while (cursor) {
              if (cursor.classList?.contains('el-character')) {
                continuationCharacterText = (cursor.textContent || '').trim()
                break
              }
              cursor = cursor.previousElementSibling
            }
          }
        }

        if (continuationCharacterText) {
          const stripContd = (s) => String(s || '').replace(/\s*\(CONT'D\)\s*/gi, ' ').replace(/\s+/g, ' ').trim()
          const base = stripContd(continuationCharacterText)
          if (base) {
            const contd = `${base} (CONT'D)`
            const first = nextPage.firstElementChild
            const firstIsSameCharacter = first?.classList?.contains('el-character') && stripContd(first.textContent) === base
            if (!firstIsSameCharacter) {
              const charLine = document.createElement('div')
              charLine.className = 'el-character'
              charLine.textContent = contd
              if (nextPage.firstChild) nextPage.insertBefore(charLine, nextPage.firstChild)
              else nextPage.appendChild(charLine)
            }
          }
        }

        // Insert at top of next page preserving intended order.
        // We insert in reverse (dialogue, then parenthetical, then character) so
        // the final order is character → parenthetical → dialogue.
        for (const node of moveGroup) {
          if (!node || !node.parentElement) continue
          if (nextPage.firstChild) {
            nextPage.insertBefore(node, nextPage.firstChild)
          } else {
            nextPage.appendChild(node)
          }
        }
      }
    }

    // Check for empty pages (except the first one)
    if (page.children.length === 0 && index > 0) {
      // If focusing this page, move focus to prev
      if (document.activeElement === page) {
        const prev = pages[index - 1]
        if (prev) {
          // Focus styling?
        }
      }
      page.remove()
    }
  })

  updatePageNumberAttributes()
}

editor.addEventListener('input', (e) => {
  markDirty()
  checkPageOverflow()
  updatePageNumberAttributes()

  // Autocomplete trigger
  if (['character', 'scene-heading'].includes(currentElement)) {
    showAutocomplete()
  } else {
    hideAutocomplete()
  }

  clearTimeout(editor.updateTimeout)
  editor.updateTimeout = setTimeout(() => {
    updateUI()
    highlightActiveScene()
    updateAutocompleteData()
  }, 300)
})

function handleEnter(e) {
  e.preventDefault()

  // Since we preventDefault(), the browser won't emit a useful beforeinput
  // for history. Capture a checkpoint now.
  recordHistoryCheckpoint({ inputType: 'insertParagraph' })

  let currentLine = getCurrentLine()
  if (!currentLine) currentLine = ensureLineExists()

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  let caretRange = selection.getRangeAt(0)

  // If there's a selection, delete it first and continue as a collapsed caret.
  if (!selection.isCollapsed) {
    caretRange.deleteContents()
    selection.removeAllRanges()
    selection.addRange(caretRange)
  }

  // If the caret is within the current line, split it and move the trailing
  // content to the new line.
  let movedTrailingContent = false
  let trailingFragment = null
  try {
    const container = caretRange.startContainer
    if (currentLine && container && currentLine.contains(container)) {
      const splitRange = document.createRange()
      splitRange.setStart(caretRange.startContainer, caretRange.startOffset)
      splitRange.setEnd(currentLine, currentLine.childNodes.length)
      trailingFragment = splitRange.extractContents()

      // Detect whether anything meaningful was moved.
      movedTrailingContent = !!(trailingFragment && (trailingFragment.textContent || '').length) || (trailingFragment && trailingFragment.childNodes && trailingFragment.childNodes.length > 0)
    }
  } catch (_) {
    movedTrailingContent = false
    trailingFragment = null
  }

  const getElementForLine = (line) => {
    if (!line) return 'action'
    for (const [elem, cls] of Object.entries(ELEMENT_CLASSES)) {
      if (line.classList.contains(cls)) return elem
    }
    return 'action'
  }

  // Determine new element
  let newElement = currentElement
  const transitions = {
    'scene-heading': 'action',
    'character': 'dialogue',
    'dialogue': 'action',
    'parenthetical': 'dialogue',
    'transition': 'scene-heading'
  }
  if (movedTrailingContent) {
    // Split line: keep the same element type for the moved content.
    newElement = getElementForLine(currentLine)
  } else {
    // End-of-line behavior: keep the existing smart transitions.
    newElement = transitions[currentElement] || 'action'
  }

  // Create new line
  const newPara = document.createElement('div')
  newPara.className = getElementClass(newElement)
  if (movedTrailingContent && trailingFragment) {
    newPara.appendChild(trailingFragment)
    if (newPara.childNodes.length === 0 || (newPara.textContent || '').length === 0) {
      newPara.innerHTML = '<br>'
    }
  } else {
    newPara.innerHTML = '<br>'
  }

  const page = getCurrentPage()
  if (currentLine && currentLine.parentElement === page) {
    currentLine.after(newPara)
  } else {
    page.appendChild(newPara)
  }

  // Move cursor
  const range = document.createRange()
  range.selectNodeContents(newPara)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)

  // Check if we pushed to new page
  checkPageOverflow()

  // If new element is on next page, focus logic is handled by browser mostly
  // But we might need to scroll

  setElement(newElement)
  markDirty()
}

editor.addEventListener('click', updateCurrentElementFromCursor)
editor.addEventListener('keyup', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    updateCurrentElementFromCursor()
  }
})

function updateCurrentElementFromCursor() {
  const line = getCurrentLine()
  if (!line) return

  // Smart default: if user navigates into an existing blank line, infer the
  // intended element type from the previous meaningful line.
  if (!settings.smartBlankLineDefaults) {
    for (const [elem, cls] of Object.entries(ELEMENT_CLASSES)) {
      if (line.classList.contains(cls)) {
        setElement(elem)
        return
      }
    }
    setElement('action')
    hideAutocomplete()
    return
  }

  const isBlankActionLine = (el) => {
    if (!el) return false
    if ((el.textContent || '').trim() !== '') return false
    return el.classList?.contains('el-action')
  }

  const getElementForLine = (lineEl) => {
    if (!lineEl) return 'action'
    for (const [elem, cls] of Object.entries(ELEMENT_CLASSES)) {
      if (lineEl.classList.contains(cls)) return elem
    }
    return 'action'
  }

  const getPrevLineAcrossPages = (current) => {
    if (!current) return null
    if (current.previousElementSibling) return current.previousElementSibling
    const page = current.parentElement
    let prevPage = page?.previousElementSibling
    while (prevPage && prevPage.classList?.contains('title-page-view')) {
      prevPage = prevPage.previousElementSibling
    }
    return prevPage?.classList?.contains('screenplay-page') ? prevPage.lastElementChild : null
  }

  const maybeSmartDefaultBlankLine = (current) => {
    if (!isBlankActionLine(current)) return null

    const transitions = {
      'scene-heading': 'action',
      'character': 'dialogue',
      // Navigation heuristic: dialogue blocks usually continue until explicitly ended.
      'dialogue': 'dialogue',
      'parenthetical': 'dialogue',
      'transition': 'scene-heading'
    }

    let prev = getPrevLineAcrossPages(current)
    while (prev && isBlankActionLine(prev)) {
      prev = getPrevLineAcrossPages(prev)
    }
    if (!prev) return null

    const prevElement = getElementForLine(prev)
    const nextElement = transitions[prevElement]
    if (!nextElement || nextElement === 'action') return null

    const nextClass = getElementClass(nextElement)
    for (const cls of Object.values(ELEMENT_CLASSES)) {
      current.classList.remove(cls)
    }
    current.classList.add(nextClass)
    return nextElement
  }

  const smartElement = maybeSmartDefaultBlankLine(line)
  if (smartElement) {
    setElement(smartElement)
    markDirty()
    return
  }

  for (const [elem, cls] of Object.entries(ELEMENT_CLASSES)) {
    if (line.classList.contains(cls)) {
      setElement(elem)
      return
    }
  }
  setElement('action')
  hideAutocomplete()
}

editor.addEventListener('paste', (e) => {
  e.preventDefault()
  const text = e.clipboardData.getData('text/plain')
  document.execCommand('insertText', false, text)
})

// ============================================
// SAVE / LOAD
// ============================================
function markDirty() {
  const tab = getActiveTab()
  if (!tab) return
  tab.isDirty = true
  updateSaveStatusUI()
  renderTabs()
}

function markSaved() {
  const tab = getActiveTab()
  if (!tab) return
  tab.isDirty = false
  updateSaveStatusUI()
  renderTabs()
}

// Browser Storage Fallback (Auto-save)
function saveToStorage() {
  persistActiveTabState()
  try {
    const bakeTabDataForStorage = (data) => {
      if (!data || typeof data !== 'object') return data
      const content = typeof data.content === 'string' ? data.content : ''
      return { ...data, content: bakeDisplayCasingIntoContentHtml(content) }
    }

    const payload = {
      v: 1,
      activeTabId,
      tabs: tabs.map(t => ({
        id: t.id,
        fileName: t.fileName,
        data: bakeTabDataForStorage(t.data)
      }))
    }
    localStorage.setItem('sluggo_workspace', JSON.stringify(payload))
  } catch (err) {
    // Storage quota or serialization error; fall back to saving only the active tab.
    try {
      const tab = getActiveTab()
      if (tab) localStorage.setItem('sluggo_workspace', JSON.stringify({ v: 1, activeTabId: tab.id, tabs: [{ id: tab.id, fileName: tab.fileName, data: bakeTabDataForStorage(tab.data) }] }))
    } catch (_) {
      // Ignore.
    }
  }
}

// File System Access API
async function saveScript(asNew = false) {
  const scriptData = JSON.stringify(getScriptDataForSave(), null, 2)

  const tab = getActiveTab()
  if (!tab) return

  if (!asNew && tab.fileHandle) {
    // Save to existing handle
    try {
      const writable = await tab.fileHandle.createWritable()
      await writable.write(scriptData)
      await writable.close()
      markSaved()
    } catch (err) {
      console.error('Save failed:', err)
      alert('Failed to save file.')
    }
  } else {
    // Save As / New Save
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: withPrimaryScriptExtension(tab.fileName),
        types: [{
          description: 'SlugGo Script',
          accept: { 'application/x-sluggo+json': [PRIMARY_SCRIPT_EXTENSION] }
        }]
      })
      tab.fileHandle = handle
      tab.fileName = handle.name

      const writable = await tab.fileHandle.createWritable()
      await writable.write(scriptData)
      await writable.close()
      markSaved()
    } catch (err) {
      // User cancelled or not supported
      if (err.name !== 'AbortError') {
        // Fallback for browsers without FS API
        downloadFile(scriptData, withPrimaryScriptExtension(tab.fileName), 'application/json')
        markSaved()
      }
    }
  }
}

async function openScript() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'Scripts',
        accept: {
          'application/x-sluggo+json': [PRIMARY_SCRIPT_EXTENSION, LEGACY_SCRIPT_EXTENSION],
          'text/plain': ['.txt', '.fountain']
        }
      }]
    })

    const file = await handle.getFile()
    const content = await file.text()

    let data
    if (isNativeScriptFileName(file.name)) {
      data = JSON.parse(content)
    } else {
      data = parsePlainTextToScriptData(content)
    }

    openScriptInNewTab({ fileName: handle.name, fileHandle: handle, data })

  } catch (err) {
    if (err.name !== 'AbortError') {
      // Fallback
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = `${PRIMARY_SCRIPT_EXTENSION},${LEGACY_SCRIPT_EXTENSION},.txt,.fountain`
      input.onchange = (e) => {
        const file = e.target.files[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = (e) => {
            let data
            if (isNativeScriptFileName(file.name)) {
              data = JSON.parse(e.target.result)
            } else {
              data = parsePlainTextToScriptData(e.target.result)
            }
            openScriptInNewTab({ fileName: file.name, fileHandle: null, data })
          }
          reader.readAsText(file)
        }
      }
      input.click()
    }
  }
}

function getTemplateScriptData({ title = '', author = '', contact = '', date = '', rights = '' } = {}) {
  const template = `<div class="screenplay-page">
<div class="el-fade-in">FADE IN:</div>
<div class="el-action"><br></div>
<div class="el-scene-heading">INT. SOMEWHERE INTERESTING - DAY</div>
<div class="el-action">A vivid action line. Keep it lean. Keep it visual.</div>
<div class="el-action"><br></div>
<div class="el-character">YOU</div>
<div class="el-parenthetical">(testing the format)</div>
<div class="el-dialogue">Type like a screenwriter. Hit Tab to cycle elements while writing.</div>
<div class="el-action"><br></div>
<div class="el-transition">CUT TO:</div>
</div>`

  return {
    metadata: {
      title,
      author,
      contact,
      date,
      rights
    },
    content: template
  }
}

function parsePlainTextToScriptData(text) {
  const lines = text.split('\n')
  const pageLines = []

  for (const line of lines) {
    const trimmed = (line ?? '').trim()
    let cls = 'el-action'

    if (/^(INT|EXT|EST|INT\.?\/EXT)[\.\s]/i.test(trimmed)) {
      cls = 'el-scene-heading'
    } else if (/^>/.test(trimmed) || / TO:$/i.test(trimmed)) {
      cls = 'el-transition'
    } else if (/^\(.*\)$/.test(trimmed)) {
      cls = 'el-parenthetical'
    } else if (trimmed === trimmed.toUpperCase() && /^[A-Z]/.test(trimmed) && trimmed.length > 0 && trimmed.length < 30) {
      cls = 'el-character'
    }

    if (!trimmed) {
      pageLines.push(`<div class="${cls}"><br></div>`)
    } else {
      pageLines.push(`<div class="${cls}">${escapeHtml(trimmed)}</div>`)
    }
  }

  return {
    metadata: {
      title: '',
      tagline: '',
      author: '',
      contact: '',
      date: '',
      rights: ''
    },
    content: `<div class="screenplay-page">${pageLines.join('')}</div>`
  }
}

function getScriptData() {
  const readValue = (id) => {
    const el = document.getElementById(id)
    return el?.value ?? ''
  }

  return {
    metadata: {
      title: readValue('input-title'),
      tagline: readValue('input-tagline'),
      author: readValue('input-author'),
      contact: readValue('input-contact'),
      date: readValue('input-date'),
      rights: readValue('input-rights')
    },
    content: Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view)')).map(p => p.outerHTML).join('')
  }
}

function bakeDisplayCasingIntoContentHtml(html) {
  const raw = String(html || '')
  if (!raw) return ''

  // Bake the same casing rules the UI shows via CSS text-transform.
  // This is used for save/share/export so outputs match what the user sees,
  // while leaving the live editor text reversible during editing.
  try {
    const doc = new DOMParser().parseFromString(`<div id="__sluggo_wrap">${raw}</div>`, 'text/html')
    const wrap = doc.getElementById('__sluggo_wrap')
    if (!wrap) return raw

    const toUpper = wrap.querySelectorAll('.el-scene-heading, .el-character, .el-transition, .el-fade-in')
    toUpper.forEach((el) => {
      // Preserve blank lines (<br>) and only transform actual text.
      const text = el.textContent
      if (!text) return
      el.textContent = text.toUpperCase()
    })

    return wrap.innerHTML
  } catch (_) {
    return raw
  }
}

function getScriptDataForSave() {
  const data = getScriptData()
  return {
    ...data,
    content: bakeDisplayCasingIntoContentHtml(data.content)
  }
}

function ensureEditorHasAtLeastOnePage() {
  if (!editor) return
  const existing = editor.querySelector('.screenplay-page:not(.title-page-view)')
  if (existing) return

  const page = createNewPage()
  page.innerHTML = '<div class="el-action"><br></div>'
}

function loadScriptData(data) {
  if (data.content) {
    clearEditor()
    // Insert pages after title page
    const titlePage = document.getElementById('title-page-view')
    titlePage.insertAdjacentHTML('afterend', data.content)
  }

  // If loaded data has no pages (e.g., empty/old workspace payload), ensure the user has something to write on.
  ensureEditorHasAtLeastOnePage()

  if (data.metadata) {
    const titleEl = document.getElementById('input-title')
    if (titleEl) titleEl.value = data.metadata.title || ''
    const taglineEl = document.getElementById('input-tagline')
    if (taglineEl) taglineEl.value = data.metadata.tagline || ''
    const authorEl = document.getElementById('input-author')
    if (authorEl) authorEl.value = data.metadata.author || ''
    const contactEl = document.getElementById('input-contact')
    if (contactEl) contactEl.value = data.metadata.contact || ''
    const dateEl = document.getElementById('input-date')
    if (dateEl) dateEl.value = data.metadata.date || ''
    const rightsEl = document.getElementById('input-rights')
    if (rightsEl) rightsEl.value = data.metadata.rights || ''
  }

  scheduleTitlePageTextareaResize()
  updateUI()
}

function resizeTextareaToContent(el, { maxHeightPx = null } = {}) {
  if (!el) return

  el.style.height = 'auto'
  const desired = el.scrollHeight
  const max = Number.isFinite(maxHeightPx) ? Math.max(0, maxHeightPx) : null

  if (max && desired > max) {
    el.style.height = `${max}px`
    el.style.overflowY = 'auto'
    return
  }

  el.style.height = `${desired}px`
  el.style.overflowY = 'hidden'
}

let titlePageTextareaResizeRaf = null

function scheduleTitlePageTextareaResize() {
  if (titlePageTextareaResizeRaf) return
  titlePageTextareaResizeRaf = requestAnimationFrame(() => {
    titlePageTextareaResizeRaf = null
    const authorEl = document.getElementById('input-author')
    if (!authorEl) return

    const pageRect = titlePageView?.getBoundingClientRect?.()
    const maxHeight = pageRect?.height ? Math.floor(pageRect.height * 0.28) : 280
    resizeTextareaToContent(authorEl, { maxHeightPx: maxHeight })
  })
}

// Auto-save every 30 seconds (to local storage as backup)
setInterval(() => {
  // Save all tabs (best-effort) as an offline backup.
  // We only run this when *any* tab is dirty to reduce churn.
  if (tabs.some(t => t.isDirty)) saveToStorage()
}, 30000)

// ============================================
// EXPORT
// ============================================
function downloadFile(content, fileName, contentType) {
  const a = document.createElement('a')
  const file = new Blob([content], { type: contentType })
  a.href = URL.createObjectURL(file)
  a.download = fileName
  a.click()
}

function getPlainTextExport() {
  const getExportLineText = (line) => {
    const raw = (line?.textContent || '').replace(/\s+$/g, '')
    const cls = String(line?.className || '')

    // Match on-screen casing rules (CSS text-transform) for export.
    if (cls.includes('el-scene-heading') || cls.includes('el-character') || cls.includes('el-transition') || cls.includes('el-fade-in')) {
      return raw.toUpperCase()
    }

    return raw
  }

  const read = (id) => (document.getElementById(id)?.value || '').trimEnd()

  const title = read('input-title')
  const author = read('input-author')
  const contact = read('input-contact')
  const date = read('input-date')
  const rights = read('input-rights')

  const authorLines = author.split(/\r?\n/).map(s => s.trim()).filter(Boolean)

  const titleLines = []
  if (title) titleLines.push(title)
  if (author || title) {
    titleLines.push('', 'Written by')
    if (authorLines.length) titleLines.push(...authorLines)
  }
  if (contact) {
    titleLines.push('', ...contact.split(/\r?\n/))
  }
  if (date) titleLines.push('', date)
  if (rights) titleLines.push(rights)

  const pages = Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view)'))
  const pageText = pages.map(page => {
    const lines = Array.from(page.children).map(line => getExportLineText(line))
    // Preserve blank lines and trailing line breaks within a page.
    return lines.join('\n').trimEnd()
  })

  // Separate pages with a form-feed marker for tools that understand it.
  const bodyText = pageText.join('\n\n\f\n\n')
  const out = [titleLines.join('\n').trimEnd(), bodyText.trimEnd()].filter(Boolean).join('\n\n\f\n\n')
  return out.trimEnd() + '\n'
}

function exportPlainText() {
  const tab = getActiveTab()
  const base = stripScriptExtension(tab?.fileName) || 'screenplay'
  downloadFile(getPlainTextExport(), `${base}.txt`, 'text/plain')
}

function updatePageNumberAttributes() {
  const pages = Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view)'))
  const title = (document.getElementById('input-title')?.value || '').trim()
  pages.forEach((page, idx) => {
    const number = idx + 1
    const showOnFirst = !settings.pageNumbersStartOnPage2
    const text = (showOnFirst || number > 1) ? `${number}.` : ''
    page.dataset.pageNumber = text
    page.dataset.headerLeft = title
  })
}

function exportFDX() {
  const tab = getActiveTab()
  const base = tab?.fileName?.replace(/\.[^/.]+$/i, '') || 'screenplay'

  const getExportLineText = (line) => {
    const raw = (line?.textContent || '').replace(/\s+$/g, '')
    const cls = String(line?.className || '')

    // Match on-screen casing rules (CSS text-transform) for export.
    if (cls.includes('el-scene-heading') || cls.includes('el-character') || cls.includes('el-transition') || cls.includes('el-fade-in')) {
      return raw.toUpperCase()
    }

    return raw
  }

  const escapeXml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

  const typeForClass = (cls) => {
    if (cls.includes('el-scene-heading')) return 'Scene Heading'
    if (cls.includes('el-action')) return 'Action'
    if (cls.includes('el-character')) return 'Character'
    if (cls.includes('el-parenthetical')) return 'Parenthetical'
    if (cls.includes('el-dialogue')) return 'Dialogue'
    if (cls.includes('el-transition')) return 'Transition'
    if (cls.includes('el-fade-in')) return 'Transition'
    return 'Action'
  }

  const paragraphs = []
  const pages = Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view)'))
  pages.forEach(page => {
    Array.from(page.children).forEach(line => {
      const text = getExportLineText(line)
      if (!text.trim()) {
        // Preserve intentional blank lines as Action paragraphs (FDX importers vary; this is a safe default)
        paragraphs.push({ type: 'Action', text: '' })
        return
      }
      paragraphs.push({ type: typeForClass(line.className || ''), text })
    })
    // Separator between pages (best-effort)
    paragraphs.push({ type: 'Action', text: '' })
  })

  const title = (document.getElementById('input-title')?.value || '').trim()
  const tagline = (document.getElementById('input-tagline')?.value || '').trim()
  const author = (document.getElementById('input-author')?.value || '').trim()
  const contact = (document.getElementById('input-contact')?.value || '').trim()
  const date = (document.getElementById('input-date')?.value || '').trim()
  const rights = (document.getElementById('input-rights')?.value || '').trim()

  const authorLines = author.split(/\r?\n/).map(s => s.trim()).filter(Boolean)

  const titlePageParas = []
  if (title) titlePageParas.push({ type: 'Title', text: title })
  if (tagline) titlePageParas.push({ type: 'Source', text: tagline })
  titlePageParas.push({ type: 'Credit', text: 'Written by' })
  authorLines.forEach(line => titlePageParas.push({ type: 'Author', text: line }))
  if (contact) {
    contact.split(/\r?\n/).forEach(line => titlePageParas.push({ type: 'Contact', text: line }))
  }
  if (date) titlePageParas.push({ type: 'Contact', text: date })
  if (rights) titlePageParas.push({ type: 'Contact', text: rights })

  const titlePageXml = titlePageParas.length
    ? `  <TitlePage>\n    <Content>\n${titlePageParas.map(p => `      <Paragraph Type="${escapeXml(p.type)}"><Text>${escapeXml(p.text)}</Text></Paragraph>`).join('\n')}\n    </Content>\n  </TitlePage>\n`
    : ''

  const contentXml = paragraphs
    .map(p => `    <Paragraph Type="${escapeXml(p.type)}"><Text>${escapeXml(p.text)}</Text></Paragraph>`)
    .join('\n')

  const fdx = `<?xml version="1.0" encoding="UTF-8"?>\n<FinalDraft DocumentType="Script" Template="No" Version="1">\n${titlePageXml}  <Content>\n${contentXml}\n  </Content>\n</FinalDraft>\n`

  downloadFile(fdx, `${base}.fdx`, 'application/xml')
}

function importPlainText(text) {
  clearEditor()
  const page = createNewPage()

  // Simple Fountain-like parsing
  const lines = text.split('\n')

  lines.forEach(line => {
    const trimmed = line.trim()
    let cls = 'el-action'

    if (/^(INT|EXT|EST|INT\.?\/EXT)[\.\s]/i.test(trimmed)) {
      cls = 'el-scene-heading'
    } else if (/^>/.test(trimmed) || / TO:$/i.test(trimmed)) {
      cls = 'el-transition'
    } else if (/^\(.*\)$/.test(trimmed)) {
      cls = 'el-parenthetical'
    } else if (trimmed === trimmed.toUpperCase() && /^[A-Z]/.test(trimmed) && trimmed.length > 0 && trimmed.length < 30) {
      cls = 'el-character'
    }

    const div = document.createElement('div')
    div.className = cls
    div.textContent = trimmed || ''
    if (!trimmed) div.innerHTML = '<br>'
    page.appendChild(div)
  })

  checkPageOverflow()
  updateUI()
  markDirty()
}

function clearEditor() {
  editor.querySelectorAll('.screenplay-page:not(.title-page-view)').forEach(el => el.remove())
}

// ============================================
// UI UPDATES
// ============================================
function updateUI() {
  const text = editor.innerText

  // Word count
  const words = text.split(/\s+/).filter(w => w.length > 0).length
  wordCountDisplay.textContent = words

  // Page count (roughly 250 words per page for screenplay)
  const pages = Math.max(1, Math.ceil(words / 200))
  pageCountDisplay.textContent = pages

  // Scenes for sidebar
  const sceneLines = Array.from(editor.querySelectorAll('.el-scene-heading'))
  sceneList.innerHTML = sceneLines.length > 0
    ? sceneLines.map((line, i) => {
      const lineId = `scene-${i}`
      line.id = lineId
      return `
          <div class="scene-item ${i === 0 ? 'active' : ''}" data-scene-id="${lineId}">
            ${line.textContent.trim().toUpperCase() || 'UNTITLED SCENE'}
          </div>
        `
    }).join('')
    : '<div class="scene-item" style="opacity: 0.5;">No scenes yet</div>'
}

// Sidebar Navigation

  updatePageJumpOptions()
sceneList.addEventListener('click', (e) => {
  const item = e.target.closest('.scene-item')
  if (!item || !item.dataset.sceneId) return

  // Sidebar scene navigation should never “isolate” pages.
  // Ensure we are in normal body view and clear any legacy inline display overrides.
  if (isTitlePageVisible()) setTitlePageVisible(false)
  if (!isBodyVisible()) setBodyVisible(true)
  editor.querySelectorAll('.screenplay-page:not(.title-page-view)').forEach(page => {
    page.style.removeProperty('display')
  })

  const sceneEl = document.getElementById(item.dataset.sceneId)
  if (sceneEl) {
    const pageEl = sceneEl.closest('.screenplay-page') || sceneEl
    pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })

    // Move caret to the scene heading so typing continues there.
    const selection = window.getSelection()
    if (selection) {
      const range = document.createRange()
      const firstText = sceneEl.firstChild
      if (firstText && firstText.nodeType === Node.TEXT_NODE) {
        range.setStart(firstText, 0)
      } else {
        range.selectNodeContents(sceneEl)
        range.collapse(true)
      }
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    try {
      editor.focus({ preventScroll: true })
    } catch (_) {
      editor.focus()
    }
  }
})

// Highlight Active Scene in Sidebar
function highlightActiveScene() {
  const sceneLines = Array.from(editor.querySelectorAll('.el-scene-heading'))
  const viewportMiddle = window.innerHeight / 3 // Trigger slightly above middle

  let activeIndex = -1

  sceneLines.forEach((line, i) => {
    const rect = line.getBoundingClientRect()
    if (rect.top < viewportMiddle) {
      activeIndex = i
    }
  })

  document.querySelectorAll('.scene-item').forEach((item, i) => {
    item.classList.toggle('active', i === activeIndex)
  })
}

// ============================================
// AUTOCOMPLETE LOGIC
// ============================================

function updateAutocompleteData() {
  const characters = Array.from(editor.querySelectorAll('.el-character')).map(el => el.textContent.trim().toUpperCase())
  const headings = Array.from(editor.querySelectorAll('.el-scene-heading')).map(el => el.textContent.trim().toUpperCase())

  characters.forEach(c => { if (c) autocompleteData.characters.add(c) })
  headings.forEach(h => {
    if (h.includes(' ')) {
      const parts = h.split(' ')
      if (parts.length > 1) {
        autocompleteData.locations.add(parts.slice(1).join(' '))
      }
    }
  })
}

function showAutocomplete() {
  const line = getCurrentLine()
  if (!line) return

  const text = line.textContent.trim().toUpperCase()
  if (!text && currentElement !== 'scene-heading') {
    hideAutocomplete()
    return
  }

  let suggestions = []
  if (currentElement === 'character') {
    suggestions = Array.from(autocompleteData.characters).filter(c => c.startsWith(text) && c !== text)
  } else if (currentElement === 'scene-heading') {
    const chosenIntExt = String(settings.sceneHeadingsIntExtStyle || 'INT./EXT.').trim() === 'INT/EXT.' ? 'INT/EXT. ' : 'INT./EXT. '
    const quickPickPrefixes = ['INT. ', 'EXT. ', 'EST. ']
    if (settings.sceneHeadingsIntExtQuickPick) {
      // Offer only the preferred combined prefix.
      quickPickPrefixes.splice(2, 0, chosenIntExt)
    }

    // Accept both variants when completing an existing heading.
    const supportedPrefixes = ['INT. ', 'EXT. ', 'INT/EXT. ', 'INT./EXT. ', 'EST. ']
    const matchesPrefix = supportedPrefixes.some(p => text.startsWith(p))

    if (!matchesPrefix) {
      suggestions = quickPickPrefixes.filter(p => p.startsWith(text))
    } else {
      const prefix = supportedPrefixes.find(p => text.startsWith(p))
      const query = text.replace(prefix, '')
      suggestions = Array.from(autocompleteData.locations).filter(l => l.startsWith(query)).map(l => prefix + l)
    }
  }

  if (suggestions.length === 0) {
    hideAutocomplete()
    return
  }

  filteredSuggestions = suggestions.slice(0, 5) // Limit to 5
  renderSuggestions()

  // Position box
  const selection = window.getSelection()
  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()

  autocompleteBox.style.display = 'block'
  autocompleteBox.style.top = `${rect.bottom + window.scrollY + 5}px`
  autocompleteBox.style.left = `${rect.left + window.scrollX}px`
}

function renderSuggestions() {
  autocompleteBox.innerHTML = filteredSuggestions.map((s, i) => `
    <div class="autocomplete-item ${i === selectedSuggestionIndex ? 'selected' : ''}" data-index="${i}">
      ${s}
    </div>
  `).join('')


  updatePageNumberAttributes()
  autocompleteBox.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('click', () => {
      applySuggestion(parseInt(item.dataset.index))
    })
  })
}

function handleAutocompleteKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % filteredSuggestions.length
    renderSuggestions()
    return true
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedSuggestionIndex = (selectedSuggestionIndex - 1 + filteredSuggestions.length) % filteredSuggestions.length
    renderSuggestions()
    return true
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    applySuggestion(selectedSuggestionIndex)
    return true
  }
  if (e.key === 'Escape') {
    hideAutocomplete()
    return true
  }
  return false
}

function applySuggestion(index) {
  const suggestion = filteredSuggestions[index]
  const line = getCurrentLine()
  if (line && suggestion) {
    line.textContent = suggestion

    // Move cursor to end
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(line)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)

    hideAutocomplete()
    markDirty()
  }
}

function hideAutocomplete() {
  autocompleteBox.style.display = 'none'
  selectedSuggestionIndex = 0
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  loadSettings()
  applySettingsToUI()

  applyInitialSidebarState()

  updateDarkModeToggleUI()

  // Shared-link import takes priority: open it as a new tab.
  // Backend (OG preview) share links use ?shareId=...
  await tryImportSharedScriptFromBackend()

  // No-backend share links use #share=...
  await tryImportSharedScriptFromUrl()

  // Load saved workspace (tabs).
  const savedWorkspace = localStorage.getItem('sluggo_workspace')

  if (savedWorkspace) {
    try {
      const workspace = JSON.parse(savedWorkspace)
      if (workspace?.tabs?.length) {
        tabs = workspace.tabs.map(t => ({
          id: t.id,
          fileName: t.fileName,
          fileHandle: null,
          data: t.data,
          isDirty: false,
          autocompleteData: getDefaultAutocompleteData()
        }))
        activeTabId = workspace.activeTabId && tabs.some(t => t.id === workspace.activeTabId)
          ? workspace.activeTabId
          : tabs[0].id
      }
    } catch (_) {
      // Ignore and fall back.
    }
  }

  if (tabs.length === 0) {
    const savedScript = localStorage.getItem('sluggo_script')
    if (savedScript) {
      try {
        const data = JSON.parse(savedScript)
        const id = createTab({ fileName: `Recovered${PRIMARY_SCRIPT_EXTENSION}`, data, isDirty: false })
        activeTabId = id
      } catch (_) {
        // Content might be raw HTML.
        if (savedScript.includes('el-')) {
          const data = { metadata: { title: '', author: '', contact: '', date: '' }, content: `<div class="screenplay-page">${savedScript}</div>` }
          const id = createTab({ fileName: `Recovered${PRIMARY_SCRIPT_EXTENSION}`, data, isDirty: false })
          activeTabId = id
        }
      }
    }
  }

  ensureAtLeastOneTab()

  const tab = getActiveTab()
  if (tab) {
    autocompleteData = tab.autocompleteData || getDefaultAutocompleteData()
    loadScriptData(tab.data)
    configureLoadedPages()
  }

  // Rebuild suggestions for the active tab.
  const active = getActiveTab()
  if (active) {
    autocompleteData = rebuildAutocompleteDataFromEditor()
    active.autocompleteData = autocompleteData
  }

  updateSaveStatusUI()
  renderTabs()

  updateUI()
  scheduleTitlePageTextareaResize()
  // Autocomplete data is rebuilt above.

  // Show tutorial on first visit
  const tutorialDone = localStorage.getItem('sluggo_tutorial')
  if (tutorialDone !== 'done') {
    tutorialModal.classList.remove('hidden')
  }

  // Focus editor
  editor.focus()
  updateCurrentElementFromCursor()
}

init().catch(err => {
  console.error('Init failed', err)
})

// PWA Service Worker Registration
// Important: do NOT register the SW in dev, it can cache index.html and break Vite HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}service-worker.js`
    navigator.serviceWorker.register(swUrl)
      .then((reg) => {
        const promptUpdateIfWaiting = () => {
          if (!reg.waiting) return
          // Minimal UX: confirm prompt
          if (confirm('A new version of SlugGo is available. Reload to update?')) {
            reg.waiting.postMessage({ type: 'SLUGGO_SW_SKIP_WAITING' })
          }
        }

        // If there's already a waiting SW, prompt now.
        promptUpdateIfWaiting()

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdateIfWaiting()
            }
          })
        })

        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return
          refreshing = true
          window.location.reload()
        })
      })
      .catch(err => console.log('SW failed', err))
  })
}
