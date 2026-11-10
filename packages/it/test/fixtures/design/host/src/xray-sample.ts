import type {IdNode, Mapping, Round, TargetRecord} from '@conciv/extension-design/defs'

export function serveXraySample(state: string | null): void {
  const sample = state === null ? undefined : SAMPLES[state]
  if (sample === undefined) return
  const passed = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const answer = answerOf({url: urlOf(input), sample: sample()})
    return answer === null ? passed(input, init) : Promise.resolve(answer)
  }
}

type Sample = {
  current: TargetRecord | null
  rounds: {target: TargetRecord; rounds: Round[]; mapping: Mapping; unsettled: number}
  layers: {round: number; width: number; root: Layer}
}

type Row = Round['rows'][number]

type Box = IdNode['dom'][number]['box']

type Look = Record<string, string | number | boolean | null>

type Placed = {node: string; look: Look}

type Component = {id: string; name: string; specifier: string; tier: 'kit' | 'app' | 'other'; imports: number}

type Layer = Omit<IdNode, 'fom' | 'children'> & {
  fom: (IdNode['fom'][number] & {box: Box | null; look: Look; component: Component | null})[]
  children: Layer[]
}

const XRAY_PATH = '/rpc/ext/design/xray/'

const MINUTE_MS = 60_000

const LAST_CHECK_MINUTES_AGO = 2

const ROUNDS = [1, 2, 3, 4, 5, 6]

const STATS_KEY = 'A4VsVg'

const CARD_KEY = 'yW45EQ'

const STAT: Component = {
  id: '2a6daca08a84a2caed721c09f9a76bd9e51cd0f3bec7a545728c9c08510f97ad',
  name: 'Stat',
  specifier: './src/Stat.tsx',
  tier: 'app',
  imports: 1,
}

const SAMPLES: Record<string, () => Sample> = {
  empty: () => ({...roundSample(), current: null}),
  round: roundSample,
  card: roundSample,
  '3d': stackSample,
}

function urlOf(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url
  return input instanceof URL ? input.href : input
}

function answerOf(input: {url: string; sample: Sample}): Response | null {
  const [, procedure] = new URL(input.url).pathname.split(XRAY_PATH)
  const answers: Record<string, unknown> = {
    current: input.sample.current,
    rounds: input.sample.rounds,
    layers: input.sample.layers,
    label: null,
  }
  if (procedure === undefined || !(procedure in answers)) return null
  return Response.json({json: answers[procedure], meta: []})
}

function roundSample(): Sample {
  const rows = [
    row({node: '34:617', name: 'Avatar', magnitude: 'much', text: 'Too short: 56px tall, the design wants 64px.'}),
    row({
      node: '34:600',
      name: 'Stat / Picked',
      magnitude: 'paint',
      text: 'Corners are 8px, the design wants 12px (radius/lg).',
    }),
    row({
      node: '34:600',
      name: 'Stat / Picked',
      magnitude: 'paint',
      text: 'Fill is #F8F8F8, the design wants #FFFFFF (color/surface).',
    }),
    {
      ...row({
        node: '34:600',
        name: 'Stat / Picked',
        magnitude: 'token-drift',
        text: 'Stat uses --chat-radius-sm (8px); the design wants radius/lg (12px)',
      }),
      component: STAT.name,
      kitToken: '--chat-radius-sm',
      designToken: 'radius/lg',
    },
    row({
      node: '34:610',
      name: 'Stat / Invoices',
      magnitude: 'slightly',
      text: 'Too narrow: 244px wide, the design wants 260px.',
    }),
    row({node: '34:620', name: 'Stat / Trucks', magnitude: 'slightly', text: 'Sits 18px lower than in the design.'}),
  ]
  return sampleOf({ref: 'Dashboard · Figma', rows, nodes: 250})
}

function stackSample(): Sample {
  const rows = [
    row({node: '34:617', name: 'Avatar', magnitude: 'much', text: 'Too short: 56px tall, the design wants 64px.'}),
    row({node: '34:600', name: 'Stat / Picked', magnitude: 'noticeably', text: 'Sits 12px higher than in the design.'}),
    row({node: '34:610', name: 'Stat / Invoices', magnitude: 'noticeably', text: 'Too narrow: 244px wide.'}),
    row({node: '34:620', name: 'Stat / Trucks', magnitude: 'noticeably', text: 'Sits 18px lower than in the design.'}),
    row({node: '33:240', name: 'Greeting', magnitude: 'paint', text: 'Text colour is #333333, the design wants #111111.'}),
    row({node: '34:630', name: 'Table', magnitude: 'paint', text: 'Corners are 8px, the design wants 12px.'}),
  ]
  return sampleOf({ref: 'figma5 · 1:2', rows, nodes: 246})
}

function sampleOf(input: {ref: string; rows: Row[]; nodes: number}): Sample {
  const at = Date.now()
  const target = {
    id: 'xray-sample',
    session: '',
    ref: input.ref,
    route: '/?variant=xray',
    width: 1440,
    height: 900,
    scale: 1,
    widget: 'shown' as const,
    createdAt: at,
  }
  const rounds = ROUNDS.map((round) => roundOf({round, rows: input.rows, nodes: input.nodes, at}))
  return {
    current: target,
    rounds: {target, rounds, mapping: {}, unsettled: 0},
    layers: {round: rounds.length, width: target.width, root: pageLayer()},
  }
}

