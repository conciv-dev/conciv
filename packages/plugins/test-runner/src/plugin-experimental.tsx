import {Panel, Plugin, type PanelTab, type SessionRef, type SessionScreen} from '@conciv/plugin/experimental'
import type {TestError} from './events.js'
import {followRunView} from './follow.js'
import {TestsPanel} from './tests-panel.js'
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
      render: (props) => {
        const run = followRunView(ctx.client)
        return (
          <TestsPanel
            ui={ctx.ui}
            run={run()}
            directory={props.session.directory}
            canOpen={ctx.desktop !== undefined}
            onOpen={openFailure}
            onFix={(error) => fixFailure(error, props.screen, props.session, props.session.directory)}
          />
        )
      },
    })
  },
})
