import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {defineExtension} from '@conciv/extension'

export default defineExtension({name: 'fixture'}).server((server) => ({
  dispose: () => writeFile(join(server.stateDir, 'fixture-disposed'), ''),
}))
