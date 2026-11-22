import {describe, expect, onTestFinished, test} from 'vitest'
import {page} from 'vitest/browser'
import {createEngine} from '@conciv/plugin-testkit'
import {createConciv, mountConciv} from './mount.js'

describe('the host page drives the widget through its handle', () => {
  test('the handle mounts the widget, opens, closes and toggles the panel, rebinds it to another engine, and unmounts it', async () => {
    const first = await createEngine()
    const second = await createEngine()
    await second.newSession('Work on the second engine')
    const bound = {address: first.address}
    const handle = createConciv({
      apiBase: first.address.apiBase,
      engineToken: () => Promise.resolve(bound.address.token),
    })
    const element = document.createElement('div')
    document.body.append(element)
    onTestFinished(() => {
      handle.unmount()
      element.remove()
    })

    await handle.mount(element)
    const launcher = page.getByRole('button', {name: 'Open conciv chat'})
    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expect.element(launcher).toBeVisible()

    handle.open()
    await expect.element(panel).toBeVisible()
    handle.close()
    await expect.element(panel).not.toBeVisible()
    await expect.element(launcher).toBeVisible()
    handle.toggle()
    await expect.element(panel).toBeVisible()
    handle.toggle()
    await expect.element(panel).not.toBeVisible()

    bound.address = second.address
    await handle.rebind(second.address.apiBase)
    handle.open()
    await expect.element(page.getByRole('button', {name: 'Work on the second engine, session options'})).toBeVisible()

    handle.unmount()
    await expect.element(launcher).not.toBeInTheDocument()
    await handle.mount(element)
    await expect.element(launcher).toBeVisible()
  })
})

describe('the script tag mounts one widget', () => {
  test('a second mountConciv call keeps the one widget the first call mounted', async () => {
    const engine = await createEngine()
    const apiBase = Object.assign(document.createElement('meta'), {
      name: 'conciv-api-base',
      content: engine.address.apiBase,
    })
    document.head.append(apiBase)
    onTestFinished(() => apiBase.remove())

    await mountConciv()
    await mountConciv()

    await expect.element(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
  })
})
