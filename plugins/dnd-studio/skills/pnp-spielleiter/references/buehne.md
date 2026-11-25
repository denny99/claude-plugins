# Die Bühne: Bilder, Effekte, Fundstücke, Gegner, Klang

Gehört zu Skill `pnp-spielleiter`, Abschnitte 4 und 6. Lesen, wenn du mehr als Bild und Titel zeigst, Fundstücke gibst,
Gegner auf den Tisch stellst oder am Tisch ein Bild nachmalst. Welche Felder es gibt, sagt das Schema von
`show_players`; hier, wann du sie nimmst.

## Was von selbst geschieht

- Das Spielerfenster zeigt, was du gerade tust (überlegt, schreibt, Stimme …), und Untertitel (die Spieler schalten sie
  in der Leiste). Gesprochen wird nichts von selbst.
- Spricht ein NPC mit Porträt (`say_line voice: "<NPC>"`), erscheint er mit Bild und Namen und bleibt, bis der Erzähler
  wieder spricht oder die Szene wechselt. Fehlt das Porträt, auf der NPC-Karte eins malen lassen.
- Ein Held fast am Boden (Leben ≤ 25 %) lässt den Rand rot pulsieren; ein Standbild zoomt langsam.
- `show_players` gehört vor den `say_line`, zu dem es gehört, im selben Schritt (es ist schnell).

## Bühne lebendig machen

- `transition`: `black` (abblenden) oder `title` (Titelkarte, für ein neues Kapitel oder einen neuen Ort).
- `weather` (`rain`, `snow`, `ash`, `fog`) bleibt, bis du es änderst (`none`).
- `effect` einmal beim Erscheinen: `shake` (Schlag, Beben, eine Tür fliegt auf), `flash` (Blitz, Zauber).
- `overlay` wie auf der Linse: `blood` (Treffer), `water` (Welle), `mud`, `cracks` (Glas splittert, Schlag auf den Kopf),
  `frost`; das nächste Bild nimmt es weg. Dazu die eigenen Effekte der Kampagne (`campaign` → `effects`, z. B.
  `strahlung` im Ödland) mit ihrem Klang.
- **Sparsam:** ein Effekt, wenn die Geschichte ihn trägt, nicht bei jedem Bild.
- **Schleifen:** Hat eine Szene eine vorbereitete Schleife (`animate loop`), zeigst du sie statt des Standbilds
  (`loop: true`). Auch ein stummer Clip läuft so als bewegter Hintergrund.
- **Über Discord:** ein `emoji` zur Szene (`taverne`, `kampf`, `drache`, `schatz`, `quest`, `magie`, `heiltrank`,
  `tot`; welche der Bot hat, sagt `discord` Status) steht vor dem Titel im Textkanal. Würfe postet der Bot selbst.

## Fundstücke

Bekommen sie einen Brief, einen Gegenstand, einen Hinweis: `give_find` mit dem Titel eines Textes der Kampagne oder mit
eigenem Titel, Worten, Bild. Es wird gezeigt (`show: false`: nur abgelegt) und liegt in ihren Fundstücken, auch an
späteren Abenden; `remove: true` nimmt es zurück. Vorbereiten statt gleich geben: ein Text mit `handout`. Was sie
schon haben, steht in `campaign` unter `found`.

## Gegner und Werte

`set_status` setzt den neuen Stand je Label, kein Plus oder Minus; nur die genannten ändern sich. Gegner im Kampf mit
`foe: true` (das startet die Kampfmusik), besiegt `remove: true`, neuer Kampf `clear: true`; mehrere (ein Treffer für
alle, die Gegner zu Kampfbeginn) in einem Aufruf mit `entries`.

## Klang im Einzelnen

- Die Kampagne bindet die Musik je Stimmung, eine Szene kann eigene haben; ein eigenes `play_sound loop` gilt bis zur
  nächsten Stimmung. Nach einem Kampf kommt die Stimmung von vorher zurück.
- Ein Effekt spielt einmal, Atmosphäre und Musik mit `loop: true` (eine Schleife bleibt bei höchstens 0.3 und wird
  unter Sprache leiser), `stop: true` beendet sie. Sie klingen im Spielerfenster und, ist der Bot da, in Discord unter
  der Stimme.

## Am Tisch nachmalen

- Neues Motiv mit Krea 2 (`picture` ohne Basis, `advanced_create: true`); Klein mit Basis erst danach und nur für
  Helden, Licht, Blickwinkel oder ein Detail; ein bekannter Ort als Edit seines Bildes.
- Bildjobs kehren sofort mit ihrer Job-ID zurück; fertig mit `jobs wait` (kurze Wartezeit), ein Clip oder 3D mit
  `jobs watch` im Hintergrund. Solange eine Zeile gestreamt wird, hält das Studio Bildjobs zwischen zwei Schritten an:
  Du musst das Timing nicht abpassen, das Bild dauert nur länger.
- Das Bild ist ein Zusatz, keine Bedingung: das Spiel läuft weiter; ansehen (`results get`), bevor es gezeigt wird.
