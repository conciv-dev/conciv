import {z} from 'zod'

export const ProgressSchema = z
  .object({
    closed: z.number().describe('rows of the previous round this round no longer has'),
    opened: z.number().describe('rows this round has that the previous round did not'),
    kept: z
      .array(
        z.object({
          node: z.string(),
          id: z.string().nullable(),
          text: z.string(),
          repeat: z.number().describe('how many rounds in a row this row was returned before this one'),
        }),
      )
      .describe('rows the previous round had too'),
    mapped: z.object({
      gained: z.array(z.string()).describe('nodes an element renders now and did not in the previous round'),
      lost: z.array(z.string()).describe('nodes an element rendered in the previous round and does not now'),
    }),
    pixels: z
      .object({now: z.number().nullable(), before: z.number().nullable()})
      .describe('share of pixels unlike the design, this round and the previous one'),
    changed: z
      .object({
        ratio: z
          .number()
          .describe('share of pixels that changed since the previous screenshot, anti-aliasing left out'),
        regions: z.array(
          z.object({
            box: z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()}),
            ids: z
              .array(
                z.object({
                  id: z.string(),
                  node: z.string().nullable(),
                  name: z.string().nullable(),
                  source: z.string().nullable(),
                  overlap: z.number().describe('share of the region the element covers'),
                }),
              )
              .describe('the elements whose boxes overlap the region most'),
          }),
        ),
        truncated: z.boolean().describe('too many regions: the one region is the box around all of them'),
        count: z.number().describe('how many regions changed'),
      })
      .nullable()
      .describe('the screenshot against the previous one; null when that one is not stored'),
    note: z.string().nullable(),
  })
  .describe('what changed since the previous round')
