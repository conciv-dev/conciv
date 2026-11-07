import {tmpdir} from 'node:os'
import {join} from 'node:path'

export const PACKED_ROOT = join(tmpdir(), 'conciv-e2e-vite-react-packed')
export const PACKED_APP_DIR = join(PACKED_ROOT, 'app')
