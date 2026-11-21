---
name: pnp-lore
description: 'Baut und pflegt in D&D Studio (MCP-Server dnd-studio) die Lore einer Spielwelt im Wissens-Vault des Studios (Werkzeug `lore`) – welche Notiz-Art wofür, wie eine Notiz geschrieben wird (kurz, verlinkt, mit Quellen), erst lesen, dann schreiben, Zurückschreiben nach einem Bau oder Spielabend, offene Fragen, Zeitleiste, Namen und Aussprache, Kanon der Kampagne und Lore getrennt und im Gleichschritt, jeder Fakt nur in einer Notiz, ein Entscheidungsprotokoll, Widersprüche und Gerüchte sauber getrennt, Prüfung mit `lore check`. Verwenden, sobald jemand die Welt einer Kampagne festhalten, nachschlagen, ordnen, ergänzen oder nach einem Abend nachtragen will („schreib die Lore vom Ödland auf“, „was wissen wir über Kesselheim?“, „trag den Abend in die Welt ein“, „übernimm die Lore aus der Kampagne“, „welche Fragen zur Welt sind offen?“), auch ohne das Wort Lore. Eine Welt von Grund auf entwerfen: Skill pnp-weltenbau. Eine Kampagne bauen: Skill pnp-kampagne.'
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
| `read`          | `title` (oder `titles` für mehrere), `world`: Notizen ganz, mit Links, Rückverweisen und Quellen.      |
| `write`         | `notes: [{title, world, kind, tags?, status?, body, sources?}]`: mehrere Notizen je Aufruf, neu oder geändert. `body` ersetzt den Text, `tags` und `sources` kommen dazu (`"-tag"` nimmt einen Tag weg). Antwort: `written` und `unlinked` (Links ins Leere). |
| `delete`        | `title`, `world`: legt eine Notiz in den Papierkorb-Ordner (nur Überholtes, nie Kanon).               |
| `check`         | `world`: prüft die Welt, ohne etwas zu ändern (G12) → `{ok, errors, hints, counts}`.                   |
| `decide`        | `world`, `what`, `words`, optional `secret`: hängt **eine** Zeile an das Protokoll „Entscheidungen“ an (legt es an, wenn es fehlt), vergibt die nächste Nummer selbst und gibt sie zurück (`id`, z. B. `E-0012`); `secret: true` schreibt sie unter `## Geheim (Spielleitung)` (G3). |
| `from_campaign` | `campaign`, `world`, optional `replace`: legt die Lore einer Welt aus einer bestehenden Kampagne an (Abschnitt 2). |

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
| `question`   | Eine offene Frage an die Welt, auch ein Widerspruch (G4)         | „Wer sendet auf 87,5?“                      |
| `decision`   | Das Entscheidungsprotokoll der Welt (G3). Eine je Welt.          | „Entscheidungen“                            |
| `note`       | Was in keine Art passt (sparsam)                                 |                                             |

`status`: `draft` (Entwurf, noch nicht abgesegnet), `canon` (gilt), `retired` (überholt, bleibt als Verweis); eine
`question` ist offen, bis sie `decided` oder `retired` ist. Gib `status` bei jeder neuen Notiz an: ohne Angabe bleibt
er leer, nicht `draft`. `canon` nur mit einer Quelle, die die Entscheidung belegt (`entscheidung:E-0007`,
`kanon:<Abend>` oder `mensch`, G3). Tags klein und wenige: `spoiler` für Spielleiterwissen, eine Region (`rostmark`),
ein Kapitel (`kap-2`).

## Die sechs Schritte und der Stand im Panel

Das D&D-Panel zeigt im Tab **Lore** sechs Schritte mit Nummer und Stand (wie die Bau-Abschnitte im Tab Bau):

1. **Bestand sichten** (Abschnitt 1; bei einer bestehenden Kampagne `from_campaign`, Abschnitt 2)
2. **Notizen anlegen/abgleichen** (Abschnitte 3 und 8)
3. **Verknüpfen**: jede Notiz hat ihre `[[Links]]`, jeder Fakt steht nur einmal (G1), Zeitleiste, „Namen und
   Aussprache“ und „Entscheidungen“ sind nachgezogen
