import {execFileSync, spawn, spawnSync, type ChildProcessWithoutNullStreams} from 'node:child_process'
import {once} from 'node:events'
import {mkdirSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {constants} from 'node:os'
import {join} from 'node:path'
import {expect, test} from '@playwright/test'

test.describe('conciv init on a real project', () => {
  const initTest = test.extend<{
    startInit: (cwd: string, env: NodeJS.ProcessEnv, bin: string) => ChildProcessWithoutNullStreams
  }>({
    // eslint-disable-next-line no-empty-pattern
    startInit: async ({}, use) => {
      const started: ChildProcessWithoutNullStreams[] = []
      await use((cwd, env, bin) => {
        const child = spawn(process.execPath, [bin, 'init', '--yes'], {cwd, env, detached: true})
        started.push(child)
        return child
      })
      for (const child of started) {
        if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) continue
        const closed = once(child, 'close')
        process.kill(-child.pid, 'SIGTERM')
        await closed
      }
    },
  })

  const seed = {name: 'init-e2e', private: true, devDependencies: {vite: '^7.0.0'}}
  const manifest = `${JSON.stringify(seed, null, 2)}\n`
  const lock = {
    name: seed.name,
    lockfileVersion: 3,
    requires: true,
    packages: {'': {name: seed.name, devDependencies: seed.devDependencies}},
  }
  const lockfile = `${JSON.stringify(lock, null, 2)}\n`

  function seedProject(binaries: string[]) {
    const project = test.info().outputPath('project')
    const tools = test.info().outputPath('tools')
    const home = test.info().outputPath('home')
    mkdirSync(project, {recursive: true})
    mkdirSync(tools, {recursive: true})
    mkdirSync(home, {recursive: true})
    writeFileSync(join(project, 'package.json'), manifest)
    writeFileSync(join(project, 'package-lock.json'), lockfile)
    writeFileSync(
      join(project, 'vite.config.ts'),
      "import {defineConfig} from 'vite'\n\nexport default defineConfig({plugins: []})\n",
    )
    execFileSync('git', ['init'], {cwd: project})
    execFileSync('git', ['add', '-A'], {cwd: project})
    execFileSync('git', ['-c', 'user.email=init@e2e', '-c', 'user.name=init', 'commit', '-m', 'seed'], {cwd: project})
    symlinkSync(process.execPath, join(tools, 'node'))
    for (const binary of binaries) {
      symlinkSync(execFileSync('which', [binary], {encoding: 'utf8'}).trim(), join(tools, binary))
    }
    const npmCache = execFileSync('npm', ['config', 'get', 'cache'], {encoding: 'utf8'}).trim()
    const env = {PATH: tools, HOME: home, NO_COLOR: '1', npm_config_cache: npmCache}
    const bin = createRequire(import.meta.url).resolve('@conciv/cli/bin')
    return {project, home, env, bin}
  }

  initTest(
    'init --yes with no npm on PATH plans npm, gives the npm install as a manual step and wires the rest',
    async ({startInit}) => {
      const {project, home, env, bin} = seedProject(['git'])
      mkdirSync(join(home, '.claude'))

      const child = startInit(project, env, bin)
      const chunks: string[] = []
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => chunks.push(chunk))
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => chunks.push(chunk))
      const [exitCode] = await once(child, 'close')
      const output = chunks.join('')

      expect(exitCode).toBe(0)

      expect(output).toContain('Detected: vite (vite.config.ts) · npm · harnesses: claude')
      expect(output).toContain('Installing @conciv/it with npm')
      expect(output).toContain('needs a manual step: spawn npm ENOENT')
      expect(output).toContain('The automatic install failed. Run this in your project:')
      expect(output).toMatch(/^│ +npm install --save-dev @conciv\/it +│$/m)
      expect(readFileSync(join(project, 'package.json'), 'utf8')).toBe(manifest)
      expect(output).toContain('Wired vite.config.ts')
      expect(readFileSync(join(project, 'vite.config.ts'), 'utf8')).toBe(
        "import {defineConfig} from 'vite'\nimport conciv from '@conciv/it/plugin/vite'\n\nexport default defineConfig({plugins: [conciv()]})\n",
      )
      expect(output).toContain('Wrote the conciv section to AGENTS.md')
      expect(readFileSync(join(project, 'AGENTS.md'), 'utf8')).toContain('conciv tools')
      expect(output).toContain('Installing the conciv claude plugin')
      expect(output).toContain('claude plugin install conciv-connect@conciv --scope local')
      expect(
        JSON.parse(readFileSync(join(project, '.conciv/claude-connect/.claude-plugin/marketplace.json'), 'utf8')),
      ).toMatchObject({name: 'conciv', plugins: [{name: 'conciv-connect'}]})
    },
  )

  function childPids(pid: number): number[] {
    const listed = spawnSync('pgrep', ['-P', String(pid)], {encoding: 'utf8'}).stdout
    return listed.split('\n').filter(Boolean).map(Number)
  }

  function alive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  for (const stop of [
    {name: 'Ctrl-C', signal: 'SIGINT', group: true},
    {name: 'SIGTERM', signal: 'SIGTERM', group: false},
    {name: 'SIGHUP', signal: 'SIGHUP', group: false},
  ] satisfies {name: string; signal: NodeJS.Signals; group: boolean}[]) {
    initTest(
      `${stop.name} while @conciv/it installs stops the npm install, puts package.json back and says the config was restored`,
      async ({startInit}) => {
        const {project, env, bin} = seedProject(['npm', 'git'])

        const child = startInit(project, env, bin)
        const output: string[] = []
        const installing = Promise.withResolvers<void>()
        const read = (chunk: string) => {
          output.push(chunk)
          if (output.join('').includes('Installing @conciv/it with npm')) installing.resolve()
        }
        child.stdout.setEncoding('utf8').on('data', read)
        child.stderr.setEncoding('utf8').on('data', read)
        const closed = once(child, 'close')
        await installing.promise
        const initPid = child.pid
        if (initPid === undefined) throw new Error('conciv init did not start')
        await expect.poll(() => childPids(initPid)).toHaveLength(1)
        const [installPid] = childPids(initPid)
        if (installPid === undefined) throw new Error('conciv init started no npm install')
        process.kill(stop.group ? -initPid : initPid, stop.signal)
        const [exitCode] = await closed

        expect(exitCode).toBe(128 + constants.signals[stop.signal])
        await expect.poll(() => alive(installPid)).toBe(false)
        expect(output.join('')).toContain('Interrupted')
        expect(output.join('')).toContain('your config was restored.')
        expect(readFileSync(join(project, 'package.json'), 'utf8')).toBe(manifest)
        expect(readFileSync(join(project, 'vite.config.ts'), 'utf8')).not.toContain('conciv')
      },
    )
  }
})
