# dnd-studio

Private plugin for D&D Studio (the desktop app in `dnd-character-creator`). It brings, in one install:

- **The Studio's MCP server** (`dnd-studio`, http://127.0.0.1:<port>/mcp) with the token kept as a sensitive option.
- **Skills** `pnp-kampagne` (build a campaign), `pnp-spielleiter` (lead an evening), `pnp-weltenbau` (design a world of one's own with the person, in ten steps) and `pnp-lore` (keep a world's lore in the Studio's lore vault, tool `lore`), and the **14 `pnp-*` agents** (including the listener `pnp-zuhoerer`, below).
- **A pane** `/dnd` in the D&D Studio look (Houndsridge logo, brass campaign title; kit v3: native buttons with a glyph in front of the label, cards, German texts; the app draws the pane's frame and surface) with six tabs — Tisch, Bau, Welt, Lore, Abnahme, Zustand:
  - **Tisch / Table** (GM screen): one status sentence (players' window, Discord, listening, pause, unheard), a card _Tisch_ (instead of loose status lines) and a scene card (title in brass, goal unless spoiler-safe, the bound sounds as chips that play only on a press), the fight order (form _Reihenfolge_ + _Starten_) with HP bars from the party values, „X ist dran“ and *Nächster Zug* (moves the Studio's spotlight to a hero), party values and conditions with spotlight fairness (_Gruppe übernehmen_), one card per NPC with its stock lines as list rows with _Sprechen_, the bound sounds as rows with _Abspielen_ and one _Klang stoppen_, the listener once as the switch _Offenes Mikro_ in its own card _Zuhörer_ (last thing said, Discord players; switching off asks nothing), dice log, secrets & whispers (hidden while spoiler-safe), a Discord section (_Beitreten_ as the primary; mapped players, heroes without a player, rooms, last whisper delivered or why not — `not_mapped`, `dms_closed`, `not_set_up` —, screen-share/unheard warnings; Status, Join, Merge only on a press), whether a watcher (`wait_for_players watch` as a background Bash) runs, and the cards _Pause_ · _Abendende_ · _Einwürfe_ (the end-of-evening steps and the person's interjections (what they typed into the chat at the live table, also written to `debrief-<campaign>-<date>.md` in the plugin's data folder; destructive actions carry ⚠ and ask first). Every write to the Studio happens only on a press.
  - **Bau / Build** (pnp-kampagne cockpit): the build sections as a stepper, lore → plan → texts → pictures → sounds → voices → review → fixes, tracked from the `pnp-*` agents that run; the reviewers' findings counted from their Mängel files; a GPU line from `studio_status` (running/queued jobs; two GPU agents at once are flagged); the plan sign-off (*Approve plan* records it and tells the main thread to go on); the full acceptance checklist of pnp-kampagne §4 (scenes with picture, text and recipe; maps painted; places pinned; talking NPCs with portrait, voice, sheet and lines; start squares; threads and party_at; broken references; prepare_table) with a „fix: <agent>“ pill per gap, *Offene Punkte beheben* (asks Claude to start those agents) and *Neu laden*, and the **Bau-Looks** switch. Every file row folds its own preview under _Details_ with _↗ Öffnen_; _⚠ Bau-Stand zurücksetzen_ (asks first) sits in the _Abnahme-Check_ card; every re-read is _Neu laden_ in the header. Spoiler-safe shows counts only.
  - **Fortschritt / progress** (top of the Build tab, 0.7.0): for every build step that runs on the GPU (pictures, maps, sounds, voices via `prepare_table`, clips, 3D, picture_tool/Refine, `write_text`) „x von N“, a bar and „noch ~M min · fertig gegen HH:MM“ (local time), and „Bau gesamt“ over them. The estimate is the moving mean of the last 8 finished jobs of the same kind (a job's time is its share of the GPU time since the last job finished); with none finished yet „Schätzung folgt“. The GPU works first come, first served, so a step's time includes the steps queued before it and jobs in the Studio's own queue the mod did not start (`studio_status`). Seen by `tool.call` hooks on the step tools, `jobs` (wait/cancel), `prepare_table` (`made`/`total`/`new`) and `studio_status`, for the main thread and every agent alike. Agents announce totals with the mod tool `build_progress` (pnp-maler, pnp-klang: how many they will make; pnp-texter: the plan's entries, shown as „x von N Einträgen“ without a time, counted from its `set_campaign_entry` calls). While a step runs (and no table), the band's D&D starter reads e.g. „Stimmen 140/320 · ~18 min“ and opens the Build tab. Limit: kept per session (another Claude session's jobs show only as Studio queue).
  - **Welt / world** (0.11.0, skill pnp-weltenbau) and **Lore** (skill pnp-lore), built like the Bau tab: on top a card with the world (a select when there are several), its notes per kind, open questions and the last change; then the numbered steps with „x von N“ (Welt: 1 Idee/Kern … 10 Review; Lore: 1 Bestand sichten … 6 Kanon-Abgleich nach dem Abend), each with who works on it and its state, and one ask-Claude button for the next open step („Schritt N angehen“). A world without notes and an open campaign offers „Aus Kampagne übernehmen“ (asks Claude for `lore from_campaign`). Below, Welt lists the open questions; Lore browses notes by kind, searches, reads a note (text, tags, links, backlinks, sources) and lists the recently changed. A step's state is what Claude reported with the mod tool `lore_progress` (`{flow: welt|lore, world, step, state, note}`, kept in the plugin's store), else read from the vault's counts. Read only: the Studio's HTTP routes `GET /dnd/lore/map|search|note` on 127.0.0.1 (port and token of the MCP server), read on a tab switch or _Neu laden_ and after Claude's own `lore` write/delete/from_campaign while one of these tabs is open; writing goes through Claude (`lore` tool) or the Studio's Lore tab.
  - **Abnahme / Review** (tab id `review`, formerly _Prüfen_; `/dnd abnahme` works): new sounds, pictures and videos waiting for a verdict. Claude (pnp-klang, pnp-maler, or the main thread) puts them in with the plugin tool `review` (`action: add`); besides, what Claude makes in this session lands there by itself: a `make_sound` sound (seen in the `make_sound`/`jobs` answers) and every result `results` lists that was made through the Studio's tools since the session began (the hooks only watch the answers, after the call, and change nothing). Sounds play locally (`afplay` on macOS, `paplay` on Linux, `Media.SoundPlayer` on Windows; a URL opens in the browser); pictures and videos stay **covered** until *Aufdecken* (they may spoil a scene), then open in the system viewer. *Passt* / *Nochmal* (the note, _Merken_, sits behind _Details_), a progress bar, and in the card _Prüfung_ *An Claude schicken*, which sends one prompt naming what passed and what the maker agent redoes with which note.
  - **Zustand / Health**: problems first (app not running → *Studio öffnen*; an old user-level MCP server holding the plugin's names), then Studio-App (version, port), connection to Claude, plugin version, Discord bot, name clash; one card per settings group with switches: **Hintergründe** (incl. **Tisch-Hintergrund**) and **Regeln am Tisch**. No token button.
- **A launcher row above the prompt** (key `launch:dnd-studio@3`, put by `mergeLauncherRows` into line 1 of the band with the other mods' starters, the usage meter below; Band v3: two fixed lines, a short status is allowed, colour only for warn/bad): the chip *D&D* (opens the pane) while the Studio answers; at a live table its status reads „Tisch läuft · Runde 3“ (without a fight „Tisch läuft“) and the chip opens the Tisch tab, where scene, round and turn stand in full. After it at most one hint, and only a warning: the most urgent of watcher („Spieler ungehört“ / „kein Zuhörer“), silence after a finished turn (12 s), Discord/unheard warnings and „Claude neu starten“ when the Studio's version changed during the session or it refused arguments Claude's tool list offered. A main-thread turn that ends at a live table without a watcher gets a toast and a note on the next prompt.
- **Notes on the model's own table calls** (never blocking): secret turns → whisper only, cut-in lines, unplayed sounds, maps without markers, reminders after a new scene, repeated entry writes, `make_sound` at a live table costs GPU time.
- **Two hard guards** (each can be switched off): a handout or secret for one player on the shared window (`show_players`/`give_find`), and `talk_npc` at a live table. Writes are also refused while a protected profile is open (option `protectedProfiles`, default "Meine Familie": the profile with real saved evenings; set your own or leave it empty).
- **Table backdrop** (desktop and mobile apps; the terminal takes only the colors): while a table is live the theme and an animated pixel backdrop stand behind the chat: the standard pixel game table (map, candle, dice, miniatures; switch *Tisch-Hintergrund*). A scene with a picture will show that picture as its backdrop (`scenePictureLook` in features/look.tsx; until it makes one, the game table stands). Nothing is guessed from a scene's title or notes. While a build runs the look follows the pipeline phase (switch *Bau-Looks*). The plugin clears only a theme it set itself; another theme mod (such as ds-seasons) comes back after `/reload-plugins` or a restart.

## Listener mode (open mic, `pnp-zuhoerer`)

With the table's switch `discord listener: "haiku"` (`table_state` shows `listener`) the players talk without buttons and a Haiku agent, `dnd-studio:pnp-zuhoerer`, waits in place of the GM's watcher: it runs the watch in the foreground, takes each turn quietly, lets table talk pass and comes back only when the GM is needed (a move, a question to the GM or an NPC, Send, a secret, a break), cutting the GM's line with `cut_line` when it matters. Its return is the JSON `{woke, why, turn, between}`.

What the mod does with it:

- A running `pnp-zuhoerer` (tracked from `agent.spawn` / `turn.complete`) counts as the watcher: no false "no watcher" reminder; the listener's own foreground watch and its quiet `wait_for_players` are not taken for the GM's. Listeners do not show up as build runs.
- The band shows „Zuhörer wartet · N übersprungen“ while one runs, „Zuhörer hat geweckt: <warum>“ after a wake, „kein Zuhörer“ (and „N Zuhörer laufen“ when more than one) otherwise.
- The Table tab gets a card **Zuhörer**: the switch _Offenes Mikro_, the last return and turn, and what the group discussed without the GM (`between`, collected over returns that did not wake the GM). The switch calls `discord` with `listener` — only on a press, and switching off asks nothing.
- `say_line` coming back `interrupted` in listener mode gets the note "wait for the listener's return, then answer" instead of the cut-in hint; an answer that ends in listener mode without a running listener gets a toast and a note on the next prompt (the skill: exactly one listener, started at the beginning of each answer to a listener wake).

The listener runs `curl` to 127.0.0.1 with Bash: allow it for the session when asked.

Commands: `/dnd [table|build|world|lore|review|health]` (also `tisch`, `bau`, `welt`, `abnahme`, `pruefen`, `zustand`), `/dnd-scene`. Model tools: `initiative` (set / next / end / show), `review` (add / list / clear), `build_progress`, `build_status`, `lore_progress`.

**Opening by itself** (userConfig `autoOpen`, „Panel beim Start öffnen“, default on): never at session start; the pane opens once when a table goes live (on the Tisch tab), once when the campaign build begins (first pipeline agent, on the Bau tab) and when Claude puts something up for review (Abnahme tab).

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
- Everything else works the same, except waiting for the players at a live table: the watcher and the listener run the
  Studio's watch command (`curl` to 127.0.0.1) and the listener its clock (`date +%s`) through Claude Code's Bash tool,
  which on Windows needs Git for Windows (Git Bash). Not tested on Windows yet.

## Changing it

```sh
claude plugin validate plugins/dnd-studio
claude plugin test plugins/dnd-studio
```

The skills and agents here are the source of truth; edit them here, not in `~/.claude` or the installed plugin folder
(an update overwrites it). Without a checkout of this repo, table lessons from a debrief go to `pnp-regeln.md` in your
campaign folder instead (skill `pnp-spielleiter`, `references/nach-dem-abend.md`).

## Privacy

Talks only to the D&D Studio app on 127.0.0.1. Nothing leaves the computer. The interjection list is written only to the plugin's own data folder.
