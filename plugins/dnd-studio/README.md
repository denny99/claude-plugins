# dnd-studio

Private plugin for D&D Studio (the desktop app in `dnd-character-creator`). It brings, in one install:

- **The Studio's MCP server** (`dnd-studio`, http://127.0.0.1:<port>/mcp) with the token kept as a sensitive option.
- **Skills** `pnp-kampagne` (build a campaign) and `pnp-spielleiter` (lead an evening), and the **14 `pnp-*` agents** (including the listener `pnp-zuhoerer`, below).
- **A pane** `/dnd` in the D&D Studio look (felt, brass, Houndsridge logo; kit v2, German texts) with four tabs — Tisch, Bau, Prüfen, Zustand:
  - **Tisch / Table** (GM screen): one status sentence (players' window, Discord, listening, pause, unheard), a scene card (title in brass, goal unless spoiler-safe, the bound sounds as chips that play only on a press), the fight order with HP bars from the party values, „X ist dran“ and *Nächster Zug* (moves the Studio's spotlight to a hero), party values and conditions with spotlight fairness, one card per NPC with its stock lines as one-press sayings, a listener line (Zuhörer, Discord players, last thing said), dice log, secrets & whispers (hidden while spoiler-safe), a Discord section (mapped players, heroes without a player, rooms, last whisper delivered or why not — `not_mapped`, `dms_closed`, `not_set_up` —, screen-share/unheard warnings; Status, Join, Merge only on a press), whether a watcher (`wait_for_players watch` as a background Bash) runs, pause flow and the end-of-evening steps with the person's interjections (what they typed into the chat at the live table, also written to `debrief-<campaign>-<date>.md` in the plugin's data folder). Every write to the Studio happens only on a press.
  - **Bau / Build** (pnp-kampagne cockpit): the build sections as a stepper, lore → plan → texts → pictures → sounds → voices → review → fixes, tracked from the `pnp-*` agents that run; the reviewers' findings counted from their Mängel files; a GPU line from `studio_status` (running/queued jobs; two GPU agents at once are flagged); the plan sign-off (*Approve plan* records it and tells the main thread to go on); the full acceptance checklist of pnp-kampagne §4 (scenes with picture, text and recipe; maps painted; places pinned; talking NPCs with portrait, voice, sheet and lines; start squares; threads and party_at; broken references; prepare_table) with a „fix: <agent>“ pill per gap, *Offene Punkte beheben lassen* (asks Claude to start those agents) and *Neu prüfen*, and the **Bau-Looks** switch. Spoiler-safe shows counts only.
  - **Prüfen / Review**: new sounds, pictures and videos waiting for a verdict. Claude (pnp-klang, pnp-maler, or the main thread) puts them in with the plugin tool `review` (`action: add`). Sounds play locally (`afplay` on macOS, `paplay` on Linux, `Media.SoundPlayer` on Windows; a URL opens in the browser); pictures and videos stay **covered** until *Aufdecken* (they may spoil a scene), then open in the system viewer. *Passt* / *Nochmal machen* (with a note), a progress bar, and *Ergebnis an Claude*, which sends one prompt naming what passed and what the maker agent redoes with which note.
  - **Zustand / Health**: problems first (app not running → *Studio öffnen*; an old user-level MCP server holding the plugin's names), then Studio-App (version, port), connection to Claude, plugin version, Discord bot, name clash; real switches for **Zuhörer** (listener) and **Szenen-Looks**; the other rules folded under *Regeln*.
- **A band above the prompt** while a table is live: scene · round · whose turn, a warning when the players finished a turn and nothing was said for 12 s, Discord/unheard warnings, the watcher state, and *MCP schemas stale — restart Claude* when the Studio's version changed during the session or it refused arguments Claude's tool list offered. A main-thread turn that ends at a live table without a watcher gets a toast and a note on the next prompt.
- **Notes on the model's own table calls** (never blocking): secret turns → whisper only, cut-in lines, unplayed sounds, maps without markers, reminders after a new scene, repeated entry writes, `make_sound` at a live table costs GPU time.
- **Two hard guards** (each can be switched off): a handout or secret for one player on the shared window (`show_players`/`give_find`), and `talk_npc` at a live table. Writes are also refused while the profile "Meine Familie" is open.
- **Scene looks** (desktop and mobile apps; the terminal takes only the colors): while a table is live the theme and an animated vector backdrop follow the scene's mood (tavern, forest, dungeon, camp, town, mountains, sea, swamp, battle, ruins, or the neutral table); a scene note `look: <mood>` or the picker in the pane overrides the keywords. While a build runs the look follows the pipeline phase (switch *Bau-Looks*; the table's look is *Szenen-Looks*). The plugin clears only a theme it set itself; another theme mod (such as ds-seasons) comes back after `/reload-plugins` or a restart.

## Listener mode (open mic, `pnp-zuhoerer`)

With the table's switch `discord listener: "haiku"` (`table_state` shows `listener`) the players talk without buttons and a Haiku agent, `dnd-studio:pnp-zuhoerer`, waits in place of the GM's watcher: it runs the watch in the foreground, takes each turn quietly, lets table talk pass and comes back only when the GM is needed (a move, a question to the GM or an NPC, Send, a secret, a break), cutting the GM's line with `cut_line` when it matters. Its return is the JSON `{woke, why, turn, between}`.

What the mod does with it:

- A running `pnp-zuhoerer` (tracked from `agent.spawn` / `turn.complete`) counts as the watcher: no false "no watcher" reminder; the listener's own foreground watch and its quiet `wait_for_players` are not taken for the GM's. Listeners do not show up as build runs.
- The band shows `listener: waiting · N skipped` while one runs, `listener woke: <why>` after a wake, `no listener` (and `N listeners running` when more than one) otherwise.
- The Table tab gets a **Listener** section: on/off, the last return and turn, and what the group discussed without the GM (`between`, collected over returns that did not wake the GM). *Listener on* / *Listener off* call `discord` with `listener` — only on a press, off asks first.
- `say_line` coming back `interrupted` in listener mode gets the note "wait for the listener's return, then answer" instead of the cut-in hint; an answer that ends in listener mode without a running listener gets a toast and a note on the next prompt (the skill: exactly one listener, started at the beginning of each answer to a listener wake).

The listener runs `curl` to 127.0.0.1 with Bash: allow it for the session when asked.

Commands: `/dnd [table|build|review|health]` (also `tisch`, `bau`, `pruefen`, `zustand`), `/dnd-scene`. Model tools: `initiative` (set / next / end / show), `review` (add / list / clear).

**Opening by itself** (userConfig `autoOpen`, „Panel beim Start öffnen“, default on): never at session start; the pane opens once when a table goes live (on the Tisch tab), once when the campaign build begins (first pipeline agent, on the Bau tab) and when Claude puts something up for review (Prüfen tab).

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
