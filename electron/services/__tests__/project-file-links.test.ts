import { afterEach, expect, it, vi } from 'vitest'
import { hasSupportedProjectLinkCount } from '../project-file-links'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createCanonicalProjectManifest } from '../../../src/shared/project-format'
import { getNewProjectDatabasePath } from '../project-data-locator'

afterEach(() => vi.restoreAllMocks())

it.each(['win32', 'linux', 'darwin'])('preserves hard-link rejection on %s', platform => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform as NodeJS.Platform)
  for (const count of [1, 1n]) expect(hasSupportedProjectLinkCount(count)).toBe(true)
  for (const count of [2, 2n, -1, -1n, NaN]) expect(hasSupportedProjectLinkCount(count)).toBe(false)
  for (const count of [0, 0n]) expect(hasSupportedProjectLinkCount(count)).toBe(platform === 'win32')
})

it('accepts a Windows zero-count manifest and still rejects an actual hard link', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'project-links-'))
  try {
    const data = path.join(root, '.ai-novel')
    fs.mkdirSync(data)
    const manifest = path.join(data, 'project.json')
    fs.writeFileSync(manifest, JSON.stringify(createCanonicalProjectManifest({ projectId: randomUUID(), createdAt: new Date().toISOString() })))
    const original = fs.lstatSync.bind(fs)
    const stat = original(manifest)
    Object.defineProperty(stat, 'nlink', { value: 0 })
    const spy = vi.spyOn(fs, 'lstatSync').mockImplementation(((file: fs.PathLike) =>
      file === manifest ? stat : original(file)) as typeof fs.lstatSync)
    expect(getNewProjectDatabasePath(root)).toBe(path.join(data, 'project.db'))
    spy.mockRestore()
    fs.linkSync(manifest, path.join(root, 'linked.json'))
    expect(() => getNewProjectDatabasePath(root)).toThrow('PROJECT_MANIFEST_INVALID')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
