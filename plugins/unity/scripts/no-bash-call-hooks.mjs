#!/usr/bin/env node
/**
 * Fails when a hook of this plugin listens on `tool.call` or `tool.run` for Bash (a matcher on Bash, or no tool
 * matcher at all). Any such hook, even one that only passes `next(e)` on, turns off the move to the background for
 * Bash in the whole session: `run_in_background` breaks for every plugin. Observe Bash at `tool.check` instead.
 *
 *   node plugins/<plugin>/scripts/no-bash-call-hooks.mjs        (exit 1 + the offending lines when found)
 *
 * The plugin test sandbox has no file system, so this check is a script; tests/ (fake worlds) is not scanned.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dirs = ['hooks', 'features', 'lib']
const hook = /\bon\(\s*(["'`])tool\.(call|run)\1\s*(,\s*(\{[^}]*\}))?/g

function files(dir) {
  let out = []
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out = out.concat(files(path))
    else if (/\.(m?[jt]sx?)$/.test(name)) out.push(path)
  }
  return out
}

const found = []
for (const file of dirs.flatMap(d => files(join(root, d)))) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(hook)) {
    const matcher = m[4] ?? ''
    const tool = /\btool\s*:\s*([^,}]+)/.exec(matcher)?.[1] ?? ''
    if (!tool || /\bBash\b/.test(tool)) {
      const line = text.slice(0, m.index).split('\n').length
      found.push(`${relative(root, file)}:${line}: ${m[0].replace(/\s+/g, ' ')}`)
    }
  }
}
if (found.length) {
  console.error(`✗ tool.call/tool.run hooks that hear Bash (they turn off run_in_background):\n  ${found.join('\n  ')}`)
  process.exit(1)
}
console.log('✔ no tool.call/tool.run hook hears Bash')
