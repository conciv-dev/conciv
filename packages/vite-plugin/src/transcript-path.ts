import {homedir} from 'node:os'
import {join} from 'node:path'

// Claude encodes the project dir by replacing every non-alphanumeric path char with '-'.
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

// Where Claude persists a session's JSONL transcript:
// ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
export function transcriptPath(cwd: string, sessionId: string, home: string = homedir()): string {
  return join(home, '.claude', 'projects', encodeProjectDir(cwd), `${sessionId}.jsonl`)
}
