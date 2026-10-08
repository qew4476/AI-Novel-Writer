import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { publishWindowsRelease } from '../publish-windows-release.mjs'

function fixture(overrides: Record<string, string> = {}) {
  return vi.fn((command: string, args: string[]) => {
    const key = [command, ...args].join(' ')
    return overrides[key] ?? ({
      'git symbolic-ref --quiet --short HEAD': 'master\n',
      'git remote get-url origin': 'https://github.com/qew4476/AI-Novel-Writer.git\n',
    } as Record<string, string>)[key] ?? ''
  })
}

describe('one-command Windows release', () => {
  it('reports invalid CLI arguments with a nonzero exit code', () => {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('../publish-windows-release.mjs', import.meta.url)),
      '--invalid',
    ], { encoding: 'utf8', windowsHide: true })
    expect(result.status).toBe(1)
    expect(result.stderr.trim()).toBe('Usage: pnpm release:win [--dry-run]')
    expect(result.stdout).toBe('')
  })
  it('pushes the current commit and version tag atomically to the fork', () => {
    const run = fixture()
    const result = publishWindowsRelease({ version: '1.2.0', run })
    expect(result.repository).toBe('qew4476/AI-Novel-Writer')
    expect(run).toHaveBeenLastCalledWith('git', ['push', '--atomic', 'origin', 'HEAD:refs/heads/master', 'HEAD:refs/tags/v1.2.0'])
  })
  it('previews without pushing', () => {
    const run = fixture()
    publishWindowsRelease({ version: '2.0.0', run, dryRun: true })
    expect(run.mock.calls.some(([, args]) => args[0] === 'push')).toBe(false)
  })
  it.each([
    ['dirty worktree', { 'git status --porcelain': ' M package.json' }],
    ['existing remote tag', { 'git ls-remote --tags origin refs/tags/v1.2.0': 'abc refs/tags/v1.2.0' }],
    ['non-GitHub remote', { 'git remote get-url origin': 'https://example.com/repo.git' }],
  ])('refuses %s before pushing', (_, overrides) => {
    const run = fixture(overrides)
    expect(() => publishWindowsRelease({ version: '1.2.0', run })).toThrow()
    expect(run.mock.calls.some(([, args]) => args[0] === 'push')).toBe(false)
  })
  it('rejects prerelease and malformed versions before running git', () => {
    const run = fixture()
    expect(() => publishWindowsRelease({ version: '1.2.0-beta.1', run })).toThrow()
    expect(run).not.toHaveBeenCalled()
  })
})
