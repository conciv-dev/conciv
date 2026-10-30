import type {DiffReport} from '../shared/defs.js'
import type {TargetRecord} from '../shared/types.js'
import {assemble, type Delta, type ReportResponse, type XrayData} from './data.js'

const ROUTE = '/?variant=target'
const HOME = '.conciv/design'
const RUN_AGE_MS = 22_000
const RUN_SUFFIX = 'a1b2'

function record(input: {id: string; width: number; name: string}): TargetRecord {
  return {id: input.id, route: ROUTE, width: input.width, height: 720, name: input.name, scale: 1, createdAt: 0}
}

const TARGETS = {
  narrow: record({id: '7c1a', width: 390, name: 'u1-390'}),
  desktop: record({id: '2b9f', width: 1280, name: 'u1-1280'}),
  wide: record({id: '9e03', width: 2560, name: 'u1-2560'}),
}

function report(input: {target: TargetRecord; body: Pick<DiffReport, 'mismatch' | 'components' | 'unmatched'>}) {
  const at = `${Date.now() - RUN_AGE_MS}-${RUN_SUFFIX}`
  const {target} = input
  const value: DiffReport = {
    target: {id: target.id, route: target.route, width: target.width},
    diffImage: `${HOME}/${target.id}/diff-${at}.png`,
    livePath: `${HOME}/${target.id}/live-${at}.png`,
    xray: '',
    ...input.body,
  }
  return value
}

const CARD = {file: 'src/Cards.tsx', line: 9, column: 7}
const CARD_FILL: Delta = {
  kind: 'fill',
  live: 0.329,
  target: 0.494,
  via: 'css',
  file: 'src/card.module.css',
  line: 7,
  column: 3,
  selector: '.card',
  declaration: 'flex: 1',
  suggest: 'the extra sibling steals a third; remove it and fill matches',
}

const DESKTOP = report({
  target: TARGETS.desktop,
  body: {
    mismatch: 0.0342,
    components: [
      {
        source: {file: 'src/Toolbar.tsx', line: 4, column: 5},
        tag: 'header',
        selector: 'header.toolbar',
        live: {x: 24, y: 24, w: 640, h: 56},
        target: {x: 24, y: 24, w: 640, h: 56},
        mismatch: 0.0186,
        children: 2,
        deltas: [
          {
            kind: 'inset-right',
            side: 'right',
            live: 24,
            target: 0,
            via: 'css',
            file: 'src/styles.css',
            line: 28,
            column: 5,
            selector: '.toolbar',
            declaration: 'padding-right: 24px',
            suggest: 'drop padding-right from the min-width 600 rule, or set it to 0',
          },
        ],
      },
      {
        source: CARD,
        tag: 'article',
        selector: 'article.card:nth-child(1)',
        live: {x: 24, y: 120, w: 405, h: 80},
        target: {x: 24, y: 120, w: 608, h: 80},
        mismatch: 0.0112,
        children: 2,
        deltas: [CARD_FILL],
      },
      {
        source: CARD,
        tag: 'article',
        selector: 'article.card:nth-child(3)',
        live: {x: 851, y: 120, w: 405, h: 80},
        target: {x: 648, y: 120, w: 608, h: 80},
        mismatch: 0.0109,
        children: 2,
        deltas: [
          {
            kind: 'inset-left',
            side: 'left',
            live: 827,
            target: 624,
            via: 'css',
            file: 'src/card.module.css',
            line: 1,
            column: 1,
            selector: '.cards',
            declaration: 'gap: 8px',
            suggest: 'position follows the extra sibling; no edit here',
          },
          CARD_FILL,
        ],
      },
      {
        source: {file: 'src/App.tsx', line: 10, column: 7},
        tag: 'input',
        selector: 'input#field',
        live: {x: 24, y: 96, w: 320, h: 36},
        target: {x: 24, y: 96, w: 320, h: 36},
        mismatch: 0,
        children: 0,
        deltas: [],
      },
      {
        source: {file: 'src/Table.tsx', line: 3, column: 5},
        tag: 'table',
        selector: 'table.table',
        live: {x: 24, y: 216, w: 1232, h: 112},
        target: {x: 24, y: 216, w: 1232, h: 112},
        mismatch: 0.0002,
        children: 3,
        deltas: [],
      },
    ],
    unmatched: [{kind: 'extra', live: {x: 437, y: 120, w: 406, h: 80}, source: CARD}],
  },
})

const NARROW = report({
  target: TARGETS.narrow,
  body: {
    mismatch: 0.008,
    components: [
      {
        source: CARD,
        tag: 'article',
        selector: 'article.card:nth-child(1)',
        live: {x: 16, y: 120, w: 358, h: 80},
        target: {x: 16, y: 120, w: 358, h: 80},
        mismatch: 0.006,
        children: 2,
        deltas: [{kind: 'padding', live: 16, target: 12}],
      },
    ],
    unmatched: [],
  },
})

const BLANK_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/%3E'

const DESKTOP_RESPONSE: ReportResponse = {target: TARGETS.desktop, report: DESKTOP, targetImage: ''}

const RESPONSES: ReportResponse[] = [
  {target: TARGETS.narrow, report: NARROW, targetImage: ''},
  DESKTOP_RESPONSE,
  {target: TARGETS.wide, report: null, targetImage: ''},
]

export function loadFixture(input: {id: string}): XrayData {
  const current = RESPONSES.find((response) => response.target.id === input.id) ?? DESKTOP_RESPONSE
  return assemble({current, siblings: RESPONSES, image: () => BLANK_IMAGE})
}
