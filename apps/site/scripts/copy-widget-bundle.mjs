import {copyFileSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const siteDir = fileURLToPath(new URL('..', import.meta.url))
const source = join(siteDir, '../../packages/embed/dist/conciv-widget.global.js')
const publicDir = join(siteDir, 'public')
const target = join(publicDir, 'conciv-widget.global.js')
mkdirSync(publicDir, {recursive: true})
copyFileSync(source, target)
