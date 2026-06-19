import type {FileDiffOptions, FileOptions} from '@mandarax/solid-diffs'

// Highlight the embedded @pierre/diffs viewers with github-dark so they match the widget's markdown
// code blocks and sit on the mandarax dark panel (instead of the library's unrelated default theme).
export const DIFF_OPTIONS: FileDiffOptions<undefined> = {theme: 'github-dark'}
export const CODE_OPTIONS: FileOptions<undefined> = {theme: 'github-dark'}
