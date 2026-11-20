const DOM_TEST_FILE = /\.dom\.test\.tsx?$/
const FLOW_TEST_FILE = /\.flow\.test\.ts$/
const COLOCATED_TEST_FILE = /(^|[\\/])src[\\/](?:.*[\\/])?[^\\/]+\.test\.tsx?$/
const OLD_LAYER_TEST_FILE = /\.(?:it|browser)\.test\.tsx?$/

export function isDomTestFile(filename: string): boolean {
  return DOM_TEST_FILE.test(filename)
}

function isColocatedTestFile(filename: string): boolean {
  return COLOCATED_TEST_FILE.test(filename) && !OLD_LAYER_TEST_FILE.test(filename)
}

export function isNewLayerTestFile(filename: string): boolean {
  return isDomTestFile(filename) || FLOW_TEST_FILE.test(filename) || isColocatedTestFile(filename)
}
