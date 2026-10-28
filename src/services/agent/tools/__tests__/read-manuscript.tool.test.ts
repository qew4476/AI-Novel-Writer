import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipc } from '../../../ipc-client'
import { useProjectStore } from '../../../../stores/project-store'
import { readManuscriptTool } from '../read-manuscript.tool'
import { createAgentExecutionContext } from '../project-context'
import { parseChapterSelection } from '../../chapter-selection'
import { mentionsToToolCalls, parseMentions } from '../../intent-router'

const original = useProjectStore.getState()
const project = { id: 'book', path: 'C:/books/book', sessionLease: 'lease', novelConfig: { writingLanguage: 'en-US' } }
beforeEach(() => useProjectStore.setState({ currentProject: project as never }))
afterEach(() => { vi.restoreAllMocks(); useProjectStore.setState(original, true) })

describe('manuscript chapter references', () => {
  it.each([
    '@正文 第3章到第6章 请分析', '@正文第五章', '@正文 5~7', '@正文 第五到第七',
    '@正文 第五章和第八章', '@manuscript chapters five to seven', '@正文 请读第五章',
  ])('recognizes %s without prematurely selecting chapters', input => {
    const mentions = parseMentions(input)
    expect(mentions).toHaveLength(1)
    expect(mentions[0].target.type).toBe('manuscript')
    expect(mentionsToToolCalls(mentions)).toEqual([])
  })

  it.each([['5', [5]], ['5-7', [5, 6, 7]], ['1,3,5', [1, 3, 5]]] as const)(
    'validates the model-resolved tool argument %s', (selection, chapters) => {
      expect(parseChapterSelection(selection)).toEqual(chapters)
    },
  )

  it.each(['', '0', '3-1', '1.5', '-2', '1-1001', '9007199254740992'])('rejects invalid or excessive selector %s', selection => {
    expect(parseChapterSelection(selection)).toBeNull()
  })

  it('retains other mentions following a chapter range', () => {
    expect(mentionsToToolCalls(parseMentions('@正文 1-3 @plot'))).toEqual([
      { toolName: 'read_plot', args: {} },
    ])
  })

  it.each(['@正文 1.5', '@正文 1-', '@正文 1到'])('does not silently read a partial selector: %s', input => {
    expect(mentionsToToolCalls(parseMentions(input))).toEqual([])
  })

  it('reads full finalized text, falls back to latest active drafts, and reports missing chapters', async () => {
    const body = 'Complete manuscript. '.repeat(100) + 'Last paragraph.'
    const invoke = vi.spyOn(ipc, 'invokeWithProjectSession').mockImplementation(async (...args) => {
      if (args[1] === 'db:draft-list-all') return [
        { id: 1, chapterNumber: 1, version: 1, status: 'finalized' },
        { id: 2, chapterNumber: 1, version: 2, status: 'draft' },
        { id: 3, chapterNumber: 2, version: 1, status: 'draft' },
        { id: 4, chapterNumber: 2, version: 2, status: 'revised' },
        { id: 5, chapterNumber: 2, version: 3, status: 'archived' },
      ] as never
      return { content: body } as never
    })
    const context = createAgentExecutionContext()
    const result = await readManuscriptTool.execute({ chapters: '1-3' }, context)
    expect(result.success).toBe(true)
    expect(result.content).toContain(body)
    expect(result.content).toContain('Chapter 1 (v1, finalized)')
    expect(result.content).toContain('Chapter 2 (v2, revised)')
    expect(result.content).toContain('Chapter 3: no saved manuscript')
    expect(result.content).not.toMatch(/[\u3400-\u9fff]/u)
    expect(invoke).toHaveBeenCalledWith(context.projectSession, 'db:draft-get-full', 1, project.path)
    expect(invoke).toHaveBeenCalledWith(context.projectSession, 'db:draft-get-full', 4, project.path)
    expect(invoke).toHaveBeenCalledTimes(3)
  })

  it('gives explicit guidance for an unspecified chapter without reading the database', async () => {
    const invoke = vi.spyOn(ipc, 'invokeWithProjectSession')
    const result = await readManuscriptTool.execute({ chapters: '' }, createAgentExecutionContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('@manuscript 3-6')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('discards all text if the project changes during a read', async () => {
    vi.spyOn(ipc, 'invokeWithProjectSession').mockImplementation(async () => {
      useProjectStore.setState({ currentProject: null })
      return [] as never
    })
    const result = await readManuscriptTool.execute({ chapters: '1' }, createAgentExecutionContext())
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
  })
})
