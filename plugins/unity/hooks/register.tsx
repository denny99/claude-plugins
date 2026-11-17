import type { Register } from 'claude-code'

import { registerUnity } from '../features/register'
import type { Options } from '../features/state'

// Wiring only.
export const register: Register = (on, options) => {
  registerUnity(on, options as Options)
}
