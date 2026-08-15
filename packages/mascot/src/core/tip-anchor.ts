import gsap from 'gsap'
import type {EmitterAnchor} from './path.js'
import type {MascotSkin} from './skin.js'

export type LayerTransform = {
  translateX: number
  translateY: number
  rotationDeg: number
  scaleX: number
  scaleY: number
}

export type AntennaLayout = {
  base: EmitterAnchor
  width: number
  height: number
  originX: number
  originY: number
  tipX: number
  tipY: number
}

const DEGREES_TO_RADIANS = Math.PI / 180

const PERCENT = 100

const numeric = (value: string | number): number => (typeof value === 'number' ? value : Number.parseFloat(value))

export const gsapNumber = (element: HTMLElement, property: string): number =>
  numeric(gsap.getProperty(element, property))

export function hostOriginInRoot(element: HTMLElement): EmitterAnchor {
  let x = 0
  let y = 0
  let node: HTMLElement | null = element
  while (node !== null) {
    x += node.offsetLeft
    y += node.offsetTop
    const parent: Element | null = node.offsetParent
    node = parent instanceof HTMLElement ? parent : null
  }
  return {x, y}
}

function layoutOffsetWithin(element: HTMLElement, host: HTMLElement): EmitterAnchor {
  const target = hostOriginInRoot(element)
  const origin = hostOriginInRoot(host)
  return {x: target.x - origin.x, y: target.y - origin.y}
}

export function readLayerTransform(element: HTMLElement, width: number, height: number): LayerTransform {
  return {
    translateX: gsapNumber(element, 'x') + (gsapNumber(element, 'xPercent') * width) / PERCENT,
    translateY: gsapNumber(element, 'y') + (gsapNumber(element, 'yPercent') * height) / PERCENT,
    rotationDeg: gsapNumber(element, 'rotation'),
    scaleX: gsapNumber(element, 'scaleX'),
    scaleY: gsapNumber(element, 'scaleY'),
  }
}

export function measureAntennaLayout(antenna: HTMLElement, skin: MascotSkin): AntennaLayout {
  const base = hostOriginInRoot(antenna)
  const width = antenna.offsetWidth
  const height = antenna.offsetHeight
  const originX = width * skin.originFractions.x
  const originY = height * skin.originFractions.y
  return {
    base,
    width,
    height,
    originX,
    originY,
    tipX: width * skin.tipFractions.x - originX,
    tipY: height * skin.tipFractions.y - originY,
  }
}

export function antennaTipFromLayout(layout: AntennaLayout, transform: LayerTransform): EmitterAnchor {
  const scaledX = layout.tipX * transform.scaleX
  const scaledY = layout.tipY * transform.scaleY
  const radians = transform.rotationDeg * DEGREES_TO_RADIANS
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: layout.base.x + layout.originX + scaledX * cos - scaledY * sin + transform.translateX,
    y: layout.base.y + layout.originY + scaledX * sin + scaledY * cos + transform.translateY,
  }
}

export function antennaTipOf(antenna: HTMLElement, layout: AntennaLayout): EmitterAnchor {
  return antennaTipFromLayout(layout, readLayerTransform(antenna, layout.width, layout.height))
}

export function antennaTipInRoot(antenna: HTMLElement, skin: MascotSkin): EmitterAnchor {
  return antennaTipOf(antenna, measureAntennaLayout(antenna, skin))
}

export function tipWithinHost(tip: EmitterAnchor, host: HTMLElement): EmitterAnchor {
  const origin = hostOriginInRoot(host)
  return {x: tip.x - origin.x, y: tip.y - origin.y}
}

export function antennaTipAnchor(host: HTMLElement, antenna: HTMLElement, skin: MascotSkin): EmitterAnchor {
  return tipWithinHost(antennaTipInRoot(antenna, skin), host)
}

export function antennaOriginOffset(antenna: HTMLElement, wrapper: HTMLElement, skin: MascotSkin): EmitterAnchor {
  const base = layoutOffsetWithin(antenna, wrapper)
  return {
    x: base.x + antenna.offsetWidth * skin.originFractions.x,
    y: base.y + antenna.offsetHeight * skin.originFractions.y,
  }
}
