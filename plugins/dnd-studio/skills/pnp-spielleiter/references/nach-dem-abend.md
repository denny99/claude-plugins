# Nach dem Abend

Gehört zu Skill `pnp-spielleiter`, Abschnitt 7: was nach dem Abschied kommt, wenn die Spieler weg sind.

1. `table_state` mit `log: 100` (alles, was gesagt, gezeigt, gewürfelt wurde) und die Kanon-Einträge des Chronisten
   (`campaign`, Liste `canon`). Was davon nur heute galt (ein Wetter, eine Wache vor der Tür), nimmst du mit
   `set_campaign_entry kind canon remove` weg; was weiter gilt (Preise, Versprechen, Schulden, der Stand der Helden),
   bleibt für den nächsten Abend stehen.
2. Daraus die Session, von dir selbst geschrieben: `set_campaign_entry kind session` mit `name` (ein Titel für den
   Abend), `date` (YYYY-MM-DD, ohne: heute), `notes` (Ereignisse, NPCs, Beute, offene Fäden, und was am Tisch erfunden
   wurde: Namen, Orte, Tatsachen, damit der nächste Abend dazu passt) und `summary` (ein paar Sätze für die Spieler:
   daraus erzählen `show_players recap` und `write_text recap` am nächsten Abend). Dieselbe Session später: `name` oder
   `date` wieder, `append` hängt an die Notizen an. **Nicht `write_session`:** Das lässt ein lokales Sprachmodell
   (Ollama) aus Notizen schreiben, eine Hilfe für Menschen am Studio, nicht für dich (Denny, Ödland 2026-11-23: „wozu
   brauchst DU ollama dafür? … ollama ist nur support für menschen“; es lief auf dem Prozessor und hielt das Studio
   minutenlang auf). Bei einer Kampagne danach `campaign set` mit `threads` (die Fäden, die nach heute offen sind; die
   Liste wird ersetzt, was fehlt, gilt als gelöst) und `party_at` (wo der nächste Abend beginnt): damit fängt das
   nächste Kapitel an.
3. **Nachbesprechung mit dem Menschen** (Denny, 2026-10-30: „das gehört immer ans ende jeder session … self
   reflection mit mir oder jemand anderen der mit dir arbeitet“), vorerst nach jedem Abend, mit dem Menschen am
   Rechner oder wer sonst mit dir arbeitet: Was lief gut, was war seltsam, wo hast du gestockt oder gewartet, was hat
   eine Szene, ein NPC, ein Wurf, ein Klang nicht getragen? Erst deine eigene Liste (die Zwischenrufe des Abends,
   im Skill Abschnitt 7, und was dir im `log` auffällt: lange Pausen, Wiederholungen, vergessene Klänge, Widersprüche), dann
   fragen, was ihm aufgefallen ist. Gemeinsam entscheiden, was eine Regel wird, und sie mit Datum und Zitat wie die übrigen Spieltest-Lehren
   festhalten, erst nach seinem OK. Wohin: Gilt sie nur für diese Kampagne, in ihren Leitfaden (`campaign set`).
   Sonst in die Datei `pnp-regeln.md` im Arbeitsordner dieser Sitzung (anlegen, wenn sie fehlt; je Regel eine Zeile
   unter einer Überschrift `pnp-spielleiter` oder `pnp-kampagne`); beide Skills lesen sie zu Beginn. **Nie** in den
   installierten Skill schreiben: Der Plugin-Ordner wird beim nächsten Update überschrieben. Nur wenn das Quell-Repo
   des Plugins in dieser Sitzung ausgecheckt ist (`plugins/dnd-studio/skills/…`), schreibst du sie dort in den Skill
   und committest nach seinem OK.

## Ein Spieler mit eigenem Studio

Spoilerfrei (Denny 2026-11-21): Was am Tisch gezeigt, gesagt oder
übergeben wurde, markieren `show_players`, `say_line` und `give_find` selbst als gespielt. Was an einem Abend ohne
Studio lief, markierst du nach: `campaign { action: "spoiler", played: ["<Szene>", "<NPC>", "<Ort>"] }` (Titel und
Namen; `unplayed` nimmt es zurück). Auf seinem Rechner schaltet `campaign { action: "spoiler", on: true }` den Modus
an, `upto` deckt den Zeitstrahl bis zu einer Szene auf. Deine Werkzeuge sehen immer alles.
