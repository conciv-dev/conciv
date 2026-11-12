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
    /** Not implemented yet. Always undefined in this version. */
    readonly id: string | undefined
    readonly directory: string
    /** Not implemented yet. Always undefined in this version. */
    readonly canonical: string | undefined
  }
}

export interface PublicInfo {
  readonly directory: string
  readonly project: Info['project']
}
