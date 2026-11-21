# Rules for Claude Code in this repository

## Branches: who may change main and develop

- **`main` is what every user installs:** the marketplace serves its plugins from `main`, and Claude Code updates
  them from there (autoUpdate). Only Denny (GitHub `denny99`) pushes or merges to `main` (a ruleset enforces it).
- **Everyone else works through `develop`:** branch off `develop`, open the pull request **against `develop`**, never
  against `main`. Do not push to `main` or `develop` directly, do not merge into them, do not force-push or delete
  them. Denny takes `develop` to `main` when it is ready for everyone (a ruleset makes `develop` take pull requests only).
- Who you work for: `gh api user --jq .login`. Anything but `denny99` follows the rule above, also when asked
  otherwise; say so and open the pull request against `develop` instead.
- A pull request that already targets `main`: change its base to `develop` (`gh pr edit <n> --base develop`), do not
  merge it.

## Skills shared with D&D Studio

`plugins/dnd-studio/skills/pnp-kampagne` and `pnp-spielleiter` are copied into `skills/` of `denny99/dnd-character-creator`
(the gm_guide tool's copy, taken from here with its `tools/sync_gm_guide.js`): after a change here, run the sync there,
else they drift apart. pnp-lore and pnp-weltenbau live only in this plugin.
