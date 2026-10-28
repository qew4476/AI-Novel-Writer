import { displayedErrorMessage } from '../../i18n/app-errors'
import type { Locale } from '../../i18n/types'
import type { MainGenerationRunView } from '../../services/generation/generation-runtime'
import { callPurpose } from '../stage/run/run-format'

export interface RecoveryLoadFailure {
  runId: string
  handle: MainGenerationRunView['handle']
  message: string
}

/** Identify the failed history record without including its source text or model configuration. */
export function recoveryLoadFailure(view: Pick<MainGenerationRunView, 'handle' | 'operation' | 'chapterNumber'>, reason: unknown, locale: Locale): string {
  const text = (zh: string, en: string) => locale === 'en-US' ? en : zh
  const chapter = view.chapterNumber === undefined ? '' : text(`第${view.chapterNumber}章 · `, `Chapter ${view.chapterNumber} · `)
  const operation = callPurpose(view.operation ?? '', text)
  const label = operation === '—' ? text('历史任务', 'Historical task') : operation
  const message = displayedErrorMessage(locale, reason)
  const explanation = ['GENERATION_PLANNING_INTENT_INVALID', 'GENERATION_POLICY_UNSUPPORTED'].includes(message)
    ? text('此旧任务缺少续跑信息，或记录格式不兼容，无法继续。可从当前稿件重新发起任务。',
      'This old task has missing or incompatible recovery information and cannot continue. Start a new task from the current draft.')
    : message === 'GENERATION_DRAFT_RECEIPT_INVALID'
      ? text('此任务的原始保存记录与草稿或生成记录不一致，无法安全恢复。这不代表当前正文丢失；请到草稿箱检查当前稿件。',
        'This task’s original save receipt does not match the draft or generation history, so recovery is unavailable. This does not mean the current text is lost; check the current draft in Drafts.')
      : message
  return `${chapter}${label} (${view.handle.runId}): ${explanation}`
}
