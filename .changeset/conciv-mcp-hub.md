---
'@conciv/cli': patch
---

Outside agents can use a conciv tab: `conciv mcp` is a hub any harness (Claude Code, Codex, Gemini CLI) can add as an MCP server, and the widget's "Connect agents" menu installs it with one click. The agent finds the open tabs with `external_tabs`, picks one with `external_use_tab`, and its calls run there after you allow them; they show in that tab's chat tagged "from <agent>" and survive a reload, and the launcher badges a closed panel while an agent waits for your Allow. `conciv tools` lists every open tab and acts on one with `--tab`. The composer's terminal launch menu and the terminal's "Open externally" button are gone.
