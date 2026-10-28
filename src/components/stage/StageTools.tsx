import { Bot, Workflow } from 'lucide-react'
import { useLocaleStore } from '../../stores/locale-store'
import { useStageStore } from '../../stores/navigation/stage-store'
import { navigate } from '../../stores/navigation/navigation-intents'

/** 固定在作品右缘的工具栏，两个工具共用同一个侧页位置。 */
export default function StageTools() {
  const text = useLocaleStore(s => s.text)
  const sheet = useStageStore(s => s.sheet)
  const tools = [
    { kind: 'assistant', label: text('AI 写作助手', 'AI Writing Assistant'), icon: Bot },
    { kind: 'run', label: text('运行工作流', 'Run workflows'), icon: Workflow },
  ] as const

  return (
    <div className="stage-tools" role="toolbar" aria-label={text('右侧工具栏', 'Right sidebar tools')} aria-orientation="vertical">
      {tools.map(({ kind, label, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          className="stage-tool"
          title={label}
          aria-label={label}
          aria-pressed={sheet?.kind === kind}
          onClick={() => {
            if (sheet?.kind === kind) useStageStore.setState({ sheet: null })
            else if (kind === 'run') navigate({ kind: 'run', facet: 'output' })
            else useStageStore.setState({ sheet: { kind: 'assistant' } })
          }}
        >
          <Icon size={20} strokeWidth={1.6} aria-hidden />
        </button>
      ))}
    </div>
  )
}
