---
name: pnp-lore
description: 'Pflegt in D&D Studio (MCP-Server dnd-studio) die Lore einer Spielwelt im Wissens-Vault des Studios (Werkzeug `lore`): einzelne Fakten nachschlagen, ergänzen oder ordnen, eine Kampagne in die Lore übernehmen, nach einem Bau oder Spielabend nachtragen, offene Fragen sichten, mit `lore check` prüfen. Verwenden, sobald jemand die Welt einer Kampagne festhalten, nachschlagen, ordnen, ergänzen oder nach einem Abend nachtragen will („schreib die Lore vom Ödland auf“, „was wissen wir über Kesselheim?“, „trag den Abend in die Welt ein“, „übernimm die Lore aus der Kampagne“, „welche Fragen zur Welt sind offen?“), auch ohne das Wort Lore. Neue Teile einer Welt im Gespräch entwerfen (eine Region, Völker, Fraktionen, Geschichte): Skill pnp-weltenbau. Eine Kampagne bauen: Skill pnp-kampagne.'
---

# Die Lore einer Welt pflegen

Die Lore ist das Gedächtnis einer Welt: was es dort gibt, wer dort lebt, was geschah und was noch offen ist. Sie liegt
im **Wissens-Vault des Studios** (Werkzeug `lore`), nach Welten getrennt, und ist kleiner und schneller zu lesen als
eine ganze Kampagne. Architekt, Texter und Spielleitung lesen dort nach, statt das Studio zu durchsuchen. Das Ziel ist
nicht Vollständigkeit, sondern dass jede Frage am Tisch oder beim Bauen mit **einem** Nachschlagen beantwortet ist.

Das Beispiel ist die Welt **Ödland** der Kampagne „Die Rostmark-Chroniken“: ein Ödland nach dem Krieg, die Rostmark,
die Stadt Kesselheim, der Schutzraum 12, Strahlung, eine Radio-Kultur wie in den 1950ern.

## Grundregeln

Vor dem ersten Schreiben **`references/grundregeln.md`** lesen: die Aktionen des Werkzeugs `lore`, die Arten, Status,
Quellen, wie eine Notiz aussieht und die Regeln im Einzelnen. Kurz:

- **G1** Jeder Fakt steht in genau einer Notiz, seiner Heimat; alle anderen verlinken.
- **G2** Rangfolge: `world`-Notiz und Protokoll, dann Kanon der Kampagnen, dann `canon`-, dann `draft`-Notizen, dann
  Fragen und Gerüchte; Kanon gegen `world`-Notiz oder Protokoll entscheidet der Mensch.
- **G3** Entscheidungen nur mit `lore decide`, mit den Worten des Menschen; Geheimes mit `secret: true`.
- **G4** Widersprüche löst der Mensch: eine „Widerspruch: …“-Frage mit beiden Stellen.
- **G5** Tatsache, Gerücht, Hypothese und Geheimes sichtbar getrennt; was die Helden vermuten, bleibt Kanon.
- **G6** Weltgeheimnisse beantwortet nur der Mensch.
- **G7** Regellücken als `[!rule-gap]` mit Vorschlag, gültig nach seinem Ja.
- **G8** Offene Fragen am Ort verlinkt.
- **G9** Was wiederkehrt, hat eine Bildvorlage.
- **G10** Eine Quelle führt (Studio oder eigener Vault).
- **G11** Spielt der Mensch mit, liest du ihm nichts Geheimes vor.
- **G12** Nach jedem größeren Schreiben `lore check`; `errors` zuerst beheben.

## Die sechs Schritte und der Stand im Panel

Die Abschnitte unten sind die sechs Schritte, die das D&D-Panel im Tab **Lore** mit Nummer und Stand zeigt. Eine
Aufgabe nimmt nur die Schritte, die sie braucht: Nachschlagen ist nur Schritt 1, ein Nachtrag nach dem Abend meist 1, 2,
5 und 6.

**Stand melden** (nur Anzeige; gibt es das Werkzeug `mcp__dnd-studio__lore_progress` nicht, überspringen): zu Beginn
eines Schritts `lore_progress` mit `{flow: "lore", world, step: <Nummer>, title: <Name>, state: "active"}`, danach
`state: "done"` und ein kurzes `note` („12 Notizen, 3 Fragen“). Nur ein `done` setzt den Haken; Notizen allein zeigt das
Panel als „Material vorhanden“. Schritt 1 zeigt es nach `from_campaign` von selbst als erledigt.

## 1. Bestand sichten

Vor jedem Schreiben und vor tieferer Arbeit an einem Thema:
1. `lore map` mit der Welt: Was gibt es schon, welche Fragen sind offen?
2. `lore search` mit dem Thema („Kesselheim Rat“). Ein Treffer: `lore read`. Kein Treffer: auch unter anderem Namen
   suchen (Spitzname, alte Schreibweise), erst dann neu anlegen.
