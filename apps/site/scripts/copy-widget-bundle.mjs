import {copyFileSync, cpSync, mkdirSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const siteDir = fileURLToPath(new URL('..', import.meta.url))
const embedDist = join(siteDir, '../../packages/embed/dist')
const publicDir = join(siteDir, 'public')
mkdirSync(publicDir, {recursive: true})
copyFileSync(join(embedDist, 'conciv-widget.global.js'), join(publicDir, 'conciv-widget.global.js'))
rmSync(join(publicDir, 'widget'), {recursive: true, force: true})
cpSync(join(embedDist, 'widget'), join(publicDir, 'widget'), {recursive: true})
