import { expect, it } from 'vitest'
import { recoveryLoadFailure } from '../recovery-load-failure'

const view = { handle: { projectId: 'project', epoch: 'old', rootActionId: 'root', runId: 'failed-review' }, operation: 'review-chapter', chapterNumber: 2 }

it('identifies the chapter, operation and historical run, with a localized reason', () => {
  const zh = recoveryLoadFailure(view, new Error('GENERATION_PLANNING_INTENT_INVALID'), 'zh-CN')
  expect(zh).toContain('第2章 · 审稿 (failed-review):')
  expect(zh).not.toContain('GENERATION_PLANNING_INTENT_INVALID')
  const en = recoveryLoadFailure(view, new Error('GENERATION_PLANNING_INTENT_INVALID'), 'en-US')
  expect(en).toContain('Chapter 2 · Review (failed-review):')
  expect(en).not.toBe(zh)
})

it('keeps unknown failures identifiable when legacy records have no operation or chapter', () => {
  expect(recoveryLoadFailure({ handle: view.handle }, new Error('Read failed'), 'en-US'))
    .toBe('Historical task (failed-review): Read failed')
})

it('explains a mismatched saved draft without implying that the current manuscript is lost', () => {
  const zh = recoveryLoadFailure({ ...view, operation: 'chapter-draft', chapterNumber: 5 }, new Error('GENERATION_DRAFT_RECEIPT_INVALID'), 'zh-CN')
  expect(zh).toContain('第5章 · 写正文')
  expect(zh).toContain('这不代表当前正文丢失')
  expect(zh).not.toContain('GENERATION_DRAFT_RECEIPT_INVALID')
  expect(recoveryLoadFailure(view, new Error('GENERATION_DRAFT_RECEIPT_INVALID'), 'en-US')).toContain('check the current draft in Drafts')
})
