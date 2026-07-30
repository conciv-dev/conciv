export type NoticeAction = {label: string; run: () => void}

export type Notice = {message: string; action: NoticeAction | null}

export type Notify = (message: string, action?: NoticeAction) => void
