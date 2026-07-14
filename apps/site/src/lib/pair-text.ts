export function pairText(token: string, origin: string): string {
  return [
    'You are connecting this machine to the conciv widget on ' + origin + '.',
    '',
    'Run this command and KEEP IT RUNNING (do not background it and exit):',
    '',
    `  npx @conciv/connect --token ${token}`,
    '',
    'It starts a local conciv core bound to 127.0.0.1 in a throwaway workspace,',
    'reachable only by ' + origin + ' with this token.',
    '',
    'When it prints "connected", tell the user to return to their browser tab on',
    origin + ' — the widget there is now powered by this machine. Chrome will show',
    'a "local network access" permission prompt in that tab; the user should allow it.',
  ].join('\n')
}
