export function honestWait(register: (listener: () => void) => void): Promise<void> {
  return new Promise((resolve) => register(resolve))
}
