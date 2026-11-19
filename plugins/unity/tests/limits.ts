import { test as base, type TestBody } from 'claude-code/testing'

// Per-test time limit. The runner's default is 5 s, which render tests overrun on a loaded machine.
export const SLOW = { timeoutMs: 30_000 }

type Options = Record<string, unknown> & { timeoutMs?: number }

/** `test` from the runner with the 30 s limit unless the test names its own. */
export function test(name: string, a: Options | TestBody, b?: TestBody): void {
  if (b === undefined) base(name, SLOW, a as TestBody)
  else base(name, { ...SLOW, ...(a as Options) } as never, b)
}
