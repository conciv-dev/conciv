import {createConciv, mountConciv, type ConcivHandle} from '@conciv/embed'

function found<Kind extends Element>(selector: string, kind: {new (): Kind; prototype: Kind}): Kind {
  const match = document.querySelector(selector)
  if (!(match instanceof kind)) throw new Error(`the page has no ${selector}`)
  return match
}

const address = found('input[name="address"]', HTMLInputElement)
const token = found('input[name="token"]', HTMLInputElement)
const status = found('[role="status"]', HTMLElement)
const widget = found('#widget', HTMLElement)

const tokens: {sent?: string; asks: ((value: string) => void)[]} = {asks: []}
const created: {handle?: ConcivHandle} = {}

function say(text: string): void {
  status.textContent = text
}

function failed(error: unknown): void {
  say(`Failed: ${error instanceof Error ? error.message : String(error)}`)
}

function engineToken(): Promise<string> {
  if (tokens.sent !== undefined) return Promise.resolve(tokens.sent)
  say('The widget asks for a token')
  const asked = Promise.withResolvers<string>()
  tokens.asks.push(asked.resolve)
  return asked.promise
}

function handle(): ConcivHandle {
  created.handle ??= createConciv({apiBase: address.value, engineToken})
  return created.handle
}

function sendToken(): void {
  tokens.sent = token.value
  for (const answer of tokens.asks.splice(0)) answer(token.value)
  say('Token sent')
}

function rebind(): void {
  tokens.sent = undefined
  void handle()
    .rebind(address.value)
    .then(() => say('Rebound'), failed)
}

const actions: Record<string, () => void> = {
  mount: () =>
    void handle()
      .mount(widget)
      .then(() => say('Mounted'), failed),
  'send-token': sendToken,
  open: () => handle().open(),
  close: () => handle().close(),
  toggle: () => handle().toggle(),
  rebind,
  unmount: () => {
    handle().unmount()
    say('Unmounted')
  },
  script: () =>
    void mountConciv()
      .then(() => mountConciv())
      .then(() => say('Mounted the script widget twice'), failed),
}

for (const [name, action] of Object.entries(actions)) {
  found(`button[name="${name}"]`, HTMLButtonElement).addEventListener('click', action)
}
