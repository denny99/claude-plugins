# dnd-studio

Private plugin for D&D Studio (the desktop app in `dnd-character-creator`). It brings, in one install:

- **The Studio's MCP server** (`dnd-studio`, http://127.0.0.1:<port>/mcp) with the token kept as a sensitive option.
- **Skills** `pnp-kampagne` (build a campaign) and `pnp-spielleiter` (lead an evening), and the **13 `pnp-*` agents**.
- **A pane** `/dnd` with three tabs:
  - **Table** (GM screen): table status (players' window, Discord, listening, pause, unheard), scene card with the scene's bound sounds as play buttons, initiative with *Next turn* (moves the Studio's spotlight to a hero), party values and conditions with spotlight fairness, NPC stock lines with their `how`, dice log, secrets & whispers (hidden while spoiler-safe), pause flow and the end-of-evening steps. Every write to the Studio happens only on a press.
  - **Build** (pnp-kampagne cockpit): the pipeline lore → plan → texts → pictures → sounds → voices → review → fixes, tracked from the `pnp-*` agents that run; the reviewers' findings counted from their Mängel files; an acceptance check from the campaign overview.
  - **Health**: is the app running, is Claude connected, how to start it on this OS (button on macOS/Windows), and the rule toggles.
- **A band above the prompt** while a table is live: scene · round · whose turn, a warning when the players finished a turn and nothing was said for 12 s, and Discord/unheard warnings.
- **Notes on the model's own table calls** (never blocking): secret turns → whisper only, cut-in lines, unplayed sounds, maps without markers, reminders after a new scene, repeated entry writes, `make_sound` at a live table costs GPU time.
- **Two hard guards** (each can be switched off): a handout or secret for one player on the shared window (`show_players`/`give_find`), and `talk_npc` at a live table. Writes are also refused while the profile "Meine Familie" is open.
- **Scene looks** (desktop and mobile apps; the terminal takes only the colors): while a table is live the theme and an animated vector backdrop follow the scene's mood (tavern, forest, dungeon, camp, town, mountains, sea, swamp, battle, ruins, or the neutral table); a scene note `look: <mood>` or the picker in the pane overrides the keywords. While a build runs the look follows the pipeline phase. The plugin clears only a theme it set itself; another theme mod (such as ds-seasons) comes back after `/reload-plugins` or a restart.

Commands: `/dnd [table|build|health]`, `/dnd-scene`. Model tool: `initiative` (set / next / end / show).

## Install

```sh
claude plugin marketplace add denny99/claude-plugins
claude plugin install dnd-studio@denny99
```

During install (or later under `/plugin` → dnd-studio → configure) set the **token**: in the Studio, *Settings → Connections → AI assistants (MCP) → Copy the setup command*, and take the part after `Bearer `. The port stays 37641 unless the app's `settings.json` sets `mcpPort`.

Remove an older user-level server first so the tools are not there twice: `claude mcp remove dnd-studio -s user`.

The plugin's MCP tools are named `mcp__plugin_dnd-studio_dnd-studio__<tool>` and its agents `dnd-studio:pnp-<name>`.

### Windows

- The app installs per user to `%LOCALAPPDATA%\Programs\DnD Studio`; *Start app* on the Health tab starts it from there.
- The server listens on 127.0.0.1 only. From WSL it is reachable only with mirrored networking.
- Everything else works the same; no shell or POSIX command is used.

## Changing it

```sh
claude plugin validate plugins/dnd-studio
claude plugin test plugins/dnd-studio
```

The skills and agents here are the source of truth; edit them here, not in `~/.claude`.

## Privacy

Talks only to the D&D Studio app on 127.0.0.1. Nothing leaves the computer.
