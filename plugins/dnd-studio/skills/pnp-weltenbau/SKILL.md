---
name: pnp-weltenbau
description: 'Entwirft in D&D Studio (MCP-Server dnd-studio) mit dem Menschen im Gespräch eine eigene Spielwelt oder einen neuen Teil davon (eine Region, Völker, Fraktionen, Geschichte, Magie oder Technik) in zehn Schritten, die das Panel im Tab Welt zeigt, und schreibt jeden Schritt als Notizen in den Wissens-Vault des Studios (Werkzeug `lore`), bis zu einer Weltkarte und einem ersten Kampagnen-Aufhänger. Verwenden, sobald jemand eine Welt, ein Setting, einen Kontinent oder eine Region erfinden oder einen neuen Teil davon ausarbeiten will („lass uns eine Welt bauen“, „ich will ein eigenes Setting wie Korath“, „bau die Rostmark weiter aus“, „hilf mir mit den Fraktionen meiner Welt“, „Schritt 4“ aus dem Panel), auch ohne geplante Kampagne. Einzelne Fakten einer Welt nachschlagen, ergänzen oder nach einem Abend nachtragen: Skill pnp-lore. Eine Kampagne in der Welt bauen: Skill pnp-kampagne.'
---

# Eine eigene Welt entwerfen

Eine Welt entsteht **mit** dem Menschen, nicht für ihn: Er bringt die Bilder im Kopf mit, du fragst, schlägst vor,
fasst zusammen und schreibst auf, Runde für Runde, jede Runde gleich festgehalten, Lücken als Fragen statt als schnelle
Erfindungen. Das Ziel ist keine Enzyklopädie, sondern eine Welt, in der **morgen ein Abend spielen kann**: ein klarer
Ton, ein paar starke Orte, Mächte, die etwas wollen, und Fragen, die Abenteuer werden.

Vor der ersten Notiz **`../pnp-lore/references/grundregeln.md`** lesen (nicht den ganzen Skill `pnp-lore`): die
Aktionen von `lore`, Arten, Status, Quellen, wie eine Notiz aussieht und die Grundregeln G1 bis G12. Sie gelten ab der
ersten Notiz; die Verweise unten („G1“) meinen sie. Werkzeuge in Claude Code:
`mcp__plugin_dnd-studio_dnd-studio__<werkzeug>`. Das Beispiel ist die Welt **Ödland** der Kampagne „Die
Rostmark-Chroniken“ (ein Ödland nach dem Krieg, die Rostmark, Kesselheim, Schutzraum 12, Strahlung, Radio-Kultur der
1950er).

## 0. Vor der ersten Runde

- **Welche Welt?** `lore map` ohne Welt. Gibt es sie schon, weiterbauen, nicht neu anfangen. Kommt sie aus einer
  Kampagne ohne Notizen, zuerst `lore from_campaign` (Skill `pnp-lore`, Schritt 1). Eine so übernommene Welt zeigt
  das Panel mit allen zehn Schritten als „aus der Kampagne übernommen“; du baust dann nur aus, was fehlt, und meldest
  den Schritt, an dem du arbeitest.
- **Einstieg mitten im Ablauf** („Schritt 4“ aus dem Panel, oder „bau die Fraktionen aus“): `lore map` mit der Welt,
  die `world`-Notiz lesen und mit `lore search` nur, was der Schritt braucht; dann weiter mit diesem Schritt. Fehlt
  Schritt 1 (keine `world`-Notiz), ihn zuerst kurz nachholen.
- **Name der Welt** (vorläufig reicht: „Ödland“). Er ist `world` in jeder Notiz.
- **Wie viel Zeit heute?** Ein Schritt dauert 10 bis 20 Minuten Gespräch. Der Weltenbau darf über Wochen gehen, die
  Notizen halten den Stand.
- **Wie viel Welt?** Für einen One-Shot reichen die Schritte 1, 2, 4, 8, 9 und 10; der Rest darf Frage bleiben.
- **Was schon feststeht:** Notizen, Bilder, Lieblingsbücher oder -filme des Menschen kurz aufnehmen, Quelle `mensch`.
  Ein eigenes Konzeptpapier ist das Fundament: es kommt in die `world`-Notiz (Rangfolge ganz oben, G2).
