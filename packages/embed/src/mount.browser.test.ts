import {describe, expect, test as baseTest} from 'vitest'
import {page} from 'vitest/browser'
import {createEngine} from '@conciv/plugin-testkit'
import {createConciv, mountConciv, type ConcivHandle} from './mount.js'

describe('the host page drives the widget through its handle', () => {
  const test = baseTest.extend<{element: HTMLElement; handles: ConcivHandle[]}>({
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    element: async ({}, use) => {
      const element = document.createElement('div')
      document.body.append(element)
      await use(element)
      element.remove()
    },
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    handles: async ({}, use) => {
      const handles: ConcivHandle[] = []
      await use(handles)
      for (const handle of handles) handle.unmount()
    },
  })

  test('the handle mounts the widget, opens, closes and toggles the panel, rebinds it to another engine, unmounts it, and a remount in the same tab reopens its last screen', async ({
    element,
    handles,
  }) => {
    const first = await createEngine()
    const second = await createEngine()
    await second.newSession('Work on the second engine')
    const bound = {address: first.address}
    const handle = createConciv({
      apiBase: first.address.apiBase,
      engineToken: () => Promise.resolve(bound.address.token),
    })
    handles.push(handle)

    await handle.mount(element)
    const launcher = page.getByRole('button', {name: 'Open conciv chat'})
    await expect.element(launcher).toBeVisible()

    handle.open()
    const panel = await page.getByRole('dialog', {name: 'conciv chat agent'}).findElement()
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
    await expect.element(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })
})

describe('the script tag mounts one widget', () => {
  const test = baseTest.extend<{apiBaseTag: HTMLMetaElement}>({
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    apiBaseTag: async ({}, use) => {
      const tag = Object.assign(document.createElement('meta'), {name: 'conciv-api-base'})
      document.head.append(tag)
      await use(tag)
      tag.remove()
      for (const root of document.querySelectorAll('[data-conciv-script-root]')) root.remove()
    },
  })

  test('a second mountConciv call keeps the one widget the first call mounted', async ({apiBaseTag}) => {
    const engine = await createEngine()
    apiBaseTag.content = engine.address.apiBase

    await mountConciv()
    await mountConciv()

    await expect.element(page.getByRole('button', {name: 'Unauthorized. Authorize conciv'})).toBeVisible()
  })
})
