import { useEffect, useRef, useState } from 'react'
import { ipc } from '../../../services/ipc-client'
import { displayedErrorMessage } from '../../../i18n/app-errors'
import { fetchChapterDrafts, useDraftStore } from '../../../stores/draft-store'
import { blueprintWritePrefill } from '../../../services/workflows/chapter-write-launch'
import type { EditorTab } from '../../../stores/editor-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { navigate } from '../../../stores/navigation/navigation-intents'
import { useStageStore } from '../../../stores/navigation/stage-store'
import { openBuiltinEditor } from '../../../stores/open-builtin-editor'
import { useProjectStore } from '../../../stores/project-store'
import { captureProjectSession, isProjectSessionCurrent, isProjectSessionPath } from '../../project-session-gate'
import { Button } from '../../ui/Button'
import { Notice } from '../../ui/Notice'
import { useStageView } from '../use-stage-work'
import WriteChapterPopover from '../write/WriteChapterPopover'
import { openDraftInChapterView, swapChapterTab } from './chapter-tab-routing'
import ChapterHead from './ChapterHead'
import DeletionCleanupNotices from './DeletionCleanupNotices'
import { useChapterBlueprint } from './use-chapter-blueprint'
import { pluralEn } from '../../../shared/plural-en'

/**
 * 待写章的单章视图：本章蓝图只读展示，主按钮「写作此章」按蓝图写，箭头弹层只改本次模型与指导。
 * 这一章有了稿（写完了，或在别处写好）就在这个标签的位置换成那一稿。
 */
