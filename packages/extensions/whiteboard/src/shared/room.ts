export const roomId = (previewId: string, sessionId: string): string => `${previewId}:${sessionId || 'local'}`
