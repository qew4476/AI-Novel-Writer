import type BetterSqlite3 from 'better-sqlite3'
import { isReceiptedDraftStatus } from '../../src/shared/draft-status'
import { countDraftUnits } from '../../src/shared/draft-units'

/** Create an independent version without changing the saved source, in the caller's transaction. */
export function createDraftVersion(db: BetterSqlite3.Database, sourceId: number, content: string, status: 'draft' | 'finalized') {
  const source = db.prepare(`
    SELECT chapter_number, status, source_dependencies FROM drafts WHERE id = ?
  `).get(sourceId) as { chapter_number: number; status: string; source_dependencies: string } | undefined
  if (!source) throw new Error('DRAFT_NOT_FOUND')
  if (isReceiptedDraftStatus(source.status) || source.status === 'archived') throw new Error('DRAFT_FINALIZED_READ_ONLY')
  const { version } = db.prepare(`
    SELECT COALESCE(MAX(version), 0) + 1 AS version FROM drafts WHERE chapter_number = ?
  `).get(source.chapter_number) as { version: number }
  const contentId = Number(db.prepare('INSERT INTO contents(body) VALUES (?)').run(content).lastInsertRowid)
  const id = Number(db.prepare(`
    INSERT INTO drafts (chapter_number, version, status, source, content_id, word_count, source_dependencies)
    VALUES (?, ?, ?, 'rewrite', ?, ?, ?)
  `).run(source.chapter_number, version, status, contentId, countDraftUnits(content), source.source_dependencies).lastInsertRowid)
  return { id, version }
}
