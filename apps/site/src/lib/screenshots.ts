import screenshots from '../data/screenshots-index.json'

export type ScreenshotEntry = (typeof screenshots)[number]

export function findScreenshot(file: string): ScreenshotEntry {
  const entry = screenshots.find((item) => item.file === file)
  if (!entry) throw new Error(`Missing screenshot manifest entry for ${file}`)
  return entry
}
