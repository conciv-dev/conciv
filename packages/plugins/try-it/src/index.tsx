import {Effect, Fiber} from 'effect'
import {from} from 'solid-js'
import {Plugin, Server, type ServerEntry} from '@conciv/plugin/experimental'
import {connectPorts} from '@conciv/protocol/connect-ports'
import {connect, type ConnectState} from './connect/connect-model.js'
import {ConnectPane} from './connect/connect-pane.js'
import {TryItOptions} from './connect/options.js'

export default Plugin.define({
  setup(ctx) {
    const options = TryItOptions.parse(ctx.options)

    const state = from<ConnectState>((report) => {
      const fiber = Effect.runFork(connect({token: options.token, ports: connectPorts(), timings: options, report}))

      return () => void Effect.runFork(Fiber.interrupt(fiber))
    })

    const entry = (current: ConnectState | undefined): ServerEntry => ({
      id: 'core',
      name: 'conciv',
      state: current?.phase === 'connected' ? 'ready' : 'starting',
      ...(current?.phase === 'connected' ? {http: {url: current.base}} : {}),
      cover: () => <ConnectPane token={options.token} state={state} />,
    })

    ctx.add(Server, () => ({ready: state() !== undefined, order: 0, entries: [entry(state())]}))
  },
})
