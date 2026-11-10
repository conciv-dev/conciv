import {afterAll, beforeAll, describe, expect, it, onTestFinished, vi} from 'vitest'
import {page, server} from 'vitest/browser'
import {collectClientEffects, collectClientTools, type ClientEffect, type ClientToolCtx} from '@conciv/extension'
import {makeDomPageDriver, type PageDriver, installReactBridge} from '@conciv/page'
import type {PageError} from '@conciv/protocol/page-types'
import pageExtension from '../src/client.js'
import {PAGE_TOOL_PREFIX, PAGE_TOOL_DEFS} from '../src/shared/defs.js'
import {z} from 'zod'
import {CHAT_FONTS} from '@conciv/ui-kit-chat/theme/fonts'
import {createRoot, type Root} from 'react-dom/client'
import {watchHotUpdates, type HotSurface} from '../src/client/hmr.js'
import {ControlledForm, FixtureApp} from './fixtures/react-app.js'

const inFirefox = server.browser === 'firefox'

describe.skipIf(inFirefox)('effects', () => {
  function installBanner(): ClientEffect {
    let banner: HTMLElement | null = null
    return {
      name: 'banner',
      description: 'shows the fixture banner',
      enabled: () => banner !== null,
      set: (enabled) => {
        if (enabled === (banner !== null)) return
        if (!enabled) {
          banner?.remove()
          banner = null
          return
        }
        banner = document.createElement('div')
        banner.setAttribute('role', 'note')
        banner.textContent = 'fixture banner shown'
        document.body.appendChild(banner)
      },
    }
  }

  let driver: PageDriver

  const banner = () => page.getByText('fixture banner shown')

  const effectResult = async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const outcome = await driver.execute({agentId: 'test-agent', name: `${PAGE_TOOL_PREFIX}effect`, input})
    if (!outcome.ok) throw new Error(`expected a result, got ${outcome.error.code}: ${outcome.error.message}`)
    return outcome.result
  }

  const effectFailure = async (input: Record<string, unknown>): Promise<PageError> => {
    const outcome = await driver.execute({agentId: 'test-agent', name: `${PAGE_TOOL_PREFIX}effect`, input})
    if (outcome.ok) throw new Error('expected a failure, got a result')
    return outcome.error
  }

  beforeAll(() => {
    driver = makeDomPageDriver({
      tools: collectClientTools([pageExtension]),
      effects: collectClientEffects([
        {name: 'fixture-a', effects: [installBanner()]},
        {name: 'fixture-b', effects: [installBanner()]},
      ]),
    })
  })

  afterAll(() => {
    driver.dispose()
  })

  describe('the page_effect verb drives registered host effects', () => {
    it('lists what exists exactly once per name, with its current state', async () => {
      expect(await effectResult({action: 'list'})).toEqual({
        effects: [{name: 'banner', description: 'shows the fixture banner', enabled: false}],
      })
    })

    it('enabling visibly changes the page and disabling reverts it', async () => {
      expect(await effectResult({action: 'enable', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
      await expect.element(banner()).toBeVisible()
      expect(await effectResult({action: 'report', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
      expect(await effectResult({action: 'disable', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
      await expect.element(banner()).not.toBeInTheDocument()
    })

    it('toggle flips the effect each call', async () => {
      expect(await effectResult({action: 'toggle', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
      await expect.element(banner()).toBeVisible()
      expect(await effectResult({action: 'toggle', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
      await expect.element(banner()).not.toBeInTheDocument()
    })

    it('start and stop drive the effect like enable and disable', async () => {
      expect(await effectResult({action: 'start', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
      await expect.element(banner()).toBeVisible()
      expect(await effectResult({action: 'stop', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
      await expect.element(banner()).not.toBeInTheDocument()
    })

    it('an unknown effect name fails with the declared error naming what exists', async () => {
      const failure = await effectFailure({action: 'enable', effect: 'confetti'})
      expect(failure.raised?.code).toBe('UNKNOWN_EFFECT')
      expect(failure.message).toContain('confetti')
      expect(failure.message).toContain('banner')
    })

    it('a driving action without an effect name fails as invalid args', async () => {
      const failure = await effectFailure({action: 'enable'})
      expect(failure.code).toBe('invalid-args')
      expect(failure.message).toContain('list')
    })

    it('list rejects a passed effect name as invalid args instead of ignoring it', async () => {
      const failure = await effectFailure({action: 'list', effect: 'banner'})
      expect(failure.code).toBe('invalid-args')
      expect(failure.message).toContain('list')
    })

    it('report on a disabled effect truthfully returns enabled: false', async () => {
      expect(await effectResult({action: 'report', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
      await expect.element(banner()).not.toBeInTheDocument()
    })
  })
})

describe.skipIf(inFirefox)('page tools', () => {
  let container: HTMLElement
  let reactRoot: Root
  let driver: PageDriver

  const leaf = () => page.getByRole('button', {name: /^A:/})
  const counter = () => page.getByRole('status')
  const formState = () => page.getByText(/^subscribed:/)

  const declaredOutputOf = (verb: string) => {
    const tool = PAGE_TOOL_DEFS.find((candidate) => candidate.name === `${PAGE_TOOL_PREFIX}${verb}`)
    const output = tool?.outputSchema
    if (!output) throw new Error(`no page tool declares an output for page_${verb}`)
    return output
  }

  const resultOf = async (verb: string, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const outcome = await driver.execute({agentId: 'test-agent', name: `${PAGE_TOOL_PREFIX}${verb}`, input})
    if (!outcome.ok) throw new Error(`expected a result for ${verb}, got ${outcome.error.code}`)
    const result = {...outcome.result}
    expect(declaredOutputOf(verb).parse(result)).toEqual(result)
    return result
  }

  const failureOf = async (verb: string, input: Record<string, unknown> = {}): Promise<PageError> => {
    const outcome = await driver.execute({agentId: 'test-agent', name: `${PAGE_TOOL_PREFIX}${verb}`, input})
    if (outcome.ok) throw new Error(`expected a failure for ${verb}, got a result`)
    return outcome.error
  }

  beforeAll(async () => {
    installReactBridge()
    container = document.createElement('div')
    container.innerHTML = `
    <input id="field" type="text" />
    <input id="secret" type="password" />
    <form id="frm"><button id="inner" type="button">inner</button></form>
    <p id="prose">hello page</p>
    <span id="failprobe">probe</span>
    <select id="sel"><option value="a">A</option><option value="b">B</option><option value="fs">Full Stack</option></select>
    <input id="locked" type="checkbox" disabled />
    <input id="qty" type="number" />
    <input id="stuck" type="checkbox" />
    <button id="hovbtn">hover me</button>
    <div id="htmlhost"><i>old</i></div>
  `
    document.body.appendChild(container)
    const mount = document.createElement('div')
    container.appendChild(mount)
    reactRoot = createRoot(mount)
    reactRoot.render(
      <>
        <FixtureApp />
        <ControlledForm />
      </>,
    )
    driver = makeDomPageDriver({tools: collectClientTools([pageExtension])})
    await vi.waitFor(() => {
      if (!document.querySelector('[data-fixture="leaf"]')) throw new Error('fixture not rendered yet')
    })
  })

  afterAll(() => {
    reactRoot.unmount()
    container.remove()
  })

  describe('target resolution', () => {
    it('resolves selector, snapshot ref, and React component name targets', async () => {
      expect(await resultOf('text', {selector: '#prose'})).toEqual({text: 'hello page'})
      const snapshot = await resultOf('snapshot')
      const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
      expect(nodes.length).toBeGreaterThan(0)
      const first = nodes[0] && typeof nodes[0] === 'object' ? {...nodes[0]} : {}
      const viaRef = await resultOf('text', {ref: String(first.ref)})
      expect(typeof viaRef.text).toBe('string')
      const viaName = await resultOf('text', {name: 'Leaf'})
      expect(String(viaName.text)).toContain('A:')
    })

    it('explains each way a target can be missing, as an invalid-args failure', async () => {
      expect(await failureOf('click', {ref: 'v999'})).toEqual({
        code: 'invalid-args',
        message: 'stale ref v999; re-run page snapshot',
      })
      expect(await failureOf('click', {name: 'Nope'})).toEqual({
        code: 'invalid-args',
        message: 'no React component named "Nope" found',
      })
      expect(await failureOf('click', {selector: '#missing'})).toEqual({
        code: 'invalid-args',
        message: 'no element for selector #missing',
      })
      expect(await failureOf('click')).toEqual({
        code: 'invalid-args',
        message: 'no target: pass ref, selector, or name',
      })
    })
  })

  describe('dom verbs', () => {
    it('clicks through React handlers', async () => {
      expect(await resultOf('click', {selector: '[data-fixture="leaf"]'})).toEqual({ok: true})
      await expect.element(leaf()).toMatchTextContent(':1:')
    })

    it('fills form fields with native events', async () => {
      expect(await resultOf('fill', {selector: '#field', value: 'typed'})).toEqual({ok: true, value: 'typed'})
      expect(await resultOf('value', {selector: '#field'})).toEqual({value: 'typed'})
      expect(await failureOf('fill', {selector: '#prose', value: 'x'})).toEqual({
        code: 'invalid-args',
        message: 'That element is not a text field.',
      })
    })

    it('masks a password value in the fill and value tool results', async () => {
      expect(await resultOf('fill', {selector: '#secret', value: 'hunter2'})).toEqual({ok: true, value: '***'})
      expect(await resultOf('value', {selector: '#secret'})).toEqual({value: '***'})
    })

    it('drives React-controlled checkboxes and radios so component state follows', async () => {
      expect(await resultOf('check', {selector: '#subscribe'})).toEqual({ok: true, checked: true})
      await expect.element(formState()).toMatchTextContent('subscribed: true')

      expect(await resultOf('check', {selector: '#subscribe'})).toEqual({ok: true, checked: true})
      await expect.element(formState()).toMatchTextContent('subscribed: true')

      expect(await resultOf('uncheck', {selector: '#subscribe'})).toEqual({ok: true, checked: false})
      await expect.element(formState()).toMatchTextContent('subscribed: false')

      expect(await resultOf('check', {selector: '#plan-pro'})).toEqual({ok: true, checked: true})
      await expect.element(formState()).toMatchTextContent('plan: pro')

      expect(await failureOf('uncheck', {selector: '#plan-pro'})).toEqual({
        code: 'invalid-args',
        message: 'A radio is unchecked by checking another one.',
      })
      await expect.element(formState()).toMatchTextContent('plan: pro')

      expect(await resultOf('check', {selector: '#plan-free'})).toEqual({ok: true, checked: true})
      await expect.element(formState()).toMatchTextContent('plan: free')
    })

    it('mutates attributes, classes, styles, text, and structure', async () => {
      await resultOf('setattr', {selector: '#prose', attribute: 'data-mark', value: 'on'})
      expect(document.querySelector('#prose')?.getAttribute('data-mark')).toBe('on')
      expect((await failureOf('setattr', {selector: '#prose', value: 'on'})).code).toBe('invalid-args')
      await resultOf('removeattr', {selector: '#prose', attribute: 'data-mark'})
      expect(document.querySelector('#prose')?.hasAttribute('data-mark')).toBe(false)
      await resultOf('addclass', {selector: '#prose', class: 'hot'})
      expect(document.querySelector('#prose')?.classList.contains('hot')).toBe(true)
      await resultOf('settext', {selector: '#prose', text: 'rewritten'})
      expect(document.querySelector('#prose')?.textContent).toBe('rewritten')
      await resultOf('insert', {selector: '#prose', html: '<em id="added">x</em>', position: 'after'})
      expect(document.querySelector('#added')).not.toBeNull()
      await resultOf('remove', {selector: '#added'})
      expect(document.querySelector('#added')).toBeNull()
    })

    it('reports route, existence, and query matches', async () => {
      const route = await resultOf('route')
      expect(route.pathname).toBe(location.pathname)
      expect(await resultOf('exists', {selector: '#frm'})).toEqual({exists: true, count: 1})
      const query = await resultOf('query', {selector: 'input'})
      expect(query.count).toBe(8)
    })

    it('route reports the document title and visibility', async () => {
      document.title = 'Settings'
      expect(await resultOf('route')).toMatchObject({title: 'Settings', state: 'visible'})
    })

    it('waits for visibility and times out with an explanation', async () => {
      expect(await resultOf('wait', {selector: '#prose', state: 'visible', timeout: 500})).toEqual({
        ok: true,
        state: 'visible',
      })
      expect(await failureOf('wait', {selector: '#missing', state: 'visible', timeout: 150})).toEqual({
        code: 'handler-error',
        message: 'wait timed out for #missing (visible)',
      })
    })

    it('evaluates code and serializes element results', async () => {
      const value = await resultOf('eval', {code: 'return 2 + 3'})
      expect(value).toEqual({result: 5})
      const element = await resultOf('eval', {code: 'return document.querySelector("#frm")'})
      expect(element.result).toMatchObject({tagName: 'form'})
    })

    it('returns the value of a bare expression and still runs a statement body', async () => {
      expect(await resultOf('eval', {code: '2 + 3'})).toEqual({result: 5})
      expect(await resultOf('eval', {code: 'document.querySelector("#frm").tagName'})).toEqual({result: 'FORM'})
      expect(await resultOf('eval', {code: 'const a = 1; return a + 1'})).toEqual({result: 2})
    })

    it('injects css stylesheets', async () => {
      expect(await resultOf('css', {text: '#prose{letter-spacing:3px}'})).toEqual({ok: true})
      expect(document.querySelector('style[data-vibe-css]')?.textContent).toContain('letter-spacing')
    })
  })

  describe('react verbs through the dispatcher', () => {
    it('inspects a component and navigates into its props by path', async () => {
      const full = await resultOf('inspect', {name: 'Leaf'})
      expect(full.component).toBe('Leaf')
      const byPath = await resultOf('inspect', {name: 'Leaf', path: 'props.label'})
      expect(byPath.value).toBe('A')
      expect(await failureOf('inspect', {name: 'Leaf', path: 'props.missing.deep'})).toEqual({
        code: 'invalid-args',
        message: 'path not found: props.missing.deep',
      })
    })

    it('overrides props and validates its inputs', async () => {
      expect((await failureOf('override', {name: 'Counter'})).code).toBe('invalid-args')
      expect(await failureOf('override', {name: 'Counter', target: 'state', json: '{nope'})).toEqual({
        code: 'invalid-args',
        message: '--json is not valid JSON: {nope',
      })
      const set = await resultOf('override', {name: 'Counter', target: 'state', path: 'value', json: '77'})
      expect(set.ok).toBe(true)
      await expect.element(counter()).toHaveTextContent('77')
    })

    it('tracks renders between start and stop', async () => {
      await resultOf('track', {action: 'start'})
      await resultOf('click', {name: 'Leaf'})
      await expect.element(leaf()).toMatchTextContent(':2:')
      const report = await resultOf('track', {action: 'report'})
      const components = Array.isArray(report.components) ? report.components : []
      expect(
        components.some(
          (entry) => typeof entry === 'object' && entry !== null && 'component' in entry && entry.component === 'Leaf',
        ),
      ).toBe(true)
      const stopped = await resultOf('track', {action: 'stop'})
      expect(stopped.tracking).toBe(false)
    })
  })

  describe('act and edit-live verbs', () => {
    it('selects an option with native change events', async () => {
      const changes: string[] = []
      document.querySelector('#sel')?.addEventListener('change', (event) => {
        const el = event.target
        if (el instanceof HTMLSelectElement) changes.push(el.value)
      })
      expect(await resultOf('select', {selector: '#sel', value: 'b'})).toEqual({ok: true, value: 'b'})
      expect(changes).toEqual(['b'])
      expect(await resultOf('value', {selector: '#sel'})).toEqual({value: 'b'})
    })

    it('selects by visible label, and a missing option fails listing the options without changing the select', async () => {
      expect(await resultOf('select', {selector: '#sel', value: 'Full Stack'})).toEqual({ok: true, value: 'fs'})
      expect(await failureOf('select', {selector: '#sel', value: 'fullstack'})).toEqual({
        code: 'invalid-args',
        message: 'No option "fullstack"; options: a "A", b "B", fs "Full Stack".',
      })
      expect(await resultOf('value', {selector: '#sel'})).toEqual({value: 'fs'})
    })

    it('fails instead of reporting ok when a field or box refuses the change', async () => {
      document.querySelector('#stuck')?.addEventListener('click', (event) => event.preventDefault())
      expect(await failureOf('fill', {selector: '#qty', value: 'many'})).toEqual({
        code: 'invalid-args',
        message: 'The field rejected "many" and stayed empty.',
      })
      const pin = Object.assign(document.createElement('input'), {id: 'pin', type: 'password'})
      pin.addEventListener('input', () => (pin.value = ''))
      container.appendChild(pin)
      const refused = await failureOf('fill', {selector: '#pin', value: 'hunter2-secret'})
      pin.remove()
      expect(refused).toEqual({code: 'invalid-args', message: 'The field rejected *** and stayed empty.'})
      expect(JSON.stringify(refused)).not.toContain('hunter2-secret')
      expect(await failureOf('check', {selector: '#locked'})).toEqual({
        code: 'invalid-args',
        message: 'That element is disabled.',
      })
      expect(await failureOf('check', {selector: '#stuck'})).toEqual({
        code: 'invalid-args',
        message: 'The box is still unchecked; the page prevented the change.',
      })
    })

    it('submits the form owning the target without navigating', async () => {
      const submitted: string[] = []
      document.querySelector('#frm')?.addEventListener('submit', (event) => {
        event.preventDefault()
        submitted.push('submitted')
      })
      expect(await resultOf('submit', {selector: '#inner'})).toEqual({ok: true})
      expect(submitted).toEqual(['submitted'])
    })

    it('presses a key so keydown and keyup both reach the element', async () => {
      const keys: string[] = []
      document.querySelector('#field')?.addEventListener('keydown', (event) => {
        if (event instanceof KeyboardEvent) keys.push(`down:${event.key}`)
      })
      document.querySelector('#field')?.addEventListener('keyup', (event) => {
        if (event instanceof KeyboardEvent) keys.push(`up:${event.key}`)
      })
      expect(await resultOf('press', {selector: '#field', key: 'Enter'})).toEqual({ok: true})
      expect(keys).toEqual(['down:Enter', 'up:Enter'])
    })

    it('hovers with bubbling mouseover and mouseenter', async () => {
      const seen: string[] = []
      document.querySelector('#hovbtn')?.addEventListener('mouseover', () => seen.push('over'))
      document.querySelector('#hovbtn')?.addEventListener('mouseenter', () => seen.push('enter'))
      expect(await resultOf('hover', {selector: '#hovbtn'})).toEqual({ok: true})
      expect(seen).toEqual(['over', 'enter'])
    })

    it('scrolls a far-away element into view', async () => {
      const spacer = document.createElement('div')
      spacer.style.height = '3000px'
      const landmark = document.createElement('p')
      landmark.id = 'far-down'
      landmark.textContent = 'down here'
      document.body.append(spacer, landmark)
      expect(window.scrollY).toBe(0)
      expect(await resultOf('scroll', {selector: '#far-down'})).toEqual({ok: true})
      await expect.element(page.getByText('down here')).toBeInViewport()
      window.scrollTo(0, 0)
      spacer.remove()
      landmark.remove()
    })

    it('replaces inner HTML with sethtml', async () => {
      expect(await resultOf('sethtml', {selector: '#htmlhost', html: '<em id="fresh">new</em>'})).toEqual({ok: true})
      expect(document.querySelector('#htmlhost')?.innerHTML).toBe('<em id="fresh">new</em>')
    })
  })

  describe('actions read the page back after its next turn', () => {
    it('reports a change the app undoes in a microtask or a queued task as refused, and a kept change as made', async () => {
      const host = document.createElement('div')
      host.innerHTML = `
        <label>Microtask name <input id="microtask-name" type="text" /></label>
        <label>Task name <input id="task-name" type="text" /></label>
        <label><input id="microtask-box" type="checkbox" /> Microtask box</label>
        <select id="microtask-plan" aria-label="Microtask plan"><option value="free">Free</option><option value="pro">Pro</option></select>
        <label>Plain name <input id="plain-name" type="text" /></label>
        <label><input id="plain-box" type="checkbox" /> Plain box</label>
      `
      document.body.append(host)
      onTestFinished(() => host.remove())
      const microtaskName = host.querySelector('#microtask-name')
      const taskName = host.querySelector('#task-name')
      const microtaskBox = host.querySelector('#microtask-box')
      const microtaskPlan = host.querySelector('#microtask-plan')
      if (!(microtaskName instanceof HTMLInputElement)) throw new Error('microtask name input missing')
      if (!(taskName instanceof HTMLInputElement)) throw new Error('task name input missing')
      if (!(microtaskBox instanceof HTMLInputElement)) throw new Error('microtask box missing')
      if (!(microtaskPlan instanceof HTMLSelectElement)) throw new Error('microtask plan missing')
      microtaskName.addEventListener('input', () => queueMicrotask(() => (microtaskName.value = '')))
      taskName.addEventListener('input', () => {
        const channel = new MessageChannel()
        channel.port1.addEventListener(
          'message',
          () => {
            taskName.value = ''
            channel.port1.close()
          },
          {once: true},
        )
        channel.port1.start()
        channel.port2.postMessage(null)
        channel.port2.close()
      })
      microtaskBox.addEventListener('change', () => queueMicrotask(() => (microtaskBox.checked = false)))
      microtaskPlan.addEventListener('change', () => queueMicrotask(() => (microtaskPlan.value = 'free')))

      expect(await failureOf('fill', {selector: '#microtask-name', value: 'Ada'})).toEqual({
        code: 'invalid-args',
        message: 'The field rejected "Ada" and stayed empty.',
      })
      await expect.element(page.getByRole('textbox', {name: 'Microtask name'})).toHaveValue('')

      expect(await failureOf('fill', {selector: '#task-name', value: 'Ada'})).toEqual({
        code: 'invalid-args',
        message: 'The field rejected "Ada" and stayed empty.',
      })
      await expect.element(page.getByRole('textbox', {name: 'Task name'})).toHaveValue('')

      expect(await failureOf('check', {selector: '#microtask-box'})).toEqual({
        code: 'invalid-args',
        message: 'The box is still unchecked; the page prevented the change.',
      })
      await expect.element(page.getByRole('checkbox', {name: 'Microtask box'})).not.toBeChecked()

      expect(await resultOf('select', {selector: '#microtask-plan', value: 'pro'})).toEqual({ok: true, value: 'free'})
      await expect.element(page.getByRole('combobox', {name: 'Microtask plan'})).toHaveValue('free')

      expect(await resultOf('fill', {selector: '#plain-name', value: 'Ada'})).toEqual({ok: true, value: 'Ada'})
      await expect.element(page.getByRole('textbox', {name: 'Plain name'})).toHaveValue('Ada')

      expect(await resultOf('check', {selector: '#plain-box'})).toEqual({ok: true, checked: true})
      await expect.element(page.getByRole('checkbox', {name: 'Plain box'})).toBeChecked()
    })
  })

  describe('actions reply at once', () => {
    it('fills, checks and clicks far-away controls and replies before the page has finished scrolling to them', async () => {
      const far = document.createElement('div')
      far.innerHTML = `
        <p id="order">order:</p>
        <div style="height: 3000px"></div>
        <label>Far name <input id="far-name" type="text" /></label>
        <div style="height: 3000px"></div>
        <label><input id="far-box" type="checkbox" /> Far box</label>
        <div style="height: 3000px"></div>
        <button id="far-button" type="button">Far button</button>
        <p id="far-clicks">0 far clicks</p>
      `
      document.body.append(far)
      const order = far.querySelector('#order')
      const note = (entry: string) => order?.append(` ${entry}`)
      const scrolled = () => note('scrolled')
      document.addEventListener('scrollend', scrolled)
      onTestFinished(() => {
        document.removeEventListener('scrollend', scrolled)
        window.scrollTo(0, 0)
        far.remove()
      })
      far.querySelector('#far-button')?.addEventListener('click', () => {
        const clicks = far.querySelector('#far-clicks')
        if (clicks) clicks.textContent = `${Number.parseInt(clicks.textContent ?? '0', 10) + 1} far clicks`
      })
      const orderLine = () => page.getByText(/^order:/)

      expect(await resultOf('fill', {selector: '#far-name', value: 'Ada'})).toEqual({ok: true, value: 'Ada'})
      note('replied')
      await expect.element(page.getByRole('textbox', {name: 'Far name'})).toHaveValue('Ada')
      await expect.element(orderLine()).toHaveTextContent('order: replied scrolled')

      expect(await resultOf('check', {selector: '#far-box'})).toEqual({ok: true, checked: true})
      note('replied')
      await expect.element(page.getByRole('checkbox', {name: 'Far box'})).toBeChecked()
      await expect.element(orderLine()).toHaveTextContent('order: replied scrolled replied scrolled')

      expect(await resultOf('click', {selector: '#far-button'})).toEqual({ok: true})
      note('replied')
      await expect.element(page.getByText('1 far clicks')).toBeVisible()
      await expect.element(orderLine()).toHaveTextContent('order: replied scrolled replied scrolled replied scrolled')
    })
  })

  describe('console reads', () => {
    it('since is inclusive: an entry stamped exactly at since is returned, one past it is not', async () => {
      console.log('console-marker-inclusive')
      const all = await resultOf('console')
      const entries = Array.isArray(all.entries) ? all.entries : []
      const marker = entries.flatMap((entry) =>
        typeof entry === 'object' && entry !== null && 'text' in entry && entry.text === 'console-marker-inclusive'
          ? [entry]
          : [],
      )[0]
      const ts = marker && 'ts' in marker && typeof marker.ts === 'number' ? marker.ts : Number.NaN
      expect(Number.isNaN(ts)).toBe(false)
      const atSince = await resultOf('console', {since: ts})
      const atEntries = Array.isArray(atSince.entries) ? atSince.entries : []
      expect(
        atEntries.some(
          (entry) =>
            typeof entry === 'object' && entry !== null && 'text' in entry && entry.text === 'console-marker-inclusive',
        ),
      ).toBe(true)
      const pastSince = await resultOf('console', {since: ts + 1})
      const pastEntries = Array.isArray(pastSince.entries) ? pastSince.entries : []
      expect(
        pastEntries.some(
          (entry) =>
            typeof entry === 'object' && entry !== null && 'text' in entry && entry.text === 'console-marker-inclusive',
        ),
      ).toBe(false)
    })
  })

  describe('stale refs', () => {
    it('a snapshot ref whose element React removed fails as stale instead of acting on a detached node', async () => {
      const ephemeral = document.createElement('button')
      ephemeral.id = 'ephemeral-btn'
      ephemeral.textContent = 'Ephemeral target'
      container.appendChild(ephemeral)
      const snapshot = await resultOf('snapshot')
      const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
      const entry = nodes.flatMap((node) =>
        typeof node === 'object' && node !== null && 'name' in node && node.name === 'Ephemeral target' ? [node] : [],
      )[0]
      const ref = entry && 'ref' in entry ? String(entry.ref) : ''
      expect(ref).not.toBe('')
      expect(await resultOf('text', {ref})).toEqual({text: 'Ephemeral target'})
      ephemeral.remove()
      expect(await failureOf('text', {ref})).toEqual({
        code: 'invalid-args',
        message: `stale ref ${ref}; re-run page snapshot`,
      })
    })
  })

  describe('refs across snapshots', () => {
    const refOfRole = (snapshot: Record<string, unknown>, role: string): string => {
      const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
      const entry = nodes.find(
        (node) => typeof node === 'object' && node !== null && 'role' in node && node.role === role,
      )
      return entry && typeof entry === 'object' && 'ref' in entry ? String(entry.ref) : ''
    }

    it('a ref from an earlier snapshot fails as stale after the page changed instead of aliasing a new element', async () => {
      const host = document.createElement('div')
      host.id = 'login-host'
      host.innerHTML = `
      <form>
        <div class="MuiFormControl-root MuiTextField-root">
          <label for="login-username">Username *</label>
          <div class="MuiInputBase-root MuiFilledInput-root"><input id="login-username" name="username" type="text" /></div>
        </div>
      </form>
    `
      container.appendChild(host)
      const username = refOfRole(await resultOf('snapshot', {selector: '#login-host'}), 'textbox')
      expect(username).not.toBe('')
      expect(await resultOf('fill', {ref: username, value: 'demo'})).toEqual({ok: true, value: 'demo'})
      host.innerHTML = `
      <nav><a href="#/a">Dashboard</a><a href="#/b">Orders</a><a href="#/c">Invoices</a><a href="#/d">Reviews</a></nav>
    `
      await resultOf('snapshot', {selector: '#login-host'})
      expect(await failureOf('fill', {ref: username, value: 'demo'})).toEqual({
        code: 'invalid-args',
        message: `stale ref ${username}; re-run page snapshot`,
      })
      host.remove()
    })
  })

  describe('page reload', () => {
    const documentOnly = (): never => {
      throw new Error('page_reload must read nothing but the document it was handed')
    }

    const ctxOver = (target: Document): ClientToolCtx => ({
      agentId: 'test-agent',
      document: target,
      target: documentOnly,
      resolve: documentOnly,
      addRef: documentOnly,
      resetRefs: documentOnly,
      consoleEntries: documentOnly,
      effects: [],
    })

    const nextLoad = (frame: HTMLIFrameElement): Promise<void> =>
      new Promise((resolve) => frame.addEventListener('load', () => resolve(), {once: true}))

    it('resolves on initiation and the handed-in page really navigates', async () => {
      const reload = collectClientTools([pageExtension]).find((entry) => entry.name === 'page_reload')
      if (!reload) throw new Error('no page_reload client tool is mounted')
      const frame = document.createElement('iframe')
      frame.srcdoc = '<p id="kept">kept</p>'
      const firstLoad = nextLoad(frame)
      document.body.appendChild(frame)
      await firstLoad
      const framed = frame.contentDocument
      if (!framed) throw new Error('the fixture frame has no document')
      framed.body.appendChild(Object.assign(framed.createElement('span'), {id: 'scribbled'}))
      expect(framed.getElementById('scribbled')).not.toBeNull()

      const reloaded = nextLoad(frame)
      const result = await reload.execute({}, ctxOver(framed))
      expect(declaredOutputOf('reload').parse(result)).toEqual({ok: true, initiated: true})

      await reloaded
      const after = frame.contentDocument
      expect(after?.getElementById('kept')).not.toBeNull()
      expect(after?.getElementById('scribbled')).toBeNull()
      frame.remove()
    }, 10_000)
  })

  describe('screenshot', () => {
    const CapturedShape = z.object({
      image: z.string().min(1),
      width: z.number(),
      height: z.number(),
      warnings: z.array(z.string()).optional(),
    })

    const screenshotOf = async (input: {exclude?: string[]} = {}) => {
      const outcome = await driver.execute({agentId: 'test-agent', name: `${PAGE_TOOL_PREFIX}screenshot`, input})
      if (!outcome.ok) throw new Error(`expected a screenshot, got ${outcome.error.code}: ${outcome.error.message}`)
      return CapturedShape.parse(outcome.result)
    }

    const decoded = async (image: string): Promise<ImageBitmap> => {
      const response = await fetch(`data:image/webp;base64,${image}`)
      return createImageBitmap(await response.blob())
    }

    const centrePixel = (bitmap: ImageBitmap): number[] => {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no 2d context to sample the screenshot')
      context.drawImage(bitmap, 0, 0)
      return Array.from(context.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data)
    }

    const isRed = ([red = 0, green = 0, blue = 0]: number[]): boolean => red > 200 && green < 60 && blue < 60

    const coverViewport = (marker?: string): HTMLElement => {
      const cover = document.createElement('div')
      if (marker) cover.setAttribute(marker, '')
      cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgb(255,0,0)'
      document.body.appendChild(cover)
      onTestFinished(() => cover.remove())
      return cover
    }

    it('captures the visible viewport as a webp the size of the window', async () => {
      const shot = await screenshotOf()
      expect({width: shot.width, height: shot.height}).toEqual({width: window.innerWidth, height: window.innerHeight})
      expect(atob(shot.image).slice(8, 12)).toBe('WEBP')
      const bitmap = await decoded(shot.image)
      expect({width: bitmap.width, height: bitmap.height}).toEqual({width: shot.width, height: shot.height})
    }, 10_000)

    it('leaves the conciv widget host, effects surface and grab toast out of the capture', async () => {
      const plain = coverViewport()
      const covered = centrePixel(await decoded((await screenshotOf()).image))
      plain.remove()
      const widget = coverViewport('data-conciv-root')
      const widgetExcluded = centrePixel(await decoded((await screenshotOf()).image))
      widget.remove()
      const effects = coverViewport('data-conciv-effects')
      const effectsExcluded = centrePixel(await decoded((await screenshotOf()).image))
      effects.remove()
      coverViewport('data-conciv-toast')
      const toastExcluded = centrePixel(await decoded((await screenshotOf()).image))
      expect(isRed(covered)).toBe(true)
      expect({widget: isRed(widgetExcluded), effects: isRed(effectsExcluded), toast: isRed(toastExcluded)}).toEqual({
        widget: false,
        effects: false,
        toast: false,
      })
    }, 10_000)

    it('leaves out host-page elements the caller names and warns about a selector it cannot read', async () => {
      coverViewport('data-host-devtools')
      const shot = await screenshotOf({exclude: ['[data-host-devtools]', '[[not a selector']})
      expect({excluded: !isRed(centrePixel(await decoded(shot.image))), warnings: shot.warnings}).toEqual({
        excluded: true,
        warnings: ['ignored invalid selector: [[not a selector'],
      })
    }, 10_000)
  })

  describe('page_hmr', () => {
    type HotListener = (payload: unknown) => void

    function fakeHot() {
      const listeners = new Map<string, HotListener[]>()
      const hot: HotSurface = {
        on: (event, listener) => {
          listeners.set(event, [...(listeners.get(event) ?? []), listener])
        },
      }
      const fire = (event: string, payload: unknown = {}): void => {
        for (const listener of listeners.get(event) ?? []) listener(payload)
      }
      return {hot, fire}
    }

    it('reports the hmr tool as not applied when no update lands in time', async () => {
      expect(await resultOf('hmr', {timeout: 50})).toMatchObject({applied: false})
    })

    it('reports no hot surface as unsupported', async () => {
      expect(await watchHotUpdates(undefined)(1000)).toEqual({
        supported: false,
        applied: false,
        waitedMs: 0,
        error: null,
      })
    })

    it('gives up with an explanation when no update ever arrives', async () => {
      const {hot} = fakeHot()
      const result = await watchHotUpdates(hot)(60)
      expect(result).toMatchObject({supported: true, applied: false, error: 'the hot update did not land within 60ms'})
      expect(result.waitedMs).toBeGreaterThanOrEqual(50)
    })

    it('reports applied when the wait is called before the update even starts', async () => {
      const {hot, fire} = fakeHot()
      const waited = watchHotUpdates(hot)(500)
      setTimeout(() => fire('vite:beforeUpdate', {type: 'update', updates: []}), 20)
      setTimeout(() => fire('vite:afterUpdate', {type: 'update', updates: []}), 40)
      expect(await waited).toMatchObject({supported: true, applied: true, error: null})
    })

    it('reports applied at once when the update landed just before the call', async () => {
      const {hot, fire} = fakeHot()
      const wait = watchHotUpdates(hot)
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      fire('vite:afterUpdate', {type: 'update', updates: []})
      expect(await wait(500)).toEqual({supported: true, applied: true, waitedMs: 0, error: null})
    })

    it('waits for an update already in flight instead of reporting the one before it', async () => {
      const {hot, fire} = fakeHot()
      const wait = watchHotUpdates(hot)
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      fire('vite:afterUpdate', {type: 'update', updates: []})
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      const waited = wait(500)
      setTimeout(() => fire('vite:afterUpdate', {type: 'update', updates: []}), 40)
      const result = await waited
      expect(result).toMatchObject({supported: true, applied: true, error: null})
      expect(result.waitedMs).toBeGreaterThanOrEqual(30)
    })

    it('resolves once a pending update is applied', async () => {
      const {hot, fire} = fakeHot()
      const wait = watchHotUpdates(hot)
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      const waited = wait(500)
      setTimeout(() => fire('vite:afterUpdate', {type: 'update', updates: []}), 50)
      const result = await waited
      expect(result).toMatchObject({supported: true, applied: true, error: null})
      expect(result.waitedMs).toBeGreaterThanOrEqual(40)
      expect(result.waitedMs).toBeLessThan(400)
    })

    it('reports the error when the pending update fails to build', async () => {
      const {hot, fire} = fakeHot()
      const wait = watchHotUpdates(hot)
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      const waited = wait(500)
      fire('vite:error', {type: 'error', err: {message: 'Unexpected token', stack: ''}})
      expect(await waited).toMatchObject({supported: true, applied: false, error: 'Unexpected token'})
    })

    it('gives up with an explanation when the pending update never lands', async () => {
      const {hot, fire} = fakeHot()
      const wait = watchHotUpdates(hot)
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      const result = await wait(60)
      expect(result).toMatchObject({
        supported: true,
        applied: false,
        error: 'the hot update did not land within 60ms',
      })
      expect(result.waitedMs).toBeGreaterThanOrEqual(50)
    })
  })
})

describe('a capture in every engine', () => {
  const mountProbe = async (layout: string, fill: (box: HTMLElement) => void): Promise<void> => {
    const face = CHAT_FONTS.find((candidate) => candidate.family === 'Archivo' && candidate.weight === 600)
    if (!face) throw new Error('no Archivo 600 face to load')
    const fontRule = document.createElement('style')
    fontRule.textContent = `@font-face{font-family:'Capture Probe';font-weight:600;src:url(${face.src}) format('woff2')}`
    document.head.append(fontRule)
    await document.fonts.load('600 14px "Capture Probe"')
    const box = document.createElement('nav')
    box.style.cssText = `position:fixed;top:0;left:0;z-index:2147483647;width:100vw;height:72px;box-sizing:border-box;padding:16px;background:#fff;color:#000;font:600 14px/20px "Capture Probe";${layout}`
    fill(box)
    document.body.appendChild(box)
    onTestFinished(() => {
      box.remove()
      fontRule.remove()
    })
  }

  const capturedLines = async (): Promise<{firstLine: boolean; secondLine: boolean}> => {
    const driver = makeDomPageDriver({tools: collectClientTools([pageExtension])})
    onTestFinished(() => driver.dispose())
    const outcome = await driver.execute({agentId: 'test-agent', name: `${PAGE_TOOL_PREFIX}screenshot`, input: {}})
    if (!outcome.ok) throw new Error(`expected a screenshot, got ${outcome.error.code}: ${outcome.error.message}`)
    const {image} = z.object({image: z.string().min(1)}).parse(outcome.result)
    const response = await fetch(`data:image/webp;base64,${image}`)
    const bitmap = await createImageBitmap(await response.blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no 2d context to sample the screenshot')
    context.drawImage(bitmap, 0, 0)
    const inked = (top: number, bottom: number): boolean =>
      context.getImageData(0, top, 300, bottom - top).data.some((value, index) => index % 4 === 0 && value < 128)
    return {firstLine: inked(16, 36), secondLine: inked(38, 70)}
  }

  it('keeps link text that sits on one line on one line in the capture', async () => {
    await mountProbe('display:flex;flex-wrap:wrap;align-items:flex-start;overflow-wrap:anywhere', (box) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;flex-wrap:nowrap;column-gap:16px'
      for (const label of ['Home', 'About', 'Form', 'Docs']) {
        const link = document.createElement('a')
        link.href = '#'
        link.textContent = label
        link.style.cssText = 'display:inline-flex;align-items:center;color:inherit;text-decoration:none'
        row.append(link)
      }
      box.append(row)
    })
    expect(await capturedLines()).toEqual({firstLine: true, secondLine: false})
  }, 10_000)

  it('keeps a wrapping paragraph inside a nowrap container wrapped in the capture', async () => {
    await mountProbe('white-space:nowrap', (box) => {
      const paragraph = document.createElement('p')
      paragraph.textContent = 'Wraps here'
      paragraph.style.cssText = 'margin:0;width:60px;white-space:normal'
      box.append(paragraph)
    })
    expect(await capturedLines()).toEqual({firstLine: true, secondLine: true})
  }, 10_000)
})
