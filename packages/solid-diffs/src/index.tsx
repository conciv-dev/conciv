// SolidJS wrappers over @pierre/diffs' framework-agnostic renderers, plus the underlying types so
// consumers build FileContents / options without importing @pierre/diffs directly.
export {SolidFileDiff, type SolidFileDiffProps} from './file-diff.js'
export {SolidCodeBlock, type SolidCodeBlockProps} from './code-block.js'
export type {FileContents, FileDiffOptions, FileOptions} from '@pierre/diffs'
