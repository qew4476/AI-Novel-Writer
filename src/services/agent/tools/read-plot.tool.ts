import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { agentToolText, assertAgentProjectCurrent, requireAgentProject, agentToolErrorDetail } from './project-context'

export const readPlotTool = buildAgentTool({
  name: 'read_plot',
  description: '读取剧情与伏笔：叙事线计划、当前状态、事件证据，以及已保存的剧情树主支线和事件。区分计划与已发生事件；过期剧情树仅供参考。',
  descriptionEn: 'Read plot and threads: narrative plans, current status, event evidence, and saved plot-tree tracks and events. Distinguish planned events from occurred events; stale trees are reference only.',
  source: 'builtin',
  inputSchema: { type: 'object', properties: {} },
  requiresConfirmation: false,
  execute: async (_args, context) => {
    const { project, projectSession } = requireAgentProject(context)
    const text = (zh: string, en: string) => agentToolText(context, zh, en)
    try {
      const [sources, threads] = await Promise.all([
        ipc.invokeWithProjectSession(projectSession, 'db:plot-tree-read', project.path),
        ipc.invokeWithProjectSession(projectSession, 'db:narrative-thread-list', project.path),
      ])
      assertAgentProjectCurrent(context)
      const snapshotStatus = sources.storedSnapshotInvalid ? 'invalid'
        : !sources.snapshot ? 'missing'
          : sources.snapshot.sourceRevision === sources.sourceRevision ? 'current' : 'stale'
      return {
        success: true,
        content: `${text('剧情与伏笔', 'Plot & threads')}\n${text(
          '叙事线计划及 planned 事件是规划，不代表正文已发生。剧情树是保存的快照；stale 或 invalid 时请以当前来源及事件证据为准，missing 表示尚无剧情树。',
          'Narrative plans and planned events describe intentions, not established manuscript facts. The tree is a saved snapshot; for stale or invalid snapshots, rely on current sources and event evidence. Missing means no tree is saved.',
        )}\n\n${JSON.stringify({
          narrativeThreads: threads,
          plotTree: { status: snapshotStatus, snapshot: sources.snapshot },
          currentSources: { synopsis: sources.synopsis, blueprints: sources.blueprints,
            finalizedChapters: sources.finalizedChapters, sourceRevision: sources.sourceRevision },
        }, null, 2)}`,
      }
    } catch (error) {
      const detail = agentToolErrorDetail(context, error)
      return { success: false, content: '', error: !detail || (context?.writingLanguage === 'en-US' && /[\u3400-\u9fff]/u.test(detail))
        ? text('读取剧情与伏笔失败', 'Could not read plot and threads')
        : text(`读取剧情与伏笔失败：${detail}`, `Could not read plot and threads: ${detail}`) }
    }
  },
})
