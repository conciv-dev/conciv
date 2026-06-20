import {execFileSync} from 'node:child_process'

// Phase 0 environment preflight for canvas-comments: every external binary the feature depends on.
// trail is a PATH binary (not npm); sqlite3 is used by the comment-store ITs to inspect the db.
const checks = [
  ['trail', ['--version']],
  ['sqlite3', ['--version']],
  ['node', ['--version']],
  ['pnpm', ['--version']],
]

const results = checks.map(([bin, args]) => {
  try {
    return {bin, ok: true, out: execFileSync(bin, args, {encoding: 'utf8'}).trim().split('\n')[0]}
  } catch (e) {
    return {bin, ok: false, out: String(e.message)}
  }
})

for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.bin}: ${r.out}`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
