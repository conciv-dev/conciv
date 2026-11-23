import {Effect, SubscriptionRef} from 'effect'

type MachineTransition<State, Command> = {readonly state: State; readonly effects: readonly Command[]}

export type MachineDriver<State, Event, Command = unknown> = {
  readonly state: SubscriptionRef.SubscriptionRef<State>
  readonly dispatch: (event: Event) => Effect.Effect<readonly Command[]>
}

export function makeMachineDriver<State, Event, Command>(options: {
  readonly initial: State
  readonly transition: (state: State, event: Event) => MachineTransition<State, Command>
  readonly run: (command: Command, driver: MachineDriver<State, Event, Command>) => Effect.Effect<void>
}): Effect.Effect<MachineDriver<State, Event, Command>> {
  return Effect.map(SubscriptionRef.make(options.initial), (state) => {
    const driver: MachineDriver<State, Event, Command> = {
      state,
      dispatch: (event) =>
        SubscriptionRef.modify(state, (current) => {
          const next = options.transition(current, event)
          return [next.effects, next.state]
        }).pipe(
          Effect.tap((effects) => Effect.forEach(effects, (command) => options.run(command, driver), {discard: true})),
        ),
    }
    return driver
  })
}