3. Bevor du einen Fakt schreibst: Hat er schon eine Heimat (G1)? Dann dort ändern und hier verlinken.

Lies nicht die ganze Welt: die Karte und gezielte Treffer reichen. Eine Welt mit 120 Notizen ganz zu lesen kostet mehr
als der ganze Bau.

**Eine bestehende Kampagne übernehmen.** Hat eine Kampagne schon Inhalt, ihre Welt aber noch keine Notizen (`lore map`
zeigt die Welt nicht oder leer), ist der erste Schritt `lore from_campaign` mit `campaign` und `world` (Ödland:
`{campaign: "Die Rostmark-Chroniken", world: "Ödland"}`). Das Studio legt an: die `world`-Notiz aus Zusammenfassung und
den Leitfaden-Seiten über die Welt, `rule`-Notizen aus Leitfaden-Seiten über Regeln, Orte als `place`, NPCs als
`character` (ihr Spielleiterwissen unter `## Geheim (Spielleitung)`), den Kanon unter `## Kanon` in den Notizen, die er
betrifft (was keine Notiz betrifft, in „Chronik: <Kampagne>“), und die Heimat-Notizen aus G1 („Namen und Aussprache“
mit den Aussprachen der Kampagne, „Zeitleiste“, „Maße, Preise und Reisezeiten“, „Entscheidungen“). Aus den Fäden der
Kampagne macht es **keine** Fragen: die bleiben der Spielleitung. Die Notizen kommen ohne `status` (leer; `lore check` meldet es nicht, `grundregeln.md`). Vorhandene Notizen
bleiben stehen (die Antwort nennt sie unter `kept`); `replace: true` schreibt sie neu, Heimat-Notizen nie. Danach:
- `lore map` lesen und dem Menschen in drei Sätzen sagen, was entstand und was fehlt (meist Geschichte, Völker,
  Fraktionen, Religion: was nie eine Szene brauchte).
- Den Rest nicht erfinden: Lücken werden `question`-Notizen oder ein Auftrag an `pnp-weltenbau`.
- Mit `campaign set` und `world: "Ödland"` die Kampagne an ihre Welt binden, falls sie es noch nicht ist.

## 2. Notizen anlegen/abgleichen

- Eine bestehende Notiz wird **ergänzt**, nicht daneben eine zweite angelegt. Zwei Notizen über dasselbe: die bessere
  behalten, die andere mit `delete` heraus und ihre Links umbiegen.
- Alle Notizen eines Schritts in **einem** `lore write`, jede mit `kind`, `status` und `sources`; Form und
  Quellen-Schreibweise wie in `references/grundregeln.md`.
- Nach einem Bau (pnp-kampagne): die neuen Einträge der Kampagne (Bauplan, Bauprotokoll) je Thema mit `lore search`
  suchen, dann ergänzen oder anlegen.

**Kanon und Lore: getrennt und im Gleichschritt.**
- **Kanon** (`campaign`, Liste `canon`) sind Tatsachen vom Tisch einer Kampagne: was gesagt, erfunden, versprochen
  wurde. Ihn schreibt der Chronist am Abend (`set_campaign_entry kind canon`); er wird nie umgeschrieben.
- **Lore** ist die Welt, unabhängig von einer Kampagne; mehrere Kampagnen können in einer Welt spielen.
- Widerspricht eine Notiz dem Kanon, wird die Notiz angepasst (Quelle `kanon:<Abend>`), nie der Kanon. Widerspricht
  der Kanon der `world`-Notiz oder dem Protokoll, entscheidet der Mensch (G2, G4).
- **Nicht alles Kanon ist Lore:** „Mara schuldet dem Händler 20 Kronkorken“ bleibt Kanon der Kampagne; „In Kesselheim
  zahlt man mit Kronkorken“ gehört in die Lore.
- Lore-Entwürfe (`draft`) sind keine Tatsachen am Tisch, bis eine Szene oder der Mensch sie bestätigt.

## 3. Verknüpfen

- Jede Notiz hat ihre `[[Links]]`; `unlinked` aus `lore write` und `dangling_links` aus `lore check` zeigen die Lücken.
- Jeder Fakt nur in seiner Heimat (G1); doppelte (`duplicates`) in die Heimat ziehen, sonst verlinken.
- **Zeitleiste** nachziehen: neue Ereignisse in die Zeile ihrer Zeit, Abende am Ende mit Datum; Widersprüche in
  Jahreszahlen sind eine `question` (G4).
- **Namen und Aussprache** nachziehen. Die Stimmen lesen diese Notiz **nicht**: sie sprechen nur, was im Wörterbuch der
  Kampagne steht (`campaign set` mit `pronunciations`, `{"Kesselheim": "[emphasis] Kessel-heim"}`). Die Notiz ist die
  Quelle: kommt ein Name dazu oder ändert sich eine Aussprache, erst die Notiz, dann **ein** `campaign set
  pronunciations` mit nur den geänderten Wörtern (`""` nimmt eines heraus), danach `prepare_table` neu laufen lassen.
  Neue NPCs und Orte bekommen beides, bevor sie gesprochen werden.
