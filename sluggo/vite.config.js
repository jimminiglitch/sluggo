import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

function getAppVersion() {
  try {
    const raw = readFileSync(new URL('./package.json', import.meta.url), 'utf8')
    const pkg = JSON.parse(raw)
    return String(pkg?.version || '').trim() || '0.0.0'
  } catch (_) {
    return '0.0.0'
  }
}

export default defineConfig(() => {
  // For GitHub Pages, the site is served from /<repo-name>/
  // In GitHub Actions we can derive the repo name from GITHUB_REPOSITORY.
  const repo = process.env.GITHUB_REPOSITORY?.split('/')?.[1]
  const base = process.env.VITE_BASE ?? ((process.env.GITHUB_ACTIONS && repo) ? `/${repo}/` : '/')

  const appVersion = getAppVersion()

  return {
    base,
    define: {
      __SLUGGO_APP_VERSION__: JSON.stringify(appVersion)
    }
  }
})
