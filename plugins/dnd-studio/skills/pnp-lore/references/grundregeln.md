# Grundregeln der Lore: ein stimmiger Vault

Gilt für jede Welt, ob sie neu entsteht (Skill `pnp-weltenbau`) oder gepflegt wird (Skill `pnp-lore`, Agent
`dnd-studio:pnp-lore`), und **ab der ersten Notiz**: ohne diese Regeln stehen am Ende Hunderte Fakten doppelt, manche
im Widerspruch. Das Beispiel ist die Welt **Ödland** der Kampagne „Die Rostmark-Chroniken“ (Rostmark, Kesselheim,
Schutzraum 12, Strahlung, Radio-Kultur der 1950er).

## Das Werkzeug `lore`

`lore map`, `lore write` usw. meinen das Werkzeug `lore` mit `action: "map"` usw.; in Claude Code heißt es
`mcp__plugin_dnd-studio_dnd-studio__lore`.

| Aktion          | Was                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `map`           | Ohne `world`: alle Welten mit Anzahl je Art und ihren Kampagnen. Mit `world`: die Titel je Art, die offenen Fragen, zuletzt Geändertes. |
| `search`        | `query`, optional `world`, `kind`, `tag`, `limit`: Treffer mit Ausschnitt. Der erste Griff bei jeder Frage. |
| `read`          | `title` (oder `titles` für mehrere), `world`: Notizen ganz, mit Links, Rückverweisen und Quellen.      |
| `write`         | `notes: [{title, world, kind, tags?, status?, body, sources?}]`: mehrere Notizen je Aufruf, neu oder geändert. `body` ersetzt den Text, `tags` und `sources` kommen dazu (`"-tag"` nimmt einen Tag weg). Antwort: `written` und `unlinked` (Links ins Leere). |
| `delete`        | `title`, `world`: legt eine Notiz in den Papierkorb-Ordner (nur Doppeltes oder Falsches, nie Kanon).   |
| `check`         | `world`: prüft die Welt, ohne etwas zu ändern (G12) → `{ok, errors, hints, counts}`.                   |
| `decide`        | `world`, `what`, `words`, optional `secret`: hängt **eine** Zeile an das Protokoll „Entscheidungen“ an (legt es an, wenn es fehlt), vergibt die nächste Nummer und gibt sie zurück (`id`, z. B. `E-0012`) (G3). |
| `from_campaign` | `campaign` (sonst die offene), `world`, optional `replace`: legt die Lore einer Welt aus einer Kampagne an (Skill `pnp-lore`, Schritt 1). |

## Arten, Status, Quellen, Tags

| Art (`kind`) | Wofür                                                            | Ödland                                      |
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

- **`status`:** `draft` (Entwurf, noch nicht abgesegnet), `canon` (gilt), `retired` (überholt, bleibt als Verweis).
  Eine `question` ist offen, bis sie `decided` (beantwortet) oder `retired` (fallen gelassen) ist. Gib `status` bei
  jeder neuen Notiz an: ohne Angabe bleibt er leer, nicht `draft`.
- **`canon`** nur mit einer Quelle, die die Entscheidung belegt: `entscheidung:E-0007`, `kanon:<Abend>` oder `mensch`
  (sonst meldet `check` `canon_without_decision`).
- **Quellen** (`sources`), eine Schreibweise: `entscheidung:E-0007`, `kanon:Abend 2026-11-14`, `weltenbau:Schritt 3`,
  `mensch` (der Mensch hat es gesagt), `obsidian:<Datei>`, `kampagne:<Kampagne>`; `from_campaign` schreibt seine eigenen
  (`campaign: …`, `place: …`, `npc: …`, `canon: …`), die bleiben so. Was keine Quelle hat, ist erfunden: erst fragen.
- **Tags** klein und wenige: `spoiler` für Spielleiterwissen, eine Region (`rostmark`), ein Kapitel (`kap-2`).

## Wie eine Notiz aussieht

- **Kurz.** Eine Notiz, ein Ding, 5 bis 25 Zeilen; was länger wird, teilt sich (Kesselheim → „Kesselheim“,
  „Kesselheimer Markt“, „Radio Kesselheim“).
- **Der erste Satz sagt, was es ist**, so dass er allein in einer Trefferliste trägt.
- **Was die Helden wissen können, zuerst**; Spielleiterwissen darunter unter `## Geheim (Spielleitung)` und Tag
  `spoiler`.
