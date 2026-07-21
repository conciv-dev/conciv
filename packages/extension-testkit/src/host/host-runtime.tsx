import {createSignal, For, Show, type JSX} from 'solid-js'
import {Dynamic, render} from 'solid-js/web'
import {z} from 'zod'
import {makeRpcClient} from '@conciv/contract'
import {collectAttachmentCards, HostApiProvider, type AnyExtension} from '@conciv/extension'
import {MountedExtension, MountedSurface} from '@conciv/extension/client'
import {AttachmentByMime, AttachmentProvider, createDocumentAttachmentAdapter} from '@conciv/ui-kit-chat'
import {Dialog, Popover} from '@conciv/ui-kit-system'
import {makeHostGrab} from './grab.js'
import {FixtureElement} from './fixture-element.js'

const attachDetail = z.object({name: z.string(), type: z.string(), text: z.string()})

// oxlint-disable-next-line conciv/no-comments -- TODO(host-views): hand-rolled tabs diverge from the real app's panel view mounting; rethink
function MountedViews(props: {extension: AnyExtension; clientValue: object}): JSX.Element {
  const views = () => props.extension.views ?? []
  const [active, setActive] = createSignal<string | null>(null)
  const activeView = () => views().find((view) => view.id === active())
  return (
    <Show when={views().length > 0}>
      <div role="tablist" aria-label="Extension views">
        <For each={views()}>
          {(view) => (
            <button type="button" role="tab" aria-selected={active() === view.id} onClick={() => setActive(view.id)}>
              {view.label}
            </button>
          )}
        </For>
      </div>
      <Show keyed when={activeView()}>
        {(view) => (
          <HostApiProvider value={props.clientValue}>
            <div
              style={{display: 'flex', 'flex-direction': 'column', width: '800px', height: '480px', overflow: 'hidden'}}
            >
              <Dynamic component={view.Component} />
            </div>
          </HostApiProvider>
        )}
      </Show>
    </Show>
  )
}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function AttachFixtureForm(props: {attach: (file: File) => void}): JSX.Element {
  const [name, setName] = createSignal('')
  const [type, setType] = createSignal('')
  const [text, setText] = createSignal('')
  return (
    <div>
      <label>
        Attachment name
        <input value={name()} onInput={(event) => setName(event.currentTarget.value)} />
      </label>
      <label>
        Attachment type
        <input value={type()} onInput={(event) => setType(event.currentTarget.value)} />
      </label>
      <label>
        Attachment text
        <input value={text()} onInput={(event) => setText(event.currentTarget.value)} />
      </label>
      <button type="button" onClick={() => props.attach(new File([text()], name(), {type: type()}))}>
        Attach fixture file
      </button>
    </div>
  )
}

function showToast(message: string): void {
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.textContent = message
  document.body.appendChild(el)
}

function showAttachment(file: File): void {
  void file.text().then((content) => {
    const el = document.createElement('div')
    el.setAttribute('role', 'note')
    el.setAttribute('aria-label', `Attachment ${file.name}`)
    el.textContent = content
    document.body.appendChild(el)
  })
}

function installStorageFixtures(): void {
  const slimScript = document.createElement('script')
  slimScript.type = 'text/plain'
  slimScript.textContent = `/* FIXTURE_SCRIPT_BODY ${'x'.repeat(10_000)} */`
  document.head.appendChild(slimScript)
  const fontStyle = document.createElement('style')
  fontStyle.setAttribute('data-conciv-fonts', '')
  fontStyle.textContent = `/* CONCIV_FONT_FIXTURE ${'y'.repeat(600_000)} */`
  document.head.appendChild(fontStyle)
}

export function startHost(extension: AnyExtension): void {
  installStorageFixtures()
  const apiBase = metaContent('conciv-api-base')
  const session = metaContent('conciv-session')
  const rpc = makeRpcClient(apiBase)
  const clientValue = extension.__client?.()?.value ?? {}
  const cards = collectAttachmentCards([extension])
  const showCardAttachment = (file: File): void => {
    const adapter = createDocumentAttachmentAdapter(file.type)
    void Promise.resolve(adapter.add({file})).then((pending) => {
      if (Symbol.asyncIterator in pending) return
      const el = document.createElement('div')
      el.setAttribute('data-testkit-attachment', file.name)
      el.setAttribute('data-conciv-root', '')
      document.body.appendChild(el)
      render(
        () => (
          <HostApiProvider rpc={rpc} apiBase={apiBase} toast={showToast} dialog={Dialog} popover={Popover}>
            <AttachmentProvider value={pending}>
              <AttachmentByMime cards={cards} />
            </AttachmentProvider>
          </HostApiProvider>
        ),
        el,
      )
    })
  }
  const attachFile = (file: File): void =>
    cards.some((entry) => entry.mime === file.type) ? showCardAttachment(file) : showAttachment(file)
  document.addEventListener('testkit:attach', (event) => {
    if (!(event instanceof CustomEvent)) return
    const parsed = attachDetail.safeParse(event.detail)
    if (!parsed.success) return
    attachFile(new File([parsed.data.text], parsed.data.name, {type: parsed.data.type}))
  })
  const mountRoot = document.createElement('div')
  mountRoot.setAttribute('data-conciv-root', '')
  document.body.appendChild(mountRoot)
  render(
    () => (
      <HostApiProvider
        rpc={rpc}
        apiBase={apiBase}
        toast={showToast}
        openEditor={(file, line) => void rpc.editor.open({file, line}).catch(() => {})}
        registerLayer={() => () => {}}
        dialog={Dialog}
        popover={Popover}
        sessionId={() => (session ? session : null)}
        grab={makeHostGrab(document)}
        insert={() => {}}
        attach={attachFile}
        newSession={() => {}}
        viewLock={() => {}}
        viewLeave={() => {}}
      >
        <MountedExtension extension={extension} clientValue={clientValue} slot="composer" />
        <MountedSurface extension={extension} clientValue={clientValue} />
        <MountedViews extension={extension} clientValue={clientValue} />
        <AttachFixtureForm attach={attachFile} />
      </HostApiProvider>
    ),
    mountRoot,
  )
  const fixtureRoot = document.createElement('div')
  document.body.appendChild(fixtureRoot)
  render(() => <FixtureElement />, fixtureRoot)
}
