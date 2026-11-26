import {describe, expect, it} from 'vitest'
import {
  claudeBlockToUnifiedDiff,
  parseClaudePatchBlocks,
  patchInfo,
  readPatchText,
} from '../../src/primitives/tools/apply-patch-text.js'

describe('reading an apply_patch call', () => {
  it.each([
    {
      name: 'a one-file update between Begin and End markers',
      arguments: JSON.stringify({
        patchText:
          '*** Begin Patch\n*** Update File: src/app.ts\n@@ function main\n-const a = 1\n+const a = 2\n keep\n*** End Patch',
      }),
      info: {files: ['app.ts'], added: 1, removed: 1},
      diffs: [
        'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,2 +1,2 @@\n-const a = 1\n+const a = 2\n keep',
      ],
    },
    {
      name: 'a patch that adds, deletes and updates three files',
      arguments: JSON.stringify({
        patch:
          '*** Begin Patch\n*** Add File: docs/notes.md\n+# Notes\n+first\n*** Delete File: old/legacy.ts\n*** Update File: src/app.ts\n-const a = 1\n+const a = 2\n*** End Patch',
      }),
      info: {files: ['notes.md', 'legacy.ts', 'app.ts'], added: 3, removed: 1},
      diffs: [
        'diff --git a/docs/notes.md b/docs/notes.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/notes.md\n@@ -0,0 +1,2 @@\n+# Notes\n+first',
        'diff --git a/old/legacy.ts b/old/legacy.ts\ndeleted file mode 100644\n--- a/old/legacy.ts\n+++ /dev/null',
        'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,1 +1,1 @@\n-const a = 1\n+const a = 2',
      ],
    },
    {
      name: 'a header that names no file',
      arguments: JSON.stringify({content: '*** Begin Patch\n*** Update File:   \n+added\n*** End Patch'}),
      info: {files: [], added: 1, removed: 0},
      diffs: [],
    },
    {
      name: 'arguments that are not JSON',
      arguments: '{"patchText": "*** Update File: src/app.ts',
      info: {files: [], added: 0, removed: 0},
      diffs: [],
    },
  ])('reads $name as its files, line counts and diffs', ({arguments: input, info, diffs}) => {
    const text = readPatchText({
      type: 'tool-call',
      id: 'c1',
      name: 'apply_patch',
      arguments: input,
      state: 'input-complete',
    })
    expect(patchInfo(text)).toEqual(info)
    expect(parseClaudePatchBlocks(text).map(claudeBlockToUnifiedDiff)).toEqual(diffs)
  })
})
