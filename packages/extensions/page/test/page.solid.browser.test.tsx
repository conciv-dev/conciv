import {expect, it, onTestFinished, test, describe} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {GRAB_FILE_NAME, GRAB_MIME} from '@conciv/grab/grab-attachment'
import {GrabCard} from '../src/client/cards/grab-card.js'
import {mountAttachment} from './fixtures/attachment-harness.js'
import {GrabSnapshotFrame} from '../src/client/cards/grab-snapshot-frame.js'
import {collectClientTools} from '@conciv/extension'
import {startPagePlane} from '@conciv/page'
import type {PageOutcome} from '@conciv/protocol/page-types'
import pageExtension from '../src/client.js'
import {endTask, mountSimulator} from '../src/client/simulator.js'

describe('grab card', () => {
  const PAYLOAD = JSON.stringify({
    text: '<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9',
    snippet: '<h1 class="title">Start simple</h1>',
    source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
    rect: {x: 0, y: 0, width: 320, height: 48},
    preview: {kind: 'dom', html: '<h1>Start simple</h1>', width: 320, height: 48},
  })

  function mount(payload: string = PAYLOAD) {
    return render(() => mountAttachment(new File([payload], GRAB_FILE_NAME, {type: GRAB_MIME}), () => <GrabCard />))
  }

  test('the card shows the snapshot and its source label', async () => {
    mount()

    await expect.element(page.getByTitle('Grabbed element snapshot')).toBeVisible()
    await expect.element(page.getByText('Hero at src/routes/index.tsx:12', {exact: false})).toBeVisible()
  })

  test('clicking the card opens a dialog that can reveal the agent text', async () => {
    mount()

    await userEvent.click(page.getByRole('button', {name: 'Open grabbed element'}))
    await expect.element(page.getByRole('dialog', {name: 'Grabbed element'})).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: 'What the agent sees'}))

    await expect
      .element(page.getByText('<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9'))
      .toBeVisible()
  })

  test('a payload with no preview falls back to the agent text', async () => {
    mount(JSON.stringify({text: 'grabbed thing at a.tsx:1:1', source: null, rect: null, preview: null}))

    await expect.element(page.getByText('grabbed thing at a.tsx:1:1')).toBeVisible()
  })

  test('an unreadable payload reports that the grab could not be read', async () => {
    mount('not a grab payload at all')

    await expect.element(page.getByRole('status')).toHaveTextContent('Grabbed element could not be read')
  })

  test('an image preview renders as the snapshot image', async () => {
    mount(
      JSON.stringify({
        text: 'grabbed thing at a.tsx:1:1',
        source: null,
        rect: null,
        preview: {
          kind: 'image',
          dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
          width: 40,
          height: 20,
        },
      }),
    )

    await expect.element(page.getByRole('img', {name: 'Grabbed element snapshot'})).toBeVisible()
  })
})

describe('grab snapshot frame', () => {
  function hostileMarkup(marker: string): string {
    return `<img src="x" onerror="window.parent.document.body.insertAdjacentHTML('beforeend', '<p>${marker}</p>')">`
  }

  test('the snapshot frame renders the markup in its own document', async () => {
    render(() => (
      <GrabSnapshotFrame html="<p>Payroll Deposit clone</p>" width={200} height={40} class="max-w-full block" />
    ))

    await expect.element(page.getByTitle('Grabbed element snapshot')).toBeVisible()
  })

  test('inline handlers in captured markup never run inside the widget', async () => {
    render(() => (
      <>
        <iframe title="Unsandboxed control" srcdoc={hostileMarkup('control escaped')} />
        <GrabSnapshotFrame html={hostileMarkup('snapshot escaped')} width={200} height={40} class="max-w-full block" />
      </>
    ))

    await expect.element(page.getByText('control escaped')).toBeVisible()
    await expect.element(page.getByText('snapshot escaped')).not.toBeInTheDocument()
  })
})

