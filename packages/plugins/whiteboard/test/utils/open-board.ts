import {createFakeEngine, type FakeEngineOptions, type FakeSession} from '@conciv/client/testing'
import {useFakeEngine} from '@internal/frontend-test-utils'
import {renderTestApp, servePluginBundle} from '@internal/frontend-test-utils/app'
import {Whiteboard} from '../../src/rpc.js'
import {createFakeWhiteboard, type FakeWhiteboard} from './fake-whiteboard.js'

export const ROOM = 'ses_board'

export const WHITEBOARD_BUILD = {
  id: 'whiteboard',
  dist: import.meta.glob<string>(['../../dist/*.cjs', '../../dist/*.cjs.manifest.json'], {
    query: '?raw',
    import: 'default',
  }),
}

export async function openBoard(
  seed: (board: FakeWhiteboard) => void = () => undefined,
  sessions: readonly FakeSession[] = [{id: ROOM, title: 'Board'}],
  tools: FakeEngineOptions['tools'] = {},
) {
  const board = createFakeWhiteboard()
  seed(board)
  const engine = useFakeEngine(
    createFakeEngine(
      servePluginBundle(WHITEBOARD_BUILD, {sessions, tools, plugins: {[Whiteboard.id]: board.handlers}}),
    ),
  )
  const first = sessions[0]?.id ?? ROOM
  return {
    board,
    engine,
    render: () =>
      renderTestApp({
        engine,
        initialEntries: [`/panel/${first}?open=true`],
      }),
  }
}
