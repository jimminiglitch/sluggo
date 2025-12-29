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

const settingsEls = {
  includeTitlePage: document.getElementById('setting-include-title-page'),
  pageNumbers: document.getElementById('setting-page-numbers')
}

const DEFAULT_SETTINGS = {
  includeTitlePageInPrint: true,
  showPageNumbersInPrint: true
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

  document.body.classList.toggle('print-include-title-page', !!settings.includeTitlePageInPrint)
  document.body.classList.toggle('print-page-numbers', !!settings.showPageNumbersInPrint)
}

function openSettings() {
  settingsModal?.classList.remove('hidden')
}

function closeSettings() {
  settingsModal?.classList.add('hidden')
  editor.focus()
}

function printScript() {
  applySettingsToUI()
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'))

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
    const term = prompt('Find text:')
    if (term) window.find(term)
  },
  'replace': () => alert('Find & Replace: Coming soon'),
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
  'toggle-dark-mode': () => document.body.classList.toggle('dark-paper'),
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
  'docs': () => docsModal?.classList.remove('hidden'),
  'license': () => licenseModal?.classList.remove('hidden'),
  'about': () => aboutModal.classList.remove('hidden'),

  // Settings
  'settings': () => openSettings()
}

// Hover intent state
let isMenuOpen = false

// Attach menu handlers
document.querySelectorAll('.menu-item').forEach(item => {
  const trigger = item.querySelector('.menu-trigger')
  const action = trigger.textContent.toLowerCase() // 'file', 'edit' etc

  trigger.addEventListener('click', (e) => {
    e.stopPropagation()
    closeAllMenus()
    isMenuOpen = true
    item.querySelector('.menu-dropdown').style.display = 'block'
  })

  item.addEventListener('mouseover', () => {
    if (isMenuOpen) {
      closeAllMenus()
      item.querySelector('.menu-dropdown').style.display = 'block'
    }
  })
})

document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action
    if (menuActions[action]) {
      menuActions[action]()
      closeAllMenus()
    }
  })
})

function closeAllMenus() {
  document.querySelectorAll('.menu-dropdown').forEach(el => el.style.display = '')
}

// Close menus on outside click
document.addEventListener('click', () => {
  isMenuOpen = false
  closeAllMenus()
})

// Scroll handler for sidebar highlighting
const editorWrapper = document.querySelector('.editor-container')
editorWrapper.addEventListener('scroll', () => {
  highlightActiveScene()
})

// Modal close handlers
document.getElementById('close-tutorial')?.addEventListener('click', () => {
  tutorialModal.classList.add('hidden')
  localStorage.setItem('skryptonite_tutorial', 'done')
  editor.focus()
})

document.getElementById('close-shortcuts')?.addEventListener('click', () => {
  shortcutsModal.classList.add('hidden')
  editor.focus()
})

document.getElementById('close-about')?.addEventListener('click', () => {
  aboutModal.classList.add('hidden')
  editor.focus()
})

document.getElementById('close-license')?.addEventListener('click', () => {
  licenseModal?.classList.add('hidden')
  editor.focus()
})

document.getElementById('close-docs')?.addEventListener('click', () => {
  docsModal?.classList.add('hidden')
  editor.focus()
})

document.getElementById('close-settings')?.addEventListener('click', () => {
  closeSettings()
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

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden')
    }
  })
})


// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  // Don't intercept if typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

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
      case 'd':
        e.preventDefault()
        menuActions['toggle-dark-mode']()
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
  el.classList.toggle('active')
}

// ============================================
// ELEMENT MANAGEMENT
// ============================================
function setElement(element) {
  currentElement = element
  const displayName = element.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  currentElementDisplay.textContent = displayName
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
editor.addEventListener('keydown', (e) => {
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
<div class="el-scene-heading">INT. LOCATION - DAY</div>
<div class="el-action">Action goes here.</div>
<div class="el-character">CHARACTER</div>
<div class="el-dialogue">Dialogue goes here.</div></div>`

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
  pages.forEach((page, idx) => {
    page.dataset.pageNumber = String(idx + 1)
  })
}

function exportFDX() {
  const content = editor.innerText
  const fdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
    <Paragraph Type="Action">
      <Text>${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Text>
    </Paragraph>
  </Content>
</FinalDraft>`
  downloadFile(fdx, 'screenplay.fdx', 'application/xml')
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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('SW registered'))
      .catch(err => console.log('SW failed', err))
  })
}