export default function ChapterPlan({ tab, chapterNumber, projectKey }: { tab: EditorTab; chapterNumber: number; projectKey: string }) {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)
  const focus = useStageStore(s => s.focus)
  const wordsPerChapter = useProjectStore(s => s.currentProject?.novelConfig.wordsPerChapter)
  const { blueprint, failed: blueprintFailed, reload: reloadBlueprint } = useChapterBlueprint(chapterNumber, projectKey)
  const { chapters } = useStageView()
  const row = chapters.find(candidate => candidate.number === chapterNumber)
  const draft = row?.draft ?? null
  const startingManual = useRef(false)
  const [manualBusy, setManualBusy] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  const startManual = async () => {
    const session = captureProjectSession(useProjectStore.getState().currentProject)
    if (!session || !isProjectSessionPath(session, projectKey) || startingManual.current || row?.running) return
    startingManual.current = true
    setManualBusy(true)
    setManualError(null)
    try {
      let drafts = await fetchChapterDrafts(chapterNumber, session)
      if (!isProjectSessionCurrent(session)) return
      if (drafts.length === 0) {
        const created = await ipc.invokeWithProjectSession(session, 'db:draft-create', {
          chapterNumber, version: 1, source: 'write', content: '', wordCount: 0,
        }, session.projectPath)
        if (!isProjectSessionCurrent(session)) return
        if (!created.success) throw new Error(created.error || text('无法创建空白草稿', 'Could not create a blank draft'))
        drafts = await fetchChapterDrafts(chapterNumber, session)
      }
      if (!isProjectSessionCurrent(session)) return
      const latest = drafts[0]
      if (!latest) throw new Error(text('无法读取草稿', 'Could not read the draft'))
      await swapChapterTab(tab.id, () => openDraftInChapterView(latest, blueprint?.title ?? row?.title ?? '', session))
      await useDraftStore.getState().loadChapterDrafts(chapterNumber, projectKey, session)
    } catch (error) {
      if (isProjectSessionCurrent(session)) setManualError(displayedErrorMessage(useLocaleStore.getState().locale, error))
    } finally {
      startingManual.current = false
      setManualBusy(false)
    }
  }

  useEffect(() => {
    const session = captureProjectSession(useProjectStore.getState().currentProject)
    if (!draft || !session) return
    void swapChapterTab(tab.id, () => openDraftInChapterView(draft, row?.title ?? '', session))
  }, [draft, row?.title, tab.id])

  // 没有蓝图就没有写作按钮来接手写作请求；留着它，等这一章补上蓝图后会在蓝图页突然弹出写作弹层。页面开着之后才到的请求也一样。
  const writeRequest = useStageStore(s => s.writeRequest)
  useEffect(() => {
    if (blueprint === null && writeRequest?.chapterNumber === chapterNumber) useStageStore.setState({ writeRequest: null })
  }, [blueprint, chapterNumber, writeRequest])

  const editBlueprint = () => openBuiltinEditor('chapter-card-editor', text('章节蓝图', 'Chapter blueprint'), 'chapter-card', undefined, chapterNumber)
  const target = wordsPerChapter && wordsPerChapter > 0 ? wordsPerChapter.toLocaleString(locale) : null

  return (
    <div className="stage-ch" data-focus={focus || undefined}>
      <div className="stage-ch-scroll">
        <article className="stage-ch-page">
          <ChapterHead
            chapterNumber={chapterNumber}
            role={blueprint?.role}
            title={blueprint?.title ?? row?.title ?? ''}
            step={0}
            focus={focus}
            version={(
              <span className="stage-ch-version stage-ch-version-chip">
                {target ? text(`尚无草稿 · 目标 ${target} 字`, `No draft yet · target ${target} ${pluralEn(wordsPerChapter ?? 0, 'word')}`) : text('尚无草稿', 'No draft yet')}
              </span>
            )}
          />
          <div className="stage-ch-actions">
            {blueprint && <WriteChapterPopover chapterNumber={chapterNumber} blueprint={blueprintWritePrefill(blueprint)} label={text('写作此章', 'Write this chapter')} align="start" />}
            <Button variant="secondary" disabled={manualBusy || Boolean(row?.running)} onClick={() => void startManual()}>
              {text('手动写作', 'Write manually')}
            </Button>
            {blueprint && (
              <span className="stage-ch-hint">
                {row?.running
                  ? text('这一章正在写，完成后会在这里换成草稿', 'This chapter is being written; the draft replaces this page when it is done')
                  : text('按本章蓝图写作，不再重复填写参数', 'Writes from this chapter’s blueprint; nothing to fill in again')}
              </span>
            )}
          </div>
          <div className="stage-ch-notices">
            {manualError && <Notice tone="warn" title={text('无法开始手动写作', 'Could not start manual writing')}>{manualError}</Notice>}
            <DeletionCleanupNotices projectKey={projectKey} chapterNumber={chapterNumber} />
            {row?.running && (
              <Notice
                tone="info"
                title={text('正在写这一章', 'Writing this chapter')}
                actions={<Button variant="secondary" size="sm" onClick={() => navigate({ kind: 'run', facet: 'output' })}>{text('查看运行', 'Open run')}</Button>}
              />
            )}
            {blueprintFailed && (
              <Notice
                tone="warn"
                title={text('读取本章蓝图失败', 'Could not read this chapter’s blueprint')}
                actions={<Button variant="secondary" size="sm" onClick={reloadBlueprint}>{text('重新读取', 'Read again')}</Button>}
              >
                {text('写作此章按本章蓝图写，读到之后才能开始。', 'Writing follows this chapter’s blueprint, so it can start once the blueprint is read.')}
              </Notice>
            )}
            {blueprint === null && (
              <Notice
                tone="warn"
                title={text('这一章还没有蓝图', 'This chapter has no blueprint yet')}
                actions={<Button variant="secondary" size="sm" onClick={editBlueprint}>{text('去蓝图规划', 'Plan it in the blueprint')}</Button>}
              >
                {text('写作此章按蓝图写，先在蓝图里规划这一章。', 'Writing follows the blueprint, so plan this chapter there first.')}
              </Notice>
            )}
          </div>
          {blueprint && (
            <section className="stage-ch-plan" aria-label={text('本章蓝图', 'Chapter blueprint')}>
              <div className="stage-ch-plan-head">
                <h2 className="stage-ch-plan-title">{text('本章蓝图', 'Chapter blueprint')}<small>{text('只读 · 写作以此为准', 'Read-only · writing follows it')}</small></h2>
                <Button variant="text" size="sm" onClick={editBlueprint}>{text('在蓝图中编辑', 'Edit in blueprint')}</Button>
              </div>
              <dl className="stage-ch-plan-grid">
                <dt>{text('定位', 'Role')}</dt><dd>{blueprint.role || '—'}</dd>
                <dt>{text('出场角色', 'Characters')}</dt>
                <dd>{blueprint.characters.length > 0
                  ? <span className="stage-ch-chips">{blueprint.characters.map(name => <span key={name} className="stage-ch-chip">{name}</span>)}</span>
                  : '—'}</dd>
                <dt>{text('本章目的', 'Purpose')}</dt><dd>{blueprint.purpose || '—'}</dd>
                <dt>{text('关键事件', 'Key events')}</dt><dd>{blueprint.keyEvents || '—'}</dd>
                {blueprint.userGuidance && <><dt>{text('作者指导', 'Author guidance')}</dt><dd>{blueprint.userGuidance}</dd></>}
              </dl>
            </section>
          )}
          {blueprint && !row?.running && (
            <div className="stage-ch-blank">
              <b>{text('这一章还是空白', 'This chapter is still blank')}</b>
              {text('点「写作此章」让 AI 按蓝图起草，或点「手动写作」直接输入正文。', 'Choose “Write this chapter” for an AI draft from the blueprint, or “Write manually” to start typing.')}
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
