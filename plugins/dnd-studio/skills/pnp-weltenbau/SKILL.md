---
name: pnp-weltenbau
description: 'Entwirft in D&D Studio (MCP-Server dnd-studio) mit dem Menschen eine eigene Spielwelt von Grund auf – im Gespräch in zehn Schritten: Idee und Kern, Geografie und Weltkarte, Völker, Kulturen, Glaube und Namen, Fraktionen und Mächte, Geschichte und Zeitleiste, Magie oder Technik und ihr Preis, Orte und NPCs, Konflikte und Aufhänger, Lore in den Vault, Review; jeder Schritt als Notizen in den Wissens-Vault des Studios (Werkzeug `lore`), offene Fragen als question-Notizen, eine Weltkarte mit Orten und ein erster Kampagnen-Aufhänger; den Stand zeigt das Panel im Tab Welt. Verwenden, sobald jemand eine eigene Welt, ein Setting, einen Kontinent oder eine Region erfinden, ausarbeiten oder weiterbauen will („lass uns eine Welt bauen“, „ich will ein eigenes Setting wie Korath“, „bau die Rostmark weiter aus“, „hilf mir mit den Fraktionen meiner Welt“), auch wenn noch keine Kampagne geplant ist. Lore einer bestehenden Welt pflegen: Skill pnp-lore. Eine Kampagne in der Welt bauen: Skill pnp-kampagne.'
---

# Eine eigene Welt entwerfen

Eine Welt entsteht **mit** dem Menschen, nicht für ihn: Er bringt die Bilder im Kopf mit, du fragst, schlägst vor,
fasst zusammen und schreibst auf. So hat Yannick seine Welt Korath gebaut: Runde für Runde im Gespräch, jede Runde
gleich festgehalten, Lücken als Fragen statt als schnelle Erfindungen. Das Ziel ist keine Enzyklopädie, sondern eine
Welt, in der **morgen ein Abend spielen kann**: ein klarer Ton, ein paar starke Orte, Mächte, die etwas wollen, und
Fragen, die Abenteuer werden.

Schreibweise: `lore write`, `map new`, `set_campaign` meinen das Werkzeug mit dieser Aktion; in Claude Code heißen sie
`mcp__plugin_dnd-studio_dnd-studio__<werkzeug>`. Wie eine Notiz aussieht, welche Arten es gibt und wie Kanon und Lore
zusammengehen, steht im Skill `pnp-lore`: lies ihn, bevor du die erste Notiz schreibst. Das Beispiel durch den ganzen
Skill ist die Welt **Ödland** der Kampagne „Die Rostmark-Chroniken“ (ein Ödland nach dem Krieg, die Rostmark,
Kesselheim, Schutzraum 12, Strahlung, Radio-Kultur der 1950er).

## 0. Vor der ersten Runde

- **Welche Welt?** `lore map` ohne Welt: Gibt es sie schon (dann weiterbauen, nicht neu anfangen) oder eine Kampagne,
  aus der sie kommt (dann zuerst `lore from_campaign`, Skill `pnp-lore` Abschnitt 2)?
- **Name der Welt** (vorläufig reicht: „Ödland“). Er ist `world` in jeder Notiz.
- **Wie viel Zeit heute?** Ein Schritt dauert 10 bis 20 Minuten Gespräch. Nicht alle Schritte an einem Tag; der
  Weltenbau darf über Wochen gehen, die Notizen halten den Stand.
- **Was schon feststeht:** Hat der Mensch Notizen, Bilder, Lieblingsbücher oder -filme, die die Welt prägen? Kurz
  aufnehmen, als Quelle `mensch` festhalten.

## 1. Die zehn Schritte

Der Weltenbau hat zehn Schritte; das D&D-Panel zeigt sie im Tab **Welt** mit Nummer und Stand (wie die
Bau-Abschnitte im Tab Bau). Schritt 1 bis 8 sind Gesprächsrunden, 9 und 10 schließen ab.

Je Runde: **drei bis fünf Fragen**, nicht mehr auf einmal. Zu jeder Frage zwei, drei konkrete Vorschläge anbieten
(der Mensch wählt, mischt oder sagt etwas Eigenes); nie eine leere Frage wie „Was gibt es für Völker?“. Was er
offen lässt, wird eine `question`-Notiz. Am Ende jeder Runde: in drei Sätzen zusammenfassen, was jetzt gilt, und
nach seinem Ja **alle Notizen der Runde in einem `lore write`** schreiben (Status `draft`; `canon` erst, wenn der
Mensch sagt „so ist es“). Dann fragen: nächster Schritt oder Pause?

