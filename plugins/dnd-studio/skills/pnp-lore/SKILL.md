---
name: pnp-lore
description: 'Baut und pflegt in D&D Studio (MCP-Server dnd-studio) die Lore einer Spielwelt im Wissens-Vault des Studios (Werkzeug `lore`) – welche Notiz-Art wofür, wie eine Notiz geschrieben wird (kurz, verlinkt, mit Quellen), erst lesen, dann schreiben, Zurückschreiben nach einem Bau oder Spielabend, offene Fragen, Zeitleiste, Namen und Aussprache, Kanon der Kampagne und Lore getrennt und im Gleichschritt. Verwenden, sobald jemand die Welt einer Kampagne festhalten, nachschlagen, ordnen, ergänzen oder nach einem Abend nachtragen will („schreib die Lore vom Ödland auf“, „was wissen wir über Kesselheim?“, „trag den Abend in die Welt ein“, „übernimm die Lore aus der Kampagne“, „welche Fragen zur Welt sind offen?“), auch ohne das Wort Lore. Eine Welt von Grund auf entwerfen: Skill pnp-weltenbau. Eine Kampagne bauen: Skill pnp-kampagne.'
---

# Die Lore einer Welt pflegen

Die Lore ist das Gedächtnis einer Welt: was es dort gibt, wer dort lebt, was geschah und was noch offen ist. Sie liegt
im **Wissens-Vault des Studios** (Werkzeug `lore`), nach Welten getrennt, und ist kleiner und schneller zu lesen als
eine ganze Kampagne. Architekt, Texter und Spielleitung lesen dort nach, statt das Studio zu durchsuchen. Das Ziel ist
nicht Vollständigkeit, sondern dass jede Frage am Tisch oder beim Bauen mit **einem** Nachschlagen beantwortet ist.

Schreibweise: `lore map`, `lore search` usw. meinen das Werkzeug `lore` mit `action: "map"` usw.; in Claude Code heißt
es `mcp__plugin_dnd-studio_dnd-studio__lore`. Das Beispiel durch den ganzen Skill ist die Welt **Ödland** der Kampagne
„Die Rostmark-Chroniken“: ein Ödland nach dem Krieg, die Rostmark, die Stadt Kesselheim, der Schutzraum 12, Strahlung,
eine Radio-Kultur wie in den 1950ern.

## Das Werkzeug `lore`

| Aktion          | Was                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `map`           | Ohne `world`: alle Welten mit Anzahl je Art und ihren Kampagnen. Mit `world`: die Titel je Art, die offenen Fragen, zuletzt Geändertes. |
| `search`        | `query`, optional `world`, `kind`, `tag`, `limit`: Treffer mit Ausschnitt. Der erste Griff bei jeder Frage.        |
| `read`          | `title`, `world`: eine Notiz ganz, mit Links, Rückverweisen und Quellen.                               |
| `write`         | `notes: [{title, world, kind, tags?, status?, body, sources?}]`: mehrere Notizen je Aufruf, neu oder geändert. `body` ersetzt den Text, `tags` und `sources` kommen dazu (`"-tag"` nimmt einen Tag weg). |
| `delete`        | `title`, `world`: nimmt eine Notiz heraus (nur Überholtes, nie Kanon).                                 |
| `from_campaign` | `campaign`, `world`: legt die Lore einer Welt aus einer bestehenden Kampagne an (siehe unten).         |

**Arten** (`kind`), eine je Notiz:

