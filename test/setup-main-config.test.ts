import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getMainLocale } from '../electron/i18n'
import { GLOBAL_CONFIG_PATH, VELA_HOME } from '../electron/utils/config-utils'

describe('main-process test configuration', () => {
  it('uses temporary settings instead of the user application directory', () => {
    expect(VELA_HOME).toBe(process.env.AI_NOVEL_VELA_HOME)
    expect(VELA_HOME).not.toBe(path.join(os.homedir(), '.vela'))
    expect(GLOBAL_CONFIG_PATH).toBe(path.join(VELA_HOME, 'config.json'))
  })

  it('keeps the default test copy independent from the system locale', () => {
    expect(getMainLocale(undefined)).toBe('zh-CN')
    expect(getMainLocale('en-US')).toBe('zh-CN')
    expect(getMainLocale('zh-TW')).toBe('zh-CN')
  })
})
