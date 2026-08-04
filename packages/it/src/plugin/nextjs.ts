export * from '@conciv/plugin/nextjs'

const NEXTJS_ENTRY = '@conciv/it/plugin/nextjs'

const BUILTIN_SERVER_EXTENSIONS = [
  '@conciv/extension-terminal',
  '@conciv/extension-test-runner',
  '@conciv/extension-whiteboard',
  '@conciv/extension-ios',
]

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const {registerWith} = await import('@conciv/plugin/nextjs')
  await registerWith(async () => {
    try {
      const {loadExtensionPackages} = await import('@conciv/extension-compiler/extensions')
      const serverExtensions = await loadExtensionPackages(process.cwd(), NEXTJS_ENTRY, BUILTIN_SERVER_EXTENSIONS)
      return {serverExtensions, clientEntries: []}
    } catch (error) {
      console.error('conciv: failed to load builtin server extensions', error)
      return {serverExtensions: [], clientEntries: []}
    }
  })
}
