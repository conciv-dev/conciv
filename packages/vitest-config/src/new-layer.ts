const DOM_TEST_FILE = /\.dom\.test\.tsx?$/
const FLOW_TEST_FILE = /\.flow\.test\.ts$/
const COLOCATED_TEST_NAME = /[^\\/]\.test\.tsx?$/
const SOURCE_DIRECTORY = /(?:^|[\\/])src[\\/]/
const LINE_TERMINATORS = ['\n', '\r', '\u2028', '\u2029']
const OLD_LAYER_TEST_FILE = /\.(?:it|browser)\.test\.tsx?$/

export function isDomTestFile(filename: string): boolean {
  return DOM_TEST_FILE.test(filename)
}

function readLastLine(path: string): string {
  return path.slice(Math.max(0, ...LINE_TERMINATORS.map((terminator) => path.lastIndexOf(terminator))))
}

function isUnderSourceDirectory(filename: string): boolean {
  const directoryEnd = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1
  return SOURCE_DIRECTORY.test(readLastLine(filename.slice(0, directoryEnd)))
}

function isColocatedTestFile(filename: string): boolean {
  return COLOCATED_TEST_NAME.test(filename) && isUnderSourceDirectory(filename) && !OLD_LAYER_TEST_FILE.test(filename)
}

export function isNewLayerTestFile(filename: string): boolean {
  return isDomTestFile(filename) || FLOW_TEST_FILE.test(filename) || isColocatedTestFile(filename)
}
