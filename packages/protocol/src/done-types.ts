import {z} from 'zod'

// The agent-authored "done" summary. This is the structured-output contract: claude/codex emit it
// at the end of a turn (Plan D), the widget renders it as the done card. Every field is REQUIRED and
// additionalProperties is false, because codex's OpenAI-strict response_format rejects optional keys
// (verified live); "optional" fields are required-but-emptyable (filesChanged: [], summary: '').
export const DoneCardSchema = z
  .object({
    // The conversational reply, rendered as the turn's normal text. The rest is the structured roll-up.
    message: z.string(),
    summary: z.string(),
    filesChanged: z.array(z.string()),
    pageActions: z.array(z.string()),
    testsPassed: z.boolean(),
  })
  .strict()

export type DoneCard = z.infer<typeof DoneCardSchema>
