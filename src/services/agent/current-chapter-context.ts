import type { EditorTab } from '../../stores/editor-store'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import { sameProjectPathKey } from '../../shared/project-session-context'
import type { Locale } from '../../i18n/types'
import { writingLanguageText } from '../../shared/writing-language'

/** Capture the displayed manuscript, including unsaved edits, before generation starts. */
export function currentChapterContext(
  tab: EditorTab | undefined,
  session: ProjectSessionContext | null,
  language: Locale,
): string {
  const text = (zh: string, en: string) => writingLanguageText(language, zh, en)
  if (!session || !tab || tab.type !== 'chapter'
    || !sameProjectPathKey(tab.projectKey, session.projectPath)
    || (tab.projectSessionLease !== undefined && tab.projectSessionLease !== session.leaseId)) {
    return text('当前没有打开本作品的正文标签，请先打开要引用的章节正文。',
      'No manuscript tab from this book is open. Open the chapter manuscript to reference it.')
  }
  if (tab.content === undefined || !tab.content.trim()) {
    return text('当前章节尚无可引用的正文，或正文尚未载入。',
      'The current chapter has no manuscript text to reference, or it has not loaded yet.')
  }
  return `${text('当前章节正文', 'Current chapter manuscript')}: ${tab.name}${tab.chapterNumber !== undefined ? ` (${tab.chapterNumber})` : ''}\n${
    tab.dirty ? text('包含尚未保存的修改。\n', 'Includes unsaved edits.\n') : ''
  }\n${tab.content}`
}
