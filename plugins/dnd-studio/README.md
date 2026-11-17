# dnd-studio

Private plugin for D&D Studio (the desktop app in `dnd-character-creator`). It brings, in one install:

- **The Studio's MCP server** (`dnd-studio`, http://127.0.0.1:<port>/mcp) with the token kept as a sensitive option.
- **Skills** `pnp-kampagne` (build a campaign) and `pnp-spielleiter` (lead an evening), and the **13 `pnp-*` agents**.
- **A pane** `/dnd` with three tabs:
  - **Table** (GM screen): table status (players' window, Discord, listening, pause, unheard), scene card with the scene's bound sounds as play buttons, initiative with *Next turn* (moves the Studio's spotlight to a hero), party values and conditions with spotlight fairness, NPC stock lines with their `how`, dice log, secrets & whispers (hidden while spoiler-safe), a Discord section (mapped players, heroes without a player, rooms, last whisper delivered or why not — `not_mapped`, `dms_closed`, `not_set_up` —, screen-share/unheard warnings; Status, Join, Merge only on a press), whether a watcher (`wait_for_players watch` as a background Bash) runs, pause flow and the end-of-evening steps with the person's interjections (what they typed into the chat at the live table, also written to `debrief-<campaign>-<date>.md` in the plugin's data folder). Every write to the Studio happens only on a press.
  - **Build** (pnp-kampagne cockpit): the pipeline lore → plan → texts → pictures → sounds → voices → review → fixes, tracked from the `pnp-*` agents that run; the reviewers' findings counted from their Mängel files; a GPU line from `studio_status` (running/queued jobs; two GPU agents at once are flagged); the plan sign-off (*Approve plan* records it and tells the main thread to go on); the full acceptance checklist of pnp-kampagne §4 (scenes with picture, text and recipe; maps painted; places pinned; talking NPCs with portrait, voice, sheet and lines; start squares; threads and party_at; broken references; prepare_table) with the `pnp-*` agent that fixes each gap. Spoiler-safe shows counts only.
  - **Health**: is the app running, is Claude connected, how to start it on this OS (button on macOS/Windows), and the rule toggles.
- **A band above the prompt** while a table is live: scene · round · whose turn, a warning when the players finished a turn and nothing was said for 12 s, Discord/unheard warnings, the watcher state, and *MCP schemas stale — restart Claude* when the Studio's version changed during the session or it refused arguments Claude's tool list offered. A main-thread turn that ends at a live table without a watcher gets a toast and a note on the next prompt.
- **Notes on the model's own table calls** (never blocking): secret turns → whisper only, cut-in lines, unplayed sounds, maps without markers, reminders after a new scene, repeated entry writes, `make_sound` at a live table costs GPU time.
- **Two hard guards** (each can be switched off): a handout or secret for one player on the shared window (`show_players`/`give_find`), and `talk_npc` at a live table. Writes are also refused while the profile "Meine Familie" is open.
- **Scene looks** (desktop and mobile apps; the terminal takes only the colors): while a table is live the theme and an animated vector backdrop follow the scene's mood (tavern, forest, dungeon, camp, town, mountains, sea, swamp, battle, ruins, or the neutral table); a scene note `look: <mood>` or the picker in the pane overrides the keywords. While a build runs the look follows the pipeline phase. The plugin clears only a theme it set itself; another theme mod (such as ds-seasons) comes back after `/reload-plugins` or a restart.

Commands: `/dnd [table|build|health]`, `/dnd-scene`. Model tool: `initiative` (set / next / end / show).

## Install

The normal path: in the Studio, *Settings → Connections → AI assistants (MCP) → Install for Claude Code*. The app installs the plugin with its token and port, and removes old copies and the old user-level `dnd-studio` MCP server.

By hand, the command the app copies:

```sh
claude plugin marketplace add denny99/claude-plugins && claude plugin install dnd-studio@denny99 --config token=<…> --config port=<…>
```

Token and port can be changed later under `/plugin` → dnd-studio → configure. The port stays 37641 unless the app's `settings.json` sets `mcpPort`.

The plugin's MCP tools are named `mcp__plugin_dnd-studio_dnd-studio__<tool>` and its agents `dnd-studio:pnp-<name>`.

An older MCP server named `dnd-studio` at user level (the Studio's former setup command) holds the name of the plugin's own `initiative` tool and makes Claude Code suppress the plugin's server as a duplicate; `/dnd health` says so. Remove it once with `claude mcp remove dnd-studio -s user` and restart Claude Code (the D&D Studio app's new installer does this migration too).

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

Talks only to the D&D Studio app on 127.0.0.1. Nothing leaves the computer. The interjection list is written only to the plugin's own data folder.
