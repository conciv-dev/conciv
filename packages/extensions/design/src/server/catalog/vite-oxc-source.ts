import type {ComponentSource} from '../../shared/catalog-defs.js'
import {walkProject} from './walk.js'

export function createViteOxcSource(): ComponentSource {
  return {name: SOURCE_NAME, scan: ({cwd}) => walkProject({cwd})}
}

const SOURCE_NAME = 'vite-oxc'
