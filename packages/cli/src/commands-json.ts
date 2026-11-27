import {writeFile} from 'node:fs/promises'
import {readCommandTree} from './command-tree.js'

await writeFile(new URL('commands.json', import.meta.url), JSON.stringify(readCommandTree(), null, 2))
