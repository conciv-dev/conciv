export interface Ref {
  readonly directory: string
  readonly workspaceId?: string
}

export interface PublicRef {
  readonly directory: string
}

export interface Info {
  readonly directory: string
  readonly workspaceId?: string
  readonly project: {
    readonly id: string
    readonly directory: string
    readonly canonical: string
  }
}

export interface PublicInfo {
  readonly directory: string
  readonly project: Info['project']
}
