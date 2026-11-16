import {onCleanup} from 'solid-js'
import {createStore, reconcile, unwrap} from 'solid-js/store'
import {
  createKeyed,
  Panel,
  Plugin,
  type Context,
  type PanelTab,
  type SessionRef,
  type SessionScreen,
} from '@conciv/plugin/experimental'
import {TestRunner} from './rpc.js'
import {TestEventSchema, type TestError} from './shared/events.js'
import {initialRunState, transitionRun, type RunAction} from './panel/run-state.js'
import {fixPrompt, TestsPanel} from './panel/tests-panel.js'

type Client = Context['client']

export default Plugin.define({
  setup(ctx) {
    const tab: PanelTab = {
      id: 'tests',
      title: 'Tests',
      pinned: true,
      label: () => (
        <span class="inline-flex gap-1.5 items-center">
          <ctx.ui.Icon name="flask-conical" size="small" />
          Tests
        </span>
      ),
    }
    const [run, setRun] = createStore(initialRunState)
    const dispatch = (action: RunAction) => setRun(reconcile(transitionRun(unwrap(run), action), {key: 'id'}))

    const load = async (client: Client, signal: AbortSignal) => {
      try {
        const runner = client.rpc(TestRunner)
        const result = await runner.status(undefined, {signal})
        if (!signal.aborted) dispatch({type: 'status', result})
        const current = await runner.current(undefined, {signal})
        if (!signal.aborted) dispatch({type: 'current', ...current})
      } catch (error) {
        if (!signal.aborted) console.error('[test-runner] the test run could not be read', error)
      }
    }

    const follow = async (client: Client, signal: AbortSignal) => {
      try {
        for await (const event of client.event.subscribe({types: ['rpc.test-runner.event'], signal})) {
          if (event.type === 'server.connected') {
            dispatch({type: 'connected'})
            void load(client, signal)
            continue
          }
          const parsed = TestEventSchema.safeParse(event.data)
          if (parsed.success) dispatch(parsed.data)
          else console.error('[test-runner] a live test event did not match its schema', parsed.error)
        }
      } catch (error) {
        if (!signal.aborted) console.error('[test-runner] the live test events stopped', error)
      }
    }

    createKeyed(
      () => ctx.client,
      (client) => {
        const controller = new AbortController()
        onCleanup(() => controller.abort())
        void follow(client, controller.signal)
      },
    )

    const openFailure = (error: TestError) => {
      const desktop = ctx.desktop
      if (!desktop) return
      const position = error.line === undefined ? undefined : {line: error.line}
      desktop.launch(error.file, position).catch((cause: unknown) => {
        console.error('[test-runner] the failing test did not open', cause)
        ctx.toast.show({title: 'The test file could not open in your editor', variant: 'error'})
      })
    }

    const fixFailure = (error: TestError, screen: SessionScreen, session: SessionRef, directory: string) => {
      screen.composer.insert(fixPrompt(error, directory))
      ctx.layout.hide(`${ctx.id}:${tab.id}`, session)
    }

    ctx.add(Panel, {
      id: 'tests',
      region: 'pane',
      list: () => [tab],
      render: (props) => (
        <TestsPanel
          ui={ctx.ui}
          run={run}
          directory={props.session.directory}
          canOpen={ctx.desktop !== undefined}
          onOpen={openFailure}
          onFix={(error) => fixFailure(error, props.screen, props.session, props.session.directory)}
        />
      ),
    })
  },
})
