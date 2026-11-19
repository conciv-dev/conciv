import type {AnyExtension} from '@conciv/extension'

export type ExtensionInstance = {
  extension: AnyExtension
  clientValue: object
  dispose: () => void
}

export function createInstances(extensions: AnyExtension[]): ExtensionInstance[] {
  return extensions.flatMap((extension) => {
    try {
      const result = extension.__client?.()
      return [
        {
          extension,
          clientValue: result?.value ?? {},
          dispose: result?.dispose ?? (() => {}),
        },
      ]
    } catch (error) {
      console.error(`[conciv] extension "${extension.name}" failed to mount`, error)
      return []
    }
  })
}
