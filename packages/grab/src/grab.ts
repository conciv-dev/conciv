// The data a grabbed element flows as, decoupled from react-grab. The adapter is the only place
// react-grab's own types appear; everything downstream (composer, chip) speaks these shapes.

// A detached, fully self-contained styled clone plus its natural CSS size. `node` is ready to mount
// anywhere (it carries inlined computed styles + a scoped <style> for pseudo-elements), so the UI
// never touches innerHTML and shadow-DOM isolation is a non-issue.
export type ElementSnapshot = {
  node: HTMLElement
  width: number
  height: number
}

// Where the grabbed element lives in source. Our own shape; the adapter maps react-grab's SourceInfo.
export type ElementSource = {
  componentName: string | null
  filePath: string
  lineNumber: number | null
}

// The picked element's viewport box at pick time, so a consumer can place UI relative to it (e.g. a
// canvas pin). Null when the element had no measurable box.
export type ElementRect = {
  x: number
  y: number
  width: number
  height: number
}

// What the human sees staged above the composer: the visual + its origin. This is composer draft
// state, cleared on send.
export type StagedGrab = {
  snapshot: ElementSnapshot
  source: ElementSource | null
  rect: ElementRect | null
}

// One full pick: the agent-bound text context plus the staged visual. Produced once per grab.
export type Grab = StagedGrab & {text: string}

// The element-grab capability the host exposes to extensions. The widget implements it over
// react-grab; the extension triggers a pick and receives a fully-built Grab (it never constructs one).
export type GrabApi = {
  pick: () => Promise<Grab | null>
  comment: () => Promise<Grab | null>
  cancel: () => void
  isActive: () => boolean
  stage: (grab: Grab) => void
}
