import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { packageManagerCommand } from './package-manager-command.mjs'

test('JavaScript package managers run through Node', () => {
  assert.deepEqual(packageManagerCommand('pnpm.cjs', ['run', 'test'], 'node'), {
    command: 'node', args: ['pnpm.cjs', 'run', 'test'],
  })
})

test('native package managers run directly, preserving arguments', () => {
  assert.deepEqual(packageManagerCommand('C:/Program Files/pnpm.EXE', ['run', 'test']), {
    command: 'C:/Program Files/pnpm.EXE', args: ['run', 'test'],
  })
})

test('runner preserves JavaScript CLI arguments and failure status', () => {
  const root = mkdtempSync(join(tmpdir(), 'package manager test '))
  try {
    const cli = join(root, 'fake pnpm.cjs')
    writeFileSync(cli, 'console.log(JSON.stringify(process.argv.slice(2))); process.exitCode = 7')
    const result = spawnSync(process.execPath, [resolve('scripts/run-package-manager.mjs'), cli, 'run', 'test'], { encoding: 'utf8' })
    assert.equal(result.status, 7)
    assert.deepEqual(JSON.parse(result.stdout), ['run', 'test'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runner executes a real native executable without loading it as JavaScript', { skip: process.platform !== 'win32' }, () => {
  const result = spawnSync(process.execPath, [resolve('scripts/run-package-manager.mjs'), process.execPath, '-e', 'process.exitCode = 9'], { encoding: 'utf8' })
  assert.equal(result.status, 9, result.stderr)
})
