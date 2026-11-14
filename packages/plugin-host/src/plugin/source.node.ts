import {readFileSync, statSync} from 'node:fs'
import {registerHooks, type ResolveFnOutput, type ResolveHookContext} from 'node:module'
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
      const resolved = resolveLocal(specifier, context, nextResolve, local, track)
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
      const typescript = typescriptLoaders[path.extname(file)]
      if (!typescript) return nextLoad(url, context)
      const {code} = transformSync(readFileSync(file, 'utf8'), {
        loader: typescript.loader,
        format: typescript.format,
        jsx: 'automatic',
        sourcefile: file,
      })
      return {format: typescript.format === 'cjs' ? 'commonjs' : 'module', source: code, shortCircuit: true}
    },
  })
  const specifier = fresh(entrypoint)
  return {version: specifier, load: () => Host.load(specifier), dispose: () => hook.deregister()}
}

function resolveLocal(
  specifier: string,
  context: ResolveHookContext,
  nextResolve: (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput,
  local: URL,
  track: (file: string, directory?: boolean) => void,
) {
  try {
    return nextResolve(specifier, context)
  } catch (error) {
    const candidate = bunCandidates(fileURLToPath(local)).find((file) =>
      statSync(file, {throwIfNoEntry: false})?.isFile(),
    )
    if (candidate) return nextResolve(pathToFileURL(candidate).href, context)
    track(path.dirname(fileURLToPath(local)), true)
    throw error
  }
}

const typescriptLoaders: Partial<Record<string, {loader: 'ts' | 'tsx'; format: 'esm' | 'cjs'}>> = {
  '.ts': {loader: 'ts', format: 'esm'},
  '.tsx': {loader: 'tsx', format: 'esm'},
  '.mts': {loader: 'ts', format: 'esm'},
  '.cts': {loader: 'ts', format: 'cjs'},
}

const bunExtensions = ['.tsx', '.jsx', '.mts', '.ts', '.mjs', '.js', '.cts', '.cjs', '.json']

const typescriptTwins: Partial<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
}

function bunCandidates(file: string) {
  const extension = path.extname(file)
  const twins = (typescriptTwins[extension] ?? []).map((twin) => file.slice(0, -extension.length) + twin)
  const appended = bunExtensions.map((candidate) => file + candidate)
  const indexes = bunExtensions.map((candidate) => path.join(file, `index${candidate}`))
  return [...twins, ...appended, ...indexes]
}
