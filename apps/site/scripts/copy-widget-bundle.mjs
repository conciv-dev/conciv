import {copyFileSync, mkdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

const source = fileURLToPath(new URL('../../../packages/embed/dist/conciv-widget.global.js', import.meta.url))
const target = fileURLToPath(new URL('../public/conciv-widget.global.js', import.meta.url))
mkdirSync(fileURLToPath(new URL('../public', import.meta.url)), {recursive: true})
copyFileSync(source, target)
