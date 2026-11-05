import {mapValues} from 'es-toolkit'
import {toolError} from '@conciv/extension'
import {
  type Box,
  type Css,
  type CssDesigns,
  type Decision,
  type DesignNode,
  NO_TARGET_MESSAGE,
  type Store,
  type Typography,
} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {intersection} from '../shared/box.js'
import {decodePng, downscale} from './raster.js'

export function createCssDesigns(input: {store: Store}): CssDesigns {
  const {store} = input
  return {
    load: ({id, decisions}) => cssDesign({store, id, decisions}),
  }
}

async function cssDesign(input: {store: Store; id: string; decisions: Decision[]}): Promise<Css> {
  const {store, id, decisions} = input
  const design = await store.design(id)
  const png = await store.targetImage(id)
  if (png === null) throw toolError('no-target', {message: NO_TARGET_MESSAGE})
  const decoded = decodePng(png)
  const raster = design.scale === 1 ? decoded : downscale({raster: decoded, scale: design.scale})
  const by = 1 / design.scale
  const page = scaledBox({box: design.root.box, by})
  const excluded = new Set(
    decisions
      .filter((decision) => decision.kind === 'excluded' || decision.kind === 'image-slot')
      .map((decision) => decision.anchor),
  )
  const typography = new Map(
    decisions.flatMap((decision) =>
      decision.kind === 'typography' && typeof decision.value === 'object' && decision.value !== null
        ? [[decision.anchor, decision.value] as const]
        : [],
    ),
  )
  const dropped: Box[] = []
  const convert = (node: DesignNode): DesignNode | null => {
    const scaled = scaledNode({node, by, typography: typography.get(node.id)})
    if (excluded.has(node.id) || outside({box: scaled.box, page})) {
      dropped.push(...[...walk({root: scaled})].map((visit) => visit.node.box))
      return null
    }
    return {...pagedNode({node: scaled, page}), children: node.children.flatMap((child) => convert(child) ?? [])}
  }
  const root = {
    ...scaledNode({node: design.root, by, typography: undefined}),
    children: design.root.children.flatMap((child) => convert(child) ?? []),
  }
  const css = {...design, scale: 1, viewport: {width: page.w, height: page.h}, root}
  return {design: css, raster, dropped}
}

function scaledNode(input: {node: DesignNode; by: number; typography: Typography | undefined}): DesignNode {
  const {node, by} = input
  const box = scaledBox({box: node.box, by})
  const layout = node.layout === undefined ? undefined : scaledLayout({layout: node.layout, by})
  const base = {...node, box, ...(layout === undefined ? {} : {layout})}
  if (base.kind === 'box') return {...base, radius: base.radius * by}
  if (base.kind !== 'text') return base
  const found = base.typography?.confidence === 1 ? base.typography : (input.typography ?? base.typography)
  return {
    ...base,
    lines: base.lines.map((line) => ({...line, box: scaledBox({box: line.box, by})})),
    ...(found === undefined
      ? {}
      : {
          typography:
            found === input.typography ? found : {...found, size: found.size * by, lineHeight: found.lineHeight * by},
        }),
  }
}

function scaledLayout(input: {
  layout: NonNullable<DesignNode['layout']>
  by: number
}): NonNullable<DesignNode['layout']> {
  const {layout, by} = input
  return {
    ...layout,
    ...(layout.gap === undefined ? {} : {gap: {...layout.gap, px: layout.gap.px * by}}),
    ...(layout.padding === undefined ? {} : {padding: mapValues(layout.padding, (value) => value * by)}),
  }
}

function scaledBox(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x * by, y: box.y * by, w: box.w * by, h: box.h * by}
}

function outside(input: {box: Box; page: Box}): boolean {
  const {box, page} = input
  return box.x >= page.x + page.w || box.x + box.w <= page.x || box.y >= page.y + page.h || box.y + box.h <= page.y
}

function pagedNode(input: {node: DesignNode; page: Box}): DesignNode {
  const {node, page} = input
  const box = intersection({a: node.box, b: page})
  if (box === null) return node
  const {layout} = node
  const padding = layout?.padding
  if (layout === undefined || padding === undefined) return {...node, box}
  const clipped = {
    left: box.x - node.box.x,
    right: node.box.x + node.box.w - (box.x + box.w),
    top: box.y - node.box.y,
    bottom: node.box.y + node.box.h - (box.y + box.h),
  }
  const inset = {
    left: Math.max(0, padding.left - clipped.left),
    right: Math.max(0, padding.right - clipped.right),
    top: Math.max(0, padding.top - clipped.top),
    bottom: Math.max(0, padding.bottom - clipped.bottom),
  }
  return {...node, box, layout: {...layout, padding: inset}}
}
