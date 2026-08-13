import {addDevDependency} from 'nypm'
import {depInstallStep, hasDep, type AddDep, type PackageJson} from './install-dep.js'
import type {InitStep} from '../pipeline.js'

const itName = '@conciv/it'

export type {AddDep, PackageJson}

export function hasIt(pkg: PackageJson): boolean {
  return hasDep(pkg, itName)
}

export const addWithNypm: AddDep = async (name, opts) => {
  await addDevDependency(name, {cwd: opts.cwd, silent: true})
}

export function installItStep(add: AddDep, packageManager: string): InitStep {
  return depInstallStep({id: 'install', name: itName, add, packageManager})
}
