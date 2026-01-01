import './style.css'

// ============================================
// SKRYPTONITE - Industry-Standard Screenplay Editor
// ============================================

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

const darkModeToggleBtn = document.getElementById('darkmode-toggle')

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
  marginPreset: document.getElementById('setting-margin-preset')
}

const DEFAULT_SETTINGS = {
  includeTitlePageInPrint: true,
  showPageNumbersInPrint: true,
  pageNumbersStartOnPage2: true,
  printHeaderStyle: 'none',
  marginPreset: 'standard'
}

let settings = { ...DEFAULT_SETTINGS }

function loadSettings() {
  try {
    const raw = localStorage.getItem('skryptonite_settings')
    if (!raw) return
    const parsed = JSON.parse(raw)
    settings = { ...DEFAULT_SETTINGS, ...(parsed || {}) }
  } catch (_) {
    // Ignore
  }
}

function saveSettings() {
  try {
    localStorage.setItem('skryptonite_settings', JSON.stringify(settings))
  } catch (_) {
    // Ignore
  }
}

function applySettingsToUI() {
  settingsEls.includeTitlePage && (settingsEls.includeTitlePage.checked = !!settings.includeTitlePageInPrint)
  settingsEls.pageNumbers && (settingsEls.pageNumbers.checked = !!settings.showPageNumbersInPrint)
  settingsEls.pageNumbersStart2 && (settingsEls.pageNumbersStart2.checked = !!settings.pageNumbersStartOnPage2)
  settingsEls.printHeaderStyle && (settingsEls.printHeaderStyle.value = settings.printHeaderStyle || 'none')
  settingsEls.marginPreset && (settingsEls.marginPreset.value = settings.marginPreset || 'standard')

  document.body.classList.toggle('print-include-title-page', !!settings.includeTitlePageInPrint)
  document.body.classList.toggle('print-page-numbers', !!settings.showPageNumbersInPrint)
  document.body.classList.toggle('print-header-title', (settings.printHeaderStyle || 'none') === 'title')

  applyMarginPreset(settings.marginPreset || 'standard')
  updatePageNumberAttributes()
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
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => closeModal(m))

  const titleEl = document.getElementById('title-page-view')
  const hadActive = titleEl?.classList.contains('active')
  if (settings.includeTitlePageInPrint && titleEl && !hadActive) {
    titleEl.classList.add('active')
  }

  window.print()

  if (settings.includeTitlePageInPrint && titleEl && !hadActive) {
    titleEl.classList.remove('active')
  }
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

