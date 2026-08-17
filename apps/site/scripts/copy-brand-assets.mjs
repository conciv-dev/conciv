import {cpSync, mkdirSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const siteDir = fileURLToPath(new URL('..', import.meta.url))
const assetsDir = join(siteDir, '../../packages/brand/assets')
const publicDir = join(siteDir, 'public')
const brandDir = join(publicDir, 'brand')

mkdirSync(brandDir, {recursive: true})
cpSync(assetsDir, brandDir, {recursive: true})

const faviconDir = join(assetsDir, 'favicon')
for (const file of readdirSync(faviconDir)) {
  cpSync(join(faviconDir, file), join(publicDir, file))
}
