import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const prohibitedPaths = [
  'AGENTS.md',
  'CONTEXT.md',
  'design-qa.md',
  'rule.md',
  'rule.lite.md',
  'docs/superpowers',
  'public/screenshot',
  'public/logos',
  'tsconfig.node.tsbuildinfo',
]

describe('public repository hygiene', () => {
  it('does not contain internal process material or generated output', () => {
    const trackedPaths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
    for (const target of prohibitedPaths) {
      expect(trackedPaths.some(file => file === target || file.startsWith(`${target}/`)), target).toBe(false)
    }
  })

  it('ignores prohibited local material before it can be staged', () => {
    const rootGitignore = readFileSync('.gitignore', 'utf8')

    for (const entry of [
      '/AGENTS.md',
      '/CONTEXT.md',
      '/docs/superpowers/',
      '/output/',
      '/public/screenshot/',
      '/public/logos/',
      '*.tsbuildinfo',
    ]) {
      expect(rootGitignore).toContain(entry)
    }
  })
})
