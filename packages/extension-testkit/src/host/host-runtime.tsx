import {render} from 'solid-js/web'
import {makeRpcClient} from '@conciv/contract'
import {HostApiProvider, type AnyExtension} from '@conciv/extension'
import {MountedExtension, MountedSurface} from '@conciv/extension/client'
import {Dialog, Popover} from '@conciv/ui-kit-system'
import {makeHostGrab} from './grab.js'
import {FixtureElement} from './fixture-element.js'

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function showToast(message: string): void {
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.textContent = message
  document.body.appendChild(el)
}

export function startHost(extension: AnyExtension): void {
  const apiBase = metaContent('conciv-api-base')
  const session = metaContent('conciv-session')
  const rpc = makeRpcClient(apiBase)
  const clientValue = extension.__client?.()?.value ?? {}
  const mountRoot = document.createElement('div')
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
        newSession={() => {}}
        viewLock={() => {}}
        viewLeave={() => {}}
      >
        <MountedExtension extension={extension} clientValue={clientValue} slot="composer" />
        <MountedSurface extension={extension} clientValue={clientValue} />
      </HostApiProvider>
    ),
    mountRoot,
  )
  const fixtureRoot = document.createElement('div')
  document.body.appendChild(fixtureRoot)
  render(() => <FixtureElement />, fixtureRoot)
}
