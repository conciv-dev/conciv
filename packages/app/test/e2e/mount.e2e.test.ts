import {describe, expect, test as baseTest} from 'vitest'
import {page} from 'vitest/browser'
import {createEngine} from '@conciv/plugin-testkit'
import {createConciv, mountConciv, type ConcivHandle} from '../../src/mount.js'

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
    await first.newSession('Work on the first engine')
    const second = await createEngine()
    await second.newSession('Work on the second engine')
    const bound = {token: () => Promise.resolve(first.address.token)}
    const handle = createConciv({
      apiBase: first.address.apiBase,
      engineToken: () => bound.token(),
    })
    handles.push(handle)

    await handle.mount(element)
    const launcher = page.getByRole('button', {name: 'Open conciv chat'})
    await expect.element(launcher).toBeVisible()

    handle.open()
    const openPanel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expect.element(openPanel).toBeVisible()
    const panel = openPanel.element()
    handle.close()
    await expect.element(panel).not.toBeVisible()
    await expect.element(launcher).toBeVisible()
    handle.toggle()
    await expect.element(panel).toBeVisible()
    handle.toggle()
    await expect.element(panel).not.toBeVisible()

    const asked = Promise.withResolvers<void>()
    const secondToken = Promise.withResolvers<string>()
    bound.token = () => {
      asked.resolve()
      return secondToken.promise
    }
    const rebinding = handle.rebind(second.address.apiBase)
    expect(await Promise.race([rebinding.then(() => 'rebound'), asked.promise.then(() => 'asked for a token')])).toBe(
      'asked for a token',
    )
    secondToken.resolve(second.address.token)
    await rebinding
    handle.open()
    await page.getByRole('button', {name: 'Work on the second engine, session options'}).click()
    await page.getByRole('button', {name: 'Session: Work on the second engine'}).click()
    await expect.element(page.getByRole('option', {name: /^Work on the second engine, /})).toBeVisible()
    expect(page.getByRole('option', {name: /^New session, /}).elements()).toHaveLength(1)

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
