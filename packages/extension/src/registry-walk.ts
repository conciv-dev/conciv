import {isProcedure, traverseContractProcedures, type AnyRouter} from '@orpc/server'

export type RegistryWalkEntry = {
  path: readonly string[]
  procedure: object
  meta: Record<string, unknown>
  errorMap: Record<string, {message?: string} | undefined>
  inputSchema: unknown
  outputSchema: unknown
}

export function isRegistryBranch(node: AnyRouter): node is Record<string, AnyRouter> {
  return typeof node === 'object' && node !== null && !isProcedure(node)
}

export function walkRegistryProcedures(router: AnyRouter): RegistryWalkEntry[] {
  const entries: RegistryWalkEntry[] = []
  traverseContractProcedures({router, path: []}, ({contract, path}) => {
    const definition = contract['~orpc']
    entries.push({
      path,
      procedure: contract,
      meta: definition.meta ?? {},
      errorMap: definition.errorMap ?? {},
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
    })
  })
  return entries
}
