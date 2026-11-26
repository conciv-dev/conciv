import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createConcivUnplugin} from '@conciv/unplugin'

const embedEntry = fileURLToPath(import.meta.resolve('@conciv/app'))

export const unplugin: ReturnType<typeof createConcivUnplugin> = createConcivUnplugin({
  embedEntry,
  widgetPageDir: dirname(embedEntry),
})
