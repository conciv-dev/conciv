export * from '@conciv/plugin/nextjs'

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const [{registerWith}, terminal, testRunner, whiteboard, iosServer] = await Promise.all([
    import('@conciv/plugin/nextjs'),
    import('@conciv/extension-terminal'),
    import('@conciv/extension-test-runner'),
    import('@conciv/extension-whiteboard'),
    import('@conciv/extension-ios'),
  ])
  await registerWith({
    serverExtensions: [terminal.default, testRunner.default, whiteboard.default, iosServer.default],
    clientEntries: [],
  })
}