function getDefaultAutocompleteData() {
  return {
    characters: new Set(),
    locations: new Set(['INT. ', 'EXT. ', 'INT/EXT. ', 'EST. '])
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
    if (!page.__skryptoniteConfigured) {
      page.__skryptoniteConfigured = true
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
  const fileName = `Untitled ${untitledCounter++}.skrypt`
  const data = getTemplateScriptData()
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
  document.title = `${tab.isDirty ? '*' : ''}${tab.fileName} - Skryptonite`
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

  // Edit
  'undo': () => document.execCommand('undo'),
  'redo': () => document.execCommand('redo'),
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
  'toggle-sidebar': () => sidebar.classList.toggle('hidden'),
  'toggle-dark-mode': () => toggleDarkPaperMode(),
  'zoom-in': () => setZoom(zoomLevel + 0.1),
  'zoom-out': () => setZoom(zoomLevel - 0.1),
  'zoom-reset': () => setZoom(1),
  'title-page': () => toggleTitlePage(),

  // Format
  'el-scene-heading': () => applyElementToCurrentLine('scene-heading'),
  'el-action': () => applyElementToCurrentLine('action'),
  'el-character': () => applyElementToCurrentLine('character'),
  'el-parenthetical': () => applyElementToCurrentLine('parenthetical'),
  'el-dialogue': () => applyElementToCurrentLine('dialogue'),
  'el-transition': () => applyElementToCurrentLine('transition'),

  // Help
  'show-shortcuts': () => shortcutsModal.classList.remove('hidden'),
  'show-tutorial': () => tutorialModal.classList.remove('hidden'),
  'docs': () => openModal(docsModal),
  'license': () => openModal(licenseModal),
  'about': () => openModal(aboutModal),

  // Settings
  'settings': () => openSettings()
}

// Hover intent state
let isMenuOpen = false

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
    closeAllMenus()
    isMenuOpen = true
    item.querySelector('.menu-dropdown').style.display = 'block'
    trigger.setAttribute('aria-expanded', 'true')
  })

  item.addEventListener('mouseover', () => {
    if (isMenuOpen) {
      closeAllMenus()
      item.querySelector('.menu-dropdown').style.display = 'block'
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

// Close menus on outside click
document.addEventListener('click', () => {
  isMenuOpen = false
  closeAllMenus()
})

// Keep quick format buttons in sync with caret movement.
document.addEventListener('selectionchange', () => {
  scheduleQuickBarUpdate()
})

darkModeToggleBtn?.addEventListener('click', () => {
  toggleDarkPaperMode()
})

// Scroll handler for sidebar highlighting
const editorWrapper = document.querySelector('.editor-container')
editorWrapper.addEventListener('scroll', () => {
  highlightActiveScene()
})

// Modal close handlers
document.getElementById('close-tutorial')?.addEventListener('click', () => {
  closeModal(tutorialModal)
  localStorage.setItem('skryptonite_tutorial', 'done')
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

settingsEls.marginPreset?.addEventListener('change', () => {
  settings.marginPreset = settingsEls.marginPreset.value || 'standard'
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
  const el = document.getElementById('title-page-view')
  const isActive = el.classList.toggle('active')
  // Hide/show other screenplay pages when title page is focused
  document.querySelectorAll('.screenplay-page:not(.title-page-view)').forEach(page => {
    page.style.display = isActive ? 'none' : ''
  })
  scheduleQuickBarUpdate()
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

  // Reset
  quickBar.querySelectorAll('.quick-btn.is-active').forEach(btn => btn.classList.remove('is-active'))

  // Title page button state
  const titleBtn = quickBar.querySelector('[data-action="title-page"]')
  if (titleBtn) titleBtn.classList.toggle('is-active', isTitlePageActive)

  // If title page is active, don't highlight a screenplay line format.
  if (isTitlePageActive) return

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
  let line = getCurrentLine()
  if (!line) line = ensureLineExists()
  if (!line) {
    setElement(element)
    return
  }

  const newClass = getElementClass(element)
  const selection = window.getSelection()
  const range = selection.getRangeAt(0)

  // Save cursor
  const savedOffset = range.startOffset
  const savedNode = range.startContainer

  // Update class
  Object.values(ELEMENT_CLASSES).forEach(cls => line.classList.remove(cls))
  line.classList.add(newClass)

  // Auto-uppercase
  if (['scene-heading', 'character', 'transition'].includes(element)) {
    const text = line.textContent.trim()
    if (text) line.textContent = text.toUpperCase()
  }

  // Restore cursor
  try {
    if (savedNode.parentElement) {
      range.setStart(savedNode, Math.min(savedOffset, savedNode.length || 0))
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  } catch (e) {
    range.selectNodeContents(line)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
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

        if (nextPage.firstChild) {
          nextPage.insertBefore(lastChild, nextPage.firstChild)
        } else {
          nextPage.appendChild(lastChild)
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

  let currentLine = getCurrentLine()
  if (!currentLine) currentLine = ensureLineExists()

  // Determine new element
  let newElement = currentElement
  const transitions = {
    'scene-heading': 'action',
    'character': 'dialogue',
    'dialogue': 'action',
    'parenthetical': 'dialogue',
    'transition': 'scene-heading'
  }
  newElement = transitions[currentElement] || 'action'

  // Create new line
  const newPara = document.createElement('div')
  newPara.className = getElementClass(newElement)
  newPara.innerHTML = '<br>'

  const page = getCurrentPage()
  if (currentLine && currentLine.parentElement === page) {
    currentLine.after(newPara)
  } else {
    page.appendChild(newPara)
  }

  // Move cursor
  const selection = window.getSelection()
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
    const payload = {
      v: 1,
      activeTabId,
      tabs: tabs.map(t => ({
        id: t.id,
        fileName: t.fileName,
        data: t.data
      }))
    }
    localStorage.setItem('skryptonite_workspace', JSON.stringify(payload))
  } catch (err) {
    // Storage quota or serialization error; fall back to saving only the active tab.
    try {
      const tab = getActiveTab()
      if (tab) localStorage.setItem('skryptonite_workspace', JSON.stringify({ v: 1, activeTabId: tab.id, tabs: [{ id: tab.id, fileName: tab.fileName, data: tab.data }] }))
    } catch (_) {
      // Ignore.
    }
  }
}

// File System Access API
async function saveScript(asNew = false) {
  const scriptData = JSON.stringify(getScriptData(), null, 2)

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
        suggestedName: tab.fileName,
        types: [{
          description: 'Skryptonite Script',
          accept: { 'application/json': ['.skrypt'] }
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
        downloadFile(scriptData, tab.fileName, 'application/json')
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
          'application/json': ['.skrypt'],
          'text/plain': ['.txt', '.fountain']
        }
      }]
    })

    const file = await handle.getFile()
    const content = await file.text()

    let data
    if (file.name.endsWith('.skrypt')) {
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
      input.accept = '.skrypt,.txt,.fountain'
      input.onchange = (e) => {
        const file = e.target.files[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = (e) => {
            let data
            if (file.name.endsWith('.skrypt')) {
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

function getTemplateScriptData() {
  const template = `<div class="screenplay-page"><div class="el-fade-in">FADE IN:</div>
<div class="el-action"><br></div>
<div class="el-scene-heading">INT. YOUR WORLD - DAY</div>
<div class="el-action"><br></div></div>`

  return {
    metadata: {
      title: '',
      author: '',
      contact: '',
      date: '',
      rights: ''
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
      author: '',
      contact: '',
      date: '',
      rights: ''
    },
    content: `<div class="screenplay-page">${pageLines.join('')}</div>`
  }
}

function getScriptData() {
  return {
    metadata: {
      title: document.getElementById('input-title').value,
      author: document.getElementById('input-author').value,
      contact: document.getElementById('input-contact').value,
      date: document.getElementById('input-date').value,
      rights: document.getElementById('input-rights')?.value || ''
    },
    content: Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view)')).map(p => p.outerHTML).join('')
  }
}

function loadScriptData(data) {
  if (data.content) {
    clearEditor()
    // Insert pages after title page
    const titlePage = document.getElementById('title-page-view')
    titlePage.insertAdjacentHTML('afterend', data.content)
  }

  if (data.metadata) {
    document.getElementById('input-title').value = data.metadata.title || ''
    document.getElementById('input-author').value = data.metadata.author || ''
    document.getElementById('input-contact').value = data.metadata.contact || ''
    document.getElementById('input-date').value = data.metadata.date || ''
    const rightsEl = document.getElementById('input-rights')
    if (rightsEl) rightsEl.value = data.metadata.rights || ''
  }
  updateUI()
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
  const pages = Array.from(editor.querySelectorAll('.screenplay-page:not(.title-page-view)'))
  // Separate pages with a form-feed marker for tools that understand it.
  return pages.map(p => p.innerText.trimEnd()).join('\n\n\f\n\n') + '\n'
}

function exportPlainText() {
  const tab = getActiveTab()
  const base = tab?.fileName?.replace(/\.skrypt$/i, '') || 'screenplay'
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
      const text = (line.textContent || '').replace(/\s+$/g, '')
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
  const author = (document.getElementById('input-author')?.value || '').trim()
  const contact = (document.getElementById('input-contact')?.value || '').trim()
  const date = (document.getElementById('input-date')?.value || '').trim()
  const rights = (document.getElementById('input-rights')?.value || '').trim()

  const titlePageParas = []
  if (title) titlePageParas.push({ type: 'Title', text: title })
  titlePageParas.push({ type: 'Credit', text: 'Written by' })
  if (author) titlePageParas.push({ type: 'Author', text: author })
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
sceneList.addEventListener('click', (e) => {
  const item = e.target.closest('.scene-item')
  if (!item || !item.dataset.sceneId) return

  // If title page is active, toggle it off and show script
  const titleEl = document.getElementById('title-page-view')
  if (titleEl && titleEl.classList.contains('active')) {
    titleEl.classList.remove('active')
    document.querySelectorAll('.screenplay-page:not(.title-page-view)').forEach(page => {
      page.style.display = ''
    })
  }

  const sceneEl = document.getElementById(item.dataset.sceneId)
  if (sceneEl) {
    sceneEl.scrollIntoView({ behavior: 'smooth', block: 'start' })

    // Move cursor to that scene
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(sceneEl)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    editor.focus()
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
    const prefixes = ['INT. ', 'EXT. ', 'INT/EXT. ', 'EST. ']
    const matchesPrefix = prefixes.some(p => text.startsWith(p))

    if (!matchesPrefix) {
      suggestions = prefixes.filter(p => p.startsWith(text))
    } else {
      const prefix = prefixes.find(p => text.startsWith(p))
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
function init() {
  loadSettings()
  applySettingsToUI()

  updateDarkModeToggleUI()

  // Load saved workspace (tabs) or fall back to the legacy single-script key.
  const savedWorkspace = localStorage.getItem('skryptonite_workspace')

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
    const legacy = localStorage.getItem('skryptonite_script')
    if (legacy) {
      try {
        const data = JSON.parse(legacy)
        const id = createTab({ fileName: 'Recovered.skrypt', data, isDirty: false })
        activeTabId = id
      } catch (_) {
        // Legacy content might be raw HTML.
        if (legacy.includes('el-')) {
          const data = { metadata: { title: '', author: '', contact: '', date: '' }, content: `<div class="screenplay-page">${legacy}</div>` }
          const id = createTab({ fileName: 'Recovered.skrypt', data, isDirty: false })
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
  // Autocomplete data is rebuilt above.

  // Show tutorial on first visit
  if (localStorage.getItem('skryptonite_tutorial') !== 'done') {
    tutorialModal.classList.remove('hidden')
  }

  // Focus editor
  editor.focus()
  updateCurrentElementFromCursor()
}

init()

// PWA Service Worker Registration
// Important: do NOT register the SW in dev, it can cache index.html and break Vite HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => {
        const promptUpdateIfWaiting = () => {
          if (!reg.waiting) return
          // Minimal UX: confirm prompt
          if (confirm('A new version of Skryptonite is available. Reload to update?')) {
            reg.waiting.postMessage({ type: 'SKRYPTONITE_SW_SKIP_WAITING' })
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
