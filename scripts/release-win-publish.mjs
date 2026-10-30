/* eslint-env node */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadElectronBuilderConfig, verifyWindowsUpdateBuildConfig } from './verify-win-update-artifacts.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}). ${capture ? result.stderr.trim() : ''}`)
  return capture ? result.stdout.trim() : ''
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('pnpm run release:win\nBuild and verify Windows locally, upload a draft, then publish and verify the GitHub Release.\nRequires Windows, gh auth login, a clean committed/pushed working tree, and a new package.json version.')
    return
  }
  if (process.platform !== 'win32') throw new Error('Windows is required.')
  if (!process.env.npm_execpath) throw new Error('Run through pnpm run release:win.')
  const config = await loadElectronBuilderConfig(root)
  verifyWindowsUpdateBuildConfig(config)
  const { owner, repo } = config.win.publish[0]
  const repository = `${owner}/${repo}`
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const tag = `v${version}`
  if (run('git', ['status', '--porcelain'], true)) throw new Error('Commit and push your changes before releasing.')
  const sha = run('git', ['rev-parse', 'HEAD'], true)
  run('gh', ['auth', 'status'])
  run('gh', ['api', `repos/${repository}/commits/${sha}`, '--jq', '.sha'], true)
  // A successful list distinguishes an unused tag from network/authentication failures.
  const tags = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${repository}/git/matching-refs/tags/${tag}`], true)).flat()
  if (tags.some(ref => ref.ref === `refs/tags/${tag}`)) throw new Error(`${tag} already exists. Increase package.json version, commit and push first.`)
  const releases = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases`], true)).flat()
  if (releases.some(release => release.tag_name === tag)) throw new Error(`${tag} already has a release or draft. Resolve it before retrying.`)

  const pnpm = (...args) => run(process.execPath, [process.env.npm_execpath, 'run', ...args])
  pnpm('build:win')
  const releaseRoot = path.join(root, 'release', version)
  run('gh', ['release', 'create', tag,
    path.join(releaseRoot, `ai-novel-writer-setup-${version}.exe`),
    path.join(releaseRoot, `ai-novel-writer-setup-${version}.exe.blockmap`),
    path.join(releaseRoot, 'latest.yml'),
    '--repo', repository, '--target', sha, '--title', tag, '--generate-notes', '--draft'])
  run('gh', ['release', 'edit', tag, '--repo', repository, '--draft=false', '--latest'])
  pnpm('verify:github-update-release')
  console.log(`Published: https://github.com/${repository}/releases/tag/${tag}`)
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