function roundOf(input: {round: number; rows: Row[]; nodes: number; at: number}): Round {
  const {round, rows, nodes} = input
  const count = (magnitude: Row['magnitude']): number => rows.filter((entry) => entry.magnitude === magnitude).length
  return {
    round,
    rows,
    reflow: {
      widths: [
        {width: 1024, from: []},
        {width: 390, from: []},
      ],
      results: [],
    },
    coverage: {
      nodes,
      mapped: nodes,
      rendered: nodes,
      missing: [],
      notRendered: [],
      dupes: [],
      revoted: 0,
      candidates: [],
    },
    counts: {
      much: count('much'),
      noticeably: count('noticeably'),
      slightly: count('slightly'),
      pins: 0,
      other: 0,
      rows: rows.length - count('token-drift'),
      reflow: 0,
      paint: count('paint'),
      drift: count('token-drift'),
    },
    pixels: null,
    progress: null,
    at: input.at - (ROUNDS.length - round + LAST_CHECK_MINUTES_AGO) * MINUTE_MS,
    tree: '',
    verdict: 'not yet',
    unsettled: null,
    broken: null,
  }
}

function row(input: {node: string; name: string; magnitude: Row['magnitude']; text: string}): Row {
  return {
    ...input,
    id: null,
    selector: null,
    source: input.node === '34:600' ? 'src/Stat.tsx:3:5' : null,
    confidence: 1,
    margin: 1,
    kind: 'frame',
  }
}

function pageLayer(): Layer {
  return layer({
    id: 'n7jFZw',
    element: 'main',
    box: {x: 240, y: 56, w: 1200, h: 844},
    children: [
      layer({
        id: 'dfU4xA',
        element: 'h1',
        box: {x: 472, y: 88, w: 300, h: 36},
        look: look({node: '33:240', name: 'Greeting', box: {x: 472, y: 88, w: 300, h: 36}}),
      }),
      layer({
        id: STATS_KEY,
        element: 'div',
        box: {x: 472, y: 208, w: 820, h: 150},
        within: look({node: '34:599', name: 'the stats row', box: {x: 472, y: 208, w: 820, h: 150}}),
        children: [
          card({label: 'Picked this week', node: '34:600', name: 'Stat / Picked', x: 472}),
          card({label: 'Open invoices', node: '34:610', name: 'Stat / Invoices', x: 752}),
          card({label: 'Trucks on the road', node: '34:620', name: 'Stat / Trucks', x: 1032}),
        ],
      }),
      layer({
        id: 'arzcgA',
        element: 'div',
        box: {x: 472, y: 378, w: 56, h: 56},
        look: look({node: '34:617', name: 'Avatar', box: {x: 472, y: 378, w: 56, h: 56}}),
      }),
    ],
  })
}

function card(input: {label: string; node: string; name: string; x: number}): Layer {
  const box = {x: input.x, y: 208, w: 260, h: 150}
  return layer({
    id: CARD_KEY,
    instance: `${STATS_KEY}/${CARD_KEY}/${input.label}`,
    element: 'div',
    classes: ['lp-card'],
    box,
    background: '#F8F8F8',
    radius: 8,
    component: STAT,
    look: look({
      node: input.node,
      name: input.name,
      box,
      paint: {fill: '#ffffff', token_fill: 'color/surface', radius: 12, token_radius: 'radius/lg'},
    }),
  })
}

function layer(input: {
  id: string
  element: string
  box: Box
  classes?: string[]
  background?: string
  radius?: number
  instance?: string
  component?: Component
  look?: Placed
  within?: Placed
  children?: Layer[]
}): Layer {
  const {box, look: own, within} = input
  const placed = own ?? within
  return {
    id: input.id,
    dom: [{path: `/${input.id}`, text: '', drawn: false, box, instance: input.instance ?? null, at: box, kids: 0}],
    cssom: [
      {
        background: input.background ?? 'rgba(0, 0, 0, 0)',
        color: '#111111',
        fontSize: 14,
        lineHeight: 20,
        fontWeight: 400,
        fontFamily: 'Source Sans 3',
        textAlign: 'start',
        radius: input.radius ?? 0,
        position: 'static',
        display: 'block',
        flexDirection: 'row',
        overflowX: 'visible',
        sizing: {width: 'set', height: 'set'},
        border: {width: 0, style: 'none', color: '', side: 'top'},
        gradient: null,
        path: `/${input.id}`,
        columns: null,
      },
    ],
    src: {at: null, element: input.element, classes: input.classes ?? [], parent: null},
    fom:
      placed === undefined
        ? []
        : [
            {
              nodeId: placed.node,
              instance: input.instance ?? null,
              confidence: 1,
              margin: 1,
              round: ROUNDS.length,
              box: own === undefined ? null : box,
              look: placed.look,
              component: input.component ?? null,
            },
          ],
    children: input.children ?? [],
  }
}

function look(input: {node: string; name: string; box: Box; paint?: Look}): Placed {
  return {node: input.node, look: {...lookOf(input), ...input.paint}}
}

function lookOf(input: {node: string; name: string; box: Box}): Look {
  return {
    node: input.node,
    type: 'FRAME',
    name: input.name,
    within: null,
    depth: 2,
    x: input.box.x,
    y: input.box.y,
    w: input.box.w,
    h: input.box.h,
    fill_kind: 'none',
    fill: null,
    fill_opacity: null,
    stroke: null,
    stroke_weight: null,
    radius: null,
    font_family: null,
    font_weight: null,
    font_size: null,
    line_height: null,
    text_align: null,
    text: null,
    opacity: null,
    image: false,
    asset: null,
    token_fill: null,
    token_stroke: null,
    token_radius: null,
    token_font: null,
    token_gap: null,
    token_padding: null,
  }
}
