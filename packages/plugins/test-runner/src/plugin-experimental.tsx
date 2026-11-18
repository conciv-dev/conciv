import {onCleanup} from 'solid-js'
import {createStore, reconcile, unwrap} from 'solid-js/store'
import {
  createKeyed,
  Panel,
  Plugin,
  type PanelTab,
  type SessionRef,
  type SessionScreen,
} from '@conciv/plugin/experimental'
import type {TestError} from './shared/events.js'
import {initialRunState, transitionRun, type RunAction} from './panel/run-state.js'
import {followTestRun} from './panel/follow-run.js'
import {TestsPanel} from './panel/tests-panel.js'
import {fixPrompt, relativePath} from './view.js'

export default Plugin.define({
  setup(ctx) {
    const tab: PanelTab = {
      id: 'tests',
      title: 'Tests',
      pinned: true,
      label: () => (
        <>
          <ctx.ui.Icon name="flask-conical" size="small" />
          Tests
        </>
      ),
    }
    const [run, setRun] = createStore(initialRunState)
    const dispatch = (action: RunAction) => setRun(reconcile(transitionRun(unwrap(run), action), {key: 'id'}))

    createKeyed(
      () => ctx.client,
      (client) => {
        const controller = new AbortController()
        onCleanup(() => controller.abort())
        void followTestRun(client, controller.signal, dispatch)
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
      screen.composer.insert(fixPrompt(error, relativePath(error.file, directory)))
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
