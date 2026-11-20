# Texte zum Sprechen schreiben: Betonung, Pausen, Aussprache

Die Stimmen des Studios spricht Fish Audio S2-Pro. Es liest einen Vorlesetext so, wie er dasteht: Satzzeichen, Satzlänge
und ein paar Marken in eckigen Klammern entscheiden, wie er klingt. Diese Seite sagt, wie man einen Text schreibt, der
vorgelesen natürlich klingt, und wie man der Stimme die eigenen Namen und Wörter einer Kampagne beibringt. Sie gilt für
jede Kampagne und jede Sprache. Die Beispiele kommen aus einem Hörtest am 2026-11-20 (Korath, Erzähler in der eigenen
Stimme des Autors).

## Was das Studio damit macht

| Im Text | Was die Stimme macht | Was Spieler sehen (Untertitel, gezeigter Text, Discord, Sitzungsprotokoll) |
|---|---|---|
| `[emphasis]` vor einem Wort | betont das Wort | nichts: die Marke fällt weg |
| andere Marken: `[pause]`, `[whisper]`, `[laughing]` … | was S2-Pro daraus macht (s. u.) | nichts |
| `…` | setzt kurz ab | `…` |
| Punkt | Stimme geht am Satzende runter | Punkt |
| Komma | Stimme bleibt oben, es geht weiter | Komma |
| `#sigh`, `#laughs` | ein Laut (wie bisher) | wie bisher |
| ein Wort aus `pronunciations` | spricht es, wie dort steht | das Wort, wie es im Text steht |

Eine Marke ist ein Wort oder ein paar Wörter in eckigen Klammern: ein Buchstabe vorn, danach nur Buchstaben,
Leerzeichen, `'` und `-`, höchstens 39 Zeichen. `[1]`, `[12:00]` oder `[Kapitel 1]` sind keine Marken und bleiben
stehen, auch für die Spieler. Die Marken fallen erst dort weg, wo die Spieler etwas sehen: im Spielerfenster und beim
Discord-Bot (`speech_markup.js`), im Sitzungsprotokoll (`table_core.py shown`). In der Kampagne selbst und in
`campaign get` stehen sie, damit man sie bearbeiten kann.

## Regeln für einen Vorlesetext

1. **Ruhig sprechen lassen.** Vorlesetexte mit `how: "say:calm:slow"` (oder ohne `how`). Spannung kommt aus dem Text:
   kurze Sätze, Pausen, Betonung. Mit `tense` blieb die Stimme am Satzende oben. `slow` macht kaum langsamer (etwa
   145 Wörter je Minute statt 150).
2. **Kurze Sätze statt Kommaketten.** Am Komma bleibt die Stimme oben, am Punkt geht sie runter. Eine Aufzählung wird
   zu eigenen Sätzen, der Inhalt bleibt gleich:
   - statt „die meisten in Gelb, manche in Rot, und darunter blinkt geduldig ein Cursor“
   - „Die meisten in [emphasis] Gelb. Manche in [emphasis] Rot. … Und darunter blinkt [emphasis] geduldig ein Cursor.“
3. **Etwa eine Betonung je Satz,** mit `[emphasis]` direkt vor dem Wort, auf dem das Bild liegt (das Ding, die Zahl,
   das Gefühl), nicht auf Füllwörtern. Mehr klingt überladen. Großbuchstaben (`REISENDEN`) wirken auch, sind aber im
   Spielerfenster zu sehen: `[emphasis]` nehmen.
4. **`…` vor dem Wort, das wirken soll:** „ein Felsbrocken … groß wie eine [emphasis] Stadt“, „und fragt nach eurem
   [emphasis] Namen“. Auch zwischen zwei Gedanken.
5. **Eine Pause, die man hören muss** (nach einer Aufzählung, vor der Pointe): den Satz mit einem Punkt beenden und
   `…` dahinter. `[pause]` mitten im Satz hat S2-Pro im Test überhört, und ein in Stücke geteilter Satz mit eingefügter
   Stille klang schlechter:
   - „… blitzt etwas [emphasis] Gerades. … [emphasis] Metallisches. … [emphasis] Viel zu gerade … für einen Felsen.“
6. **Nichts am Inhalt ändern.** Die Marken und die Satzteilung sind für die Stimme; was gesagt wird, bleibt.

Ein ganzer Text nach diesen Regeln (der Autor: „das ist perfekt“):

