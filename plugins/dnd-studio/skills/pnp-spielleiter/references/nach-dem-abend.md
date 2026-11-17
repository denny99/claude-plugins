# Nach dem Abend

Gehört zu Skill `pnp-spielleiter`, Abschnitt 7: was nach dem Abschied kommt, wenn die Spieler weg sind.

1. `table_state` mit `log: 100` (alles, was gesagt, gezeigt, gewürfelt wurde) und die Kanon-Einträge des Chronisten
   (`campaign`, Liste `canon`). Was davon nur heute galt (ein Wetter, eine Wache vor der Tür), nimmst du mit
   `set_campaign_entry kind canon remove` weg; was weiter gilt (Preise, Versprechen, Schulden, der Stand der Helden),
   bleibt für den nächsten Abend stehen.
2. Daraus knappe Session-Notizen: `set_campaign_entry kind session` ist für eine vorhandene Session;
   eine neue schreibt `write_session` mit `notes` (Ereignisse, NPCs, Beute, offene Fäden, und was am Tisch erfunden
   wurde: Namen, Orte, Tatsachen, damit der nächste Abend dazu passt). Antwortet sie „working“, lädt das
   Sprachmodell noch: denselben Aufruf noch einmal. `write_session` erzählt nur deine Notizen und lässt die Fäden der
   Kampagne, wie sie sind; `new_threads` und `resolved_threads` in der Antwort sind ein Vorschlag des Sprachmodells.
   Bei einer Kampagne danach `campaign set` mit `threads` (die Fäden, die nach heute offen sind; die Liste wird
   ersetzt, was fehlt, gilt als gelöst) und `party_at` (wo der nächste Abend beginnt): damit fängt das nächste
   Kapitel an.
3. **Nachbesprechung mit dem Menschen** (Denny, 2026-10-30: „das gehört immer ans ende jeder session … self
   reflection mit mir oder jemand anderen der mit dir arbeitet“), vorerst nach jedem Abend, mit dem Menschen am
   Rechner oder wer sonst mit dir arbeitet: Was lief gut, was war seltsam, wo hast du gestockt oder gewartet, was hat
   eine Szene, ein NPC, ein Wurf, ein Klang nicht getragen? Erst deine eigene Liste (die Zwischenrufe des Abends,
   im Skill Abschnitt 7, und was dir im `log` auffällt: lange Pausen, Wiederholungen, vergessene Klänge, Widersprüche), dann
   fragen, was ihm aufgefallen ist. Gemeinsam entscheiden, was eine Regel wird; die schreibst du in diesen Skill oder
   in `pnp-kampagne`, mit Datum und Zitat wie die übrigen Spieltest-Lehren, und committest erst nach seinem OK.
