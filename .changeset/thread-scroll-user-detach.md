---
'@conciv/ui-kit-chat': patch
---

Touch, wheel, and keyboard scrolling in the thread now detaches auto-follow, so scrolling back through a reply while the assistant is still streaming no longer fights a re-pin that snaps you to the bottom. This was most visible on iOS, where the browser reports scrolling later than the streamed content arrives. Auto-follow resumes as soon as you return to the bottom or press the scroll-to-end button.
