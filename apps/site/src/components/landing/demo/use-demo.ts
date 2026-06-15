import { useReducer } from 'react';
import { GREETING, type Message, type Pickable } from './demo-data';

export type DemoState = {
  picking: boolean;
  grabbed: Pickable | null;
  patched: boolean;
  messages: Message[];
};

type Action =
  | { type: 'arm'; on: boolean }
  | { type: 'grab'; pickable: Pickable }
  | { type: 'send'; message: Message }
  | { type: 'push'; message: Message }
  | { type: 'patch' }
  | { type: 'reset' };

const initial: DemoState = { picking: false, grabbed: null, patched: false, messages: [GREETING] };

function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'arm':
      return { ...state, picking: action.on };
    case 'grab':
      return { ...state, picking: false, grabbed: action.pickable };
    case 'send':
      return { ...state, grabbed: null, patched: false, messages: [...state.messages, action.message] };
    case 'push':
      return { ...state, messages: [...state.messages, action.message] };
    case 'patch':
      return { ...state, patched: true };
    case 'reset':
      return initial;
  }
}

export function useDemo() {
  return useReducer(reducer, initial);
}
