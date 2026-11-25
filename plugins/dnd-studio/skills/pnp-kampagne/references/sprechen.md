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

Die Regeln kommen aus Hörtests mit dem Autor (Korath, 2026-11-20). Die erste Fassung (eine Betonung je Satz, `…` vor
jeder Pointe, Aufzählungen in Einzelsätze zerlegt) klang beim Erzähler zerhackt, „als würde ein Dreijähriger
sprechen“, und Betonungen auf Füllwörtern („da seid ihr [emphasis] ja“) waren ganz daneben. Weniger ist mehr:

1. **Der Text, wie er geschrieben ist.** Eine gute Erzählerstimme setzt an Komma und Punkt selbst die richtigen
   Pausen. Sätze nur teilen, wo sie wirklich lang sind (ein Semikolon, eine Kette aus drei, vier „und“); Kommas
   innerhalb eines Satzes bleiben.
2. **Die Art des Textes entscheidet:**

   | Art | Sätze | `[emphasis]` | `…` |
   |---|---|---|---|
   | Beschreibung (Ort, Ankunft) | normal lang, am Ende ein, zwei kurze Sätze für den Haken | etwa eine je drei, vier Sätze | keine |
   | Stiller, menschlicher Moment | normal lang | höchstens eine | keine |
   | Spannung (Flug, Gefahr, Eile) | kurz, auch knapp abgehackt | etwa eine je Satz | sparsam, vor dem einen Wort, das zuschlägt |
   | NPC-Worte | wie Menschen reden, Satzzeichen wie geschrieben | höchstens eine, nur auf dem Wort, das die Figur selbst betont (eine Warnung, eine Bedingung) | höchstens eine |

3. **`[emphasis]` nur auf dem Wort, das das Bild trägt** (das Ding, die Zahl, das Gefühl), nie auf Füllwörtern
   („ja“, „doch“, „mal“), nie zwei in einem Satz. Großbuchstaben wirken auch, sind aber im Spielerfenster zu sehen.
4. **`…` und Kommas zusammen werden zu lang.** Im Test brachte die entworfene Stimme an Komma plus `…` Pausen bis
   0,8 s. Ohne `…` blieben sie unter 0,6 s und klangen am natürlichsten. `[pause]` mitten im Satz überhört S2-Pro.
5. **Das `how`:** beim Erzähler `say:` (ohne `slow`, das macht kaum langsamer; `tense` lässt die Stimme am Satzende
   oben). Beim Erzähler war zwischen `say:`, `say:calm:slow` und `say:curiosity` kaum ein Unterschied zu hören:
   Lebendigkeit kommt aus dem Text. Bei NPCs zählt das `how` dagegen: je Zeile eine Stimmung, die zur ganzen Zeile
   passt (im Test Rosa, eine müde Überlebende, mit `say:relief`). Eine Betonung im NPC-Satz half nur dort, wo die
   Figur selbst etwas einschärft: „Und eins merkt ihr euch, [emphasis] Kehrwieder nennt ihr nie über Funk.“ Eine
   Pause, die die Figur macht, ist ein `…` („Vierzig jetzt … und wenn's nicht ankommt, reden wir über achtzig.“). Ein gespeicherter Text hat nur ein `how`; braucht
   eine Zeile zwei Stimmungen, wird sie zu zwei Texten.
6. **Nichts am Inhalt ändern.** Marken und Satzteilung sind für die Stimme; was gesagt wird, bleibt.

Ein Beispiel, Beschreibung (der Autor: „am natürlichsten“):

> Unten in der Zisterne stellt jemand die Lampe in die Mitte, und einer nach dem anderen rückt heran. Die Kinder auf
> Decken, die Alten auf Kisten, Matti am Fuß der Leiter, als wolle er gleich wieder hinauf. So viele Menschen und ein
> Schiff, das für [emphasis] sechs gebaut ist. Laut hat es niemand gesagt, aber jeder hat es ausgerechnet. Nur die
> Tropfen fallen in die Stille. Dann klopft Rosa mit dem Löffel gegen ihre leere Kanne und schaut euch an.

Ein Beispiel, Spannung (hier wirkte die knappe Fassung besser als die ruhige):

> Nach drei Tagen Flug wächst der [emphasis] Mars im Fenster. Rostrot … und still. Mit ihm wächst die Lichterkette der
> [emphasis] Kontrollgrenze. Im Cockpit wird es [emphasis] eng. Alle wollen sehen. Und keiner will etwas sagen. Nur
> die Instrumente ticken … und der Kurs zeigt mitten [emphasis] durch die Kette.

**Die Stimme entscheidet mit.** Wie lang eine Pause an Komma und `…` wird und wie stark `[emphasis]` wirkt, hängt von
der Stimme ab. Bekommt eine Kampagne einen neuen Erzähler, vor dem Bauen drei kurze Texte (Beschreibung, Spannung,
NPC) in ihr sprechen lassen und den Menschen hören lassen. Geht es im Test um die Stimme, denselben Text in beiden
Stimmen, sonst denselben Text in Varianten (A, B, C), und die Pausen messen (`ffmpeg -af silencedetect`).

**Eine Erzählerstimme aus Worten** (`set_voice from description`) war im Test besser als eine geklonte Aufnahme des
Autors. Eine Beschreibung, die zu einer Referenz passen soll: deren Tonhöhe messen (im Test 94 Hz Median) und
„medium-pitched“, „light baritone“ oder „deep“ danach wählen. „low baritone“ ergab 72 Hz und klang zu tief. Jede
Erzeugung klingt anders: die gehörte Datei übernehmen (`set_voice from file`), nicht neu aus der Beschreibung machen.

Das gilt auch für die ersten Worte der NPCs und was die Spielleitung am Tisch frei spricht.

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
- Es wirkt auf **jede Stimme** (Erzähler, NPCs, Helden), auf `say_line`, `prepare_table`, `talk_npc` und
  die Vorlese-Knöpfe im Studio. Nach einer Änderung macht `prepare_table` die betroffenen Zeilen neu.

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
- **Reviewer** prüfen: Schreibweise passt zur Art des Textes, Betonung sparsam und nie auf Füllwörtern, keine Umschreibungen im Text selbst (die gehören ins Wörterbuch),
  jeder erfundene Name im Wörterbuch.
- **Mit einem Vault ist der Vault die Quelle des Wörterbuchs** (Korath, 2026-11-20): eine eigene Notiz (im
  Wissens-Vault des Studios die Notiz „Namen und Aussprache“ der Welt, Skill `pnp-lore`; Wort, so gesprochen, seit wann), versioniert und beim Neubau einer Studio-Kampagne wieder da. Das Studio hält eine Kopie,
  denn nur dort wirkt sie; abgeglichen wird in **eine** Richtung, vom Vault ins Studio (`campaign set
  pronunciations`, nur die geänderten Wörter), nie im Studio zuerst ändern. In eine Notiz, die Spieler lesen dürfen,
  kommt ein Name erst, wenn er am Tisch gefallen ist; bis dahin steht seine Aussprache nur im Studio. Ohne Vault
  bleibt das Wörterbuch allein im Studio. Die Texte im Vault dürfen die Marken auch tragen.
