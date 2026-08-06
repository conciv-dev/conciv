export * from '@conciv/plugin/nextjs'

const NEXTJS_ENTRY = '@conciv/it/plugin/nextjs'

const BUILTIN_SERVER_EXTENSIONS = [
  '@conciv/extension-terminal',
  '@conciv/extension-test-runner',
  '@conciv/extension-whiteboard',
  '@conciv/extension-ios',
]

function resolveEmbedEntry(
  resolve: (root: string, resolveFrom: string, specifier: string) => string,
): string | undefined {
  try {
    return resolve(process.cwd(), NEXTJS_ENTRY, '@conciv/embed')
  } catch (error) {
    console.error('conciv: failed to resolve the widget bundle', error)
    return undefined
  }
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const {registerWith} = await import('@conciv/plugin/nextjs')
  await registerWith(async () => {
    const compiler = await import('@conciv/extension-compiler/extensions')
    const embedEntry = resolveEmbedEntry(compiler.resolvePackageEntry)
    try {
      const serverExtensions = await compiler.loadExtensionPackages(
        process.cwd(),
        NEXTJS_ENTRY,
        BUILTIN_SERVER_EXTENSIONS,
      )
      return {serverExtensions, clientEntries: [], embedEntry}
    } catch (error) {
      console.error('conciv: failed to load builtin server extensions', error)
      return {serverExtensions: [], clientEntries: [], embedEntry}
    }
  })
}
