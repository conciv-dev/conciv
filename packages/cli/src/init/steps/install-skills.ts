import {depInstallStep, type AddDep} from './install-dep.js'
import type {InitStep} from '../pipeline.js'

export const skillsPackName = '@conciv/skills'

export function installSkillsStep(add: AddDep, packageManager: string): InitStep {
  return depInstallStep({id: 'install-skills', name: skillsPackName, add, packageManager})
}
