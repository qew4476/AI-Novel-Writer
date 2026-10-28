import { describe, expect, it } from 'vitest'

import type { EditorTab } from '../../stores/editor-store'
import {
  captureFinalizationSnapshot,
  reconcileFinalizationCompletion,
} from '../finalization-snapshot'

const PROJECT_PATH = 'C:\\novels\\A'
const SESSION = {
  projectId: 'project-a',
  leaseId: 'lease-a',
  projectPath: PROJECT_PATH,
}

function draftTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: 'draft-1',
    name: '第一章 v1',
    type: 'chapter',
    filePath: 'ai-novel://draft/17',
    projectKey: PROJECT_PATH,
    projectSessionLease: SESSION.leaseId,
    draftId: 17,
    chapterNumber: 1,
    content: '编辑器里尚未保存的正文',
    savedContent: '数据库中的旧正文',
    contentRevision: 8,
    dirty: true,
    draftStatus: 'draft',
    ...overrides,
  }
}

describe('finalization editor snapshot seam', () => {
  it('adopts an independent final version only for the frozen source tab', () => {
    const tab = draftTab()
    const snapshot = captureFinalizationSnapshot({ tab, projectSession: SESSION, chapterTitle: '第一章' })
    const completion = { sourceDraftId: 17, draftId: 18, finalizationId: 'draft-version-17',
      contentHash: 'hash', contentRevision: snapshot.contentRevision, projectPath: PROJECT_PATH,
      projectSession: SESSION, publicationStatus: 'published' as const }
    expect(reconcileFinalizationCompletion(tab, snapshot, completion)).toMatchObject({
      id: tab.id, draftId: 18, filePath: 'ai-novel://draft/18', draftStatus: 'finalized', dirty: false,
    })
    const other = draftTab({ draftId: 19 })
    expect(reconcileFinalizationCompletion(other, snapshot, completion)).toBe(other)
    expect(reconcileFinalizationCompletion(draftTab({ content: '后续修改', contentRevision: 10 }), snapshot, completion))
      .toMatchObject({ draftId: 17, content: '后续修改', dirty: true, finalizationConflict: { finalizationId: completion.finalizationId } })
  })
  it('commits a positive source revision for a first edit and preserves a later edit', () => {
    const first = draftTab({ contentRevision: 0 })
    const snapshot = captureFinalizationSnapshot({
      tab: first,
      projectSession: SESSION,
      chapterTitle: '第一章',
    })
    expect(snapshot.contentRevision).toBe(1)

    const completion = {
      finalizationId: 'finalization-first',
      contentHash: 'hash-of-first',
      contentRevision: snapshot.contentRevision,
      draftId: 17,
      projectPath: PROJECT_PATH,
      projectSession: SESSION,
      publicationStatus: 'published' as const,
    }
    expect(reconcileFinalizationCompletion(first, snapshot, completion)).toMatchObject({
      dirty: false,
      draftStatus: 'finalized',
    })
    expect(reconcileFinalizationCompletion(
      draftTab({ contentRevision: 1, content: first.content }), snapshot, completion,
    )).toMatchObject({
      dirty: true,
      finalizationConflict: { finalizationId: 'finalization-first' },
    })
  })

  it('freezes the visible unsaved tab body instead of any persisted database body', () => {
    const snapshot = captureFinalizationSnapshot({
      tab: draftTab(),
      projectSession: SESSION,
      chapterTitle: 'CON<>: 夜航. ',
    })

    expect(snapshot).toMatchObject({
      tabId: 'draft-1',
      draftId: 17,
      chapterNumber: 1,
      content: '编辑器里尚未保存的正文',
      contentRevision: 9,
      projectSession: SESSION,
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.projectSession)).toBe(true)
  })

  it('does not let an old completion overwrite later editing or clear dirty', () => {
    const snapshot = captureFinalizationSnapshot({
      tab: draftTab(),
      projectSession: SESSION,
      chapterTitle: '第一章',
    })

    const reconciled = reconcileFinalizationCompletion(
      draftTab({
        content: '定稿期间继续编辑的新正文',
        contentRevision: 9,
        dirty: true,
      }),
      snapshot,
      {
        finalizationId: 'finalization-1',
        contentHash: 'hash-of-snapshot',
        contentRevision: 9,
        draftId: 17,
        projectPath: PROJECT_PATH,
        projectSession: SESSION,
        publicationStatus: 'published',
      },
    )

    expect(reconciled).toMatchObject({
      content: '定稿期间继续编辑的新正文',
      contentRevision: 9,
      dirty: true,
      draftStatus: 'draft',
      finalizationConflict: {
        finalizationId: 'finalization-1',
        publicationStatus: 'published',
      },
    })
  })
})
