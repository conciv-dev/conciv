---
'@conciv/extension-ios': patch
---

The ios extension is now a Devframe plugin. ios_build, ios_run, ios_screenshot and ios_logs are served as ios:build, ios:run, ios:screenshot and ios:logs hub functions that reach the agent under the same tool names, inputs and outputs; ios_build and ios_run still ask for approval and stay out of code mode. The client half keeps the native bridge surface and makes no server calls.
