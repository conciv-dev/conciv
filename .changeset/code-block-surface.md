---
'@conciv/uno-preset': patch
'@conciv/ui-kit-chat': patch
'@conciv/solid-diffs': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/ui-kit-system': patch
'@conciv/core': patch
---

Code in tool cards sits on the same sunken surface as the JSON and console bodies. The preset gains a `rounded-chat-sm` radius token for the small chat corner.

A file's name is now the header of its code block, set apart from the code by a line. Every code and diff block has a copy button, in the header when the block names a file and at the top right otherwise, and a block cut short by its height limit shows how many lines are hidden and opens to show them all.

A bash call shows one box: its command is the header row, with copy and the expand control on that same line, and the output below. A long block shows exactly eleven lines (seventeen for logs and files) and its expand control names the true number of hidden lines; the trace row no longer clamps a code block a second time. Search matches, code-run output and a finished code fence in a chat message use the same header. Every icon in a kit button is a block box, so it centres with its label at any line height.