- **Verlinkt:** jeder Ort, jede Person, jedes Ereignis mit eigener Notiz als `[[Titel]]`. Ein Link auf eine Notiz, die
  bald entsteht, ist erlaubt; sonst eine `question`-Notiz dafür.
- **Konkret statt groß:** ein Name, eine Zahl, ein Geruch, ein Satz, den ein NPC sagen würde. „Im Schutzraum 12 riecht
  es nach Ozon und Dosenpfirsich“ trägt am Tisch, „ein geheimnisvoller Ort“ nicht.
- In der Sprache der `world`-Notiz, keine Zugangsdaten, keine Dateipfade dieses Rechners.

```markdown
Kesselheim ist die größte Siedlung der [[Rostmark]], um einen erloschenen Kühlturm gebaut.

- Wer: ~800 Leute, regiert vom [[Kesselheimer Rat]]; Händler, Schrottsammler, Flüchtlinge aus [[Schutzraum 12]].
- Wie es ist: Wellblech, Röhrenradios in jedem Fenster, abends die Sendung von [[Radio Kesselheim]].
- Gefahr: Strahlungsnester im Kühlturm (siehe [[Strahlung]]).

## Geheim (Spielleitung)
Der Rat verschweigt, dass der Kühlturm wieder warm wird.
```

## G1. Jeder Fakt steht in genau einer Notiz