describe('page action queue', () => {
  const AGENT = 'queue-session'
  const FIELDS = ['first', 'last', 'email', 'phone', 'city', 'zip']

  type Frame = {requestId: string; query: unknown}

  async function* streamed(frames: Frame[], wake: {now: () => void}, signal: AbortSignal): AsyncGenerator<Frame> {
    while (!signal.aborted) {
      const frame = frames.shift()
      if (frame !== undefined) {
        yield frame
        continue
      }
      await new Promise<void>((resolve) => {
        wake.now = resolve
        signal.addEventListener('abort', () => resolve(), {once: true})
      })
    }
  }

  function QueueForm(props: {heard: (event: string) => void; drafting: () => void}) {
    const field = (name: string) => (
      <label>
        {name}
        <input name={name} onInput={() => props.heard(name)} />
      </label>
    )
    return (
      <form onSubmit={(event) => event.preventDefault()}>
        {FIELDS.map(field)}
        <label>
          card
          <input name="card" autocomplete="cc-number" onInput={() => props.heard('card')} />
        </label>
        <label>
          locked
          <input name="locked" readOnly value="fixed" />
        </label>
        <label>
          <input type="checkbox" name="agree" onChange={() => props.heard('agree')} />
          agree
        </label>
        <button type="button" onKeyDown={(event) => props.heard(`key ${event.key}`)}>
          Send
        </button>
        <div id="notes" contenteditable="true" role="textbox" aria-label="Notes">
          <p id="notes-line">old note</p>
        </div>
        <div
          contenteditable="true"
          role="textbox"
          aria-label="Draft"
          onBeforeInput={(event) => {
            if (event.isTrusted) return
            event.preventDefault()
            props.drafting()
          }}
        >
          <p id="draft-line">old draft</p>
        </div>
      </form>
    )
  }

  function queuePage(
    delivered: (requestId: string) => Promise<void> = () => Promise.resolve(),
    drafting: () => void = () => {},
  ) {
    const heard: string[] = []
    render(() => <QueueForm heard={(event) => heard.push(event)} drafting={drafting} />)
    const host = document.createElement('div')
    host.setAttribute('data-conciv-root', '')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const unmount = mountSimulator({root: host.attachShadow({mode: 'open'}), session: () => AGENT, onStop: endTask})
    onTestFinished(unmount)
    onTestFinished(endTask)
    const replied: string[] = []
    const replies = new Map<string, PromiseWithResolvers<PageOutcome>>()
    const replyTo = (requestId: string): PromiseWithResolvers<PageOutcome> => {
      const known = replies.get(requestId)
      if (known !== undefined) return known
      const made = Promise.withResolvers<PageOutcome>()
      replies.set(requestId, made)
      return made
    }
    const served = () => {
      const frames: Frame[] = []
      const wake = {now: () => {}}
      const plane = startPagePlane({
        source: {
          queries: (signal) => streamed(frames, wake, signal ?? new AbortController().signal),
          reply: async ({requestId, outcome}) => {
            await delivered(requestId)
            replied.push(requestId)
            replyTo(requestId).resolve(outcome)
          },
        },
        tools: collectClientTools([pageExtension]),
      })
      onTestFinished(plane.dispose)
      const send = (requestId: string, query: Record<string, unknown>): Promise<PageOutcome> => {
        frames.push({requestId, query: {agentId: AGENT, ...query}})
        wake.now()
        return replyTo(requestId).promise
      }
      const queue = (id: string, actions: Record<string, unknown>[]) => {
        const ids = actions.map((_, index) => `${id}-${index}`)
        const accepted = send(`${id}-accept`, {name: 'page_queue', input: {actions}, queue: {id, replies: ids}})
        return {
          accepted,
          each: ids.map((requestId) => replyTo(requestId).promise),
          played: Promise.all(ids.map((requestId) => replyTo(requestId).promise)),
        }
      }
      return {send, queue, dispose: plane.dispose}
    }
    const first = served()
    const leave = () => {
      first.dispose()
      unmount()
    }
    const switchSession = () => {
      first.dispose()
      return served()
    }
    return {heard, replied, send: first.send, queue: first.queue, leave, switchSession}
  }

  const fill = (name: string, value: string) => ({tool: 'page_fill', selector: `[name=${name}]`, value})

  it("a queue cut off by an unmount does not keep a later mount's mask up", async () => {
    const before = queuePage()
    const cut = before.queue('q-cut', [fill('first', 'Ada'), fill('last', 'Lovelace'), fill('email', 'a@b.c')])
    await cut.accepted
    before.leave()
    const after = queuePage()
    await after.queue('q-next', [fill('city', 'Paris')]).played
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
    expect(before.heard).toEqual(['city'])
  })

  it('a session switch mid-queue lands nothing more of the old queue, reports none of it, and takes the mask down', async () => {
    const before = queuePage()
    const cut = before.queue('q-switched', [fill('first', 'Ada'), fill('last', 'Lovelace')])
    await cut.accepted
    const after = before.switchSession()
    expect(await after.queue('q-other', [fill('city', 'Paris')]).played).toEqual([
      {ok: true, result: {ok: true, value: 'Paris'}},
    ])
    expect(before.heard).toEqual(['city'])
    expect(before.replied).toEqual(['q-switched-accept', 'q-other-accept', 'q-other-0'])
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
  })

  it('a queue whose acceptance never reached the engine plays nothing and takes the mask down', async () => {
    const {heard, queue} = queuePage(async (requestId) => {
      if (requestId === 'q-unsent-accept') throw new Error(`the socket closed before ${requestId} was sent`)
    })
    const outcomes = await queue('q-unsent', [fill('first', 'Ada'), fill('last', 'Byron')]).played
    expect(outcomes).toMatchObject([
      {ok: false, error: {message: expect.stringContaining('did not run')}},
      {ok: false, error: {message: expect.stringContaining('did not run')}},
    ])
    expect(heard).toEqual([])
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
  })

  it('a session switch while a queued fill waits on the editor does not fall back to typing into it', async () => {
    const switched = Promise.withResolvers<ReturnType<typeof before.switchSession>>()
    const before = queuePage(undefined, () => switched.resolve(before.switchSession()))
    const cut = before.queue('q-draft', [{tool: 'page_fill', selector: '#draft-line', value: 'Hello draft'}])
    await cut.accepted
    const after = await switched.promise
    await after.queue('q-after', [fill('city', 'Paris')]).played
    await expect.element(page.getByRole('textbox', {name: 'Draft'})).toMatchTextContent(/^\s*old draft\s*$/)
    expect(before.replied).toEqual(['q-draft-accept', 'q-after-accept', 'q-after-0'])
  })

  it('a single act call sent while a queue plays lands after the last queued action', async () => {
    const {heard, queue, send} = queuePage()
    const played = queue('q-before', [fill('first', 'Ada'), fill('last', 'Byron'), fill('email', 'ada@example.com')])
    const single = send('single', {name: 'page_fill', input: {selector: '[name=phone]', value: '555'}, mutating: true})
    expect(await single).toMatchObject({ok: true})
    await played.played
    expect(heard).toEqual(['first', 'last', 'email', 'phone'])
  })
})
