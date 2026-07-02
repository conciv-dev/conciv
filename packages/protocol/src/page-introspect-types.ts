export type RawFrame = {fileName?: string; line?: number; column?: number; fn?: string}
export type SourceLoc = {file: string; line: number; column: number}
export type Owner = {component: string; ref: string}
export type LocateResult = {
  component: string | null
  stack: string[]
  frames: RawFrame[]
  owners: Owner[]

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

  rect: Rect | null
}
export type TreeResult = {nodes: TreeNode[]; truncated: number}