Jede Zahl, jeder Preis, jede Regel, jede Entfernung, jede Jahreszahl, jede Beschreibung hat eine Heimat; jede andere
Notiz verlinkt dorthin (`[[Titel]]` oder `[[Titel#Abschnitt|Text]]`) und wiederholt ihn nicht. Ein kurzer Zeiger
(„Preise: [[Maße, Preise und Reisezeiten#Preise]]“) ist erlaubt, die Zahl noch einmal nicht. Zieht ein Fakt um,
bekommt die alte Stelle einen Link, nie eine zweite Fassung. Feste Heimat-Notizen je Welt (fehlt eine, meldet `check`
`missing_home`):

| Fakt                                               | Heimat                                              |
| -------------------------------------------------- | --------------------------------------------------- |
| Ton, Säulen, Grenzen, Sprache, Rangfolge           | die `world`-Notiz (das Fundament, G2)               |
| Jahreszahlen, Reihenfolge der Ereignisse           | „Zeitleiste“ (`history`)                            |
| Namen und wie man sie spricht                      | „Namen und Aussprache“ (`language`)                 |
| Preise, Währung, Entfernungen, Reisezeiten, Größen | „Maße, Preise und Reisezeiten“ (`rule`)             |
| eine Regel am Tisch                                | ihre eigene `rule`-Notiz                            |
| was entschieden wurde, wann, mit wessen Worten     | „Entscheidungen“ (`decision`, G3)                   |

- **Zeitleiste:** eine Zeile je Ereignis, älteste oben, in der Zeitrechnung der Welt („Jahr 0 – Der Krieg endet;
  [[Schutzraum 12]] schließt seine Tore“); jedes größere Ereignis hat eine eigene Notiz und ist hier verlinkt; was an
  Spielabenden geschah, am Ende mit Datum des Abends.
- **Namen und Aussprache:** jeder Name, den eine Stimme vorliest und der nicht eindeutig ist, in einfacher Lautschrift
  („Kesselheim – KESS-el-heim“), dazu die Regeln, nach denen Namen der Welt gebildet werden.

Ödland: Dass ein Liter Wasser in Kesselheim 3 Kronkorken kostet, steht nur in „Maße, Preise und Reisezeiten“; die
Notiz „Kesselheimer Markt“ schreibt „Wasser ist teuer (siehe [[Maße, Preise und Reisezeiten#Preise]])“.

## G2. Rangfolge

Was höher steht, gilt; Tieferes wird angepasst, nie umgekehrt:
1. die `world`-Notiz (Fundament) und das Entscheidungsprotokoll,
2. der Kanon der Kampagnen (was am Tisch festgelegt wurde),
3. `canon`-Notizen,
4. `draft`-Notizen,
5. Fragen, Gerüchte, Hypothesen, Vorschläge.

Widerspricht der Kanon einer Notiz (3 oder 4), wird die Notiz angepasst (Quelle `kanon:<Abend>`). Widerspricht er der
`world`-Notiz oder einer Entscheidung, oder zwei Kanon-Einträge einander, entscheidet der Mensch (G4). Die Rangfolge
steht in der `world`-Notiz, damit jede Sitzung sie findet.

## G3. Ein Entscheidungsprotokoll

Eine `decision`-Notiz „Entscheidungen“ je Welt, eine Zeile je Entscheidung:
`E-0012 · 2026-11-21 · Wasser kostet in Kesselheim 3 Kronkorken je Liter · „drei kronkorken, das ist teuer genug“`
– Nummer, Datum, was gilt, die Worte des Menschen **wörtlich**.
- **Geschrieben wird nur mit `lore decide`** (`world`, `what`, `words`), je Entscheidung ein Aufruf; die Nummer kommt
  zurück und wird die Quelle der Notiz, die den Fakt trägt (`entscheidung:E-0012`). Nie mit `lore write`: es ersetzt
  den ganzen Text, und zwei Schreibende überschreiben sich.
- **Geheimes** (was die Spieler noch nicht wissen dürfen: eine Wendung, ein Weltgeheimnis, was unter `## Geheim
  (Spielleitung)` oder in einer `spoiler`-Notiz steht) mit `secret: true`: es steht dann im Protokoll unter `## Geheim
  (Spielleitung)`, den der spoilerfreie Modus abdeckt.
- **Retcon:** ein neuer Eintrag, der den alten nennt; der alte bleibt stehen.
- Nur diese Notiz darf Fakten anderer Notizen zitieren (sie ist das Protokoll der Änderung, G1).

## G4. Widersprüche entscheidet der Mensch

Sagen zwei Stellen Verschiedenes (eine Jahreszahl, eine Entfernung, wer wen kennt), wählst du **nicht** die
plausiblere Fassung und änderst keine. Lege eine `question`-Notiz „Widerspruch: <Thema>“ an: beide Stellen mit Link und
Wortlaut, was davon abhängt, Vorschläge; beide Notizen verlinken sie. Nach der Entscheidung: `lore decide`, die eine
Stelle wird richtig, die andere ein Link (G1), die Frage wird `decided`. Am Tisch hält das Spiel nicht an: die
strittige Stelle umgehen, nach dem Abend fragen.

## G5. Was als Tatsache gilt

| Was                                 | Wie                                                    | Ödland                                    |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| Tatsache der Welt                   | gewöhnlicher Text, mit Quelle                          | Kesselheim liegt am erloschenen Kühlturm. |
| Was jeder weiß                      | `> [!public]`                                          | Der Rat verteilt das Wasser.              |
| Gerücht, Glaube                     | `> [!rumour]`                                          | Im Kühlturm soll noch jemand leben.       |
| Mögliche Erklärung (vorgeschlagen, nicht entschieden) | `> [!hypothesis]`                    | Die Stimme auf 87,5 könnte eine Aufnahme sein. |
| Geheimes der Spielleitung           | unter `## Geheim (Spielleitung)`, Tag `spoiler`        | Der Kühlturm wird wieder warm.            |
| Offene Frage                        | `question`-Notiz, in der Notiz verlinkt (G8)           | Wer sendet auf 87,5?                      |
| Was die Helden herausgefunden oder vermutet haben | Kanon der Kampagne, nicht die Lore       | Mara glaubt, die Stimme ist eine Aufnahme. |

Im Zweifel die schwächere Art (Gerücht statt Tatsache, Frage statt Antwort) und fragen. Ein Gerücht wird nie zur
Tatsache, nur weil es aufgeschrieben ist; eine Theorie der Spieler kommt nie in die Lore, auch nicht als
`[!hypothesis]`.

## G6. Weltgeheimnisse löst nur der Mensch

Die großen Rätsel einer Welt markiert die Notiz mit `> [!mystery] Weltgeheimnis – die Antwort entscheidet der Mensch`.
Du darfst Spuren, Beobachtungen, Gerüchte und mehrere konkurrierende Erklärungen (`[!hypothesis]`) vorschlagen, aber
**nie die endgültige Antwort** erfinden, auch nicht als Entwurf, auch nicht unter `## Geheim`. Ödland: „Wer sendet auf
87,5?“ bleibt offen, bis der Mensch es sagt.

## G7. Regellücken

Fehlt eine Regel, die der Tisch braucht, steht in der betroffenen Notiz `> [!rule-gap] <was fehlt>` mit einer
vorgeschlagenen Ersatzregel; sie gilt erst nach dem Ja des Menschen (`lore decide`). Was am Tisch gilt, steht in einer
`rule`-Notiz, nie nur in deinem Kopf.

## G8. Offene Fragen stehen am Ort

Jede Notiz, die von einer offenen Frage abhängt, verlinkt sie dort, wo die Lücke ist (`> [!open] [[Wer sendet auf
87,5?]]`). `lore check` meldet Fragen, auf die keine Notiz zeigt.

## G9. Was wiederkehrt, hat eine Bildvorlage

Ein Fahrzeug, ein Wahrzeichen, ein Gesicht, das öfter im Bild erscheint, bekommt in seiner Notiz eine Zeile
`Bildvorlage: <Ergebnis-ID oder Datei>`; jedes weitere Bild davon entsteht aus ihr (`picture` mit der Vorlage als
Grundlage), nie frei neu, sonst sieht dasselbe Ding jedes Mal anders aus. Eine Änderung am Aussehen geht zuerst in die
Vorlage und ins Protokoll, dann in neue Bilder.

## G10. Eine Quelle führt

Liegt die Welt nur im Studio, ist die Studio-Lore die Quelle. Hat der Mensch einen eigenen Obsidian-Vault, wird
**einmal** festgelegt, welche Seite führt, und in die `world`-Notiz geschrieben (Skill `pnp-lore`, „Ein eigener
Obsidian-Vault“). Zwei Orte, an denen beide schreiben, sind zwei Wahrheiten.

## G11. Spielt der Mensch selbst mit?

Dann entscheidet er die öffentliche Ebene und die Weltgeheimnisse (G6), aber das Geheime einer Kampagne (Wendungen,
Absichten der NPCs, Geheimnisse der Helden) schreibt ein Agent, und du liest es ihm nie vor: in der Hauptsitzung nur
Zahlen („3 Geheimnisse angelegt“), Inhalte nur in Agenten (`dnd-studio:pnp-lore`, Architekt, Texter). Das steht in der
`world`-Notiz (`Autor spielt mit: ja`). Was ein Agent dabei festhält, geht mit `lore decide` und `secret: true` ins
Protokoll, nie in dessen öffentlichen Teil.

## G12. Prüfen

Nach jedem größeren Schreiben und am Ende jedes Schritts `lore check` mit der Welt. `errors` werden behoben, bevor du
weitermachst; `hints` prüfst du mit Augenmaß:

| Meldung                  | Was                                                                 | Abhilfe                                   |
| ------------------------ | ------------------------------------------------------------------- | ----------------------------------------- |
| `no_sources`             | Notiz ohne Quelle (das Protokoll selbst braucht keine)              | Quelle nachtragen oder den Menschen fragen |
| `dangling_links`         | `[[Link]]` auf keine Notiz                                          | Notiz anlegen, Link umbiegen oder `question` |
| `broken_anchors`         | `[[Notiz#Abschnitt]]` auf einen fehlenden Abschnitt                 | Anker oder Überschrift richten            |
| `spoiler_links`          | öffentlicher Teil verlinkt eine `spoiler`-Notiz (Titel verrät sie)  | Link unter `## Geheim (Spielleitung)`     |
| `secret_in_log`          | öffentliche Protokollzeile zitiert Geheimes                         | dem Menschen melden (spielt er mit, nur dass, nicht was); künftig `secret: true` |
| `missing_home`           | `world`-Notiz oder eine Heimat-Notiz aus G1 fehlt                   | anlegen (das Protokoll legt `lore decide` an) |
| `orphan_questions` (Hinweis) | offene Frage, auf die keine Notiz zeigt (G8)                    | am Ort verlinken                          |
| `duplicates` (Hinweis)   | derselbe Satz oder dieselbe Zahl mit Einheit in zwei Notizen (G1)   | in die Heimat, sonst Link; widersprechen sie sich: G4 |
| `canon_without_decision` (Hinweis) | `canon` ohne `entscheidung:`-, `kanon:`- oder `mensch`-Quelle | Quelle nachtragen oder zurück auf `draft` |

Was `check` nicht sieht, prüfst du selbst: Widersprüche mit anderen Worten (G4), Gerüchte, die wie Tatsachen dastehen
(G5), eine Sprache durchgehend wie in der `world`-Notiz.
