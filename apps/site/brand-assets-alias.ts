import {createRequire} from 'node:module'
import {dirname} from 'node:path'

export const brandAssetsAlias = {
  '@brand-assets': dirname(createRequire(import.meta.url).resolve('@conciv/brand/logos.json')),
}
