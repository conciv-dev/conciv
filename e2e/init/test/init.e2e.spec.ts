import {execFile, execFileSync, spawn} from 'node:child_process'
import {once} from 'node:events'
import {readFileSync, symlinkSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'

describe('conciv init on a real project', () => {
  it('init --yes installs @conciv/it with npm, wires the vite config and teaches agents the CLI', async () => {
    const project = tempDir('conciv-init-project-')
    writeFileSync(
      join(project, 'package.json'),
      `${JSON.stringify({name: 'init-e2e', private: true, devDependencies: {vite: '^7.0.0'}}, null, 2)}\n`,
    )
    writeFileSync(
      join(project, 'vite.config.ts'),
      "import {defineConfig} from 'vite'\n\nexport default defineConfig({})\n",
    )
    execFileSync('git', ['init'], {cwd: project})
    execFileSync('git', ['add', '-A'], {cwd: project})
    execFileSync('git', ['-c', 'user.email=init@e2e', '-c', 'user.name=init', 'commit', '-m', 'seed'], {cwd: project})
    const tools = tempDir('conciv-init-tools-')
    symlinkSync(process.execPath, join(tools, 'node'))
    symlinkSync(execFileSync('which', ['npm'], {encoding: 'utf8'}).trim(), join(tools, 'npm'))
    symlinkSync(execFileSync('which', ['git'], {encoding: 'utf8'}).trim(), join(tools, 'git'))
    const env = {PATH: tools, HOME: tempDir('conciv-init-home-'), NO_COLOR: '1'}
    const bin = createRequire(import.meta.url).resolve('@conciv/cli/bin')

    const run = await promisify(execFile)(process.execPath, [bin, 'init', '--yes'], {cwd: project, env})
    const output = `${run.stdout}${run.stderr}`

    expect(output).toContain('Installed @conciv/it')
    expect(output).toContain('Wired vite.config.ts')
    expect(output).toContain('Wrote the conciv section to AGENTS.md')
    expect(JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))).toMatchObject({
      devDependencies: {'@conciv/it': expect.any(String)},
    })
    expect(readFileSync(join(project, 'vite.config.ts'), 'utf8')).toContain(
      "import conciv from '@conciv/it/plugin/vite'",
    )
    expect(readFileSync(join(project, 'AGENTS.md'), 'utf8')).toContain('conciv tools')
  })

  it('Ctrl-C while @conciv/it installs puts package.json back and says the config was restored', async () => {
    const project = tempDir('conciv-init-project-')
    const manifest = `${JSON.stringify({name: 'init-e2e', private: true, devDependencies: {vite: '^7.0.0'}}, null, 2)}\n`
    writeFileSync(join(project, 'package.json'), manifest)
    writeFileSync(
      join(project, 'vite.config.ts'),
      "import {defineConfig} from 'vite'\n\nexport default defineConfig({})\n",
    )
    execFileSync('git', ['init'], {cwd: project})
    execFileSync('git', ['add', '-A'], {cwd: project})
    execFileSync('git', ['-c', 'user.email=init@e2e', '-c', 'user.name=init', 'commit', '-m', 'seed'], {cwd: project})
    const tools = tempDir('conciv-init-tools-')
    symlinkSync(process.execPath, join(tools, 'node'))
    symlinkSync(execFileSync('which', ['npm'], {encoding: 'utf8'}).trim(), join(tools, 'npm'))
    symlinkSync(execFileSync('which', ['git'], {encoding: 'utf8'}).trim(), join(tools, 'git'))
    const env = {PATH: tools, HOME: tempDir('conciv-init-home-'), NO_COLOR: '1'}
    const bin = createRequire(import.meta.url).resolve('@conciv/cli/bin')

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