4. **Geheimes markieren**: Spielleiterwissen unter `## Geheim (Spielleitung)` mit Tag `spoiler`
5. **Offene Fragen** (Abschnitt 4)
6. **Kanon-Abgleich nach dem Abend** (Abschnitt 7 und 8), zum Schluss `lore check` (G12)

**Stand melden** (nur Anzeige; gibt es das Werkzeug `mcp__dnd-studio__lore_progress` nicht, überspringen): zu Beginn
eines Schritts `lore_progress` mit `{flow: "lore", world, step: <Nummer>, title: <Name>, state: "active"}`, danach
`state: "done"` und ein kurzes `note` („12 Notizen, 3 Fragen“). Nummer und Name sind die der sechs Schritte oben, nicht
die Abschnitt-Nummern (Offene Fragen ist Schritt 5, Abschnitt 4). Nur ein `done` setzt den Haken; Notizen allein zeigt
das Panel als „Material vorhanden“, außer Schritt 1 nach `from_campaign`.

## Grundregeln: ein stimmiger Vault

Diese Regeln gelten für jede Welt, ob sie neu entsteht (Skill `pnp-weltenbau`) oder gepflegt wird. Sie stammen aus
Yannicks Korath-Vault, der sie erst nachträglich einbauen musste: ohne sie standen am Ende rund 260 Fakten doppelt,
manche davon im Widerspruch. Wer eine Welt von Grund auf baut, legt sie **ab der ersten Notiz** an.

