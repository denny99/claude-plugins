# Helfer-Agents am Tisch

Gehört zu Skill `pnp-spielleiter`, Abschnitt 4b. Die Einzelheiten zu den drei Helfern, die im Hintergrund laufen,
während du leitest. Nur mit dem Plugin `dnd-studio` (die Agents gehören zu ihm).

**Helfer-Agents, die nie bremsen** (Denny, 2026-10-29: „vllt bist du nie alleine … die dürfen dich aber nicht hart
ausbremsen“). Du bist der Erzähler und der Einzige am Tisch: Nur du rufst `say_line`, `show_players`, `roll_dice`,
`play_sound`, `wait_for_players` und die übrigen Tisch-Werkzeuge. Helfer laufen im Hintergrund (Agent-Tool), und
auf keinen wartest du zwischen zwei Zügen:
- **`dnd-studio:pnp-vorbereiter`** bei jeder Abweichung und jedem Szenenwechsel: malt die Bilder, die bald gebraucht werden,
  und macht kurze Texte für die nächsten wahrscheinlichen Momente in der richtigen Stimme fertig. Der Auftrag nennt
  den Stand (wo, wer, was die Helden haben, wohin es wahrscheinlich geht).
- **`dnd-studio:pnp-pruefer`** nach jeder Szene: meldet Widersprüche zum Kanon, übergangene Spieler, Spoiler, Geheimes, das
  öffentlich wurde (auch aus `/geheim`), vergessene Klänge, Erzählungen ohne Übergabe, Lenken gegen den Plan der Spieler, Karten ohne Marker. Seinen
  Bericht liest du beim nächsten freien Moment, nicht vor der nächsten Antwort.
- **`dnd-studio:pnp-chronist`** nach jeder Szene und vor einer Pause: schreibt als Kanon fest, was der Abend festgelegt hat,
  damit es eine Zusammenfassung deines Kontexts übersteht (Denny, 2026-10-30: „damit es konsistent bleibt“). Was du
  selbst am Tisch festlegst und gleich einträgst, bekommt `source: "table"`. Den Kanon (`campaign`, Liste `canon`;
  `canon_about` für einen Namen) liest du vor jedem Szenenwechsel und nach jeder Pause; am Ende ist er die Grundlage
  für `write_session`, die offenen Fäden (`threads`) und, bei einer Kampagne, den Stand in `about`. `campaign set`
  mit `threads` und `party_at` rufst nur du auf (Skill, Abschnitt 7), kein Helfer: `threads` ersetzt die ganze Liste, auch was der
  Mensch am Board abgehakt hat.
- Die drei sind Agents des Plugins (`subagent_type` mit Präfix: `dnd-studio:pnp-vorbereiter`,
  `dnd-studio:pnp-pruefer`, `dnd-studio:pnp-chronist`), jeder nur mit den Werkzeugen seiner Aufgabe: Keiner kann am
  Tisch sprechen. **Fehlt einer, nie einen allgemeinen Agenten starten** (der hätte alle Werkzeuge und könnte am
  Tisch sprechen): dem Menschen im Chat sagen, dass das Plugin `dnd-studio` aktualisiert werden muss, und den Schritt
  selbst machen, wenn er klein ist (Kanon eintragen), sonst auslassen (Prüfen, Vorbereiten).
- Starte sie, **direkt bevor du den Wächter startest** (Skill, Abschnitt 3), oder bevor `wait_for_players` wartet. Was fertig ist, nimmst du, was noch läuft, ignorierst du.
  Ein Helfer, der den Tisch verlangsamt (eine Antwort hängt an ihm), ist falsch eingesetzt.
- Was ein Helfer bringt, ist Material, kein fertiger Zug: Sein Bild siehst du an (`results get`), bevor es gezeigt
  wird, und seine Zeilen sagst du nur, wenn sie zur Lage passen, wenn sie dran sind. Im Test lief das gut: Der
  Prüfer fand alle Fehler, die der Spieler bemerkt hatte, und die vorbereiteten Zeilen kamen ohne Wartezeit.
