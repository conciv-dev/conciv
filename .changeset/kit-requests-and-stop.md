---
'@conciv/simulation': patch
'@conciv/app': patch
---

The test engine records what each model request was given (`engine.requests()`: messages, and each tool's name and description), and a session can stop its live run (`session.stop()`, the chat stop the widget's Stop button sends), in node and browser mode alike.
