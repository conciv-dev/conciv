import {execFile, execFileSync, spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdirSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {expect, test} from '@playwright/test'

test.describe('conciv init on a real project', () => {
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

  test('init --yes with no npm on PATH plans npm, gives the npm install as a manual step and wires the rest', async () => {
    const {project, home, env, bin} = seedProject(['git'])
    mkdirSync(join(home, '.claude'))

    const run = await promisify(execFile)(process.execPath, [bin, 'init', '--yes'], {cwd: project, env})
    const output = `${run.stdout}${run.stderr}`

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
  })

  test('Ctrl-C while @conciv/it installs puts package.json back and says the config was restored', async () => {
    const {project, env, bin} = seedProject(['npm', 'git'])

    const child = spawn(process.execPath, [bin, 'init', '--yes'], {cwd: project, env, detached: true})
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
    if (child.pid === undefined) throw new Error('conciv init did not start')
    process.kill(-child.pid, 'SIGINT')
    const [exitCode] = await closed

    expect(exitCode).toBe(130)
    expect(output.join('')).toContain('Interrupted')
    expect(output.join('')).toContain('your config was restored.')
    expect(readFileSync(join(project, 'package.json'), 'utf8')).toBe(manifest)
    expect(readFileSync(join(project, 'vite.config.ts'), 'utf8')).not.toContain('conciv')
  })
})
