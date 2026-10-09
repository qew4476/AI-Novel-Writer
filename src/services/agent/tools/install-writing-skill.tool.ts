import { ipc } from '../../ipc-client'
import { skillRegistry } from '../skill-registry'
import { buildAgentTool } from '../tool-registry'
import { agentToolText } from './project-context'

export const installWritingSkillTool = buildAgentTool({
  name: 'install_writing_skill',
  userFacingName: '安装写作 Skill',
  description: '在用户确认后，安装直接输入的 SKILL.md 内容，或从已检查的公开 GitHub 地址安装自包含提示词型 Skill。两种输入只能提供一种。不能接收或执行脚本、工具、hook 或子代理。',
  descriptionEn: 'After explicit user confirmation, re-inspect and install a self-contained prompt-only writing Skill from directly supplied SKILL.md content or its public GitHub URL. Provide exactly one input. A GitHub candidate must be inspected before installation. Scripts, tools, hooks, and subagents are rejected; this tool never executes code.',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '用户输入的完整 SKILL.md 文字，包含 name、description 元数据和写作指令；不能与 source_url 同时提供',
        descriptionEn: 'Complete user-supplied SKILL.md text with name and description frontmatter and writing instructions; mutually exclusive with source_url',
      },
      source_url: {
        type: 'string',
        description: '此前已只读检查的公开 GitHub 地址；主进程会重新下载并验证',
        descriptionEn: 'The previously inspected public GitHub URL; the main process downloads and validates it again',
      },
    },
    required: [],
  },
  requiresConfirmation: true,
  isReadOnly: false,
  execute: async (args, context) => {
    const text = (zhCN: string, enUS: string) => agentToolText(context, zhCN, enUS)
    const sourceUrl = args.source_url
    const content = args.content
    const hasUrl = sourceUrl !== undefined
    const hasContent = content !== undefined
    if (hasUrl === hasContent
      || (hasUrl && (typeof sourceUrl !== 'string' || !sourceUrl.trim()))
      || (hasContent && (typeof content !== 'string' || !content.trim()))) {
      return { success: false, content: '', error: text(
        '请提供 source_url 或 content 中的一项，且必须是非空文字',
        'Provide exactly one non-empty text argument: source_url or content',
      ) }
    }
    if (context?.abortSignal?.aborted) {
      return { success: false, content: '', error: text('安装已在提交前取消', 'Installation was cancelled before commit') }
    }
    context?.markSideEffectStarted?.()
    const result = hasContent
      ? await ipc.invoke('skills:install-content', content as string)
      : await ipc.invoke('skills:install-github', sourceUrl as string)
    if (!result.success || !result.skill) {
      const detail = result.error
      return {
        success: false,
        content: '',
        error: context?.writingLanguage === 'en-US' && /[\u3400-\u9fff]/u.test(detail ?? '')
          ? text('Skill 安装失败', 'Could not install the writing Skill')
          : detail ?? text('Skill 安装失败', 'Could not install the writing Skill'),
      }
    }
    await skillRegistry.loadAll()
    return {
      success: true,
      content: text(
        `已安装写作 Skill“${result.skill.name}”。它尚未绑定到项目阶段。`,
        `Installed writing Skill "${result.skill.name}". It is not bound to a project stage yet.`,
      ),
    }
  },
})
