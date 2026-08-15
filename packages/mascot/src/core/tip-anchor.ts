import type {EmitterAnchor} from './path.js'
import type {MascotSkin} from './skin.js'

function layoutOffsetToRoot(element: HTMLElement): EmitterAnchor {
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
  const target = layoutOffsetToRoot(element)
  const origin = layoutOffsetToRoot(host)
  return {x: target.x - origin.x, y: target.y - origin.y}
}

function localMatrix(element: HTMLElement): DOMMatrixReadOnly {
  const {transform} = getComputedStyle(element)
  if (transform === '' || transform === 'none') return new DOMMatrixReadOnly()
  const matrix = new DOMMatrixReadOnly(transform)
  const angle = Math.atan2(matrix.b, matrix.a)
  return new DOMMatrixReadOnly([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0])
}

export function antennaTipAnchor(host: HTMLElement, antenna: HTMLElement, skin: MascotSkin): EmitterAnchor {
  const base = layoutOffsetWithin(antenna, host)
  const width = antenna.offsetWidth
  const height = antenna.offsetHeight
  const originX = width * skin.originFractions.x
  const originY = height * skin.originFractions.y
  const local = new DOMPoint(width * skin.tipFractions.x - originX, height * skin.tipFractions.y - originY)
  const moved = localMatrix(antenna).transformPoint(local)
  return {x: base.x + originX + moved.x, y: base.y + originY + moved.y}
}

export function antennaOriginOffset(antenna: HTMLElement, wrapper: HTMLElement, skin: MascotSkin): EmitterAnchor {
  const base = layoutOffsetWithin(antenna, wrapper)
  return {
    x: base.x + antenna.offsetWidth * skin.originFractions.x,
    y: base.y + antenna.offsetHeight * skin.originFractions.y,
  }
}
