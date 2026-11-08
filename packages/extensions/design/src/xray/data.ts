import {createMemo, createResource} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import {makeBrowserRpcClient} from '@conciv/contract'
import {makeExtRpcClient} from '@conciv/extension'
import type {XrayRouter} from '../server.js'

export function createXrayData(input: {
  apiBase: () => string
  session: () => string | null
  round: () => number | null
  on: () => boolean
}) {
  const client = createMemo(() => makeExtRpcClient<XrayRouter>(input.apiBase(), DESIGN_EXTENSION_NAME))
  const [design, {refetch}] = createResource(
    () => ({apiBase: input.apiBase(), session: input.session(), client: client()}),
    async (key) => {
      const session = key.session ?? (await makeBrowserRpcClient(key.apiBase).rpc.sessions.resolve({})).sessionId
      const target = await key.client.xray.current({session})
      return target === null ? null : key.client.xray.rounds({id: target.id})
    },
  )
  createTimer(
    () => void refetch(),
    () => (input.on() ? POLL_MS : false),
    setInterval,
  )
  const [hotkeys] = createResource(client, (rpc) => rpc.xray.hotkeys())
  const shownRound = createMemo(() => {
    const rounds = design.latest?.rounds ?? []
    const pinned = input.round()
    return rounds.find((entry) => entry.round === pinned) ?? rounds.at(-1) ?? null
  })
  const targetId = createMemo(() => design.latest?.target.id)
  const roundNumber = createMemo(() => shownRound()?.round)
  const [layers] = createResource(
    () => {
      const id = targetId()
      const round = roundNumber()
      return id === undefined || round === undefined ? false : {id, round, client: client()}
    },
    (key) => key.client.xray.layers({id: key.id, round: key.round}),
  )
  const file = (path: string): string => `${input.apiBase()}/api/ext/${DESIGN_EXTENSION_NAME}/files/${path}`
  return {design, hotkeys, layers, shownRound, file}
}

const DESIGN_EXTENSION_NAME = 'design'

const POLL_MS = 2000
