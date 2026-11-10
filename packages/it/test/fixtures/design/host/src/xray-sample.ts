import {z} from 'zod'
import type {IdNode, Mapping, Round, TargetRecord} from '@conciv/extension-design/defs'

export function serveXraySample(state: string | null): void {
  const sample = state === null ? undefined : SAMPLES[state]
  if (sample === undefined) return
  const flags = new Map<string, Flag | null>()
  const passed = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = urlOf(input)
    if (procedureOf(url) === 'flag') flagged({flags, body: await bodyOf({input, init})})
    const answer = answerOf({url, sample: sample(), flags})
    return answer === null ? passed(input, init) : answer
  }
}

type Sample = {
  current: TargetRecord | null
  rounds: {target: TargetRecord; rounds: Round[]; mapping: Mapping; unsettled: number}
  layers: {round: number; width: number; root: Layer}
  parts: Part[]
}

type Flag = 'prefer' | 'do-not-use'

type Prop = {name: string; type: string; required: boolean; values: string[]}

type Part = {
  id: string
  name: string
  tier: 'kit' | 'app' | 'other'
  imports: number
  onPage: number
  flag: Flag | null
  specifier: string
  importLine: string
  sentence: string | null
  props: Prop[]
  usage: string | null
  renders: {node: string; name: string; text: string}[]
  preview: string | null
  previewError: string | null
}

const FlagCallSchema = z.object({
  json: z.object({id: z.string(), flag: z.enum(['prefer', 'do-not-use', 'clear'])}),
})

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

const KIT = '@conciv/ui-kit-system'

const NO_PREVIEW = 'the sample catalog has no preview pages'

const VIEWPORT_KEY = 'VwPt1A'

const PLANES_KEY = 'PlNs2B'

const SEGMENT_GROUP_PROPS: Prop[] = [
  {name: 'size', type: "'sm' | 'md' | 'lg'", required: false, values: ['sm', 'md', 'lg']},
  {name: 'value', type: 'string', required: true, values: []},
  {name: 'onChange', type: '(value: string) => void', required: true, values: []},
]

const LISTED: Omit<Part, 'id' | 'flag' | 'importLine' | 'preview' | 'previewError'>[] = [
  kitPart({name: 'Button', imports: 212, onPage: 6, sentence: 'A pressable action.'}),
  {
    ...kitPart({name: 'SegmentGroup', imports: 84, onPage: 2, sentence: 'A row of choices where one is on.'}),
    props: SEGMENT_GROUP_PROPS,
    usage: '<SegmentGroup.Root value="desktop">',
    renders: [
      {node: '1:40', name: 'Viewport', text: 'Desktop 1440 / Laptop 1200'},
      {node: '1:52', name: 'Planes', text: 'SRC / CSSOM / DOM'},
    ],
  },
  kitPart({name: 'TooltipIconButton', imports: 57, onPage: 4, sentence: 'An icon button that names itself.'}),
  kitPart({name: 'ScrollArea', imports: 40, onPage: 1, sentence: 'A scrolling box with a thin bar.'}),
  kitPart({name: 'Switch', imports: 31, onPage: 3, sentence: 'An on and off toggle.'}),
  kitPart({name: 'Chip', imports: 22, onPage: 2, sentence: 'A small label.'}),
  kitPart({name: 'StatusDot', imports: 18, onPage: 5, sentence: 'A dot that tells a state.'}),
  kitPart({name: 'RelativeTime', imports: 12, onPage: 1, sentence: 'A time said as how long ago.'}),
  kitPart({name: 'Slider', imports: 9, onPage: 1, sentence: 'A value picked along a track.'}),
  kitPart({name: 'ClipboardCopyButton', imports: 7, onPage: 1, sentence: 'Copies a text and says so.'}),
  appPart({name: 'StatCard', file: 'Stat', imports: 4, onPage: 3}),
  appPart({name: 'Sidebar', file: 'Sidebar', imports: 1, onPage: 1}),
  ...['Tooltip', 'Popover', 'Dialog', 'Menu'].map((name) => kitPart({name, imports: 1, onPage: 0, sentence: null})),
  ...['Topbar', 'Greeting', 'Figures', 'Portrait', 'TableCard', 'NavLink', 'DashboardPage'].map((name) =>
    appPart({name, file: name, imports: 1, onPage: 0}),
  ),
  ...[
    'ArrowLeft', 'ArrowDown', 'Box', 'Camera', 'Check', 'ChevronDown', 'ChevronRight', 'CircleAlert', 'Clock',
    'Copy', 'Download', 'Eye', 'EyeOff', 'File', 'Filter', 'Folder', 'Grid', 'Info', 'Layers', 'Link', 'List',
    'Lock', 'Menu', 'Minus', 'MousePointerClick', 'PanelLeft', 'Pencil', 'Play', 'Plus', 'Power', 'Puzzle',
    'RefreshCw', 'Search', 'Settings', 'Share', 'Star', 'Sun', 'Trash', 'Upload', 'User', 'X',
  ].map((name) => otherPart({name})),
]

