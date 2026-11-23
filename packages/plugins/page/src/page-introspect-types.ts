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
