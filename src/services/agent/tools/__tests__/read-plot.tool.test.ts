import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipc } from '../../../ipc-client'
import { useProjectStore } from '../../../../stores/project-store'
import { readPlotTool } from '../read-plot.tool'
import { createAgentExecutionContext } from '../project-context'
import { mentionsToToolCalls, parseMentions } from '../../intent-router'

const original = useProjectStore.getState()
const project = { id: 'book', path: 'C:/books/book', sessionLease: 'lease',
  novelConfig: { writingLanguage: 'en-US' } }

beforeEach(() => useProjectStore.setState({ currentProject: project as never }))
afterEach(() => { vi.restoreAllMocks(); useProjectStore.setState(original, true) })

describe('plot and threads context', () => {
  it.each(['current', 'stale', 'missing', 'invalid'] as const)('reads thread evidence and marks a %s plot tree', async status => {
    const snapshot = status === 'missing' || status === 'invalid' ? null : {
      sourceRevision: status === 'current' ? 'now' : 'before',
      tracks: [{ title: 'Hidden identity', events: [{ status: 'planned', summary: 'Reveal' }] }],
    }
    const threads = [{ title: 'Secret', status: 'planted', authorIntent: 'Reveal later',
      events: [{ chapterNumber: 1, evidence: 'A silver key', type: 'planted' }] }]
    const invoke = vi.spyOn(ipc, 'invokeWithProjectSession').mockImplementation(async (...args) => (
      args[1] === 'db:narrative-thread-list' ? threads : {
        snapshot, storedSnapshotInvalid: status === 'invalid' || undefined, sourceRevision: 'now',
        synopsis: { content: 'Outline' }, blueprints: [], finalizedChapters: [],
      }
    ) as never)
    const context = createAgentExecutionContext()
    const result = await readPlotTool.execute({}, context)
    expect(result.success).toBe(true)
    expect(result.content).toContain(`"status": "${status}"`)
    expect(result.content).toContain('A silver key')
    expect(result.content).toContain('not established manuscript facts')
    expect(result.content).not.toMatch(/[\u3400-\u9fff]/u)
    expect(invoke).toHaveBeenCalledWith(context.projectSession, 'db:plot-tree-read', project.path)
    expect(invoke).toHaveBeenCalledWith(context.projectSession, 'db:narrative-thread-list', project.path)
    if (snapshot) expect(result.content).toContain('Hidden identity')
  })

  it('discards reads after switching projects', async () => {
    vi.spyOn(ipc, 'invokeWithProjectSession').mockImplementation(async () => {
      useProjectStore.setState({ currentProject: null })
      return {} as never
    })
    const result = await readPlotTool.execute({}, createAgentExecutionContext())
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.error).toContain('current project changed')
  })

  it('connects Chinese and English menu mentions to the read tool', () => {
    for (const [locale, mention] of [['zh-CN', '@剧情与伏笔'], ['en-US', '@plot']] as const) {
      expect(mentionsToToolCalls(parseMentions(mention, locale))).toEqual([{ toolName: 'read_plot', args: {} }])
    }
  })
})
