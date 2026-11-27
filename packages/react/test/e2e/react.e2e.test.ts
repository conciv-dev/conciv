import {describe, expect} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {createContext, createElement, useContext} from 'react'
import {createRoot} from 'react-dom/client'
import {createStore} from 'solid-js/store'
import {Panel, ToolRegistry, type PanelProps, type Plugin, type ToolProps} from '@conciv/frontend-plugin-api'
import type {Entry} from '@conciv/frontend-plugin-api/host'
import {test, TestLLM} from '@conciv/backend-test-utils'
import {ConcivWidget, reactRender} from '../../src/react.js'

describe('a React app draws plugin UI in React', () => {
  const Team = createContext('nobody')

  function teamNotes(): Entry {
    const [notes, setNotes] = createStore({title: 'Notes', open: true})
    function NotesPanel(props: PanelProps) {
      const team = useContext(Team)
      return createElement(
        'section',
        {'aria-label': 'Team notes'},
        createElement('p', null, `${team} reads ${props.tab.title}`),
        createElement('button', {type: 'button', onClick: () => setNotes('title', 'Release notes')}, 'Rename'),
        createElement('button', {type: 'button', onClick: () => setNotes('open', false)}, 'Done'),
      )
    }
    function CodeCard(props: ToolProps) {
      const team = useContext(Team)
      return createElement('p', null, `${team} card for ${props.tool}`)
    }
    const setup: Plugin.Setup = (ctx) => {
      ctx.add(Panel, {
        id: 'notes',
        region: 'pane',
        list: () => (notes.open ? [{id: 'notes', title: notes.title, pinned: true}] : []),
        render: reactRender(NotesPanel),
      })
      ctx.add(ToolRegistry, {name: 'execute_typescript', render: reactRender(CodeCard)})
    }
    return {id: 'team-notes', windowEntry: async () => ({default: setup})}
  }

  test('a React panel reads the app’s context and follows its tab as it changes and goes, a React tool card draws a call, and the UI leaves with the widget', async ({
    createEngine,
  }) => {
    const engine = await createEngine()
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    const token = () => Promise.resolve(engine.address.token)
    const plugins = [[teamNotes(), {}] as const]
    root.render(
      createElement(
        Team.Provider,
        {value: 'Platform'},
        createElement(ConcivWidget, {apiBase: engine.address.apiBase, engineToken: token, plugins}),
      ),
    )

    await userEvent.click(page.getByRole('button', {name: 'Open conciv chat'}))
    await userEvent.click(page.getByRole('tab', {name: 'Notes'}))
    await expect.element(page.getByText('Platform reads Notes')).toBeVisible()
    await userEvent.click(page.getByRole('button', {name: 'Rename'}))
    await expect.element(page.getByText('Platform reads Release notes')).toBeVisible()
    await expect.element(page.getByRole('tab', {name: 'Release notes'})).toBeVisible()

    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {typescriptCode: 'return 1'}),
      TestLLM.text('Ran it'),
    )
    await userEvent.click(page.getByRole('tab', {name: 'Chat'}))
    await userEvent.fill(page.getByRole('textbox', {name: 'Message the conciv agent'}), 'Run it')
    await userEvent.click(page.getByRole('button', {name: 'Send message'}))
    await expect.element(page.getByText('Ran it')).toBeVisible()
    await expect.element(page.getByText('Platform card for execute_typescript')).toBeVisible()

    await userEvent.click(page.getByRole('tab', {name: 'Release notes'}))
    await userEvent.click(page.getByRole('button', {name: 'Done'}))
    await expect.element(page.getByRole('tab', {name: 'Release notes'})).not.toBeInTheDocument()
    await expect.element(page.getByText('Platform reads Release notes')).not.toBeInTheDocument()

    root.unmount()
    await expect.element(page.getByText('Platform card for execute_typescript')).not.toBeInTheDocument()
    host.remove()
  })
})
