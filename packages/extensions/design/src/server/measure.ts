import {z} from 'zod'
import {AsyncRetryer} from '@tanstack/pacer/async-retryer'
import {isPageVerbError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {PAGE_PING_TOOL} from '@conciv/protocol/page-types'
import {DESIGN_TOOLS, RunSchema, type LiveComponent, type Measured, type Measurer, type Raster} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {createRaster} from './raster.js'

export function createMeasurer(_input: {config: DesignConfig}): Measurer {
  const tolerances = designConfig.tolerances
  return {
    probe: async (page) => {
      await widgetConnected({page, tolerances})
      const reply = await askMeasure({page, height: PROBE_HEIGHT, timeout: tolerances.measureTimeoutMs})
      return {route: reply.route, framework: frameworkOf(reply)}
    },
    measure: async (request) => {
      await widgetConnected({page: request.page, tolerances})
      const reply = await askMeasure({...request, timeout: request.timeout ?? tolerances.measureTimeoutMs})
      return measuredFrom({reply, tolerances})
    },
    dispose: () => undefined,
  }
}

type DesignConfig = z.output<typeof designConfig>

type Tolerances = typeof designConfig.tolerances

const [, , , , , measureDef] = DESIGN_TOOLS

const MeasureReplySchema = measureDef.outputSchema ?? z.never()

type MeasureReply = z.output<typeof MeasureReplySchema>

const LiveComponentsSchema = RunSchema.shape.extras

const PROBE_HEIGHT = 1

const ROOT_STYLES = {
  color: 'rgb(0, 0, 0)',
  fontSize: 16,
  lineHeight: 0,
  fontWeight: 400,
  fontFamily: '',
  textAlign: 'start',
  radius: 0,
  position: 'static',
  sizing: {width: 'fixed', height: 'fixed'},
  border: {width: 0, style: 'none', color: '', side: 'top'},
  gradient: null,
} as const

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
  timeout: number
}): Promise<MeasureReply> {
  const {page, width, height, timeout} = input
  return MeasureReplySchema.parse(
    await page.call(measureDef.name, {
      ...(width === undefined ? {} : {width}),
      ...(height === undefined ? {} : {height}),
      timeout,
    }),
  )
}

function measuredFrom(input: {reply: MeasureReply; tolerances: Tolerances}): Measured {
  const {reply, tolerances} = input
  const raster = createRaster(Buffer.from(reply.image, 'base64'))
  return {
    live: pageRoot({reply, raster}),
    raster,
    route: reply.route,
    path: reply.capturePath,
    sources: reply.opinion ? [reply.source, 'takumi'] : [reply.source],
    confidence: reply.limits === undefined || reply.limits.inlineWidths === 0 ? 1 : tolerances.inlineWidthConfidence,
    ...(reply.longestTask === undefined ? {} : {longestTask: reply.longestTask}),
    ...(reply.pageError === undefined ? {} : {pageError: reply.pageError}),
    framework: frameworkOf(reply),
    masks: reply.masks,
    ...(reply.limits === undefined ? {} : {limits: reply.limits}),
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
    owner: null,
    tag: 'body',
    text: '',
    box: {x: 0, y: 0, w: reply.width, h: reply.height},
    textBox: null,
    glyphs: [],
    axis: null,
    columns: null,
    styles: {...ROOT_STYLES, background: `rgb(${red}, ${green}, ${blue})`},
    role: null,
    hints: [],
    index: 1,
    path: '',
    drawn: false,
    placeholder: null,
    children: LiveComponentsSchema.parse(reply.components),
  }
}
