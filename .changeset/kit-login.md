---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

A test logs a browser in and out: `engine.loginCode()` issues a login code, `engine.revokeBrowsers()` revokes every trusted browser, and `mount({login: 'none'})` opens the app logged out.
