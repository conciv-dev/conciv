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
    PERF_CASES.filter((name) => typeof medians[browser]?.[name]?.median !== 'number').map(
      (name) => `${browser} ${name}`,
    ),
  )
}

function readRecords(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function describeTooLoaded(file, when) {
  const records = readRecords(file)
  return PERF_BROWSERS.flatMap((browser) => {
    const failed = PERF_CASES.filter((name) => records[browser][name].broken.length > 0)
    if (failed.length === 0) return []
    const checks = failed.map((name) => `${records[browser][name].broken.join(', ')} on ${name}`).join('; ')
    return [
      `this machine is too loaded to judge: main itself failed ${checks} on ${browser} ${when}`,
      ...PERF_CASES.map(
        (name) =>
          `  main ${when} ${browser} ${name} samples p50/p95/max/over33/sampled: ${records[browser][name].samples.join(' | ')}`,
      ),
    ]
  })
}

function hundredths(value) {
  return Math.round(value * 100) / 100
}

function describeVerdict(passes) {
  return passes ? 'PASS' : 'FAIL'
}

function describeBrokenChecks(broken) {
  if (broken.length === 0) return ''
  return `; the branch itself failed ${broken.join(', ')}`
}

function describeDisagreement(medianPasses, firstPasses, firstLimit) {
  if (firstPasses === medianPasses) return ''
  return (
    `; the in-test check against main before the branch alone (limit ${firstLimit}) said ` +
    `${describeVerdict(firstPasses)}: this two-run verdict decides`
  )
}

function judgeCase(browser, name, records) {
  const branch = records.branch[browser][name]
  const before = records.before[browser][name].median
  const after = records.after[browser][name].median
  const twoRun = hundredths((before + after) / 2)
  const limit = hundredths(Math.max(branch.budgetMs, twoRun + branch.toleranceMs))
  const firstLimit = hundredths(Math.max(branch.budgetMs, before + branch.toleranceMs))
  const medianPasses = branch.median <= limit
  const passes = medianPasses && branch.broken.length === 0
  const verdict =
    `test:perf: ${describeVerdict(passes)} ${browser} ${name}: branch median p95 ${branch.median}, ` +
    `main ${before} before and ${after} after the branch, two-run main ${twoRun}, limit ${limit}`
  const disagreement = describeDisagreement(medianPasses, branch.median <= firstLimit, firstLimit)
  return {passes, line: `${verdict}${describeBrokenChecks(branch.broken)}${disagreement}`}
}

function reportVerdicts(verdicts, branchCode) {
  for (const verdict of verdicts) console.info(verdict.line)
  if (verdicts.some((verdict) => !verdict.passes)) {
    console.info('test:perf: FAIL')
    return 1
  }
  if (branchCode !== 0) {
    console.info(
      "test:perf: PASS: the branch run's own median check against main before the branch failed, " +
        'the two-run rule passes every case and the branch held every per-sample check',
    )
    return 0
  }
  console.info('test:perf: PASS')
  return 0
}

function judgeBranch(scratch, branchCode) {
  const missing = missingMedians(scratch.branch)
  if (missing.length > 0) {
    console.error(`test:perf: FAIL: the branch run recorded no median for: ${missing.join(', ')}`)
    return Math.max(branchCode, 1)
  }
  const records = {
    before: readRecords(scratch.before),
    branch: readRecords(scratch.branch),
    after: readRecords(scratch.after),
  }
  return reportVerdicts(
    PERF_BROWSERS.flatMap((browser) => PERF_CASES.map((name) => judgeCase(browser, name, records))),
    branchCode,
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

async function prepareMain(base, scratch) {
  console.info(`test:perf: preparing the merge base ${base} in ${scratch.checkout}`)
  await mustRun('creating the scratch checkout', 'git', ['worktree', 'add', '--detach', scratch.checkout, base], {
    cwd: APP_DIR,
  })
  await mustRun('installing the merge base', 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
    cwd: scratch.checkout,
  })
  await mustRun('building the merge base', 'pnpm', BUILD_ARGS, {cwd: scratch.checkout})
  for (const path of BRANCH_TEST_FILES) cpSync(join(APP_DIR, path), join(scratch.app, path), {recursive: true})
}

async function measureMain(scratch, file, when) {
  const measured = await run(`measuring the merge base ${when}`, 'pnpm', PERF_ARGS, {
    cwd: scratch.app,
    env: {CONCIV_PERF_RECORD: file},
  })
  const missing = missingMedians(file)
  if (missing.length > 0) {
    throw new Error(
      `${stepFailure(measured).message}\nThe merge base recorded no median ${when} for: ${missing.join(', ')}. ` +
        "If the output above is a failed import, this branch's perf test needs product code the merge base lacks.",
    )
  }
  const tooLoaded = describeTooLoaded(file, when)
  if (tooLoaded.length > 0) throw new Error(tooLoaded.join('\n'))
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
  const root = git(['rev-parse', '--show-toplevel'])
  const dir = mkdtempSync(join(dirname(root), 'conciv-perf-main-'))
  const scratch = {
    dir,
    checkout: join(dir, 'checkout'),
    app: join(dir, 'checkout', relative(root, APP_DIR)),
    before: join(dir, 'main-before.json'),
    branch: join(dir, 'branch.json'),
    after: join(dir, 'main-after.json'),
  }
  process.once('SIGINT', () => abort(scratch, 'SIGINT'))
  process.once('SIGTERM', () => abort(scratch, 'SIGTERM'))
  try {
    await prepareMain(base, scratch)
    await mustRun('building the branch', 'pnpm', BUILD_ARGS, {cwd: APP_DIR})
    await measureMain(scratch, scratch.before, 'before the branch')
  } catch (error) {
    removeScratch(scratch)
    throw new Error(`${error.message}\nNo branch run happened.`, {cause: error})
  }
  try {
    const branch = await run('the branch perf run', 'pnpm', PERF_ARGS, {
      cwd: APP_DIR,
      env: {CONCIV_PERF_BASELINE: scratch.before, CONCIV_PERF_RECORD: scratch.branch},
    })
    try {
      await measureMain(scratch, scratch.after, 'after the branch')
    } catch (error) {
      throw new Error(
        `${error.message}\nThe branch's lines above are not a verdict: neither a pass nor a regression.`,
        {cause: error},
      )
    }
    return judgeBranch(scratch, branch.code)
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
