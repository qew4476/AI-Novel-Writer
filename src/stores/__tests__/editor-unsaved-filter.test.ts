import { describe, expect, it } from 'vitest'
import { hasUnsavedProjectEditorItems } from '../editor-unsaved'
import type { EditorTab } from '../editor-store'

describe('project tree unsaved filters', () => {
  const tab: EditorTab = { id: 'premise', name: 'Premise', type: 'arch-file', projectKey: 'a', filePath: 'vela://core/premise', dirty: true }

  it('matches the resource only in its owning project and clears after saving', () => {
    const filter = { filePaths: ['vela://core/premise'] }
    expect(hasUnsavedProjectEditorItems([tab], {}, 'a', filter)).toBe(true)
    expect(hasUnsavedProjectEditorItems([tab], {}, 'b', filter)).toBe(false)
    expect(hasUnsavedProjectEditorItems([{ ...tab, dirty: false }], {}, 'a', filter)).toBe(false)
    expect(hasUnsavedProjectEditorItems([tab], {}, 'a', { filePaths: ['vela://core/synopsis'] })).toBe(false)
  })

  it('includes retained builtin drafts without an open tab', () => {
    const ledgers = { config: JSON.stringify({ projects: [{ projectKey: 'a' }] }) }
    expect(hasUnsavedProjectEditorItems([], ledgers, 'a', { types: ['config'] })).toBe(true)
    expect(hasUnsavedProjectEditorItems([], ledgers, 'b', { types: ['config'] })).toBe(false)
    expect(hasUnsavedProjectEditorItems([], ledgers, 'a', { types: ['character'] })).toBe(false)
    expect(hasUnsavedProjectEditorItems([], { config: '{' }, 'a', { types: ['config'] })).toBe(false)
    expect(hasUnsavedProjectEditorItems([], {}, 'a', { types: ['config'] })).toBe(false)
  })

  it('matches a draft across draft and manuscript paths by stable identity', () => {
    const draft: EditorTab = { ...tab, type: 'chapter', filePath: 'vela://draft/7', draftId: 7 }
    expect(hasUnsavedProjectEditorItems([draft], {}, 'a', { draftIds: [7] })).toBe(true)
    expect(hasUnsavedProjectEditorItems([draft], {}, 'a', { draftIds: [8] })).toBe(false)
  })
})