> Draußen tobt der Sturm weiter … gedämpft durch die Hülle wie ein [emphasis] fernes Meer. Auf dem Bildschirm des
> Bordcomputers stehen die Systeme untereinander. Die meisten in [emphasis] Gelb. Manche in [emphasis] Rot. … Und
> darunter blinkt [emphasis] geduldig ein Cursor. … Durch die Lüftung rieselt feiner Staub. Der Boden ist
> [emphasis] kalt. Und eure Kleidung riecht nach [emphasis] Rauch … aus dem Kessel. … [emphasis] Niemand weiß, wie
> lange der Sturm noch hält. … Und niemand weiß, wer [emphasis] kommt … wenn er vorbei ist.

Das gilt auch für Standardsätze, erste Worte der NPCs und was die Spielleitung am Tisch frei spricht: Wer `say_line`
schreibt, darf `[emphasis]` und `…` setzen.

## Aussprache der eigenen Wörter: `campaign set pronunciations`

Erfundene Namen liest die Stimme, wie sie in ihrer Sprache aussähen, und das ist oft falsch: „Korath“ mit englischem
th und Ton auf „-rath“, „Kervan“ als „Kerfan“, „Gasriese“ mit falscher Betonung. Im Text umschreiben hilft nicht, weil
die Spieler die Umschreibung dann lesen. Darum hat jede Kampagne ein Wörterbuch, das nur auf dem Weg zur Stimme wirkt:

```json
campaign set {
  "pronunciations": {
    "Korath": "[emphasis] Ko-rat",
    "Gasriese*": "[emphasis] Gas-Riese",
    "Kervan": "Kehrwahn"
  }
}
```

- **Links das Wort, wie es in den Texten steht; rechts, wie es gesprochen wird.** Die Texte bleiben, wie sie sind.
- **Ganze Wörter,** egal ob groß oder klein geschrieben: „Korath“ trifft „Korath“ und „KORATH“, nicht „Korathianer“.
  Mehrere Wörter gehen auch („Kapitänin Weidemann“).
- **Ein `*` am Ende** trifft jedes Wort, das so anfängt, und hängt den Rest wieder an: `"Gasriese*"` macht aus
  „Gasriesen“ „[emphasis] Gas-Riesen“. Für Wörter mit Endungen (Plural, Genitiv) so ein Eintrag.
- Das längste passende Wort gewinnt; was eingesetzt wurde, wird nicht noch einmal ersetzt.
- **Ändern:** die genannten Wörter kommen dazu oder ändern sich, `""` nimmt eines heraus, `null` leert alles.
  `campaign get` zeigt die Liste unter `pronunciations`.
- Es wirkt auf **jede Stimme** (Erzähler, NPCs, Helden), auf `say_line`, `prepare_table`, `talk_npc`, die
  Standardsätze und die Vorlese-Knöpfe im Studio. Nach einer Änderung macht `prepare_table` die betroffenen Zeilen neu.

**Wie man die richtige Schreibweise findet:** einen Satz mit dem Wort ein paar Mal in Varianten sprechen lassen und
den Menschen hören lassen, der weiß, wie es klingen soll (`say_line`, ein Teil je Variante, „Eins. …“, „Zwei. …“
vorn, damit man sie auseinanderhält). Was im Test half:

| Problem | Schreibweise, die half |
|---|---|
| englisch gelesenes th, Ton auf der falschen Silbe | Silben mit Bindestrich, deutsch geschrieben, `[emphasis]` davor: `Ko-rat` |
| v als f gelesen | w schreiben: `Kehrwahn` |
| Ton auf der falschen Silbe in einem Namen aus zwei Silben | als ein Wort schreiben, wie ein deutsches Kompositum (Ton vorn): `Kehrwahn` statt `Kehr-wahn` |
| zusammengesetztes Wort klingt verschluckt | `[emphasis] Gas-Riese` |
| langes O wird kurz | `oh` oder `oo` |

## Für Bauende und Prüfende

- **pnp-texter** schreibt Vorlesetexte gleich nach den Regeln oben und legt für jeden erfundenen Namen, der vorkommt,
  einen Eintrag in `pronunciations` an oder meldet ihn, wenn er die Aussprache nicht kennt.
- **pnp-tischbereit** ruft danach `prepare_table`, bis alles gemacht ist.
- **Reviewer** prüfen: Sätze kurz, Betonung sparsam, keine Umschreibungen im Text selbst (die gehören ins Wörterbuch),
  jeder erfundene Name im Wörterbuch.
- Eine Kampagne, deren Notizen außerhalb des Studios liegen (ein Obsidian-Vault, Markdown-Dateien): die Texte dort
  dürfen die Marken auch tragen, das Wörterbuch aber gehört in die Kampagne des Studios, denn nur dort wirkt es.
