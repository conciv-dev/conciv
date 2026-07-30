import {For, Match, Show, Switch, splitProps, type JSX} from 'solid-js'
import {Button, Dialog} from '@conciv/ui-kit-system'
import type {LiveSession} from '@conciv/contract'

export type PickingStep = {step: 'picking'; candidates: LiveSession[]}
export type ConnectedStep = {step: 'connected'; reloadCommand: string}
export type SnippetStep = {step: 'snippet'; command: string; detail: string}

export type ConnectStep = PickingStep | ConnectedStep | SnippetStep

const ROW =
  'flex flex-col gap-0.5 items-start w-full text-left py-2 px-2.5 rounded-pw-md [border:none] bg-transparent text-pw-text cursor-pointer trans-color-bg hover:bg-pw-fill-strong'
const CODE = 'font-mono text-xs text-pw-text bg-pw-fill rounded-pw-sm py-1.5 px-2 break-all'

function statusHint(session: LiveSession): string {
  if (session.status === 'busy') return 'Working now. Let the current turn finish first.'
  if (session.status === 'shell') return 'In a shell. Exit the ! shell first.'
  return 'Idle and ready.'
}

function cwdHint(session: LiveSession): string {
  if (session.relation === 'ancestor') return `Started higher up, in ${session.cwd}.`
  if (session.relation === 'descendant') return `Started in a subfolder, ${session.cwd}.`
  return session.cwd
}

const picking = (state: ConnectStep): PickingStep | undefined => (state.step === 'picking' ? state : undefined)
const connected = (state: ConnectStep): ConnectedStep | undefined => (state.step === 'connected' ? state : undefined)
const snippet = (state: ConnectStep): SnippetStep | undefined => (state.step === 'snippet' ? state : undefined)

export function ConnectSessionDialog(props: {
  state: ConnectStep | null
  onPick: (session: LiveSession) => void
  onCopy: (text: string) => void
  onClose: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['state', 'onPick', 'onCopy', 'onClose'])
  return (
    <Dialog open={local.state !== null} onOpenChange={() => local.onClose()} label="Connect a running session">
      <Show when={local.state}>
        {(state) => (
          <div class="flex flex-col gap-3">
            <Switch>
              <Match when={picking(state())}>
                {(value) => (
                  <>
                    <p class="text-pw-text-3 text-xs leading-normal">
                      Pick the terminal session you want this panel to follow.
                    </p>
                    <Show
                      when={value().candidates.length > 0}
                      fallback={<p class="text-pw-text text-sm">No claude session is running in this project.</p>}
                    >
                      <ul class="flex flex-col gap-1 list-none m-0 p-0">
                        <For each={value().candidates}>
                          {(session) => (
                            <li>
                              <button type="button" class={ROW} onClick={() => local.onPick(session)}>
                                <span class="text-sm font-semibold">{session.name}</span>
                                <span class="text-pw-text-3 text-xs">{statusHint(session)}</span>
                                <span class="text-pw-text-3 text-xs">{cwdHint(session)}</span>
                              </button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </>
                )}
              </Match>
              <Match when={connected(state())}>
                {(value) => (
                  <>
                    <p class="text-pw-text text-sm leading-normal">
                      Run this in that terminal, then keep talking in either place.
                    </p>
                    <code class={CODE}>{value().reloadCommand}</code>
                    <p class="text-pw-text-3 text-xs leading-normal">
                      Your next message re-reads the whole conversation, so the first reply costs more than usual.
                    </p>
                    <div class="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => local.onCopy(value().reloadCommand)}>
                        Copy command
                      </Button>
                      <Button size="sm" onClick={() => local.onClose()}>
                        Done
                      </Button>
                    </div>
                  </>
                )}
              </Match>
              <Match when={snippet(state())}>
                {(value) => (
                  <>
                    <p class="text-pw-text text-sm leading-normal">{value().detail}</p>
                    <p class="text-pw-text-3 text-xs leading-normal">
                      Quit that session and start it again with this command instead.
                    </p>
                    <code class={CODE}>{value().command}</code>
                    <div class="flex justify-end gap-2">
                      <Button size="sm" onClick={() => local.onCopy(value().command)}>
                        Copy command
                      </Button>
                    </div>
                  </>
                )}
              </Match>
            </Switch>
          </div>
        )}
      </Show>
    </Dialog>
  )
}
