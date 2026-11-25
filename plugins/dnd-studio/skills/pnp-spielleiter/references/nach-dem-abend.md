# Ende des Abends und danach

Gehört zu Skill `pnp-spielleiter`, Abschnitt 7. Lesen, wenn die Spieler Schluss machen wollen.

## Am Tisch, solange die Spieler noch da sind

Schluss machen die Spieler: Den Abschied sprichst du, wenn sie sagen, dass es reicht, oder wenn das Kapitel zu Ende ist
und sie nicht weiterwollen. Ohne Rückblick und Ausklingen endet ein Abend abrupt.

1. **Rückblick als Erzählung, nicht als Protokoll:** Der Erzähler erzählt in vier bis sechs Sätzen, was die Helden
   heute erlebt haben, wie in einem Roman am Kapitelende: jeder Held mit seinem Moment (wer was gewagt hat, der beste
   Wurf, eine Entscheidung mit Folgen), was sie gewonnen und verloren haben, was offen bleibt. Kein „Ihr habt heute …
   außerdem …“. Die erste Zeile läuft wie immer sofort, während du den Rest schreibst.
2. **Ausklingen:** ein ruhiges letztes Bild (das Feuer, das Dorf, die Nacht), eine leise Atmosphäre oder Musik
   (`play_sound loop`, `volume` ≈ 0.3) und ein letzter Satz, der nach vorn zeigt: eine Frage, die bis zum nächsten
   Abend hängen bleibt (bei einem Kapitelende der vorbereitete Ausblick). Dann, als Erzähler aus der Geschichte heraus,
   der Abschied und ein Dank. Zum Schluss der **Abspann**: `show_players` mit `credits: true`, `credit_lines` („Danke
   fürs Spielen“, „Fortsetzung folgt …“) und `music` rollt die Helden mit ihren Spielern, die NPCs und Orte des Abends.
3. Nach dem Abschied noch einmal warten, falls jemand etwas sagen will. Erst dann aufräumen: `show_players clear`,
   Musik aus (`play_sound stop`), `discord leave` (holt alle aus Neben- und Ortsräumen zurück und löscht die Räume des
   Bots). Leeren, Klang aus und `leave` erst, wenn der letzte Text wirklich zu Ende gespielt ist, sonst wird er
   abgeschnitten; `leave` wartet selbst höchstens eine Minute auf Zeilen, die noch spielen. Woran du es erkennst, ohne
   `wait: true`: `table_state` zeigt unter `last_line` `done` (die letzte Zeile ist durch), oder du rufst gleich
   `discord leave`, das auf die laufenden Zeilen wartet.

## Danach, ohne Spieler

1. `table_state` mit `log: 100` (alles, was gesagt, gezeigt, gewürfelt wurde) und die Kanon-Einträge des Chronisten
   (`campaign`, Liste `canon`). Was nur heute galt (ein Wetter, eine Wache vor der Tür), nimmst du mit
   `set_campaign_entry kind canon remove` weg; was weiter gilt (Preise, Versprechen, Schulden, der Stand der Helden),
   bleibt stehen.
2. Daraus die Session, von dir selbst geschrieben: `set_campaign_entry kind session` mit `name` (Titel des Abends),
   `date` (YYYY-MM-DD, ohne Angabe heute), `notes` (Ereignisse, NPCs, Beute, offene Fäden, am Tisch Erfundenes: Namen, Orte, Tatsachen) und `summary`
   (ein paar Sätze für die Spieler: daraus erzählen `show_players recap` und `write_text recap` am nächsten Abend).
   Dieselbe Session später: `append`; es findet sie über denselben `name` oder dasselbe `date`. **Nicht `write_session`:** Das lässt ein lokales Sprachmodell aus Notizen
   schreiben, eine Hilfe für Menschen am Studio, nicht für dich, und hält das Studio minutenlang auf. Bei einer Kampagne
   danach `campaign set` mit `threads` (die nach heute offenen Fäden; die Liste wird ersetzt, was fehlt, gilt als
   gelöst) und `party_at` (wo der nächste Abend beginnt).
3. **Nachbesprechung mit dem Menschen,** nach jedem Abend, mit ihm oder wer sonst mit dir arbeitet: Was lief gut, was
   war seltsam, wo hast du gestockt, was hat eine Szene, ein NPC, ein Wurf, ein Klang nicht getragen? Erst deine eigene
   Liste (die Zwischenrufe des Abends und was dir im `log` auffällt: lange Pausen, Wiederholungen, vergessene Klänge,
   Widersprüche), dann fragen, was ihm aufgefallen ist. Gemeinsam entscheiden, was eine Regel wird, und sie erst nach
   seinem OK festhalten, mit einem halben Satz, warum. Wohin: Gilt sie nur für diese Kampagne, in ihren Leitfaden
   (`campaign set`). Sonst in `pnp-regeln.md` im Arbeitsordner dieser Sitzung (anlegen, wenn sie fehlt; je Regel eine
   Zeile unter `pnp-spielleiter` oder `pnp-kampagne`); beide Skills lesen sie zu Beginn. **Nie** in den installierten
   Skill schreiben: Der Plugin-Ordner wird beim nächsten Update überschrieben. Nur wenn das Quell-Repo des Plugins in
   dieser Sitzung ausgecheckt ist (`plugins/dnd-studio/skills/…`), schreibst du sie dort in den Skill und committest
   nach seinem OK.

## Ein Spieler mit eigenem Studio

Spoilerfrei: Was am Tisch gezeigt, gesagt oder übergeben wurde, markieren `show_players`, `say_line` und `give_find`
selbst als gespielt. Was an einem Abend ohne Studio lief, markierst du nach: `campaign { action: "spoiler", played:
["<Szene>", "<NPC>", "<Ort>"] }` (`unplayed` nimmt es zurück). Auf seinem Rechner schaltet `campaign { action:
"spoiler", on: true }` den Modus an, `upto` deckt den Zeitstrahl bis zu einer Szene auf. Deine Werkzeuge sehen immer
alles.
