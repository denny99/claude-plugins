# Erfolgsstufen

Gehört zu Skill `pnp-spielleiter`, Abschnitt 5. Denny 2026-11-13: Wer eine Probe klar schafft, schafft sie; wer sie
überragend schafft, bekommt etwas dazu; knapp daneben ist ein Teilerfolg; weit daneben geht etwas schief; ein Patzer
ist richtig blöd. Die Stufen sind eine Tischkonvention für Proben **außerhalb des Kampfs**. Der Eine Ring kennt von
sich aus nur die Stufen des Erfolgs (Sechsen); die Stufen darunter sind unsere Ergänzung.

## Ablesen aus `roll_dice`

- **Der Eine Ring** (`system: "tor"`): `ok` (geschafft ja/nein), `total` gegen den ZW (`tn`), `verdict`:
  `extraordinary` (zwei und mehr Sechsen), `great` (eine Sechs), `success`, `automatic` (Rune ohne Sechs, zählt als
  geschafft), `failure`. Das **Auge** steht nicht im `verdict`: Es ist der behaltene W12 (`kept`) mit Wert 11 in
  `dice`, oder `face`, wenn die Kampagne eigene Würfelseiten hat (im Ödland „Totenkopf“). Ohne Begünstigung kommt es
  etwa bei jedem zwölften Wurf.
- **d20**: `ok`, `total` gegen `dc`, `verdict`: `critical` (natürliche 20, immer geschafft), `fumble` (natürliche 1,
  vom Studio **immer** als Misserfolg gewertet), `success`, `failure`.

## Die Stufen

Zuerst Patzer prüfen, dann „weit drunter“, dann die übrigen.

| Stufe | Der Eine Ring | d20 | Folge |
|---|---|---|---|
| Patzer | Auge **und** Misserfolg | natürliche 1 **und** Summe unter dem DC | richtig schlimm, aber in der Geschichte, kein Slapstick |
| Weit drunter | 5+ unter dem ZW | 5+ unter dem DC | etwas geht schief: entdeckt, etwas verloren, die Lage wird schlimmer |
| Daneben | 3–4 unter dem ZW | 3–4 unter dem DC | nicht geschafft |
| Knapp daneben | 1–2 unter dem ZW | 1–2 unter dem DC | Teilerfolg oder Erfolg mit Preis: halb geschafft, oder geschafft, aber laut, verletzt, Zeit verloren |
| Geschafft | `success` / `automatic` | erreicht | Ziel erreicht, klar erzählt |
| Weit drüber | `great` (großer Erfolg) / `extraordinary` (außergewöhnlich) | DC um 5+ übertroffen oder natürliche 20 | Ziel erreicht plus ein Bonus in der Welt: mehr erfahren, schneller, etwas dazu gefunden, der Gegner verliert etwas; außergewöhnlich mehr als groß |

## Feinheiten

- **Patzer nur mit Misserfolg.** Gelingt die Probe trotz Auge, bleibt sie geschafft, höchstens mit einem dunklen
  Unterton. Bei d20 wertet das Studio jede natürliche 1 als Misserfolg; ein Patzer ist sie aber nur, wenn auch die
  Summe unter dem DC liegt, sonst ein schlichtes Daneben. Sonst käme jeder zwanzigste Wurf als Katastrophe.
- **Erst Hoffnung, dann die Stufe.** Liegt der Wurf daneben und hat der Held Hoffnung oder ein Talent, das ihn
  rettet: das Ergebnis sagen und warten (4a, „Nach einem Wurf gehört der nächste Zug dem Spieler“, „Erinnern, wenn es
  brenzlig wird“). Erst danach gilt die Stufe. Es gelten die Regeln des Spiels zur Hoffnung (Der Eine Ring: höchstens
  1 Hoffnung je Wurf).
- **Im Kampf** gelten die Regeln des Spiels (bei Der Eine Ring geben die Sechsen dort ihre eigenen Effekte), nicht
  diese Tabelle.
- **Das Rezept geht vor:** Steht in der Szene, was ein großer Erfolg oder ein Schiefgehen bringt, das nehmen; sonst
  passend zur Lage erfinden, im Ton der Kampagne.
- **Nicht jede Kleinigkeit würfeln** (4a, „Würfe nur, wenn die Spieler etwas versuchen“): Die Stufen sollen spürbar
  bleiben.
