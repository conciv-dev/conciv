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
// column comes from the build-injected data-mandarax-source attr (react-grab carries no column); null
// when the attr is absent, so a source anchor degrades to file:line and flags drift rather than
// silently pinning an ambiguous shared-line JSX node.
export type ElementSource = {
  componentName: string | null
  filePath: string
  lineNumber: number | null
  column: number | null
}

// What the human sees staged above the composer: the visual + its origin. This is composer draft
// state, cleared on send.
export type StagedGrab = {
  snapshot: ElementSnapshot
  source: ElementSource | null
}

// The grabbed element's on-screen box at pick time (for placing a source-linked pin); null if absent.
export type ElementRect = {x: number; y: number; width: number; height: number}

// One full pick: the agent-bound text context plus the staged visual + its screen box. Per grab.
export type Grab = StagedGrab & {text: string; rect: ElementRect | null}
