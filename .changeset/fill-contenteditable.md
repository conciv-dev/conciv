---
'@conciv/extension-page': patch
---

`page_fill` now types into rich-text editors built on `contenteditable` (plain, `plaintext-only`, Tiptap/ProseMirror, Lexical, Slate, Quill): it dispatches `beforeinput`/`input` first, falls back to editing commands when the editor cancels them, and fails with a clear error when the editor's text still lacks the value. Read-only editors (`contenteditable="false"`, `aria-readonly="true"`) and CodeMirror/Monaco code editors are refused instead of reported as filled.
