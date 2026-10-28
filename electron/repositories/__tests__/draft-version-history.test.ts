import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProjectDb } from '../../database'
import { initializeLegacyBaselineSchema } from '../../migrations/baseline-schema'
import { DraftRepository } from '../draft-repository'
import { FinalizationRepository } from '../finalization-repository'
import { countDraftUnits } from '../../../src/shared/draft-units'
import { FinalizationService } from '../../services/finalization-service'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('../../database', () => ({ getProjectDb: vi.fn(), getCurrentProjectPath: () => null }))
const Database = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database
let draftId: number
const original = '保存前的正文'
const changed = '作者修改后的正文'

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  initializeLegacyBaselineSchema(db)
  vi.mocked(getProjectDb).mockReturnValue(db)
  draftId = DraftRepository.create({ chapterNumber: 1, source: 'write', content: original, wordCount: countDraftUnits(original) })
})
afterEach(() => { db.close(); vi.clearAllMocks() })

function versions() {
  return db.prepare(`SELECT d.version, d.status, c.body FROM drafts d JOIN contents c ON c.id=d.content_id ORDER BY d.version`).all()
}
function finalize(content = changed) {
  return FinalizationRepository.commit({ createVersion: true, finalizationId: 'final-1', draftId, chapterNumber: 1,
    chapterTitle: '第一章', content, contentHash: createHash('sha256').update(content).digest('hex'),
    contentRevision: 2, targetFileName: 'chapter1.txt' })
}

describe('saved draft version history', () => {
  it('reuses the independent final version after a lost response or publication failure', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-version-'))
    try {
      const request = { createVersion: true, projectRoot: root, draftId, chapterNumber: 1,
        chapterTitle: '第一章', content: changed, contentRevision: 2 }
      const publish = vi.fn(async () => { throw new Error('disk unavailable') })
      const first = await new FinalizationService({ publisher: { publish } }).finalize(request)
      expect(first).toMatchObject({ committed: true, publicationStatus: 'pending' })
      expect(first.draftId).not.toBe(draftId)
      const retryPublish = vi.fn(async () => undefined)
      const service = new FinalizationService({ publisher: { publish: retryPublish } })
      const second = await service.finalize(request)
      const third = await service.finalize(request)
      expect(second).toMatchObject({ success: true, draftId: first.draftId, finalizationId: first.finalizationId })
      expect(third.draftId).toBe(first.draftId)
      expect(retryPublish).toHaveBeenCalledOnce()
      expect(versions()).toHaveLength(2)
      expect(await service.finalize({ ...request, content: '不同内容' })).toMatchObject({ committed: false, success: false })
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })
  it('keeps each saved body independently and advances the working version only when content changes', () => {
    expect(DraftRepository.updateContent(draftId, original, countDraftUnits(original), true)).toEqual({ id: draftId, version: 1 })
    const second = DraftRepository.updateContent(draftId, changed, countDraftUnits(changed), true)
    expect(second.version).toBe(2)
    expect(second.id).not.toBe(draftId)
    expect(DraftRepository.updateContent(second.id, changed, countDraftUnits(changed), true)).toEqual(second)
    expect(DraftRepository.updateContent(second.id, '', 0, true).version).toBe(3)
    expect(versions()).toEqual([
      { version: 1, status: 'draft', body: original },
      { version: 2, status: 'draft', body: changed },
      { version: 3, status: 'draft', body: '' },
    ])
    const old = DraftRepository.listByChapter(1).find(draft => draft.version === 1)!
    DraftRepository.updateStatus(old.id, 'archived')
    expect(() => DraftRepository.updateContent(old.id, '覆盖历史', 4, true)).toThrow('DRAFT_FINALIZED_READ_ONLY')
  })

  it('adds a final version even when it matches the last save, and retry adds no duplicate', () => {
    draftId = DraftRepository.updateContent(draftId, changed, countDraftUnits(changed), true).id
    const committed = finalize()
    finalize()
    expect(versions()).toEqual([
      { version: 1, status: 'draft', body: original },
      { version: 2, status: 'draft', body: changed },
      { version: 3, status: 'finalized', body: changed },
    ])
    expect(FinalizationRepository.getByDraftId(committed.draftId)?.contentSnapshot).toBe(changed)
  })

  it('preserves the last saved body when finalizing unsaved changes', () => {
    finalize()
    expect(versions()).toEqual([
      { version: 1, status: 'draft', body: original },
      { version: 2, status: 'finalized', body: changed },
    ])
  })

  it('supersedes the old independent final version when a saved draft is finalized again', () => {
    const first = finalize()
    const second = FinalizationRepository.commit({ createVersion: true, finalizationId: 'final-2', draftId, chapterNumber: 1,
      chapterTitle: 'chapter', content: original, contentHash: createHash('sha256').update(original).digest('hex'),
      contentRevision: 3, targetFileName: 'chapter1.txt' })
    expect(DraftRepository.getMeta(first.draftId)?.status).toBe('superseded')
    expect(DraftRepository.getMeta(second.draftId)?.status).toBe('finalized')
    expect(DraftRepository.getFull(draftId)?.content).toBe(original)
    expect(() => DraftRepository.updateContent(first.draftId, 'overwrite', 9, true)).toThrow('DRAFT_FINALIZED_READ_ONLY')
    expect(versions()).toHaveLength(3)
  })

  it('rolls back the new history row, version and content together if finalization fails', () => {
    db.exec(`CREATE TRIGGER reject_outbox BEFORE INSERT ON finalization_outbox BEGIN SELECT RAISE(ABORT, 'outbox rejected'); END`)
    expect(() => finalize()).toThrow('outbox rejected')
    expect(versions()).toEqual([{ version: 1, status: 'draft', body: original }])
    expect(db.prepare('SELECT COUNT(*) AS n FROM contents').get()).toEqual({ n: 1 })
  })

  it('rolls back a failed save without leaving a version or orphaned content', () => {
    db.exec(`CREATE TRIGGER reject_draft BEFORE INSERT ON drafts BEGIN SELECT RAISE(ABORT, 'save rejected'); END`)
    expect(() => DraftRepository.updateContent(draftId, changed, 8, true)).toThrow('save rejected')
    expect(versions()).toEqual([{ version: 1, status: 'draft', body: original }])
    expect(db.prepare('SELECT COUNT(*) AS n FROM contents').get()).toEqual({ n: 1 })
  })
})
