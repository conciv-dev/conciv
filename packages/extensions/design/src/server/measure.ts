import {z} from 'zod'
import {AsyncRetryer} from '@tanstack/pacer/async-retryer'
import {isPageVerbError, toolError} from '@conciv/extension'
import {DESIGN_ERRORS} from '../shared/errors.js'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {PAGE_PING_TOOL} from '@conciv/protocol/page-types'
import {captureDef, PageCaptureSchema} from '@conciv/extension-page/defs'
import {
  LiveComponentsSchema,
  type LiveComponent,
  type Measured,
  type Measurer,
  type Raster,
  type Widget,
} from '../shared/defs.js'
import {DESIGN_TOOLS} from '../shared/design-tools.js'
import {designConfig} from '../shared/tolerances.js'
import {hiddenOverlays} from '../shared/overlays.js'
import {createRaster} from './raster.js'

export function createMeasurer(_input: {config: DesignConfig}): Measurer {
  const tolerances = designConfig.tolerances
  return {
    probe: async (page) => {
      await widgetConnected({page, tolerances})
      const reply = await askMeasure({page, height: PROBE_HEIGHT, timeout: PROBE_TIMEOUT_MS})
      return {route: reply.route, framework: frameworkOf(reply)}
    },
    measure: async (request) => {
      await widgetConnected({page: request.page, tolerances})
      const reply = await askMeasure({...request, timeout: request.timeout ?? tolerances.measureTimeoutMs})
      return measuredFrom(await captured({page: request.page, reply, widget: request.widget}))
    },
    dispose: () => undefined,
  }
}

type DesignConfig = z.output<typeof designConfig>

type Tolerances = typeof designConfig.tolerances

const [, , , measureDef] = DESIGN_TOOLS

const MeasureReplySchema = measureDef.outputSchema ?? z.never()

type MeasureReply = z.output<typeof MeasureReplySchema>

const PROBE_HEIGHT = 1

const PROBE_TIMEOUT_MS = 3000

const ROOT_STYLES = {
  color: 'rgb(0, 0, 0)',
  fontSize: 16,
  lineHeight: 0,
  fontWeight: 400,
  fontFamily: '',
  textAlign: 'start',
  radius: 0,
  position: 'static',
  display: 'block',
  flexDirection: 'row',
  overflowX: 'visible',
  sizing: {width: 'fixed', height: 'fixed'},
  border: {width: 0, style: 'none', color: '', side: 'top'},
  gradient: null,
  opacity: 1,
  image: '',
  media: {},
} as const

const NO_TAB = DESIGN_ERRORS['no-tab'].message

async function widgetConnected(input: {page: ServerToolPageAccess; tolerances: Tolerances}): Promise<void> {
  const {page, tolerances} = input
  const retryer = new AsyncRetryer(() => pingWidget(page), {
    backoff: 'fixed',
    baseWait: tolerances.widgetPoll,
    maxAttempts: Math.ceil(tolerances.widgetWait / tolerances.widgetPoll) + 1,
    throwOnError: false,
  })
  await retryer.execute()
}

async function pingWidget(page: ServerToolPageAccess): Promise<void> {
  await page.call(PAGE_PING_TOOL, {}).catch((error: unknown) => {
    if (isPageVerbError(error) && error.code === 'no-widget') throw error
  })
}

async function askMeasure(input: {
  page: ServerToolPageAccess
  width?: number
  height?: number
  widget?: Widget
  fresh?: boolean
  timeout: number
}): Promise<MeasureReply> {
  const {page, width, height, timeout} = input
  const reply = await page
    .call(measureDef.name, {
      ...(width === undefined ? {} : {width}),
      ...(height === undefined ? {} : {height}),
      ...(input.widget === undefined ? {} : {widget: input.widget}),
      ...(input.fresh === undefined ? {} : {fresh: input.fresh}),
      timeout,
    })
    .catch((error: unknown) => {
      if (isPageVerbError(error) && error.code === 'no-widget') throw toolError('no-tab', {message: NO_TAB})
      throw error
    })
  return MeasureReplySchema.parse(reply)
}

async function captured(input: {
  page: ServerToolPageAccess
  reply: MeasureReply
  widget: Widget
}): Promise<MeasureReply> {
  const {page, reply} = input
  if (reply.capturePath === 'snapdom-mirror') return reply
  const shot = PageCaptureSchema.safeParse(
    await page
      .call(captureDef.name, {width: reply.width, height: reply.height, scale: 1, hide: hiddenOverlays(input.widget)})
      .catch(() => null),
  )
  return shot.success ? {...reply, image: shot.data.image, capturePath: shot.data.path} : reply
}

function measuredFrom(reply: MeasureReply): Measured {
  const raster = createRaster(Buffer.from(reply.image, 'base64'))
  return {
    live: pageRoot({reply, raster}),
    raster,
    route: reply.route,
    width: reply.width,
    path: reply.capturePath,
    sources: reply.opinion ? [reply.source, 'takumi'] : [reply.source],
    overflowX: reply.overflowX,
    scrollHeight: reply.scrollHeight,
    queries: reply.queries,
    sheets: reply.sheets,
    ...(reply.longestTask === undefined ? {} : {longestTask: reply.longestTask}),
    ...(reply.pageError === undefined ? {} : {pageError: reply.pageError}),
    ...(reply.fontsLoading === undefined ? {} : {fontsLoading: reply.fontsLoading}),
    ...(reply.thrown === undefined
      ? {}
      : {thrown: {message: reply.thrown.message, frames: reply.thrown.frames, at: Date.now() - reply.thrown.ago}}),
    framework: frameworkOf(reply),
    masks: reply.masks,
    scheme: reply.scheme,
  }
}

function frameworkOf(reply: MeasureReply): 'react' | 'solid' {
  return reply.framework ?? 'react'
}

function pageRoot(input: {reply: MeasureReply; raster: Raster}): LiveComponent {
  const {reply, raster} = input
  const [red, green, blue] = raster.median([])
  return {
    source: null,
    key: null,
    instance: null,
    repeat: null,
    owner: null,
    tag: 'body',
    text: '',
    box: {x: 0, y: 0, w: reply.width, h: reply.height},
    bounds: {x: 0, y: 0, w: reply.width, h: reply.height},
    scrolls: false,
    textBox: null,
    glyphs: [],
    axis: null,
    columns: null,
    styles: {
      ...ROOT_STYLES,
      border: {...ROOT_STYLES.border, sides: []},
      shadows: [],
      blur: {layer: 0, background: 0},
      background: `rgb(${red}, ${green}, ${blue})`,
    },
    role: null,
    hints: [],
    index: 1,
    path: '',
    drawn: false,
    placeholder: null,
    children: LiveComponentsSchema.parse(reply.components),
  }
}
