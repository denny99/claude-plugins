# Standardsätze (stock lines)

Kurze, immer wieder passende Zeilen einer Figur. Sie werden vorab erzeugt (`prepare_table`) und kommen am Tisch
sofort, während der Rest der Antwort noch entsteht. Darum: kurz (3–8 Wörter), ohne Story-Fakten, ohne Spielernamen,
in der Art der Figur, so dass jede Antwort danach passen kann. Nicht kürzer: ein einzelnes „Hmm …“ ist zu wenig Text,
die Stimme driftet dann zu einer fremden oder erfindet Wörter (Spieltest 2026-10-28). Sie spielen nur, wenn die
Spielleitung sie gezielt aufruft (`say_line opener`), und nur für Figuren mit eigener Stimmprobe.

| Art | Wer | Wofür | Beispiel (Bartel, alter Köhler) |
|---|---|---|---|
| `greet` | NPC, Erzähler | wird angesprochen | „Hm. Wer stört?“ (`how: "say:groan"`) |
| `bye` | NPC, Erzähler | Abschied | „Und lass die Tür zu.“ |
| `think` | NPC, Erzähler | vor der Antwort auf eine längere Frage | „Hm, lass mich nachdenken …“ |
| `yes` | NPC, Erzähler | stimmt zu | „Na gut.“ |
| `no` | NPC, Erzähler | lehnt ab | „Kommt nicht in Frage.“ |
| `gesture` | nur NPC, vom Erzähler gesprochen | was die Figur tut (`opener: "gesture"`) | „Bartel kratzt sich am Bart und brummt.“ |
| `approach` | nur Erzähler | Brücke: ein Held wendet sich einem NPC zu | „{hero} geht zu {npc} hinüber.“ |

- Eine Zeile ist ein String oder `{text, how}`; `how` wie bei `say_line` (`say:`, `whisper:fear`, `say:groan`,
  `shout:anger` …). Ein Kind plappert schnell, ein Wächter spricht knapp, eine Hexe flüstert.
- **Niedrigschwellig starten.** Die deutsche Higgs-Stimme kippt bei starken Gefühlen in eine fremde Stimme, und die
  Prüfung lässt die Zeile dann weg (Ödland-Vorbereitung 2026-10-30: 9 von rund 330 Zeilen, alle mit `anger`,
  `sadness`, `fear` oder `groan`; dieselben Worte mit `say:calm:slow`, `say:determination` oder `say:contempt` hielten.
  Denny: „wenn zu emotional ist ändert es sich zu stark. muss man bissl niedrig schwellig starten“). Darum für
  vorbereitete Sätze `say:calm`, `say:determination`, `say:contempt`, `say:relief`, `say:enthusiasm` und das Gefühl
  in die Worte legen; `anger`, `sadness`, `fear` und `groan` nur, wo es nicht anders geht, und nach `prepare_table`
  prüfen, ob die Zeile gemacht wurde.

## Vielfalt: Stimmungen über die ganze Geschichte

Zwei Sätze pro Art werden nach dem dritten Mal hörbar wiederholt, und eine Figur, die am Ende noch genauso klingt wie
am Anfang, wirkt wie ein Automat. Darum:

- **3–4 Sätze pro Art**, verschieden lang und verschieden gebaut (ein Wort, eine Frage, ein halber Satz).
- **Den Bogen der Figur abdecken:** Welche Stimmungen hat sie im Lauf des Abenteuers? Jede Art bekommt mindestens
  einen Satz pro Stimmung, mit passendem `how`.
  - Hanna (Mutter, Kind vermisst): Begrüßung ängstlich „Oh, gut, dass du kommst!“ (`say:fear:fast`) und erleichtert
    „Ihr seid zurück!“ (`say:relief`); Ja ängstlich „Alles, was du brauchst.“ und dankbar „Danke. Danke!“ (`say:relief`).
  - Bartel (Brummbär, taut auf, wenn man freundlich ist): Begrüßung mürrisch „Hm. Wer stört?“ (`say:groan`) und
    aufgetaut „Ah, du schon wieder. Komm rein.“ (`say:contentment`).
  - Mira (Kind, tapfer, verängstigt): Begrüßung ängstlich „Bist du echt?“ (`say:fear`) und übermütig „Hey! Hier
    oben!“ (`shout:enthusiasm`); Nein trotzig „Ohne Flocke nicht!“ (`say:determination`).
- **Gesten** zeigen die Stimmung auch: die nervöse Hand an der Schürze am Anfang, das Lachen unter Tränen am Ende.
- Die Spielleitung wählt am Tisch den Satz, der zur Lage passt (siehe `pnp-spielleiter`, „Stimmung trifft“); je
  besser die Auswahl, desto seltener muss sie neu erzeugen.
- `approach` braucht beide Platzhalter; daraus entsteht jede Kombination aus Held und NPC („Tobi geht zu Bartel
  hinüber.“, „Brór wendet sich an Hanna.“). Namen werden auf den ersten Teil gekürzt („Brór, Sohn des Bram“ → Brór).
  Darum steht der Rufname vorn: „Direktor Albrecht Kühn“ wurde zu „Jule geht zu Direktor hinüber“, „Herr Dornbusch“
  zu „… zu Herr hinüber“ (Ödland, 2026-10-30) – besser „Kühn (Direktor)“ oder „Dornbusch (Stahlbund)“.
- Setzen: `set_campaign_entry kind npc name … stock { greet: [...], gesture: [...] }`; eine angegebene Art ersetzt
  diese Art, die anderen bleiben. Erzähler: `campaign set narrator_stock { … }`.
- Im Studio stehen sie auf der NPC-Karte bzw. beim Erzähler unter „Standardsätze“ (Reiter je Art, Anhören,
  „Vorschlagen“ lässt das Sprachmodell welche schreiben).
