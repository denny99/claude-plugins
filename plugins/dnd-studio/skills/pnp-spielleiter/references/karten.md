# Karten, Marker und Orte

Gehört zu Skill `pnp-spielleiter`, Abschnitt 4d. Lesen, bevor du eine Karte zeigst, Marker setzt oder Orte aufdeckst.
Die Spieler wollen wissen, wo sie sind und wohin es geht. Karten sind ohne aufgemalte Namen gemalt; was was ist, sagen
die Orts-Pins (`pin_place`, beim Bau gesetzt) und die Marker der Helden.

- **Karte an Orten, an denen man sich bewegt** (Hof, Wald, Dungeon, Kampf, Reise): `show_players` mit `map` (Name aus
  `map list`) und `markers` für jeden Helden und NPC dort; die Karte steht neben dem Szenenbild.
- **Marker per Ortsname,** nichts umrechnen: `{who, at: "Kesselheim"}`; mehrere am selben Ort stehen nebeneinander.
  Unterwegs `toward` und `part` (0 am Aufbruchsort, 1 am Ziel). Welche Orte auf der Karte liegen und welche bekannt
  sind: `map list` mit `map`, unter `places`. Nur innerhalb eines Ortes ohne Pins (ein Raum im Dungeon) ein Feld
  `at: "gx,gy"` aus dem `plan` der Karte.
- Die Startfelder einer Szene setzt das Studio selbst, wenn die Szene am Tisch beginnt; du schickst `markers` nur, wenn
  sich jemand bewegt, und dann nur `map` und `markers` (Bild und Titel bleiben, die Marker gleiten). Die Marker bleiben
  an der Karte gespeichert: ohne `markers` gelten die letzten, `markers: []` räumt ab, `map: ""` nimmt die Karte weg.
- **Nie eine Karte ohne Marker,** auch auf der Kampagnen- oder Regionalkarte bei jeder Reise: am Aufbruchsort,
  unterwegs, am Ziel. Sonst versteht keiner, was was ist.
- **Nur Orte zeigen, die die Helden kennen.** Jeder Ort ist für die Spieler verborgen, bis du ihn aufdeckst
  (`reveal_places`), sobald sie von ihm erfahren (jemand erzählt davon, sie sehen ihn, er steht auf einer Skizze), nie
  vorher; ein verfrühter Pin nimmt die Entdeckung. Das bleibt an der Kampagne (`hide_places` oder
  `set_campaign_entry known: false` nimmt es zurück). Ein Held darf an einem verborgenen Ort stehen; Pin und Name
  bleiben verborgen. Der menschliche GL sieht im Studio alle Pins, die verborgenen blass.
- **Hängen die Spieler fest** (lange Stille, „keine Ahnung, wohin“), darfst du einen Ort aufdecken, den sie schon
  kennen könnten (jemand hat davon erzählt, er steht auf ihrer Karte oder in ihrem Bogen), mit einem Satz, warum er
  ihnen einfällt („Hedwig hatte den Rasthof erwähnt.“). Nie einen Ort, der entdeckt werden soll. Ein Angebot, keine
  Lösung.
- **Karte groß** (`big: true`), wenn das Laufen wichtiger ist als das Szenenbild (Dungeon, Verfolgung, Kampf);
  `big: false` holt das Bild zurück.
- **Nebel** (`fog: true`) bei Orten mit Geheimnissen (Ruine, Höhle, gefährlicher Wald). Um die Helden wird beim Gehen
  von selbst aufgedeckt; einen Raum, den sie betreten, oder was sie vom Hügel sehen, mit `reveal`. NPCs im Nebel bleiben
  unsichtbar, bis die Helden sie sehen.
- **Leitet ein Mensch mit,** vor jeder Änderung an Karte oder Markern `map list` mit `map` lesen
  (`references/sonderfaelle.md`).
