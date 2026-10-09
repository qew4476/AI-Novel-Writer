import { useEditorStore } from '../../../stores/editor-store'
import { useProjectStore } from '../../../stores/project-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { hasUnsavedProjectEditorItems, type UnsavedEditorFilter } from '../../../stores/editor-unsaved'

export function UnsavedBadge(filter: UnsavedEditorFilter) {
  const projectKey = useProjectStore(s => s.currentProject?.path)
  const text = useLocaleStore(s => s.text)
  const dirty = useEditorStore(s => projectKey
    ? hasUnsavedProjectEditorItems(s.tabs, s.draftLedgers, projectKey, filter)
    : false)
  if (!dirty) return null
  return (
    <span
      className="text-[0.7rem] flex-shrink-0 inline-flex items-center gap-1"
      style={{ color: 'var(--color-warning-text, #7A5414)' }}
      title={text('已修改，尚未保存', 'Modified, not yet saved')}
    >
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current" />
      {text('未保存', 'Unsaved')}
    </span>
  )
}