- **Entscheidungen:** was der Mensch dabei entschieden hat, je Entscheidung ein `lore decide` (G3); die Nummer wird die
  Quelle der Notiz.

## 4. Geheimes markieren

Spielleiterwissen steht unter `## Geheim (Spielleitung)` mit Tag `spoiler`; eine ganz geheime Notiz trägt den Tag und
wird im öffentlichen Teil anderer Notizen nicht verlinkt (`spoiler_links`). Geheime Entscheidungen mit `secret: true`
(`secret_in_log`). Spielt der Mensch mit (G11), schreibt das ein Agent, und du nennst ihm nur Zahlen.

## 5. Offene Fragen

Was die Welt noch nicht beantwortet, wird eine `question`-Notiz statt einer stillen Lücke oder einer schnellen
Erfindung: Titel als Frage („Wer sendet auf 87,5?“), im Text warum sie zählt, was davon abhängt (`[[Links]]`) und
mögliche Antworten, wenn welche im Raum stehen; die Notizen, die davon abhängen, verlinken sie (G8). Offene Fragen sind
der Stoff für Abenteuer-Aufhänger: Architekt und `pnp-weltenbau` lesen sie zuerst.

**Eine Regel für beantwortete Fragen:** die Antwort mit `lore decide` ins Protokoll und in die betroffenen Notizen (statt
der Zeile `> [!open]` die Antwort oder ein Link auf ihre Heimat), dann bekommt die Frage `status: decided`, eine Zeile
„Antwort: …“ und die Quelle `entscheidung:E-nnnn`. Sie bleibt stehen, damit Links und der Weg zur Antwort nicht
verloren gehen; `lore map` zählt sie nicht mehr als offen. `retired` ist für eine Frage, die ohne Antwort fallen
gelassen wird; `delete` nur für eine doppelte Frage (Links umbiegen).

## 6. Kanon-Abgleich nach dem Abend

Nach jedem Spielabend (und nach einem Bau) wird die Lore nachgezogen, **nur das Geänderte**:
1. Was neu ist: der Kanon des Abends und die Session-Notizen (nach einem Bau: Bauplan, Bauprotokoll).
2. Je Thema `lore search`, dann ergänzen oder anlegen, alles in **einem** `lore write` (Schritt 2, Kanon vor Notiz nach
   G2).
3. Zeitleiste, „Namen und Aussprache“ und Wörterbuch nachziehen (Schritt 3), beantwortete Fragen nach der Regel aus
   Schritt 5, neue Fragen anlegen; was der Mensch entschieden hat, je Entscheidung ein `lore decide`.
4. `lore check` (G12) und das Gefundene beheben.
5. Dem Menschen in zwei Sätzen sagen, was neu ist und welche Fragen offen sind (ohne Spoiler, wenn er mitspielt).

Große Nachträge gibt die Hauptsitzung an den Agenten `dnd-studio:pnp-lore` (Auftrag: Welt, Kampagne, was sich
geändert hat, der Pfad von `references/grundregeln.md` und ein Pfad fürs Protokoll); sie schreibt die Lore danach nicht
selbst noch einmal.

## Ein eigener Obsidian-Vault

Hat der Mensch seine Welt in einem Obsidian-Vault, gehört sein Ordner ins Profil: `profile edit` mit `vault`
(z. B. `~/Dokumente/dnd-kampagnen/Ödland`); `studio_status` zeigt ihn als `vault: {path, found}`. Dann kennen ihn alle
Agenten des Mods, das Aufräumen des Studios behält jede Datei, die eine seiner Notizen nennt, und gelesen und
geschrieben wird er direkt als Dateien, nicht über ein anderes Plugin. **Eine** Seite führt (G10), mit ihm entschieden
und in der `world`-Notiz festgehalten (`Führende Quelle: Studio` oder `Führende Quelle: Obsidian-Vault <Ordner>`):
- **Studio führt:** den Vault einmal mit `lore write` übernehmen (Arten zuordnen, Quellen `obsidian:<Datei>`); danach
  wird nur noch im Studio geschrieben, der Vault ist Archiv oder wird vom Studio aus nachgezogen.
- **Der Vault führt** (mit eigenen Regeln, Prüfskript und Protokoll): geschrieben wird nur im Vault, nach seinen Regeln
  (seine `CLAUDE.md`/`AGENTS.md`); die Studio-Lore ist ein Spiegel, der nur in eine Richtung abgeglichen wird (Vault →
  Studio). Was am Tisch neu entsteht, geht zuerst in den Vault.

Nie in beide Richtungen zugleich abgleichen: das sind zwei Wahrheiten. Ohne Vault gibt es nichts abzugleichen.