const PREFERRED = new Set(['Chip'])

const SAMPLES: Record<string, () => Sample> = {
  empty: () => ({...roundSample(), current: null}),
  round: roundSample,
  card: roundSample,
  '3d': stackSample,
  parts: partsSample,
}

function urlOf(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url
  return input instanceof URL ? input.href : input
}

function procedureOf(url: string): string | undefined {
  return new URL(url).pathname.split(XRAY_PATH)[1]
}

async function bodyOf(input: {input: RequestInfo | URL; init: RequestInit | undefined}): Promise<string> {
  if (input.input instanceof Request) return input.input.clone().text()
  return typeof input.init?.body === 'string' ? input.init.body : ''
}

function flagged(input: {flags: Map<string, Flag | null>; body: string}): void {
  const call = FlagCallSchema.safeParse(JSON.parse(input.body || 'null'))
  if (!call.success) return
  const {id, flag} = call.data.json
  input.flags.set(id, flag === 'clear' ? null : flag)
}

function answerOf(input: {url: string; sample: Sample; flags: Map<string, Flag | null>}): Response | null {
  const procedure = procedureOf(input.url)
  const parts = input.sample.parts.map((part) => ({...part, flag: flagOf({part, flags: input.flags})}))
  const answers: Record<string, unknown> = {
    current: input.sample.current,
    rounds: input.sample.rounds,
    layers: input.sample.layers,
    components: {
      components: parts.filter((part) => part.flag !== 'do-not-use'),
      hidden: parts.filter((part) => part.flag === 'do-not-use'),
    },
    flag: null,
    label: null,
  }
  if (procedure === undefined || !(procedure in answers)) return null
  return Response.json({json: answers[procedure], meta: []})
}

function flagOf(input: {part: Part; flags: Map<string, Flag | null>}): Flag | null {
  if (!input.flags.has(input.part.id)) return input.part.flag
  return input.flags.get(input.part.id) ?? null
}

function partsSample(): Sample {
  const sample = roundSample()
  return {
    ...sample,
    layers: {
      ...sample.layers,
      root: pageLayer([
        tabsLayer({id: VIEWPORT_KEY, node: '1:40', name: 'Viewport', box: {x: 960, y: 94, w: 200, h: 28}}),
        tabsLayer({id: PLANES_KEY, node: '1:52', name: 'Planes', box: {x: 1172, y: 94, w: 180, h: 28}}),
      ]),
    },
    parts: LISTED.map((part) => ({
      ...part,
      id: `sample-${part.tier}-${part.name}`,
      flag: PREFERRED.has(part.name) ? 'prefer' : null,
      importLine: `import {${part.name}} from '${part.specifier}'`,
      preview: null,
      previewError: NO_PREVIEW,
    })),
  }
}

function kitPart(input: {name: string; imports: number; onPage: number; sentence: string | null}) {
  return {...input, tier: 'kit' as const, specifier: KIT, props: [], usage: null, renders: []}
}

function appPart(input: {name: string; file: string; imports: number; onPage: number}) {
  return {
    name: input.name,
    tier: 'app' as const,
    imports: input.imports,
    onPage: input.onPage,
    specifier: `./src/${input.file}.tsx`,
    sentence: null,
    props: [],
    usage: null,
    renders: [],
  }
}

function otherPart(input: {name: string}) {
  return {
    name: input.name,
    tier: 'other' as const,
    imports: 1,
    onPage: 0,
    specifier: `lucide-solid/icons/${input.name}`,
    sentence: null,
    props: [],
    usage: null,
    renders: [],
  }
}

function tabsLayer(input: {id: string; node: string; name: string; box: Box}): Layer {
  return layer({id: input.id, element: 'div', classes: ['xp-tabs'], box: input.box, look: look(input)})
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
    layers: {round: rounds.length, width: target.width, root: pageLayer([])},
    parts: [],
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
    brokenBy: null,
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

function pageLayer(extra: Layer[]): Layer {
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
      ...extra,
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
