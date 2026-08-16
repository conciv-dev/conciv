import type {AnyExtension} from '@conciv/extension'
import type {ExtensionInstance} from './extension-slots.js'

export function createInstances(extensions: AnyExtension[]): ExtensionInstance[] {
  return extensions.flatMap((extension) => {
    try {
      const result = extension.__client?.()
      return [
        {
          extension,
          clientValue: result?.value ?? {},
          effects: result?.effects ?? [],
          dispose: result?.dispose ?? (() => {}),
        },
      ]
    } catch (error) {
      console.error(`[conciv] extension "${extension.name}" failed to mount`, error)
      return []
    }
  })
}
