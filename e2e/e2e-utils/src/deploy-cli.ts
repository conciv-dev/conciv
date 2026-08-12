import {deployPackedApp} from './deploy.js'
import {isE2EApp} from './ports.js'

async function main(): Promise<void> {
  const [, , app, pnpmFilter] = process.argv
  if (app === undefined || pnpmFilter === undefined) {
    throw new Error('usage: deploy-cli.ts <app> <pnpmFilter>')
  }
  if (!isE2EApp(app)) {
    throw new Error(`"${app}" is not a known e2e app`)
  }
  const target = await deployPackedApp(app, pnpmFilter)
  console.log(`deployed ${pnpmFilter} to ${target}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
