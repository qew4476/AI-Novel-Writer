import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import type { StoreApi } from 'zustand'
import type { ProjectData } from '../../../shared/ipc-channels'
import { useProjectStore } from '../../../stores/project-store'
import { useEditorStore } from '../../../stores/editor-store'
import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useStageStore } from '../../../stores/navigation/stage-store'
import StageTools from '../StageTools'
import StageWorkspace from '../StageWorkspace'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const stores = [useProjectStore, useEditorStore, useLayoutStore, useLocaleStore, useStageStore] as const
const restores = stores.map(store => {
  const api = store as StoreApi<unknown>
  const state = api.getState()
  return () => api.setState(state, true)
})
let host: HTMLDivElement
let root: Root
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

beforeEach(async () => {
  Object.defineProperty(window, 'aiNovelAPI', { configurable: true, value: {
    invoke: vi.fn(async (channel: string) => channel === 'config:set' ? { success: true } : channel.endsWith('-list') || channel.endsWith('get-all') ? [] : undefined),
    on: () => () => undefined,
  } })
  useProjectStore.setState({ currentProject: { path: 'C:/novels/test', config: {} } as unknown as ProjectData })
  useEditorStore.setState({ tabs: [], activeTabId: null })
  useLayoutStore.setState({ settingsOpen: false })
  useLocaleStore.setState({ locale: 'zh-CN' })
  useStageStore.setState({ sheet: null, focus: false })
  host = document.createElement('div')
  host.className = 'paper-ink stage-shell'
  host.style.cssText = 'width: 850px; height: 700px'
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<div className="stage-frame"><StageWorkspace library={false} focus={false} /><StageTools /></div>))
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  restores.forEach(restore => restore())
  Reflect.deleteProperty(window, 'aiNovelAPI')
  vi.restoreAllMocks()
})

it('opens, switches and collapses the two tools while keeping the rail visible', async () => {
  expect(host.querySelector('.stage-sheet-slot')).toBeNull()
  await act(async () => button('AI 写作助手').click())
  expect(button('AI 写作助手').getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelector('.stage-chat')).not.toBeNull()
  expect(host.querySelector('.stage-chat')?.textContent).not.toContain('AI 工作流')
  const slot = host.querySelector<HTMLElement>('.stage-sheet-slot')!
  const rail = host.querySelector('.stage-tools')!
  expect(getComputedStyle(slot).position).toBe('absolute')
  expect(slot.getBoundingClientRect().right).toBeLessThanOrEqual(rail.getBoundingClientRect().left)
  await act(async () => button('运行工作流').click())
  expect(host.querySelector('.stage-chat')).toBeNull()
  expect(host.querySelector('.pi-sheet-title')?.textContent).toBe('运行')
  expect(button('运行工作流').getAttribute('aria-pressed')).toBe('true')
  await act(async () => button('运行工作流').click())
  expect(host.querySelector('.stage-sheet-slot')).toBeNull()
  expect(host.querySelectorAll('.stage-tool')).toHaveLength(2)
})

it('localizes controls and closes the assistant with Escape or its close button', async () => {
  await act(async () => useLocaleStore.getState().setLocale('en-US'))
  await act(async () => button('AI Writing Assistant').click())
  expect(host.querySelector('.pi-sheet-title')?.textContent).toBe('AI Writing Assistant')
  await act(async () => button('Close writing assistant').click())
  expect(host.querySelector('.stage-sheet-slot')).toBeNull()
  await act(async () => button('AI Writing Assistant').click())
  await act(async () => userEvent.keyboard('{Escape}'))
  expect(host.querySelector('.stage-sheet-slot')).toBeNull()
})
