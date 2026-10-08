import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'

const root = fileURLToPath(new URL('../', import.meta.url))

export function publishWindowsRelease({ version, run, dryRun = false }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('package.json version must be a stable version, for example 1.2.0.')
  }
  if (run('git', ['status', '--porcelain']).trim()) {
    throw new Error('Commit your changes first / 请先提交工作目录的修改。')
  }
  const branch = run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim()
  if (!branch) throw new Error('Check out a branch before publishing.')
  const origin = run('git', ['remote', 'get-url', 'origin']).trim()
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(origin)
  if (!match) throw new Error('origin must point to a GitHub repository.')
  const repository = match[1]
  const tag = `v${version}`
  if (run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]).trim()) {
    throw new Error(`${tag} already exists. Re-run its failed workflow in GitHub Actions, or increase package.json version.`)
  }
  run('git', ['cat-file', '-e', 'HEAD:.github/workflows/windows-simple-release.yml'])
  // Atomically publish both refs; no local tag or force push is needed.
  const args = ['push', '--atomic', 'origin', `HEAD:refs/heads/${branch}`, `HEAD:refs/tags/${tag}`]
  if (!dryRun) run('git', args)
  return { tag, repository, dryRun, command: ['git', ...args], actionsUrl: `https://github.com/${repository}/actions/workflows/windows-simple-release.yml` }
}

function main() {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--dry-run')) throw new Error('Usage: pnpm release:win [--dry-run]')
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const result = publishWindowsRelease({
    version,
    dryRun: args.includes('--dry-run'),
    run: (command, commandArgs) => execFileSync(command, commandArgs, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true,
    }),
  })
  console.log(`${result.dryRun ? 'Preview / 预览' : 'Triggered / 已触发'}: ${result.tag}`)
  console.log(result.actionsUrl)
  console.log('GitHub Actions builds the exe and publishes the Release / GitHub Actions 将构建 exe 并发布 Release。')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
