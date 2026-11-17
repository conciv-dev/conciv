import type {AnyRouter} from '@orpc/server'

export type MountedExtensionRouter = {slug: string; extensionName: string; router: AnyRouter}

export type CompositeRpcRouter<TCore = AnyRouter> = TCore & {ext: Record<string, AnyRouter>}

export function makeCompositeRpcRouter<TCore>(
  core: TCore,
  extensions: readonly MountedExtensionRouter[],
): CompositeRpcRouter<TCore> {
  const owners = new Map<string, string>()
  for (const entry of extensions) {
    const existing = owners.get(entry.slug)
    if (existing !== undefined) {
      throw new Error(
        `extension rpc slug collision: "${entry.slug}" is claimed by both "${existing}" and "${entry.extensionName}"`,
      )
    }
    owners.set(entry.slug, entry.extensionName)
  }
  return {...core, ext: Object.fromEntries(extensions.map((entry) => [entry.slug, entry.router]))}
}