| Art          | Wofür                                                            | Ödland                                      |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------- |
| `world`      | Die Welt im Ganzen: Ton, Säulen, was jeder weiß. Eine je Welt.   | „Ödland“                                    |
| `place`      | Ein Ort, eine Region, ein Bauwerk                                | „Rostmark“, „Kesselheim“, „Schutzraum 12“   |
| `people`     | Ein Volk, eine Kultur, eine Gruppe von Menschen                  | „Schutzraum-Leute“, „Schrottsammler“        |
| `faction`    | Eine Macht mit Zielen: Gilde, Bande, Kirche, Staat               | „Kesselheimer Rat“                          |
| `character`  | Eine Person (NPC, Held, Gestalt der Geschichte)                  | „Ansagerin von Radio Kesselheim“            |
| `history`    | Ein Ereignis oder eine Epoche; die Zeitleiste                    | „Der Krieg“, „Zeitleiste“                   |
| `religion`   | Glaube, Kult, Heiliges                                           | „Die Stille Welle“                          |
| `magic`      | Magie und ihr Preis                                              |                                             |
| `technology` | Technik und ihr Preis                                            | „Strahlung“, „Röhrenradios“                 |
| `creature`   | Wesen, Tiere, Mutanten                                           | „Rostkäfer“                                 |
| `item`       | Ein Gegenstand von Gewicht                                       | „Geigerzähler von Schutzraum 12“            |
| `language`   | Sprache, Namen, Aussprache                                       | „Namen und Aussprache“                      |
| `rule`       | Eine Hausregel der Welt am Tisch                                 | „Strahlungsdosis“                           |
| `theme`      | Ein Leitmotiv, eine Stimmung, eine Säule                         | „Hoffnung im Rauschen“                      |
| `question`   | Eine offene Frage an die Welt                                    | „Wer sendet auf 87,5?“                      |
| `note`       | Was in keine Art passt (sparsam)                                 |                                             |

`status`: `draft` (Entwurf, noch nicht abgesegnet), `canon` (gilt), `retired` (überholt, bleibt als Verweis). Ohne
Angabe `draft`. Tags klein und wenige: `spoiler` für Spielleiterwissen, eine Region (`rostmark`), ein Kapitel (`kap-2`).

## Die sechs Schritte und der Stand im Panel

Das D&D-Panel zeigt im Tab **Lore** sechs Schritte mit Nummer und Stand (wie die Bau-Abschnitte im Tab Bau):

1. **Bestand sichten** (Abschnitt 1; bei einer bestehenden Kampagne `from_campaign`, Abschnitt 2)
2. **Notizen anlegen/abgleichen** (Abschnitte 3 und 8)
3. **Verknüpfen**: jede Notiz hat ihre `[[Links]]`, Zeitleiste und „Namen und Aussprache“ sind nachgezogen
4. **Geheimes markieren**: Spielleiterwissen unter `## Geheim (Spielleitung)` mit Tag `spoiler`
5. **Offene Fragen** (Abschnitt 4)
6. **Kanon-Abgleich nach dem Abend** (Abschnitt 7 und 8)

**Stand melden** (nur Anzeige; gibt es das Werkzeug `mcp__dnd-studio__lore_progress` nicht, überspringen): zu Beginn
eines Schritts `lore_progress` mit `{flow: "lore", world, step: <Nummer>, state: "active"}`, danach `state: "done"` und
ein kurzes `note` („12 Notizen, 3 Fragen“). Ohne Meldung schätzt das Panel den Stand aus der Welt (Notizen, Fragen).

## 1. Erst lesen, dann schreiben

Vor jedem Schreiben und vor tieferer Arbeit an einem Thema:
1. `lore map` mit der Welt: Was gibt es schon, welche Fragen sind offen?
2. `lore search` mit dem Thema („Kesselheim Rat“). Ein Treffer: `lore read`. Kein Treffer: auch unter anderem Namen
   suchen (Spitzname, alte Schreibweise), erst dann neu anlegen.
3. Eine bestehende Notiz wird **ergänzt**, nicht daneben eine zweite angelegt. Zwei Notizen über dasselbe zusammenführen:
   die bessere behalten, die andere mit `delete` heraus und ihre Links umbiegen.

Lies nicht die ganze Welt: die Karte und gezielte Treffer reichen. Eine Welt mit 120 Notizen ganz zu lesen kostet mehr
als der ganze Bau.

## 2. Eine bestehende Kampagne übernehmen

