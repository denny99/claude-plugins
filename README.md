# claude-plugins (privat)

Private Claude Code plugins and mods.

```sh
claude plugin marketplace add denny99/claude-plugins
claude plugin install <plugin>@denny99
```

## Channels: stable and latest

| Channel | Branch | Marketplace name | Add it with |
| --- | --- | --- | --- |
| **stable** (default) | `main` | `denny99` | `claude plugin marketplace add denny99/claude-plugins` |
| **latest** (opt-in) | `develop` | `denny99-latest` | `claude plugin marketplace add denny99/claude-plugins#develop` |

`main` is the default branch, so a marketplace added without a branch follows stable. Install a
plugin from one channel only (`<plugin>@denny99` or `<plugin>@denny99-latest`).

The branches differ in the `name` in `.claude-plugin/marketplace.json` on purpose. Releasing is a
merge of `develop` into `main`, which keeps `main`'s name. Never merge `main` back into
`develop`, and never edit that line on `develop`.

## Releases

semantic-release, as in the deltastone projects: a push to `main` runs
`.github/workflows/release.yml`, and `npm run release` releases each plugin with new commits in its
folder. `fix` → patch, `feat` / `imp` → minor, `BREAKING CHANGE:` → major; `chore`, `ci`, `test`,
`docs` release nothing. Each release tags `<plugin>-v<version>`, writes the plugin's
`CHANGELOG.md`, a GitHub release and the version into the plugin's entry in
`.claude-plugin/marketplace.json` on `main`.

Never set a version by hand: `plugin.json` has none, and `develop`'s marketplace entries have none
either, so the latest channel picks up every commit.
