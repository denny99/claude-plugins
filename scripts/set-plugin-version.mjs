#!/usr/bin/env node
// Writes a plugin's released version into its entry in .claude-plugin/marketplace.json.
// Called by semantic-release (prepareCmd) from the plugin's folder: node ../../scripts/set-plugin-version.mjs <plugin> <version>
// Only main carries versions there; develop's entries have none, so the latest channel updates by commit.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [name, version] = process.argv.slice(2)
if (!name || !version) {
  console.error('usage: set-plugin-version.mjs <plugin> <version>')
  process.exit(2)
}
const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.claude-plugin', 'marketplace.json')
const market = JSON.parse(readFileSync(file, 'utf8'))
const entry = market.plugins.find(p => p.name === name)
if (!entry) {
  console.error(`no plugin "${name}" in ${file}`)
  process.exit(1)
}
// between "name" and "source", which never change: edits to the other fields on develop then merge into main without a
// conflict (git conflicts on neighbouring lines, too)
const { name: n, source, version: _old, ...rest } = entry
market.plugins[market.plugins.indexOf(entry)] = { name: n, version, source, ...rest }
writeFileSync(file, `${JSON.stringify(market, null, 2)}\n`)
console.log(`${name} -> ${version}`)