Hat eine Kampagne schon Inhalt, aber ihre Welt noch keine Notizen (`lore map` zeigt die Welt nicht oder leer), ist der
**erste Schritt** `lore from_campaign` mit `campaign` (wie `campaign` sie nennt) und `world` (Ödland: `{campaign: "Die
Rostmark-Chroniken", world: "Ödland"}`). Das Studio legt an: Zusammenfassung und Leitfaden → `world`, Orte → `place`,
NPCs → `character`, Kanon → in die betroffenen Notizen, Fäden → `question`, Aussprachen → `language`. Danach:
- `lore map` lesen und dem Menschen in drei Sätzen sagen, was entstand und was fehlt (meist Geschichte, Völker,
  Fraktionen, Religion: was nie eine Szene brauchte).
- Den Rest nicht erfinden: Lücken werden `question`-Notizen oder ein Auftrag an `pnp-weltenbau`.
- Mit `set_campaign world: "Ödland"` die Kampagne an ihre Welt binden, falls sie es noch nicht ist.

## 3. Wie eine Notiz aussieht

- **Kurz.** Eine Notiz, ein Ding. 5 bis 25 Zeilen; was länger wird, teilt sich (Kesselheim → „Kesselheim“,
  „Kesselheimer Markt“, „Radio Kesselheim“).
- **Der erste Satz sagt, was es ist**, so dass er allein in einer Trefferliste trägt: „Kesselheim ist die größte
  Siedlung der Rostmark, um einen erloschenen Kühlturm gebaut.“
- **Was die Helden wissen können, zuerst**; Spielleiterwissen darunter unter `## Geheim (Spielleitung)` (und Tag `spoiler`).
  Spielt der Mensch selbst mit, liest du ihm nichts davon vor.
- **Verlinkt:** jeder Ort, jede Person, jedes Ereignis, das eine eigene Notiz hat oder haben sollte, als
  `[[Titel]]`. Ein Link auf eine Notiz, die es noch nicht gibt, ist erlaubt, wenn sie bald entsteht; sonst eine
  `question`-Notiz dafür.
- **Mit Quellen** (`sources`): woher es stammt – `kampagne:Die Rostmark-Chroniken`, `kanon:Abend 2026-11-14`,
  `weltenbau:Runde 3`, `mensch` (der Mensch hat es gesagt). Was keine Quelle hat, ist erfunden: erst fragen.
- **Konkret statt groß:** ein Name, eine Zahl, ein Geruch, ein Satz, den ein NPC sagen würde. „Im Schutzraum 12
  riecht es nach Ozon und Dosenpfirsich“ trägt am Tisch, „ein geheimnisvoller Ort“ nicht.
- Deutsch (oder die Sprache der Kampagne), keine Zugangsdaten, keine Dateipfade dieses Rechners.

Gerüst einer Ortsnotiz:

```markdown
Kesselheim ist die größte Siedlung der [[Rostmark]], um einen erloschenen Kühlturm gebaut.

- Wer: ~800 Leute, regiert vom [[Kesselheimer Rat]]; Händler, Schrottsammler, Flüchtlinge aus [[Schutzraum 12]].
- Wie es ist: Wellblech, Röhrenradios in jedem Fenster, abends die Sendung von [[Radio Kesselheim]].
- Gefahr: Strahlungsnester im Kühlturm (siehe [[Strahlung]]).

## Geheim (Spielleitung)
Der Rat verschweigt, dass der Kühlturm wieder warm wird.
```

## 4. Offene Fragen

Was die Welt noch nicht beantwortet, wird eine `question`-Notiz statt einer stillen Lücke oder einer schnellen
Erfindung: Titel als Frage („Wer sendet auf 87,5?“), im Text warum sie zählt, was davon abhängt (`[[Links]]`) und
mögliche Antworten, wenn welche im Raum stehen. Beantwortet: die Antwort in die betroffenen Notizen schreiben, die Frage
mit `delete` herausnehmen (oder `status: retired`, wenn der Weg zur Antwort lehrreich ist). Offene Fragen sind der
Stoff für Abenteuer-Aufhänger: Architekt und `pnp-weltenbau` lesen sie zuerst.

