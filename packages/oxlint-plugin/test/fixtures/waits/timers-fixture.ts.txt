export async function sleepingTest(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10))
  const ticker = setInterval(() => undefined, 5)
  clearInterval(ticker)
  globalThis.setImmediate(() => undefined)
}
