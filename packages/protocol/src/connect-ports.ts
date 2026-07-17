export const CONNECT_FIRST_PORT = 4732
export const CONNECT_LAST_PORT = 4741

export function connectPorts(): number[] {
  const ports: number[] = []
  for (let port = CONNECT_FIRST_PORT; port <= CONNECT_LAST_PORT; port += 1) ports.push(port)
  return ports
}
