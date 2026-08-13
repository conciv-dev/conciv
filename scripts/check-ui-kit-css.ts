#!/usr/bin/env node
import {execFileSync} from 'node:child_process'

const UI_KIT_CSS_PATTERN = /^packages\/ui-kit-[^/]+\/src\/.*\.css$/
const GIT_SCAN_PATHSPEC = ':(glob)packages/ui-kit-*/src/**/*.css'

const MESSAGE =
  'component styles belong in packages/uno-preset (keyframes -> src/animation.ts, animation ' +
  'shortcuts -> src/motion.ts, effects/rules/preflights -> the preset), .css is only for ' +
  'tokens/themes.'

function isAllowlisted(path: string): boolean {
  const segments = path.split('/')
  const basename = segments[segments.length - 1]
  if (basename === 'tokens.css') return true
  return segments.includes('theme')
}

function findBannedPaths(paths: string[]): string[] {
  return paths.filter((path) => UI_KIT_CSS_PATTERN.test(path) && !isAllowlisted(path))
}

function scanTrackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files', GIT_SCAN_PATHSPEC], {encoding: 'utf8'})
  return output.split('\n').filter((line) => line.length > 0)
}

function main(): void {
  const argPaths = process.argv.slice(2)
  const candidatePaths = argPaths.length > 0 ? argPaths : scanTrackedFiles()
  const banned = findBannedPaths(candidatePaths)

  if (banned.length === 0) return

  console.error('check-ui-kit-css: banned ui-kit component .css file(s) found:\n')
  for (const path of banned) console.error(`  ${path}`)
  console.error(`\n${MESSAGE}`)
  process.exitCode = 1
}

main()