**G1. Jeder Fakt steht in genau einer Notiz.** Jede Zahl, jeder Preis, jede Regel, jede Entfernung, jede Jahreszahl,
jede Beschreibung hat eine Heimat; jede andere Notiz, die ihn braucht, verlinkt dorthin (`[[Titel]]` oder
`[[Titel#Abschnitt|Text]]`) und wiederholt ihn nicht, auch nicht „der Bequemlichkeit halber“. Ein kurzer Zeiger
(„Preise: [[Maße, Preise und Reisezeiten#Preise]]“) ist erlaubt, die Zahl noch einmal hinzuschreiben nicht. Zieht ein
Fakt um, bekommt die alte Stelle einen Link, nie eine zweite Fassung. Feste Heimat-Notizen je Welt:

| Fakt                                   | Heimat                                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| Ton, Säulen, Grenzen, Sprache, Rangfolge | die `world`-Notiz (das Fundament, G2)                      |
| Jahreszahlen, Reihenfolge der Ereignisse | „Zeitleiste“ (`history`, Abschnitt 5)                     |
| Namen und wie man sie spricht          | „Namen und Aussprache“ (`language`, Abschnitt 6)            |
| Preise, Währung, Entfernungen, Reisezeiten, Größen | „Maße, Preise und Reisezeiten“ (`rule`)          |
| eine Regel am Tisch                    | ihre eigene `rule`-Notiz                                    |
| was entschieden wurde, wann, mit wessen Worten | „Entscheidungen“ (`decision`, G3)                   |

Ödland: Dass ein Liter Wasser in Kesselheim 3 Kronkorken kostet, steht nur in „Maße, Preise und Reisezeiten“; die Notiz
„Kesselheimer Markt“ schreibt „Wasser ist teuer (siehe [[Maße, Preise und Reisezeiten#Preise]])“.

**G2. Rangfolge.** Was höher steht, gilt; Tieferes wird angepasst, nie umgekehrt:
1. die `world`-Notiz (Fundament) und das Entscheidungsprotokoll,
2. `canon`-Notizen und der Kanon der Kampagnen (Abschnitt 7),
3. `draft`-Notizen,
4. Fragen, Gerüchte, Hypothesen, Vorschläge.
Die Rangfolge steht in der `world`-Notiz, damit jede Sitzung sie findet.

**G3. Ein Entscheidungsprotokoll.** Eine `decision`-Notiz „Entscheidungen“ je Welt, eine Zeile je Entscheidung:
`E-0012 · 2026-11-21 · Wasser kostet in Kesselheim 3 Kronkorken je Liter · „drei kronkorken, das ist teuer genug“`
– fortlaufende Nummer, Datum, was gilt, die Worte des Menschen **wörtlich**. Die Notiz, die den Fakt trägt, bekommt die
Quelle `entscheidung:E-0012` (hat der Mensch es nur gesagt, ohne Protokollzeile, reicht für `canon` auch `mensch`).
**Geschrieben wird nur mit `lore decide`** (`world`, `what`, `words`): eine Zeile wird angehängt, die Nummer vergibt das
Studio und gibt sie zurück – nie die ganze Notiz mit `lore write` neu schreiben, denn `write` ersetzt den ganzen Text
und zwei Schreibende überschreiben sich. Gibt es `decide` noch nicht: die Notiz erst lesen, dann ganz schreiben, und nie
zwei solche Schreiber gleichzeitig. **Geheime Entscheidungen** (alles, was die Spieler noch nicht wissen dürfen: eine
Wendung, ein Weltgeheimnis, was unter `## Geheim (Spielleitung)` oder in einer `spoiler`-Notiz steht) mit
`secret: true`: sie stehen im Protokoll unter `## Geheim (Spielleitung)`, den deckt der spoilerfreie Modus ab; der
öffentliche Teil des Protokolls ist für alle lesbar. `lore check` meldet eine öffentliche Zeile, die Geheimes zitiert. So weiß auch in einem Jahr jemand, warum etwas so ist. Wird etwas zurückgenommen oder
geändert (Retcon), gibt es einen neuen Eintrag, der den alten nennt; der alte bleibt stehen. Nur diese Notiz darf
Fakten anderer Notizen zitieren (sie ist das Protokoll der Änderung, G1).

**G4. Widersprüche entscheidet der Mensch.** Sagen zwei Notizen Verschiedenes (eine Jahreszahl, eine Entfernung, wer
wen kennt), wählst du **nicht** die plausiblere Fassung und änderst keine der beiden Stellen. Lege eine `question`-Notiz
„Widerspruch: <Thema>“ an: beide Stellen mit Link und Wortlaut, was davon abhängt, Vorschläge. Beide Notizen verlinken
sie. Nach der Entscheidung: Eintrag in „Entscheidungen“, die eine Stelle wird richtig, die andere ein Link (G1), die
Frage geht heraus. Am Tisch hält das Spiel nicht an: die strittige Stelle umgehen, nach dem Abend fragen.

**G5. Was als Tatsache gilt.** Nicht alles, was aufgeschrieben ist, ist wahr in der Welt. Notizen trennen sichtbar:

| Was                        | Wie                                                         | Ödland                                         |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| Tatsache der Welt          | gewöhnlicher Text, mit Quelle                               | Kesselheim liegt am erloschenen Kühlturm.      |
| Was jeder weiß             | `> [!public]`                                               | Der Rat verteilt das Wasser.                   |
| Gerücht, Glaube            | `> [!rumour]`                                               | Im Kühlturm soll noch jemand leben.            |
| Vermutung, Theorie         | `> [!hypothesis]` (Theorien der Spieler: Kanon der Kampagne) | Die Stimme auf 87,5 ist eine Aufnahme.        |
| Geheimes der Spielleitung  | unter `## Geheim (Spielleitung)`, Tag `spoiler`             | Der Kühlturm wird wieder warm.                 |
| Offene Frage               | `question`-Notiz, in der Notiz verlinkt (G8)                | Wer sendet auf 87,5?                           |
| Was die Helden herausgefunden haben | Kanon der Kampagne, nicht die Lore (Abschnitt 7)   | Mara hat den Sender gefunden.                  |

Im Zweifel die schwächere Art (Gerücht statt Tatsache, Frage statt Antwort) und fragen. Ein Gerücht wird nie zur
Tatsache, nur weil es aufgeschrieben ist; eine Theorie der Spieler nie Lore, nur weil sie gut klingt.

**G6. Weltgeheimnisse löst nur der Mensch.** Die großen Rätsel einer Welt (Korath: ob der Mond bewohnbar ist, was
hinter der Bedrohung steckt) markiert die Notiz mit `> [!mystery] Weltgeheimnis – die Antwort entscheidet der Mensch`.
Du darfst Spuren, Beobachtungen, Gerüchte und mehrere konkurrierende Erklärungen vorschlagen, aber **nie die
endgültige Antwort** erfinden, auch nicht als Entwurf, auch nicht unter `## Geheim`. Ödland: „Wer sendet auf 87,5?“
bleibt offen, bis der Mensch es sagt.

**G7. Regellücken.** Fehlt eine Regel, die der Tisch braucht, steht in der betroffenen Notiz `> [!rule-gap] <was fehlt>`
mit einer vorgeschlagenen Ersatzregel; sie gilt erst, wenn der Mensch sie absegnet (Eintrag in „Entscheidungen“). Nie
eine Regel, die nur du kennst: was am Tisch gilt, steht in einer `rule`-Notiz.

**G8. Offene Fragen stehen am Ort.** Jede Notiz, die von einer offenen Frage abhängt, verlinkt sie dort, wo die Lücke
ist (`> [!open] [[Wer sendet auf 87,5?]]`). So sieht man die Lücke beim Lesen, nicht erst in `lore map`. `lore check`
meldet Fragen, auf die keine Notiz zeigt.

**G9. Was wiederkehrt, hat eine Bildvorlage.** Ein Schiff, ein Fahrzeug, ein Wahrzeichen, ein Gesicht, das öfter im
Bild erscheint, bekommt in seiner Notiz eine Zeile `Bildvorlage: <Ergebnis-ID oder Datei>`; jedes weitere Bild davon
entsteht aus ihr (`picture` mit der Vorlage als Grundlage), nie frei neu. Gleiches Ding, gleiches Bild: Korath malte
sein Schiff erst frei und musste später alle Bilder aus einem 3D-Modell neu machen. Eine Änderung am Aussehen geht zuerst
in die Vorlage und ins Entscheidungsprotokoll, dann in neue Bilder.

**G10. Eine Quelle führt.** Liegt die Welt nur im Studio, ist die Studio-Lore die Quelle. Hat der Mensch einen eigenen
Obsidian-Vault, wird **einmal** festgelegt, welche Seite führt, und in die `world`-Notiz geschrieben (Abschnitt 9). Zwei
Orte, an denen beide schreiben, sind zwei Wahrheiten.

**G11. Spielt der Mensch selbst mit?** Dann entscheidet er die öffentliche Ebene und die Weltgeheimnisse (G6), aber das
Geheime einer Kampagne (Wendungen, Absichten der NPCs, Geheimnisse der Helden) schreibt ein Agent, und du liest es ihm
nie vor: in der Hauptsitzung nur Zahlen („3 Geheimnisse angelegt“), Inhalte nur in Agenten (`dnd-studio:pnp-lore`,
Architekt, Texter). Das gehört in die `world`-Notiz (`Autor spielt mit: ja`), damit jede Sitzung es weiß. Was der
Agent dabei entscheiden lässt oder festhält, geht mit `lore decide` und `secret: true` ins Protokoll, nie in dessen
öffentlichen Teil.

**G12. Prüfen.** Nach jedem größeren Schreiben und am Ende jedes Schritts `lore check` mit der Welt. `errors` werden
behoben, bevor du weitermachst; `hints` prüfst du mit Augenmaß:

| Meldung                  | Was                                                                 | Abhilfe                                   |
| ------------------------ | ------------------------------------------------------------------- | ----------------------------------------- |
| `no_sources`             | Notiz ohne Quelle (das Protokoll selbst braucht keine)               | Quelle nachtragen oder den Menschen fragen |
| `dangling_links`         | `[[Link]]` auf keine Notiz                                          | Notiz anlegen, Link umbiegen oder `question` |
| `broken_anchors`         | `[[Notiz#Abschnitt]]` auf einen fehlenden Abschnitt                 | Anker oder Überschrift richten            |
| `spoiler_links`          | öffentlicher Teil verlinkt eine `spoiler`-Notiz (Titel verrät sie)  | Link unter `## Geheim (Spielleitung)`     |
| `secret_in_log`          | öffentliche Protokollzeile zitiert Geheimes                         | dem Menschen melden (spielt er mit, nur dass, nicht was); künftig `secret: true` |
| `missing_home`           | `world`-Notiz oder eine Heimat-Notiz aus G1 fehlt                   | anlegen                                   |
| `orphan_questions` (Hinweis) | offene Frage, auf die keine Notiz zeigt (G8)                   | am Ort verlinken                          |
| `duplicates` (Hinweis)   | derselbe Satz oder dieselbe Zahl mit Einheit in zwei Notizen (G1)    | in die Heimat, sonst Link; widersprechen sie sich: G4 |
| `canon_without_decision` (Hinweis) | `canon` ohne `entscheidung:`-, `kanon:`- oder `mensch`-Quelle | Quelle nachtragen oder zurück auf `draft` |

Was `check` nicht sieht, prüfst du selbst: Widersprüche mit anderen Worten (G4), Gerüchte, die wie Tatsachen dastehen
(G5), eine Sprache durchgehend wie in der `world`-Notiz. Kennt das Studio `check` noch nicht, gehst du die Tabelle von
Hand durch (`lore map`, `lore search`, `unlinked` aus `lore write`).

## 1. Erst lesen, dann schreiben

Vor jedem Schreiben und vor tieferer Arbeit an einem Thema:
1. `lore map` mit der Welt: Was gibt es schon, welche Fragen sind offen?
2. `lore search` mit dem Thema („Kesselheim Rat“). Ein Treffer: `lore read`. Kein Treffer: auch unter anderem Namen
   suchen (Spitzname, alte Schreibweise), erst dann neu anlegen.
3. Eine bestehende Notiz wird **ergänzt**, nicht daneben eine zweite angelegt. Zwei Notizen über dasselbe zusammenführen:
   die bessere behalten, die andere mit `delete` heraus und ihre Links umbiegen.
4. Bevor du einen Fakt schreibst: Hat er schon eine Heimat (G1)? Dann dort ändern und hier verlinken.

Lies nicht die ganze Welt: die Karte und gezielte Treffer reichen. Eine Welt mit 120 Notizen ganz zu lesen kostet mehr
als der ganze Bau.

## 2. Eine bestehende Kampagne übernehmen

Hat eine Kampagne schon Inhalt, aber ihre Welt noch keine Notizen (`lore map` zeigt die Welt nicht oder leer), ist der
**erste Schritt** `lore from_campaign` mit `campaign` (wie `campaign` sie nennt) und `world` (Ödland: `{campaign: "Die
Rostmark-Chroniken", world: "Ödland"}`). Das Studio legt an: Zusammenfassung und Leitfaden → `world`, Orte → `place`,
NPCs → `character`, Kanon → in die betroffenen Notizen, Fäden → `question`, und die Heimat-Notizen aus G1 („Namen und
Aussprache“ mit den Aussprachen der Kampagne, „Zeitleiste“, „Maße, Preise und Reisezeiten“, „Entscheidungen“).
Vorhandene Notizen bleiben stehen; `replace: true` schreibt sie neu, Heimat-Notizen aber nie. Danach:
- `lore map` lesen und dem Menschen in drei Sätzen sagen, was entstand und was fehlt (meist Geschichte, Völker,
  Fraktionen, Religion: was nie eine Szene brauchte).
- Den Rest nicht erfinden: Lücken werden `question`-Notizen oder ein Auftrag an `pnp-weltenbau`.
- Mit `campaign set` und `world: "Ödland"` die Kampagne an ihre Welt binden, falls sie es noch nicht ist.

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
- **Keine Wiederholung:** was eine andere Notiz trägt, wird verlinkt, nicht abgeschrieben (G1).
- In der Sprache der `world`-Notiz (meist Deutsch, oder die Sprache der Kampagne), keine Zugangsdaten, keine
  Dateipfade dieses Rechners.

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
gebildet werden (Ödland: deutsche Ortsnamen mit Industrieteilen, Rufnamen aus Funkcodes).

Die Stimmen lesen diese Notiz **nicht**: sie sprechen nur, was im Wörterbuch der Kampagne steht (`campaign set` mit
`pronunciations`, `{"Kesselheim": "[emphasis] Kessel-heim"}`). Die Notiz ist die Quelle, aus der du dorthin
überträgst: Kommt ein Name neu dazu oder ändert sich eine Aussprache, erst die Notiz, dann mit **einem** `campaign set
pronunciations` nur die geänderten Wörter (`""` nimmt eines heraus), danach `prepare_table` neu laufen lassen. Neue
NPCs und Orte bekommen beides, bevor sie gesprochen werden.

## 7. Kanon und Lore: getrennt und im Gleichschritt

- **Kanon** (`campaign`, Liste `canon`) sind Tatsachen vom Tisch einer Kampagne: was gesagt, erfunden, versprochen
  wurde. Ihn schreibt der Chronist am Abend (`set_campaign_entry kind canon`); er wird nie umgeschrieben.
- **Lore** ist die Welt, unabhängig von einer Kampagne; mehrere Kampagnen können in einer Welt spielen.
- **Kanon geht vor.** Widerspricht eine Notiz dem Kanon, wird die Notiz angepasst (Quelle `kanon:<Abend>`), nie der
  Kanon. Widersprechen sich zwei Kanon-Einträge oder Kanon und eine Entscheidung des Menschen, gilt G4. Was am Tisch erfunden wurde und in der Lore fehlt, kommt dazu.
- **Nicht alles Kanon ist Lore:** „Mara schuldet dem Händler 20 Kronkorken“ bleibt Kanon der Kampagne; „In Kesselheim
  zahlt man mit Kronkorken“ gehört in die Lore.
- Lore-Entwürfe (`draft`) sind keine Tatsachen am Tisch, bis eine Szene oder der Mensch sie bestätigt.

## 8. Zurückschreiben

Nach einem Bau (pnp-kampagne) und nach jedem Spielabend wird die Lore nachgezogen, **nur das Geänderte**:
1. Was neu ist: die neuen Einträge der Kampagne (Bauplan, Bauprotokoll) bzw. der Kanon des Abends und die Session-Notizen.
2. Je Thema `lore search`, dann ergänzen oder anlegen, alles in **einem** `lore write` mit allen Notizen.
3. Zeitleiste und „Namen und Aussprache“ nachtragen (neue Aussprachen auch ins Wörterbuch der Kampagne, Abschnitt 6),
   beantwortete Fragen herausnehmen, neue Fragen anlegen; was der
   Mensch dabei entschieden hat, je Entscheidung ein `lore decide` (Geheimes mit `secret: true`, G3).
4. `lore check` (G12) und das Gefundene beheben.
5. Dem Menschen in zwei Sätzen sagen, was neu ist und welche Fragen offen sind (ohne Spoiler, wenn er mitspielt).

Große Nachträge gibt die Hauptsitzung an den Agenten `dnd-studio:pnp-lore` (Auftrag: Welt, Kampagne, was sich
geändert hat); sie schreibt die Lore danach nicht selbst noch einmal.

## 9. Ein eigener Obsidian-Vault

Hat der Mensch seine Welt in einem Obsidian-Vault, gehört sein Ordner ins Profil: `profile edit` mit `vault`
(z. B. `~/Dokumente/dnd-kampagnen/Ödland`); `studio_status` zeigt ihn als `vault: {path, found}`. Dann kennen ihn alle
Agenten des Mods, das Aufräumen des Studios behält jede Datei, die eine seiner Notizen nennt, und gelesen und geschrieben
wird er direkt als Dateien, nicht über ein anderes Plugin. Dann wird **eine** Seite die führende (G10), mit ihm entschieden und in
der `world`-Notiz festgehalten (`Führende Quelle: Studio` oder `Führende Quelle: Obsidian-Vault <Ordner>`):
- **Studio führt:** den Vault einmal mit `lore write` übernehmen (Arten zuordnen, Quellen `obsidian:<Datei>`); danach
  wird nur noch im Studio geschrieben, der Vault ist Archiv oder wird vom Studio aus nachgezogen.
- **Der Vault führt** (wie Yannicks Korath-Vault mit eigenen Regeln, Prüfskript und Entscheidungsprotokoll): geschrieben
  wird nur im Vault, nach seinen Regeln (seine `CLAUDE.md`/`AGENTS.md`); die Studio-Lore ist ein Spiegel, der nur in
  eine Richtung abgeglichen wird (Vault → Studio). Was am Tisch neu entsteht, geht zuerst in den Vault.
Nie in beide Richtungen zugleich abgleichen: das sind zwei Wahrheiten. Ohne Vault gibt es nichts abzugleichen.
