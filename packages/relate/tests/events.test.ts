import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '../src/events'

describe('EventBus', () => {
  it('calls registered handler on emit', async () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.on('test', handler)
    await bus.emit('test', { value: 42 })

    expect(handler).toHaveBeenCalledWith({ value: 42 })
  })

  it('supports multiple handlers for same event', async () => {
    const bus = new EventBus()
    const a = vi.fn()
    const b = vi.fn()

    bus.on('test', a)
    bus.on('test', b)
    await bus.emit('test', {})

    expect(a).toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
  })

  it('does nothing for events with no handlers', async () => {
    const bus = new EventBus()
    await expect(bus.emit('nothing', {})).resolves.toBeUndefined()
  })

  it('removes handler with off()', async () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.on('test', handler)
    bus.off('test', handler)
    await bus.emit('test', {})

    expect(handler).not.toHaveBeenCalled()
  })

  it('supports sync handlers', async () => {
    const bus = new EventBus()
    let called = false

    bus.on('test', () => { called = true })
    await bus.emit('test', {})

    expect(called).toBe(true)
  })

  it('isolates errors — other handlers still run', async () => {
    const bus = new EventBus()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const after = vi.fn()

    bus.on('test', () => { throw new Error('boom') })
    bus.on('test', after)
    await bus.emit('test', {})

    expect(after).toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('caps recursion at depth 5', async () => {
    const bus = new EventBus()
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let depth = 0

    bus.on('recurse', async () => {
      depth++
      await bus.emit('recurse', {})
    })

    await bus.emit('recurse', {})

    expect(depth).toBe(5)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
