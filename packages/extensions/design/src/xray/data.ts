import {createMemo, createResource} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import {createStore} from 'solid-js/store'
import {groupBy, sortBy, uniq, uniqBy} from 'es-toolkit'
import {engineHeaders, makeBrowserRpcClient} from '@conciv/contract'
import {makeExtRpcClient} from '@conciv/extension'
import type {GateRow} from '../shared/defs.js'
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
  const [ui, setUi] = createStore<{round: number | null; width: number | null; shown: Record<Layer, boolean>}>({
    round: null,
    width: null,
    shown: {design: true, page: false, moved: false},
  })
  const rounds = createMemo(() => design.latest?.rounds ?? [])
  const shownRound = createMemo(() => {
    const pinned = ui.round ?? input.round()
    return rounds().find((entry) => entry.round === pinned) ?? rounds().at(-1) ?? null
  })
  const history = createMemo(() => rounds().slice(-HISTORY_LENGTH))
  const designWidth = createMemo(() => design.latest?.target.width ?? null)
  const viewports = createMemo(() => {
    const own = designWidth()
    const reflowed = shownRound()?.reflow.widths.map((entry) => entry.width) ?? []
    return uniq(own === null ? reflowed : [own, ...reflowed]).toSorted((a, b) => b - a)
  })
  const viewport = createMemo(() => {
    const picked = ui.width
    return picked !== null && viewports().includes(picked) ? picked : designWidth()
  })
  const earlier = createMemo(() => {
    const shown = shownRound()
    return shown === null ? null : (rounds().findLast((entry) => entry.round < shown.round) ?? null)
  })
  const problems = createMemo(() => {
    const round = shownRound()
    const width = viewport()
    if (round === null || width === null) return []
    const rows = round.rows.filter((row) => (row.width ?? designWidth()) === width)
    return Object.values(groupBy(rows, (row) => row.node)).map((group) => ({
      node: group[0]?.node ?? '',
      name: group[0]?.name ?? '',
      magnitude: sortBy(group, [(row) => SEVERITY.indexOf(row.magnitude)])[0]?.magnitude ?? 'other',
      lines: group.map((row) => row.text),
    }))
  })
  const summary = createMemo(() => {
    const round = shownRound()
    if (round === null) return null
    const elements = problems().length
    return {
      matching: round.verdict === 'done' || round.rows.length === 0,
      problems: problems().reduce((total, entry) => total + entry.lines.length, 0),
      elements,
      matched: Math.max(round.coverage.nodes - elements, 0),
      total: round.coverage.nodes,
      at: round.at,
    }
  })
  const moved = createMemo(() => shownRound()?.progress?.changed?.count ?? 0)
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
  const boxes = createMemo(() => {
    const root = layers.latest
    if (!root) return []
    const worst = new Map(problems().map((entry) => [entry.node, entry.magnitude]))
    return uniqBy(entriesOf(root.root), (entry) => entry.nodeId).flatMap((entry) =>
      entry.box === null
        ? []
        : [
            {
              node: entry.nodeId,
              name: entry.look?.name ?? entry.nodeId,
              box: entry.box,
              magnitude: worst.get(entry.nodeId) ?? null,
            },
          ],
    )
  })
  const file = (path: string): Promise<Blob | null> =>
    fetch(`${input.apiBase()}/api/ext/${DESIGN_EXTENSION_NAME}/files/${path}`, {
      headers: engineHeaders(input.apiBase()),
    }).then((response) => (response.ok ? response.blob() : null))
  const label = (written: Parameters<ReturnType<typeof client>['xray']['label']>[0]): Promise<void> =>
    client().xray.label(written)
  return {
    design,
    hotkeys,
    layers,
    boxes,
    shownRound,
    rounds,
    history,
    earlier,
    problems,
    summary,
    viewports,
    viewport,
    moved,
    shown: (layer: Layer) => ui.shown[layer],
    pinRound: (round: number | null) => setUi('round', round),
    pickViewport: (width: number) => setUi('width', width),
    show: (layer: Layer, on: boolean) => setUi('shown', layer, on),
    file,
    label,
  }
}

const DESIGN_EXTENSION_NAME = 'design'

const POLL_MS = 2000

const HISTORY_LENGTH = 6

const SEVERITY: GateRow['magnitude'][] = ['much', 'noticeably', 'paint', 'slightly', 'reflow', 'pin', 'other']

type Layer = 'design' | 'page' | 'moved'

type LayerRoot = NonNullable<Awaited<ReturnType<XrayClient['xray']['layers']>>>['root']

type XrayClient = ReturnType<typeof makeExtRpcClient<XrayRouter>>

function entriesOf(layer: LayerRoot): LayerRoot['fom'] {
  return [...layer.fom, ...layer.children.flatMap(entriesOf)]
}