**Stand melden** (nur Anzeige im Panel; gibt es das Werkzeug `mcp__dnd-studio__lore_progress` nicht, überspringen):
zu Beginn eines Schritts `lore_progress` mit `{flow: "welt", world, step: <Nummer>, state: "active"}`, nach dem
`lore write` des Schritts dasselbe mit `state: "done"` und einem kurzen `note` („4 Orte, 1 Frage“). Ohne Meldung
schätzt das Panel den Stand aus den Notizen je Art.

Die Reihenfolge trägt: Idee und Kern entscheiden alles Weitere. Springt der Mensch, folge ihm und hole Fehlendes
später.

1. **Idee/Kern** → Notiz `world` (die Welt) und ein bis drei `theme`-Notizen.
   Wie fühlt sich die Welt an (düster, hoffnungsvoll, seltsam, heiter)? Drei Säulen: was es hier immer gibt und was
   die Welt von jeder anderen unterscheidet. Was kommt nie vor (Grenzen des Tisches)?
   Ödland: „Hoffnung im Rauschen“ – Wiederaufbau nach dem Krieg; Strahlung als ständige Gefahr; Radio als Stimme der
   Gemeinschaft, Musik und Ansagen wie in den 1950ern.
2. **Geografie & Karte** → `place`-Notizen für die Großregionen und drei bis sechs Orte, dann die Weltkarte
   (Abschnitt 2). Wie groß ist die Welt (eine Region reicht oft)? Klima, Grenzen, was man von einem Hügel sieht, wie
   weit es zu Fuß ist. Je Ort: ein Satz, was ihn besonders macht, und eine Gefahr.
   Ödland: die Rostmark (Schrottebene), Kesselheim (Siedlung am kalten Kühlturm), Schutzraum 12 (Bunker, aus dem die
   Helden kommen).
3. **Völker & Kulturen** → `people`-, `religion`- und `language`-Notizen.
   Wer lebt hier, wie leben sie, was essen, feiern, fürchten sie, was glauben sie? Wie begrüßt man sich, nach welchen
   Regeln entstehen Namen? „Namen und Aussprache“ (Skill `pnp-lore` Abschnitt 6) beginnt hier und wächst mit jedem
   Schritt. Ödland: die Schutzraum-Leute, die Schrottsammler; „Die Stille Welle“, ein Kult, der im Rauschen zwischen
   den Sendern Stimmen hört.
4. **Fraktionen & Mächte** → `faction`-Notizen, je mit Ziel, Mittel, Gegner und einem Gesicht (`character`).
   Zwei bis vier Mächte, die etwas **wollen** und sich im Weg stehen.
   Ödland: der Kesselheimer Rat (Ordnung, Wasser), die Schrottsammler (Freiheit, Beute), eine Stimme im Radio, die
   niemand kennt.
5. **Geschichte & Zeitleiste** → `history`-Notizen und die „Zeitleiste“ (Skill `pnp-lore` Abschnitt 5).
   Was ist das große Ereignis, das die Gegenwart erklärt? Drei bis sieben Einträge reichen; jedes Geheimnis der
   Vergangenheit ist ein möglicher Aufhänger. Ödland: Der Krieg, Schutzraum 12 schließt, Jahr 23 öffnet er sich wieder.
6. **Magie/Technik & Regeln** → `magic`- oder `technology`-Notizen, dazu `rule`, wenn es am Tisch zählt.
   Was kann man, was kostet es, wer darf es? Ohne Preis kein Spiel.
   Ödland: Strahlung (Dosis als Regel, Geigerzähler als Gegenstand), Röhrentechnik, die nur noch wenige reparieren.
7. **Orte & NPCs** → mehr `place`-Notizen im Kleinen (eine Kneipe, ein Sendemast) und `character`-Notizen: je
   Fraktion und wichtigem Ort ein Gesicht mit Name, Wunsch, Eigenheit und einem Satz, den es sagt; dazu `creature`
   und `item`, wo die Welt sie braucht. Ödland: die Ansagerin von Radio Kesselheim, der Rostkäfer, der Geigerzähler
   von Schutzraum 12.
