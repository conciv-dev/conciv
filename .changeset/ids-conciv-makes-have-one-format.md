---
'@conciv/plugin': patch
'@conciv/protocol': patch
'@conciv/core': patch
'@conciv/chat': patch
'@conciv/cli': patch
'@conciv/harness': patch
---

Ids conciv makes have one format from one maker, opencode's: sessions are `ses_` plus a descending id (runs `run_`, markers `mrk_`, calls `call_`, hub tasks `tsk_`, engines `eng_`, ptys `pty_`, settings generations `gen_`); an existing local database holds `conciv_` session ids that no longer validate, so reset it.
