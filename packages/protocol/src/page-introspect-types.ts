// Page/React introspection result types (locate, inspect, tree), shared by the widget and EffectCtx.
export type RawFrame = {fileName?: string; line?: number; column?: number; fn?: string}
export type SourceLoc = {file: string; line: number; column: number}
export type Owner = {component: string; ref: string}
export type LocateResult = {
  component: string | null
  stack: string[]
  frames: RawFrame[]
  owners: Owner[]
  // When the element carries a build-injected source attribute (data-mandarax-source / data-tsd-source),
  // the exact file:line:col is read directly — no owner-stack symbolication needed.
  source?: SourceLoc
}
export type TreeNode = {component: string; ref: string; children: TreeNode[]; truncated?: number}
export type HookNode = {id: number; name: string; value: unknown; editable: boolean}
export type Rect = {x: number; y: number; w: number; h: number}
export type InspectResult = {
  component: string | null
  props: unknown
  state: unknown
  hooks: HookNode[]
  // Where the component sits on screen (its nearest host element's box) — so the agent can answer
  // "where is <Foo>" without a separate verb.
  rect: Rect | null
}
export type TreeResult = {nodes: TreeNode[]; truncated: number}
