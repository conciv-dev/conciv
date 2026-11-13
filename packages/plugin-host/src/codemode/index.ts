export const executeToolName = 'execute_typescript'

export const capabilityName = (path: string): string => path.split('.').join('_')

export const toolExpression = (path: string): string => `external_${capabilityName(path)}`

export const searchSignature: string = `search({
  query?: string,
  namespace?: string,
  /** @integer @exclusiveMinimum 0 */
  limit?: number,
  /** @integer @minimum 0 */
  offset?: number,
}): {
  items: Array<{
      path: string,
      description: string,
      signature: string,
    }>,
  /** @integer @minimum 0 */
  remaining: number,
  next: {
      /** @integer @minimum 0 */
      offset: number,
    } | null,
}`
