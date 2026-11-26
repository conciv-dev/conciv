export async function driveEndpoint(): Promise<string | undefined> {
  if (!process.env['CONCIV_DRIVE']) return undefined
  const [{Effect}, NodeFileSystem, DriveManifest] = await Promise.all([
    import('effect'),
    import('@effect/platform-node/NodeFileSystem'),
    import('@conciv/simulation/manifest'),
  ])
  const manifest = await Effect.runPromise(DriveManifest.resolve().pipe(Effect.provide(NodeFileSystem.layer)))
  return manifest.endpoints.ui
}
