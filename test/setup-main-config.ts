import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'

// Never read or write the developer's persisted application settings in tests.
const testConfigHome = mkdtempSync(path.join(os.tmpdir(), 'ai-novel-test-config-'))
process.env.AI_NOVEL_VELA_HOME = testConfigHome
writeFileSync(path.join(testConfigHome, 'config.json'), JSON.stringify({ locale: 'zh-CN' }))

afterAll(() => {
  rmSync(testConfigHome, { recursive: true, force: true })
})
