type TestKind = 'unit' | 'it' | 'e2e'

const KIND_NAME = /[^\\/]\.(unit|it|e2e)\.test\.(?:ts|tsx|js)$/

function isTestKind(kind: string | undefined): kind is TestKind {
  return kind === 'unit' || kind === 'it' || kind === 'e2e'
}

export function readTestKind(filename: string): TestKind | undefined {
  const kind = KIND_NAME.exec(filename)?.[1]
  if (!isTestKind(kind)) return undefined
  return filename.replaceAll('\\', '/').includes(`/test/${kind}/`) ? kind : undefined
}

export function isDomTestFile(filename: string): boolean {
  return readTestKind(filename) === 'unit'
}

export function isNewLayerTestFile(filename: string): boolean {
  const kind = readTestKind(filename)
  return kind === 'unit' || kind === 'it'
}
