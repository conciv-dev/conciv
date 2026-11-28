import {createRequire} from 'node:module'
import {dirname} from 'node:path'

export const brandAssetsAlias = {
  find: '@brand-assets',
  replacement: dirname(createRequire(import.meta.url).resolve('@internal/brand/logos.json')),
}