## 5. Zeitleiste

Eine `history`-Notiz „Zeitleiste“ je Welt: eine Zeile je Ereignis, älteste oben, in der Zeitrechnung der Welt
(„Jahr 0 – Der Krieg endet; [[Schutzraum 12]] schließt seine Tore“). Jedes größere Ereignis hat zusätzlich eine eigene
Notiz und ist in der Zeitleiste verlinkt. Was an Spielabenden geschah, steht am Ende mit Datum des Abends. Widersprüche
in Jahreszahlen sind eine `question`.

## 6. Namen und Aussprache

Eine `language`-Notiz „Namen und Aussprache“ je Welt: jeder Name, den eine Stimme vorliest und der nicht eindeutig ist,
mit Aussprache in einfacher Lautschrift („Kesselheim – KESS-el-heim“), dazu die Regeln, nach denen Namen der Welt
gebildet werden (Ödland: deutsche Ortsnamen mit Industrieteilen, Rufnamen aus Funkcodes). Das Studio liest Aussprachen
von dort für die Stimmen; neue NPCs und Orte bekommen ihre Zeile, bevor sie gesprochen werden.

## 7. Kanon und Lore: getrennt und im Gleichschritt

- **Kanon** (`campaign`, Liste `canon`) sind Tatsachen vom Tisch einer Kampagne: was gesagt, erfunden, versprochen
  wurde. Ihn schreibt der Chronist am Abend (`set_campaign_entry kind canon`); er wird nie umgeschrieben.
- **Lore** ist die Welt, unabhängig von einer Kampagne; mehrere Kampagnen können in einer Welt spielen.
- **Kanon geht vor.** Widerspricht eine Notiz dem Kanon, wird die Notiz angepasst (Quelle `kanon:<Abend>`), nie der
  Kanon. Was am Tisch erfunden wurde und in der Lore fehlt, kommt dazu.
- **Nicht alles Kanon ist Lore:** „Mara schuldet dem Händler 20 Kronkorken“ bleibt Kanon der Kampagne; „In Kesselheim
  zahlt man mit Kronkorken“ gehört in die Lore.
- Lore-Entwürfe (`draft`) sind keine Tatsachen am Tisch, bis eine Szene oder der Mensch sie bestätigt.

## 8. Zurückschreiben

Nach einem Bau (pnp-kampagne) und nach jedem Spielabend wird die Lore nachgezogen, **nur das Geänderte**:
1. Was neu ist: die neuen Einträge der Kampagne (Bauplan, Bauprotokoll) bzw. der Kanon des Abends und die Session-Notizen.
2. Je Thema `lore search`, dann ergänzen oder anlegen, alles in **einem** `lore write` mit allen Notizen.
3. Zeitleiste und „Namen und Aussprache“ nachtragen, beantwortete Fragen herausnehmen, neue Fragen anlegen.
4. Dem Menschen in zwei Sätzen sagen, was neu ist und welche Fragen offen sind (ohne Spoiler, wenn er mitspielt).

Große Nachträge gibt die Hauptsitzung an den Agenten `dnd-studio:pnp-lore` (Auftrag: Welt, Kampagne, was sich
geändert hat); sie schreibt die Lore danach nicht selbst noch einmal.

## 9. Ein eigener Obsidian-Vault

Hat der Mensch seine Welt schon in einem Obsidian-Vault, bleibt das Studio trotzdem die Quelle für Claude: Den Vault
einmal mit `lore write` übernehmen (Arten zuordnen, Quellen `obsidian:<Datei>`), danach gleicht `pnp-lore` beide ab,
wenn der Auftrag den Vault-Ordner nennt. Ohne Vault gibt es nichts abzugleichen.
