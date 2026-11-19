---
'@conciv/uno-preset': patch
'@conciv/ui-kit-chat': patch
'@conciv/solid-diffs': patch
'@conciv/ui-kit-chat-tools': patch
---

Code in tool cards sits on the same sunken surface as the JSON and console bodies. The preset gains a `rounded-chat-sm` radius token for the small chat corner.

A file's name is now the header of its code block, set apart from the code by a line. Every code and diff block has a copy button, in the header when the block names a file and at the top right otherwise, and a block cut short by its height limit shows how many lines are hidden and opens to show them all.
