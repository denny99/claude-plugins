# Test-Playbook unity

Für eine frische Desktop-Session in `~/IdeaProjects/privat/cozy-game-panels` (Worktree des cozy-game, Unity-Projekt unter
`unity/`). Unity-Editor mit diesem Projekt ist offen, Bridge-Paket installiert.
Claude führt Schritt für Schritt: Schritt nennen → Denny macht ihn → „ok“ oder was komisch ist. Komisches sammelt Claude
mit Schritt-Nummer und, wenn vorhanden, Screenshot-Beschreibung in der Befundliste (Pfad steht im Auftrag der Session).
Grundregel: **nichts Schreibendes**, außer der Schritt sagt es. Kein Commit, kein Push, kein Build, keinen Worktree
anlegen.

## 0. Start

1. Session startet ohne Fehlerzeile von unity.
2. Panel **Unity** geht von selbst auf (Rang 2: Unity-Projekt, kein deltastone-Ticket-Branch).
3. Über dem Prompt Chip **Unity** mit Editor-Zustand. Klick öffnet das Panel, `/unity` ebenso.
4. Claude ruft `unity_status` → Editor verbunden, Projekt und Version stimmen.

## 1. Übersicht

1. Kopf: Houndsridge-Logo, Projekt, **eine** Status-Pill (Editor bereit / Play-Modus / kompiliert / nicht verbunden),
   **Neu laden** und **Ziel**.
2. Kompilier-Zustand: grün. Denny sagt „bau absichtlich einen Tippfehler in eine .cs-Datei und mach ihn dann rückgängig“
   → Fehler im Ergebnis des Edits und im Panel mit **Reparieren**; nach Rückgängig wieder grün.
3. **▶ Starten** → Status-Pill „Play-Modus“; **Stoppen** beendet. Messen gibt es hier nicht (nur im Tab Leistung).
4. **Screenshot** → Bild an Claude, Claude beschreibt es.
5. Letzter Testlauf (rote zuerst), Konsole auf einen Blick, Jobs mit eingeklapptem Log.

## 2. Tests

1. Tab **Tests**: Bereich wählen, **EditMode**-Tests eines kleinen Bereichs laufen lassen → Ergebnis, neu rot / weiter rot
   getrennt.
2. **Betroffene prüfen** bei sauberem Baum: ruhiger Hinweis, nichts läuft.
3. **Rote erneut ausführen** (falls rote da). Karte **Letzter Lauf**: Assertion-Text erst hinter **Details**.

## 3. Review

1. Tab **Review**: Leer-Zustand verständlich, oder Karten **Offen** / **Gemeldet** / **Erledigt** mit **Passt** / **Passt nicht** (Entscheidungen: Optionen als Zeilen, **Wählen** markiert; **Antwort schicken** sendet). Kommentar im Feld, **Merken** hält ihn fest; der Screenshot-Schalter steht einmal in der Karte **Review**.
2. **Klänge**: **Abspielen** spielt im Editor, **Passt** hakt ab; „Nochmal machen“ samt Notiz erst hinter **Details**; Mix nur ansehen.
3. **Problem melden** (Karte **Review**) nur ansehen.

## 4. Leistung

1. Im Play-Modus **10 s messen** → Median / p95 / schlechtester Wert, Linie gegen 16,6 ms.
2. **Hinspringen** setzt das Spiel an die Stelle; **Analysieren** schickt einen Prompt.

## 5. Mehr: Konsole, Ziel

1. **Konsole**: Filter Fehler / Warnungen / Alle, **An Claude** je Zeile, **Fehler an Claude**; **Details** zeigen volle Meldung und Stack; **⚠ Leeren** fragt vorher nach (darf bestätigt werden).
2. **Ziel**: Hauptprojekt oder Worktree, Projekt-Config, Schalter für Guards. **Worktree anlegen** nur ansehen.

## 6. Guards

1. Denny sagt „verschieb eine Asset-Datei mit `mv` ohne .meta“ → abgelehnt, Grund nennt den richtigen Befehl.
2. Denny sagt „committe jetzt“ während eine Datei aus `restoreBeforeCommit` geändert ist → abgelehnt mit
   `git checkout -- <Datei>`. Nicht ausführen.

## 7. Optik

1. Panel schmal ziehen (~320 px): Tabs scrollen, Knöpfe untereinander, nichts abgeschnitten.
2. Hell/Dunkel der App umschalten: alles lesbar.
3. Pills leicht rund und textbreit.
4. Aktionsknöpfe mit Zeichen vor dem Wort, Tabs **Übersicht · Tests · Review · Leistung** ohne Glyphen.
5. Wortlaut verständlich ohne Vorwissen? Alles notieren, was man nicht versteht.
