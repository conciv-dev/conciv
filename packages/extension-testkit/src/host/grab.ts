import type {ElementSource, Grab, GrabApi} from '@conciv/grab'

const SOURCE_ATTR = 'data-conciv-source'

type SourceParts = {filePath: string; lineNumber: number | null; column: number | null}

function parseSource(value: string): SourceParts {
  const lastColon = value.lastIndexOf(':')
  const firstColon = value.lastIndexOf(':', lastColon - 1)
  const line = Number(value.slice(firstColon + 1, lastColon))
  const column = Number(value.slice(lastColon + 1))
  return {
    filePath: value.slice(0, firstColon),
    lineNumber: Number.isFinite(line) ? line : null,
    column: Number.isFinite(column) ? column : null,
  }
}

function sourceOf(element: Element): SourceParts | null {
  const value = element.getAttribute(SOURCE_ATTR)
  return value ? parseSource(value) : null
}

function toElementSource(parts: SourceParts): ElementSource {
  return {componentName: null, filePath: parts.filePath, lineNumber: parts.lineNumber}
}

function toGrab(element: Element): Grab {
  const box = element.getBoundingClientRect()
  const parts = sourceOf(element)
  return {
    text: element.textContent ?? '',
    snapshot: {node: element.cloneNode(true) as HTMLElement, width: box.width, height: box.height},
    source: parts ? toElementSource(parts) : null,
    rect: {x: box.x, y: box.y, width: box.width, height: box.height},
  }
}

export function makeHostGrab(doc: Document): GrabApi {
  let teardown: (() => void) | null = null
  const stagedGrabs: Grab[] = []

  const pick = (): Promise<Grab | null> =>
    new Promise((resolve) => {
      const onClick = (event: Event) => {
        const target = event.target as Element | null
        const picked = target?.closest(`[${SOURCE_ATTR}]`)
        if (!picked) return
        event.preventDefault()
        event.stopPropagation()
        finish(toGrab(picked))
      }
      const finish = (grab: Grab | null) => {
        doc.removeEventListener('click', onClick, true)
        teardown = null
        resolve(grab)
      }
      teardown = () => finish(null)
      doc.addEventListener('click', onClick, true)
    })

  return {
    pick,
    comment: pick,
    cancel: () => teardown?.(),
    isActive: () => teardown !== null,
    stage: (grab) => void stagedGrabs.push(grab),
    staged: () => stagedGrabs,
    clear: () => void (stagedGrabs.length = 0),
  }
}
