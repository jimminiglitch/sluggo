import { defineConfig } from 'vite'

export default defineConfig(() => {
  // For GitHub Pages, the site is served from /<repo-name>/
  // In GitHub Actions we can derive the repo name from GITHUB_REPOSITORY.
  const repo = process.env.GITHUB_REPOSITORY?.split('/')?.[1]
  const base = process.env.VITE_BASE ?? ((process.env.GITHUB_ACTIONS && repo) ? `/${repo}/` : '/')

  return { base }
})
