export const SETTLE_WINDOW_MS = 900

export const TRAILING_FRAME_MS = 150

export function cursorOf(container: ParentNode): SVGPathElement {
  const cursor = container.querySelector<SVGPathElement>('[data-conciv-part="cursor"]')
  if (cursor === null) throw new Error('the lockup cursor did not render')
  return cursor
}

export function antennaOf(container: ParentNode): SVGGElement {
  const antenna = container.querySelector<SVGGElement>('[data-conciv-part="antenna"]')
  if (antenna === null) throw new Error('the lockup antenna did not render')
  return antenna
}

export function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
