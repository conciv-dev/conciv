import {existsSync, readFileSync} from 'node:fs'
import {registerHooks} from 'node:module'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {transformSync} from 'esbuild'
import {localSource} from './source.js'
import {missingPackageTarget} from './source.package.js'
import * as Host from '@conciv/plugin/host'

let generation = Date.now()

export async function prepareSource(entrypoint: string, track: (file: string, directory?: boolean) => void) {
  const version = String(++generation)
  const fresh = (specifier: string) => {
    const url = new URL(specifier)
    url.searchParams.set('__opencode_reload', version)
    return url.href
  }
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!context.parentURL || new URL(context.parentURL).searchParams.get('__opencode_reload') !== version)
        return nextResolve(specifier, context)
      const local =
        specifier.startsWith('./') || specifier.startsWith('../')
          ? new URL(specifier, context.parentURL)
          : localSource(specifier, path.dirname(fileURLToPath(context.parentURL)))
      if (!local) {
        try {
          return nextResolve(specifier, context)
        } catch (error) {
          const target = missingPackageTarget(specifier, fileURLToPath(context.parentURL))
          if (target) track(target, true)
          throw error
        }
      }
      if (fileURLToPath(local).split(path.sep).includes('node_modules')) return nextResolve(specifier, context)
      const resolved = (() => {
        try {
          return nextResolve(specifier, context)
        } catch (error) {
          const typescript = typescriptSource(local)
          if (typescript) return nextResolve(pathToFileURL(typescript).href, context)
          track(path.dirname(fileURLToPath(local)), true)
          throw error
        }
      })()
      if (!resolved.url.startsWith('file:')) return resolved
      const file = fileURLToPath(resolved.url)
      if (file.split(path.sep).includes('node_modules')) return resolved
      track(file)
      return {...resolved, url: fresh(resolved.url)}
    },
    load(url, context, nextLoad) {
      if (!url.startsWith('file:') || new URL(url).searchParams.get('__opencode_reload') !== version)
        return nextLoad(url, context)
      const file = fileURLToPath(url)
      const loader = typescriptLoaders[path.extname(file)]
      if (!loader) return nextLoad(url, context)
      const {code} = transformSync(readFileSync(file, 'utf8'), {
        loader,
        format: 'esm',
        jsx: 'automatic',
        sourcefile: file,
      })
      return {format: 'module', source: code, shortCircuit: true}
    },
  })
  const specifier = fresh(entrypoint)
  return {version: specifier, load: () => Host.load(specifier), dispose: () => hook.deregister()}
}

const typescriptLoaders: Partial<Record<string, 'ts' | 'tsx'>> = {'.ts': 'ts', '.tsx': 'tsx'}

const typescriptExtensions: Partial<Record<string, readonly string[]>> = {'.js': ['.ts', '.tsx'], '.jsx': ['.tsx']}

function typescriptSource(local: URL) {
  const file = fileURLToPath(local)
  const extension = path.extname(file)
  return (typescriptExtensions[extension] ?? [])
    .map((candidate) => file.slice(0, -extension.length) + candidate)
    .find((candidate) => existsSync(candidate))
}
