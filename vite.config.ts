import { defineConfig } from 'vite'
import { execFileSync } from 'node:child_process'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function buildMetadata() {
  let commitSha: string | null = null
  let dirty: boolean | null = null
  const deploymentSha = process.env.VERCEL_GIT_COMMIT_SHA
  if (deploymentSha && /^[0-9a-f]{40}$/i.test(deploymentSha)) commitSha = deploymentSha
  else {
    try { commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim() } catch { /* source archives may lack git */ }
  }
  try { dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: __dirname, encoding: 'utf8' }).trim().length > 0 } catch { /* unknown stays explicit */ }
  return { commitSha, dirty }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'kigen-build-metadata',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify(buildMetadata()) + '\n' })
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],
})