- **Spielst du selbst mit?** (G11) Die Antwort kommt in die `world`-Notiz.
- **Wo liegt die Welt?** Nur im Studio, oder in einem eigenen Obsidian-Vault? Dann den Ordner ins Profil
  (`profile edit` mit `vault`) und festlegen, welche Seite führt (G10), in die `world`-Notiz.
- **In welcher Sprache** schreiben wir die Notizen, in welcher die Namen? Einmal festlegen (`world`-Notiz), dann
  durchgehend.

## 1. Die zehn Schritte

Das D&D-Panel zeigt sie im Tab **Welt** mit Nummer und Stand. Schritt 1 bis 8 sind Gesprächsrunden, 9 und 10 schließen
ab. Die Reihenfolge trägt: Idee und Kern entscheiden alles Weitere. Springt der Mensch, folge ihm und hole Fehlendes
später.

**Jede Runde, in dieser Reihenfolge:**
1. `lore_progress` mit `{flow: "welt", world, step: <Nummer>, title: <Name wie unten>, state: "active"}` (nur Anzeige;
   gibt es `mcp__dnd-studio__lore_progress` nicht, überspringen).
2. **Drei bis fünf Fragen**, nicht mehr auf einmal, zu jeder zwei, drei konkrete Vorschläge (der Mensch wählt, mischt
   oder sagt etwas Eigenes); nie eine leere Frage wie „Was gibt es für Völker?“.
3. **In drei Sätzen zusammenfassen**, was jetzt gilt und was offen bleibt.
4. Auf sein **Ja** warten. Korrigiert er, die Zusammenfassung anpassen und neu fragen.
5. Je Entscheidung, die er damit getroffen hat, ein **`lore decide`** mit seinen Worten wörtlich (Weltgeheimnisse und
   sonst Geheimes mit `secret: true`, G3); die Nummern kommen zurück.
6. **Ein `lore write`** mit allen Notizen der Runde: was er bestätigt hat, als `canon` mit den Quellen
   `weltenbau:Schritt <n>` und `entscheidung:E-nnnn`; was nur vorgeschlagen ist, als `draft` mit
   `weltenbau:Schritt <n>`; was er offen lässt, als `question`. Jeder Fakt in seine Heimat-Notiz (G1): eine Entfernung
   in „Maße, Preise und Reisezeiten“, eine Jahreszahl in die „Zeitleiste“; die Orts- oder Fraktionsnotiz verlinkt nur.
7. **`lore check`** (G12), `errors` beheben.
8. `lore_progress` mit `state: "done"` und kurzem `note` („4 Orte, 1 Frage“); nur ein `done` setzt den Haken.
9. Ein Blick auf die offenen Fragen (`lore map`): Beantwortet die Runde eine alte, gilt die Regel aus Skill `pnp-lore`,
   Schritt 5 (`decided`, Antwort in die Notizen). Dann fragen: nächster Schritt oder Pause?

`canon` wird etwas nur in Punkt 6, nach seinem Ja und `lore decide`, nie später von selbst.

**Die Schritte:**

1. **Idee/Kern** → die `world`-Notiz (das Fundament), ein bis drei `theme`-Notizen und die noch fast leeren
   Heimat-Notizen „Zeitleiste“ (`history`), „Namen und Aussprache“ (`language`), „Maße, Preise und Reisezeiten“
   (`rule`); das Protokoll „Entscheidungen“ legt das erste `lore decide` an. Wie fühlt sich die Welt an (düster,
   hoffnungsvoll, seltsam, heiter)? Drei Säulen: was es hier immer gibt und was die Welt von jeder anderen
   unterscheidet. Was kommt nie vor (Grenzen des Tisches)? In die `world`-Notiz außerdem die Antworten aus Abschnitt 0
   (Autor spielt mit, führende Quelle, Sprache) und die Rangfolge (G2).
   Ödland: „Hoffnung im Rauschen“ – Wiederaufbau nach dem Krieg; Strahlung als ständige Gefahr; Radio als Stimme der
   Gemeinschaft, Musik und Ansagen wie in den 1950ern.
