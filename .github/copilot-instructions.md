# SlugGo - Copilot Instructions

## Project Overview

SlugGo is a fast, offline-friendly screenplay editor built with vanilla JavaScript and Vite. It's a Progressive Web App (PWA) that provides industry-standard screenplay formatting in the browser with desktop-like features including a menu bar, keyboard shortcuts, pagination, scene sidebar, autosave, and multi-tab support.

**Key Philosophy**: No logins, no subscriptions, no bloat. Just writing.

## Project Structure

This is a monorepo with the Vite application nested in the `./sluggo/` subdirectory:

```
/
├── .github/              # GitHub workflows and configurations
│   └── workflows/        # CI, Pages deployment, and release workflows
├── sluggo/              # Main Vite application
│   ├── src/             # Source code (vanilla JS)
│   │   ├── main.js      # Main application logic
│   │   └── style.css    # Styles
│   ├── public/          # Static assets
│   ├── index.html       # Main HTML file with complete UI structure
│   ├── package.json     # App dependencies
│   └── vite.config.js   # Vite configuration
├── package.json         # Root-level convenience scripts
└── README.md            # Documentation
```

## Technology Stack

- **Framework**: Vanilla JavaScript (no framework dependencies)
- **Build Tool**: Vite 7.x
- **Module Type**: ES Modules
- **Node Version**: Node.js 18+ recommended (Node 20 used in CI)
- **Deployment**: GitHub Pages
- **Release Management**: Semantic Release with Conventional Commits

## Development

### Setup and Running

From **repository root**:
```bash
npm run install:app  # Install dependencies in ./sluggo/
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build
```

From **app folder** (`./sluggo/`):
```bash
cd sluggo
npm install
npm run dev
npm run build
npm run preview
```

### Build Configuration

- Vite is configured to inject `__SLUGGO_APP_VERSION__` at build time (see `vite.config.js`)
- Version includes semantic version + git SHA (e.g., `1.1.0+abc1234`)
- Base path is configured for GitHub Pages deployment (using repo name)
- Production build outputs to `sluggo/dist/`

## Code Conventions

### JavaScript Style

- **Pure vanilla JS** - No frameworks or libraries
- **ES Modules** - Use import/export syntax
- **No TypeScript** - Plain JavaScript only
- **Variable naming**: camelCase for variables and functions
- **Constants**: UPPER_SNAKE_CASE for global constants
- **DOM references**: Declared at top of main.js

### Code Organization

- Keep all application logic in `sluggo/src/main.js`
- Styles in `sluggo/src/style.css`
- UI structure is primarily defined in `index.html` with modals and sections
- Static assets go in `sluggo/public/`

### Screenplay Elements

The app supports standard screenplay formatting types:
- Scene Heading (Ctrl+1)
- Action (Ctrl+2)
- Character (Ctrl+3)
- Parenthetical (Ctrl+4)
- Dialogue (Ctrl+5)
- Transition (Ctrl+6)

### Storage

- Uses `localStorage` for autosave backups and preferences
- File System Access API when available (with fallback to download/upload)
- Default file extension: `.sluggo` (legacy `.skrypt` still supported)

## Commit Conventions

This project uses **Conventional Commits** with semantic-release:

- `feat:` - New features (triggers minor version bump)
- `fix:` - Bug fixes (triggers patch version bump)
- `chore:` - Maintenance tasks (no version bump)
- `docs:` - Documentation changes (no version bump)
- `BREAKING CHANGE:` - Breaking changes (triggers major version bump)

## Testing

Currently, there is **no automated test infrastructure** in this project. Manual testing is required for all changes.

### Manual Testing Checklist

When making changes, manually verify:
1. Dev server starts correctly (`npm run dev`)
2. Build completes without errors (`npm run build`)
3. Preview works (`npm run preview`)
4. Core features work in browser:
   - Creating/opening/saving scripts
   - Formatting elements (Scene, Action, Character, etc.)
   - Keyboard shortcuts
   - Tabs functionality
   - Sidebar toggle
   - Dark mode
   - Print/PDF export

## GitHub Actions Workflows

### CI (`.github/workflows/ci.yml`)
- Runs on: Push to main, pull requests
- Checks: Build success
- Working directory: `sluggo/`
- Node version: 20

### Pages Deploy (`.github/workflows/pages.yml`)
- Runs on: Push to main
- Deploys build to GitHub Pages

### Release (`.github/workflows/release.yml`)
- Runs on: Push to main
- Uses semantic-release to create releases
- Generates CHANGELOG.md
- Updates version in package.json

## Important Files

- **index.html**: Contains the complete UI structure including menu bar, modals, sidebars
- **main.js**: Core application logic
- **vite.config.js**: Build configuration including version injection and base path setup
- **.releaserc.json**: Semantic release configuration

## PWA Features

SlugGo is installable as a Progressive Web App:
- Manifest file in `public/manifest.json`
- Works offline when installed
- Icon and theme configuration in `index.html`

## Printing and PDF

- Uses browser print dialog for PDF output
- Courier New at 12pt for screenplay pages (industry standard)
- Configurable page numbers and title page inclusion
- Print layout optimized for Letter (8.5" × 11") paper

## Making Changes

When contributing to SlugGo:

1. **Keep it simple**: This is a vanilla JS project by design
2. **Avoid dependencies**: Don't add new npm packages unless absolutely necessary
3. **Test manually**: Build and run the app to verify changes
4. **Follow conventions**: Use Conventional Commits for commit messages
5. **Maintain performance**: Keep the app fast and lightweight
6. **Preserve offline functionality**: Don't break PWA/offline features
7. **Desktop-like UX**: Maintain the menu bar, keyboard shortcuts, and desktop app feel

## Common Tasks

### Adding a new keyboard shortcut
1. Add the keyboard handler in main.js
2. Update the shortcuts modal in index.html
3. Update documentation if needed

### Adding a new screenplay element type
1. Update element type constants in main.js
2. Add formatting logic
3. Add UI button/menu item in index.html
4. Update keyboard shortcuts

### Changing styles
- Edit `sluggo/src/style.css`
- Maintain print stylesheet for PDF export
- Test in both light and dark modes

### Updating version
- Version is managed by semantic-release
- Use Conventional Commits to trigger version bumps automatically
- Manual version changes are overwritten by semantic-release
