export const Arm = {
  TOOLS: 'tools',
  CONTROL: 'control',
} as const satisfies Record<string, string>

export type Arm = (typeof Arm)[keyof typeof Arm]
