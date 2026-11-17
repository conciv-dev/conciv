---
'@conciv/plugin-recorder': patch
---

The Recorder panel gains "Send to agent": it saves the recording, attaches it to the composer as a "Screen recording" note naming the recording's id, and brings the user back to the chat. The recorder draws that note as its own card in the composer and in the sent message: the poster, and Play, which opens a "Screen recording replay" dialog with the player and Export video, or says the recording expired or could not load.

The agent reads a sent recording with a new tool, `recording_get({recordingId, keyframes?})`: the recording's action log and keyframe screenshots, or an error when the recording has expired. The recorder skill names it and says when to call it.
