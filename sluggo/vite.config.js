import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

function getAppVersion() {
  try {
    const raw = readFileSync(new URL('./package.json', import.meta.url), 'utf8')
    const pkg = JSON.parse(raw)
    return String(pkg?.version || '').trim() || '0.0.0'
  } catch (_) {
    return '0.0.0'
  }
}

function getBuildShaShort() {
  // Prefer CI-provided SHA.
  const envSha = process.env.GITHUB_SHA || process.env.VITE_GITHUB_SHA
  if (envSha) return String(envSha).slice(0, 7)

  // Fall back to local git.
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString('utf8')
      .trim()
    return sha || ''
  } catch (_) {
    return ''
  }
}

function getAppVersionString() {
  const base = getAppVersion()
  const sha = getBuildShaShort()
  // SemVer build metadata: 1.2.3+abc1234
  return sha ? `${base}+${sha}` : base
}

export default defineConfig(() => {
  // Build output should work both at a custom domain root (/) and under a
  // GitHub Pages project sub-path (/<repo>/). Using a relative base achieves
  // that by emitting ./assets/... URLs.
  //
  // Keep dev server base as / for predictable routing and HMR.
  const base = process.env.VITE_BASE ?? (process.env.NODE_ENV === 'development' ? '/' : './')

  const appVersion = getAppVersionString()

  return {
    base,
    define: {
      __SLUGGO_APP_VERSION__: JSON.stringify(appVersion)
    }
  }
})