2. **Geografie & Karte** → `place`-Notizen für die Großregionen und drei bis sechs Orte, dann die Weltkarte
   (Abschnitt 2). Wie groß ist die Welt (eine Region reicht oft)? Klima, Grenzen, was man von einem Hügel sieht, wie
   weit es zu Fuß ist. Je Ort: ein Satz, was ihn besonders macht, eine Gefahr und seine Lage in Worten (was liegt
   nördlich, wo fließt das Wasser). Entfernungen und Reisezeiten als Tabelle in „Maße, Preise und Reisezeiten“.
   Ödland: die Rostmark (Schrottebene), Kesselheim (Siedlung am kalten Kühlturm), Schutzraum 12 (Bunker, aus dem die
   Helden kommen).
3. **Völker & Kulturen** → `people`-, `religion`- und `language`-Notizen. Wer lebt hier, wie leben sie, was essen,
   feiern, fürchten, glauben sie? Wie begrüßt man sich, nach welchen Regeln entstehen Namen? „Namen und Aussprache“
   beginnt hier und wächst mit jedem Schritt. Ödland: die Schutzraum-Leute, die Schrottsammler; „Die Stille Welle“, ein
   Kult, der im Rauschen zwischen den Sendern Stimmen hört.
4. **Fraktionen & Mächte** → `faction`-Notizen, je mit Ziel, Mittel, Gegner und einem Gesicht (`character`). Zwei bis
   vier Mächte, die etwas **wollen** und sich im Weg stehen. Ödland: der Kesselheimer Rat (Ordnung, Wasser), die
   Schrottsammler (Freiheit, Beute), eine Stimme im Radio, die niemand kennt.
5. **Geschichte & Zeitleiste** → `history`-Notizen und die „Zeitleiste“. Was ist das große Ereignis, das die Gegenwart
   erklärt? Drei bis sieben Einträge reichen; jedes Geheimnis der Vergangenheit ist ein möglicher Aufhänger. Ödland:
   Der Krieg, Schutzraum 12 schließt, Jahr 23 öffnet er sich wieder. Die großen Rätsel der Welt mit dem Menschen
   benennen und als **Weltgeheimnis** markieren (G6); was die Leute glauben, ist `[!rumour]` (G5).
6. **Magie/Technik & Regeln** → `magic`- oder `technology`-Notizen, dazu `rule`, wenn es am Tisch zählt. Was kann man,
   was kostet es, wer darf es? Ohne Preis kein Spiel. Preise und Währung in „Maße, Preise und Reisezeiten“, jede Regel
   in **ihrer** `rule`-Notiz, fehlende als `[!rule-gap]` (G7). Ödland: Strahlung (Dosis als Regel, Geigerzähler als
   Gegenstand), Röhrentechnik, die nur noch wenige reparieren.
7. **Orte & NPCs** → mehr `place`-Notizen im Kleinen (eine Kneipe, ein Sendemast) und `character`-Notizen: je Fraktion
   und wichtigem Ort ein Gesicht mit Name, Wunsch, Eigenheit und einem Satz, den es sagt; dazu `creature` und `item`,
   wo die Welt sie braucht. Ödland: die Ansagerin von Radio Kesselheim, der Rostkäfer, der Geigerzähler von Schutzraum
   12. Was öfter im Bild erscheinen wird, bekommt gleich eine Bildvorlage (G9).
8. **Konflikte & Aufhänger** → `theme`-Notiz „Was Helden hier tun“ und `question`-Notizen für Aufhänger. Wer sind
   typische Helden, was treibt sie an, warum gehen sie los? Wo stoßen die Mächte aus Schritt 4 aufeinander? Drei
   mögliche Abenteuer in je einem Satz, einer davon wird der erste Aufhänger (Abschnitt 3).
9. **Lore in den Vault** (so heißt der Schritt im Panel; er ist das Prüfen): `lore map` lesen, `lore check` laufen
   lassen und alle `errors` beheben (G12), dazu prüfen, was `check` nicht sieht: Spielleiterwissen unter `## Geheim
   (Spielleitung)` mit Tag `spoiler`, die Heimat-Notizen nachgezogen. Übrige `draft`-Notizen dem Menschen in einer
   kurzen Liste zeigen: was er jetzt bestätigt, geht den Weg aus Punkt 5 und 6 der Runde (`lore decide`, dann
   `canon`), der Rest bleibt `draft`.
