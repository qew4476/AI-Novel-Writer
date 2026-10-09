import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../../services/ipc-client', () => ({
  ipc: { invoke, isElectron: true },
}))

beforeEach(() => {
  vi.resetModules()
  invoke.mockReset()
  invoke.mockImplementation(async (channel: string) => (
    channel === 'project:recent-list'
      ? [{ name: 'Last', path: '/last', updatedAt: '' }, { name: 'Older', path: '/older', updatedAt: '' }]
      : null
  ))
})

describe('startup project restoration', () => {
  it('opens the most recently opened project only once', async () => {
    const { useProjectStore } = await import('../project-store')
    const open = vi.fn(async () => true)
    useProjectStore.setState({ openProject: open })
    await Promise.all([
      useProjectStore.getState().restoreStartupProject(),
      useProjectStore.getState().restoreStartupProject(),
    ])
    expect(open).toHaveBeenCalledExactlyOnceWith('/last')
  })

  it('keeps the welcome screen when no recent project exists', async () => {
    invoke.mockResolvedValueOnce(null).mockResolvedValueOnce([])
    const { useProjectStore } = await import('../project-store')
    const open = vi.fn(async () => true)
    useProjectStore.setState({ openProject: open })
    await useProjectStore.getState().restoreStartupProject()
    expect(open).not.toHaveBeenCalled()
  })

  it('does not override a manual project open while reading startup metadata', async () => {
    let resolve!: (value: null) => void
    invoke.mockImplementationOnce(() => new Promise<null>(done => { resolve = done }))
    const { useProjectStore } = await import('../project-store')
    const open = vi.fn(async () => true)
    useProjectStore.setState({ openProject: open })
    const restoring = useProjectStore.getState().restoreStartupProject()
    useProjectStore.setState({ loading: true })
    resolve(null)
    await restoring
    expect(open).not.toHaveBeenCalled()
  })

  it('gives explicit smoke requests priority over recent projects', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'project:smoke-open-request') return { projectPath: '/smoke' }
      if (channel === 'project:smoke-open-confirm') return { success: true }
      return [{ name: 'Last', path: '/last', updatedAt: '' }]
    })
    const { useProjectStore } = await import('../project-store')
    const open = vi.fn(async () => true)
    useProjectStore.setState({ openProject: open })
    await useProjectStore.getState().restoreStartupProject()
    expect(open).toHaveBeenCalledExactlyOnceWith('/smoke')
    expect(invoke).toHaveBeenCalledWith('project:smoke-open-confirm', '/smoke')
  })

  it('leaves startup usable if recent metadata cannot be read', async () => {
    invoke.mockRejectedValueOnce(new Error('unavailable'))
    const { useProjectStore } = await import('../project-store')
    await expect(useProjectStore.getState().restoreStartupProject()).resolves.toBeUndefined()
    expect(useProjectStore.getState().currentProject).toBeNull()
  })
})
