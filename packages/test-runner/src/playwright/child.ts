import {writeSync} from 'node:fs'

// Placeholder spawn entry for the playwright runner. The playwright adapter is a capability-only stub
// (its create() throws), so the driver never spawns this yet — it exists as its own tsdown
// output so the spawn seam is pre-wired. If it is ever launched, it fails loud on fd 3 instead
// of hanging. When playwright lands, port its native output -> TestEvent NDJSON here, following
// vitest/child.ts (mind the import-vs-spawn footgun warning at the top of that file).
writeSync(3, JSON.stringify({type: 'error', reason: 'playwright runner not implemented'}) + '\n')
process.exit(1)
