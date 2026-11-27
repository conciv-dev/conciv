import type {AnyRoute} from '@bomb.sh/router'
import {main} from './main.js'

export interface CommandParam {
  readonly name: string
  readonly kind: 'argument' | 'option' | undefined
  readonly label: string | undefined
  readonly description: string | undefined
}

export interface Command {
  readonly path: string
  readonly description: string
  readonly runs: boolean
  readonly params: readonly CommandParam[]
}

function readParams(route: AnyRoute): CommandParam[] {
  return route.phases.flatMap((phase) =>
    Object.values(phase.model.params).map((param) => ({
      name: param.name,
      kind: param.cli.syntax?.type,
      label: param.cli.syntax?.label,
      description: param.description,
    })),
  )
}

function isInherited(param: CommandParam, inherited: readonly CommandParam[]): boolean {
  return inherited.some((parent) => parent.name === param.name && parent.description === param.description)
}

function collectCommands(route: AnyRoute, path: readonly string[], inherited: readonly CommandParam[]): Command[] {
  const params = readParams(route)
  const children = route.phases.flatMap((phase) => phase.routes)
  const command = {
    path: path.join(' '),
    description: route.description ?? '',
    runs: route.methods.includes('execute'),
    params: params.filter((param) => !isInherited(param, inherited)),
  }
  return [
    command,
    ...children.flatMap((child) => collectCommands(child, [...path, child.name], [...inherited, ...params])),
  ]
}

export function readCommandTree(): Command[] {
  return collectCommands(main, [main.name], [])
}
