import { describe, expect, it } from 'vitest'
import type { EditorTab } from '../../../stores/editor-store'
import { currentChapterContext } from '../current-chapter-context'
import { getAllMentionTargets, mentionsToToolCalls, parseMentions } from '../intent-router'

const session = { projectId: 'book', projectPath: 'C:/books/book', leaseId: 'lease' }
const tab: EditorTab = {
  id: 'chapter-2', name: 'Chapter 2', type: 'chapter', chapterNumber: 2,
  projectKey: session.projectPath, projectSessionLease: session.leaseId,
  content: 'Opening paragraph.\n' + 'Manuscript text. '.repeat(100) + '\nFinal paragraph.',
  dirty: true,
}

describe('current chapter mention', () => {
  it('attaches the complete displayed manuscript, including unsaved edits', () => {
    const context = currentChapterContext(tab, session, 'en-US')
    expect(context).toContain(tab.content)
    expect(context).toContain('Includes unsaved edits.')
    expect(context).toContain('Chapter 2')
  })

  it('does not substitute a different chapter or project when no current manuscript is available', () => {
    for (const candidate of [undefined, { ...tab, type: 'chapter-card' as const },
      { ...tab, projectKey: 'C:/books/other' }, { ...tab, projectSessionLease: 'old-lease' }]) {
      expect(currentChapterContext(candidate, session, 'en-US')).toContain('No manuscript tab')
      expect(currentChapterContext(candidate, session, 'en-US')).not.toContain(tab.content)
    }
    expect(currentChapterContext(tab, null, 'en-US')).toContain('No manuscript tab')
  })

  it('reports an empty or not yet loaded manuscript in both languages', () => {
    for (const content of [undefined, '', '   ']) {
      expect(currentChapterContext({ ...tab, content }, session, 'en-US')).toContain('no manuscript text')
      expect(currentChapterContext({ ...tab, content }, session, 'zh-CN')).toContain('尚无可引用的正文')
    }
  })

  it('removes project-file mentions and never maps the current chapter to a progress list', () => {
    for (const locale of ['zh-CN', 'en-US'] as const) {
      expect(getAllMentionTargets(locale).map(target => target.value)).not.toContain('file')
      expect(parseMentions('@file @项目文件', locale)).toEqual([])
      const mentions = parseMentions('@current_chapter @architecture', locale)
      expect(mentions.map(mention => mention.target.type)).toContain('chapter')
      expect(mentionsToToolCalls(mentions)).toEqual([{ toolName: 'read_architecture', args: {} }])
    }
  })
})
