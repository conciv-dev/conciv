import {composeGrabText, type Grab, type GrabFrame, type GrabSourceLoc} from '@conciv/grab'

export type Symbolicate = (input: {frames: GrabFrame[]}) => Promise<GrabSourceLoc | null>

export async function resolveGrabSource(grab: Grab, symbolicate: Symbolicate): Promise<Grab | null> {
  const frames = grab.frames ?? []
  if (grab.source || frames.length === 0) return null
  const source = await symbolicate({frames}).catch(() => null)
  if (!source) return null
  return {
    ...grab,
    source: {componentName: null, filePath: source.file, lineNumber: source.line},
    text: composeGrabText(grab.snippet ?? '', source, grab.text),
  }
}
