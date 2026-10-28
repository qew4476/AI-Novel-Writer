import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { parseChapterSelection } from '../chapter-selection'
import { agentToolText, assertAgentProjectCurrent, requireAgentProject, agentToolErrorDetail } from './project-context'

export const readManuscriptTool = buildAgentTool({
  name: 'read_manuscript',
  description: '读取指定章节的完整已保存正文。先理解用户自然语言章数（如第五章、5~7、第五到第七），转换为 chapters 中的数字、列表或范围（5、5-7、1,3,5）。章数不明时先询问。每章优先定稿，否则最新未归档草稿；不含未保存修改。',
  descriptionEn: 'Read complete saved manuscript chapters. Interpret natural chapter expressions, including Chinese numerals (e.g. chapter five, 5~7, five through seven), and convert them to numeric chapters, lists, or ranges (5; 5-7; 1,3,5). Ask if unclear. Prefer finalized text, otherwise the latest non-archived draft; excludes unsaved edits.',
  source: 'builtin',
  inputSchema: { type: 'object', properties: {
    chapters: { type: 'string', description: '章节号或范围，例如 第1章到第3章、1、3、5章；一次最多1000章。',
      descriptionEn: 'Chapter numbers or ranges, e.g. 1-3 or 1,3,5; at most 1000 chapters per request.' },
  }, required: ['chapters'] },
  requiresConfirmation: false,
  execute: async (args, context) => {
    const { project, projectSession } = requireAgentProject(context)
    const text = (zh: string, en: string) => agentToolText(context, zh, en)
    const chapters = typeof args.chapters === 'string' ? parseChapterSelection(args.chapters) : null
    if (!chapters) return { success: false, content: '', error: text(
      '请在 @正文 后指定有效章号，例如 @正文 第3章到第6章 或 @正文 2、5、8章。范围须由小到大，一次最多1000章。',
      'Specify valid chapters after @manuscript, e.g. @manuscript 3-6 or @manuscript 2,5,8. Ranges must be ascending; at most 1000 chapters per request.',
    ) }
    try {
      const drafts = await ipc.invokeWithProjectSession(projectSession, 'db:draft-list-all', project.path)
      assertAgentProjectCurrent(context)
      const parts: string[] = [text('正文引用：已保存内容；优先定稿，否则最新未归档草稿。',
        'Manuscript reference: saved text; finalized versions preferred, otherwise the latest non-archived draft.')]
      for (const chapter of chapters) {
        const candidates = drafts.filter(d => d.chapterNumber === chapter && d.status !== 'archived')
          .sort((a, b) => Number(b.status === 'finalized') - Number(a.status === 'finalized') || b.version - a.version || b.id - a.id)
        const target = candidates[0]
        if (!target) {
          parts.push(text(`第 ${chapter} 章：暂无已保存正文。`, `Chapter ${chapter}: no saved manuscript.`))
          continue
        }
        const draft = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', target.id, project.path)
        assertAgentProjectCurrent(context)
        parts.push(text(`## 第 ${chapter} 章（v${target.version}, ${target.status}）`,
          `## Chapter ${chapter} (v${target.version}, ${target.status})`) + '\n\n' + (draft?.content?.trim()
          ? draft.content : text('正文为空或已不可用。', 'The manuscript is empty or unavailable.')))
      }
      return { success: true, content: parts.join('\n\n---\n\n') }
    } catch (error) {
      const detail = agentToolErrorDetail(context, error)
      return { success: false, content: '', error: !detail || (context?.writingLanguage === 'en-US' && /[\u3400-\u9fff]/u.test(detail))
        ? text('读取正文失败', 'Could not read manuscript chapters')
        : text(`读取正文失败：${detail}`, `Could not read manuscript chapters: ${detail}`) }
    }
  },
})
