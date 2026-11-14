import {execFileSync, spawn} from 'node:child_process'
import {once} from 'node:events'
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {constants} from 'node:os'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const APP_DIR = dirname(fileURLToPath(import.meta.url))
const PERF_BROWSERS = ['chromium', 'firefox']
const PERF_CASES = ['multi-tool', 'virtual-boundary', 'code-block', 'glide']
const BRANCH_TEST_FILES = [
  'test/calm-perf.browser.test.tsx',
  'test/helpers.browser.tsx',
  'test/commands',
  'vitest.config.ts',
]
const BUILD_ARGS = ['turbo', 'run', 'build', '--filter=@conciv/app^...']
const PERF_ARGS = ['exec', 'vitest', 'run', '--project', 'perf']
const OUTPUT_TAIL_LINES = 40
const running = new Set()

function git(args) {
  return execFileSync('git', args, {cwd: APP_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim()
}

function run(step, command, args, options) {
  const tail = []
  const keep = (chunk, stream) => {
    stream.write(chunk)
    tail.push(...chunk.toString().split('\n'))
    tail.splice(0, Math.max(0, tail.length - OUTPUT_TAIL_LINES))
  }
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {...process.env, ...options.env},
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    running.add(child)
    child.stdout.on('data', (chunk) => keep(chunk, process.stdout))
    child.stderr.on('data', (chunk) => keep(chunk, process.stderr))
    child.on('error', (error) => tail.push(error.message))
    child.on('close', (code) => {
      running.delete(child)
      resolve({step, code: code ?? 1, tail})
    })
  })
}

function stepFailure(result) {
  return new Error(`${result.step} failed (exit ${result.code}). Last output:\n${result.tail.join('\n')}`)
}

async function mustRun(step, command, args, options) {
  const result = await run(step, command, args, options)
  if (result.code !== 0) throw stepFailure(result)
  return result
}

function missingMedians(file) {
  if (!existsSync(file)) return PERF_BROWSERS.flatMap((browser) => PERF_CASES.map((name) => `${browser} ${name}`))
  const medians = JSON.parse(readFileSync(file, 'utf8'))
  return PERF_BROWSERS.flatMap((browser) =>
    PERF_CASES.filter((name) => typeof medians[browser]?.[name] !== 'number').map((name) => `${browser} ${name}`),
  )
}

function removeCheckout(scratch) {
  if (!existsSync(scratch.checkout)) return
  rmSync(scratch.checkout, {recursive: true, force: true, maxRetries: 3})
  try {
    git(['worktree', 'remove', scratch.checkout])
  } catch (error) {
    console.error(`test:perf: could not unregister the scratch worktree ${scratch.checkout}: ${error.message}`)
  }
  console.info(`test:perf: removed the scratch checkout ${scratch.checkout}`)
}

function removeScratch(scratch) {
  removeCheckout(scratch)
  rmSync(scratch.dir, {recursive: true, force: true, maxRetries: 3})
}

async function abort(scratch, signal) {
  const open = [...running]
  for (const child of open) child.kill(signal)
  await Promise.all(open.map((child) => once(child, 'close')))
  removeScratch(scratch)
  process.exit(128 + constants.signals[signal])
}

async function measureMain(base, scratch) {
  const appPath = relative(git(['rev-parse', '--show-toplevel']), APP_DIR)
  const scratchApp = join(scratch.checkout, appPath)
  console.info(`test:perf: measuring the merge base ${base} in ${scratch.checkout}`)
  await mustRun('creating the scratch checkout', 'git', ['worktree', 'add', '--detach', scratch.checkout, base], {
    cwd: APP_DIR,
  })
  await mustRun('installing the merge base', 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
    cwd: scratch.checkout,
  })
  await mustRun('building the merge base', 'pnpm', BUILD_ARGS, {cwd: scratch.checkout})
  for (const path of BRANCH_TEST_FILES) cpSync(join(APP_DIR, path), join(scratchApp, path), {recursive: true})
  const measured = await run('measuring the merge base', 'pnpm', PERF_ARGS, {
    cwd: scratchApp,
    env: {CONCIV_PERF_RECORD: scratch.medians},
  })
  const missing = missingMedians(scratch.medians)
  if (missing.length > 0) {
    throw new Error(
      `${stepFailure(measured).message}\nThe merge base recorded no median for: ${missing.join(', ')}. ` +
        "If the output above is a failed import, this branch's perf test needs product code the merge base lacks.",
    )
  }
  console.info(
    `test:perf: main's medians (its own verdicts are printed above): ${readFileSync(scratch.medians, 'utf8')}`,
  )
}

async function main() {
  const base = git(['merge-base', 'HEAD', 'origin/main'])
  if (base === git(['rev-parse', 'HEAD'])) {
    console.info(
      'test:perf: HEAD is the merge base with origin/main: no baseline, judged against the fixed budget only',
    )
    await mustRun('building', 'pnpm', BUILD_ARGS, {cwd: APP_DIR})
    return (await run('the perf run', 'pnpm', PERF_ARGS, {cwd: APP_DIR})).code
  }
  const dir = mkdtempSync(join(dirname(git(['rev-parse', '--show-toplevel'])), 'conciv-perf-main-'))
  const scratch = {dir, checkout: join(dir, 'checkout'), medians: join(dir, 'medians.json')}
  process.once('SIGINT', () => abort(scratch, 'SIGINT'))
  process.once('SIGTERM', () => abort(scratch, 'SIGTERM'))
  try {
    await measureMain(base, scratch)
  } catch (error) {
    removeScratch(scratch)
    throw new Error(`${error.message}\nNo branch run happened: there is no baseline from main.`, {cause: error})
  }
  removeCheckout(scratch)
  try {
    await mustRun('building the branch', 'pnpm', BUILD_ARGS, {cwd: APP_DIR})
    const branch = await run('the branch perf run', 'pnpm', PERF_ARGS, {
      cwd: APP_DIR,
      env: {CONCIV_PERF_BASELINE: scratch.medians},
    })
    return branch.code
  } finally {
    removeScratch(scratch)
  }
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    console.error(`test:perf: ${error.message}`)
    process.exitCode = 1
  },
)