10. **Review** → frisch lesen, nicht aus dem Gedächtnis des Gesprächs: ein Agent in frischem Kontext
    (`general-purpose`, Modell Sonnet) mit diesem Auftrag:

    > Lies die Lore der Welt „<Welt>“ im Werkzeug `lore` (`map`, `search`, `read`, `check`; nur lesen, nichts
    > schreiben). Regeln: `<Pfad zu pnp-lore/references/grundregeln.md>`. Melde in einer Liste, je Punkt mit Notiz und
    > Wortlaut: Widersprüche (Jahreszahlen, Entfernungen, wer wen kennt), doppelte Fakten (G1), Gerüchte oder
    > Hypothesen, die wie Tatsachen dastehen (G5), beantwortete Weltgeheimnisse (G6), Lücken, die ein Abend sofort
    > trifft, Namen, die sich zu ähnlich sind, und das Ergebnis von `lore check`. Entscheide nichts. <Spielt der Mensch
    > mit: Aus Notizen mit Tag `spoiler` und unter `## Geheim (Spielleitung)` nur die Zahl der Funde, keinen Inhalt.>

    Die Liste dem Menschen vorlegen. Widersprüche als „Widerspruch: …“-Frage mit beiden Stellen (G4), nach seiner
    Entscheidung ein `lore decide`, die eine Stelle richtig, die andere ein Link; doppelte Fakten in die Heimat-Notiz.

## 2. Die Weltkarte (in Schritt 2)

Eine Karte lebt im Profil, nicht in einer Kampagne: `map new` geht auch ohne Kampagne. Die Marker (`pin_place`) gehören
aber an Orte einer Kampagne, darum kommen sie erst bei der Übergabe (Abschnitt 3).
1. Die Lage der Orte in Worten steht in ihren `place`-Notizen (Schritt 2).
2. **Ein Bild** der ganzen Gegend: `picture` als gedruckte Landkarte genau von oben, die Lage der Orte in Worten, ohne
   aufgemalte Namen; Stil und Lehren in `../pnp-kampagne/references/bild-und-klang.md`, Abschnitt „Karten“.
   Mit `picture_tool resolution 2` vergrößern.
3. `map new` mit diesem `picture`, `type: "world"` und `tiles` als Karte der Welt.
4. In die `world`-Notiz: den Namen der Karte und `Bildvorlage: <Ergebnis-ID>` (G9), Quelle `weltenbau:Schritt 2`.

## 3. Der erste Kampagnen-Aufhänger und die Übergabe

Nach Schritt 10 mit dem Menschen **einen** Aufhänger wählen (aus Schritt 8 oder einer offenen Frage): wer, wo, was
steht auf dem Spiel, warum jetzt. Ödland: „Radio Kesselheim verstummt mitten in der Abendsendung; die Helden aus
Schutzraum 12 sollen den Sendemast in der Rostmark prüfen.“ Als `question`-Notiz („Warum verstummt Radio
Kesselheim?“) festhalten.

Dann übergeben an den Skill **`pnp-kampagne`**: eine neue Kampagne in dieser Welt, mit `campaign set` und
`world: "<Welt>"` an sie gebunden, der Aufhänger als Auftrag, die Lore als Quelle für Architekt und Texter (sie lesen
mit `lore search`, statt neu zu erfinden). Die Orte der Weltkarte werden Orte der Kampagne; die Weltkarte aus
Abschnitt 2 wird die Karte der Gegend (ein Ort für die Region mit `set_campaign_entry kind place map "<Karte>"`, die
Orte `in` ihm), dann jeder Ort mit `pin_place` genau dorthin, wo das Bild ihn zeigt (alle in einem Aufruf).

## 4. Was du nicht tust

- Keine Welt in einem Rutsch erfinden und dem Menschen vorlegen: Es ist seine Welt. Vorschläge ja, Entscheidungen er.
- Nichts als `canon` schreiben ohne sein Ja und eine Zeile in „Entscheidungen“.
- Keinen Fakt zweimal schreiben (G1), keinen Widerspruch still auflösen (G4), kein Weltgeheimnis beantworten (G6),
  kein Gerücht und keine Theorie als Tatsache (G5).
- Keine langen Texte: Notizen kurz und verlinkt; die Prosa kommt später in den Vorlesetexten einer Kampagne.
