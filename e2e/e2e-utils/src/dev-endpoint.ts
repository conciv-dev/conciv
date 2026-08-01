import {tmpdir} from 'node:os'
import {join} from 'node:path'

export const E2E_DEV_ENDPOINT_DIR = join(tmpdir(), 'conciv-it-dev-endpoint')
