---
'@conciv/ui-kit-chat': patch
---

Scrolling up while a reply streams now lets go of the end right away. Before, a reader sitting at the end of the thread who nudged up with a trackpad was pulled back down on every new chunk, and a reader scrolled into a long streaming reply kept drifting with it. Now a small scroll up is enough to stop following, the text you are reading stays still while the reply keeps growing below it, and a reader who stays at the end still follows the whole stream.