8. **Konflikte & Aufhänger** → `theme`-Notiz „Was Helden hier tun“ und `question`-Notizen für Aufhänger.
   Wer sind typische Helden, was treibt sie an, warum gehen sie los? Wo stoßen die Mächte aus Schritt 4 aufeinander?
   Drei mögliche Abenteuer in je einem Satz, einer davon wird der erste Aufhänger (Abschnitt 3).
9. **Lore in den Vault** → prüfen, dass alles steht: `lore map` lesen; jede Notiz hat Art, Quelle und Links, die
   Zeitleiste und „Namen und Aussprache“ sind nachgezogen, Spielleiterwissen ist mit `spoiler` markiert. Was der
   Mensch bestätigt hat, bekommt `status: canon` (ein `lore write` für alle).
10. **Review** → frisch lesen (die Notizen, nicht dein Gedächtnis des Gesprächs): Widersprüche (Jahreszahlen,
   Entfernungen, wer wen kennt), Lücken, die ein Abend sofort trifft, Namen, die sich zu ähnlich sind. Gefundenes
   dem Menschen in einer kurzen Liste vorlegen, nach seinem Ja beheben oder als `question` festhalten.

Nach jedem Schritt ein Blick auf die offenen Fragen (`lore map` zeigt sie): Beantwortet ein neuer Schritt eine alte
Frage, wird die Antwort eingetragen und die Frage herausgenommen.

## 2. Die Weltkarte (in Schritt 2)

Wenn Land und Orte stehen:
1. Die Lage der Orte in Worten mit dem Menschen klären (was liegt nördlich, wo fließt das Wasser, wie weit ist es
   zu Fuß), in die `place`-Notizen schreiben.
2. **Ein Bild** der ganzen Gegend: `picture` als gedruckte Landkarte genau von oben, die Lage der Orte in Worten, Stil
   etwa „D&D sourcebook illustration“, ohne aufgemalte Namen; mit `picture_tool resolution 2` vergrößern.
3. `map new` mit diesem `picture` und `tiles` als Karte der Welt, dann jeden Ort mit `pin_place` genau dorthin, wo das
   Bild ihn zeigt (alle in einem Aufruf). Einzelheiten und Ödland-Lehren: Skill `pnp-kampagne`, Abschnitt 3 (Karten).
4. Den Namen der Karte in die `world`-Notiz schreiben.

Ohne Kampagne gibt es noch keine Orte im Studio, an die Marker gehören: dann die Karte malen und die Marker setzen,
sobald die erste Kampagne die Orte anlegt (Abschnitt 3).

## 3. Der erste Kampagnen-Aufhänger und die Übergabe

Nach Schritt 10 mit dem Menschen **einen** Aufhänger wählen (aus Schritt 8 oder einer offenen Frage): wer, wo, was
steht auf dem Spiel, warum jetzt. Ödland: „Radio Kesselheim verstummt mitten in der Abendsendung; die Helden aus
Schutzraum 12 sollen den Sendemast in der Rostmark prüfen.“ Als `question`-Notiz („Warum verstummt Radio
Kesselheim?“) festhalten.

Dann übergeben an den Skill **`pnp-kampagne`**: eine neue Kampagne in dieser Welt, die Welt mit `set_campaign world:
"<Welt>"` an sie binden, der Aufhänger als Auftrag, die Lore als Quelle für Architekt und Texter (sie lesen mit `lore
search`, statt neu zu erfinden). Die Orte der Weltkarte werden Orte der Kampagne mit ihren Markern.

## 4. Was du nicht tust

- Keine Welt in einem Rutsch erfinden und dem Menschen vorlegen: Es ist seine Welt. Vorschläge ja, Entscheidungen er.
- Nichts als `canon` schreiben, was er nicht bestätigt hat.
- Keine langen Texte: Notizen kurz und verlinkt (Skill `pnp-lore` Abschnitt 3); die Prosa kommt später in den
  Vorlesetexten einer Kampagne.
- Nicht alle Runden erzwingen: Eine Welt für einen One-Shot braucht die Schritte 1, 2, 4, 8 und 9; der Rest darf Frage bleiben.
