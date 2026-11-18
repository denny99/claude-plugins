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
   **Aktualisieren** und **Ziel**.
2. Kompilier-Zustand: grün. Denny sagt „bau absichtlich einen Tippfehler in eine .cs-Datei und mach ihn dann rückgängig“
   → Fehler im Ergebnis des Edits und im Panel mit **Claude reparieren lassen**; nach Rückgängig wieder grün.
3. **Play** → Status-Pill „Play-Modus“; **Stopp** beendet.
4. **Screenshot** → Bild an Claude, Claude beschreibt es.
5. Letzter Testlauf (rote zuerst), Konsole auf einen Blick, Jobs mit eingeklapptem Log.

## 2. Tests

1. Tab **Tests**: Bereich wählen, **EditMode**-Tests eines kleinen Bereichs laufen lassen → Ergebnis, neu rot / weiter rot
   getrennt.
2. **Betroffene** bei sauberem Baum: ruhiger Hinweis, nichts läuft.
3. **Rote erneut ausführen** (falls rote da).

## 3. Review

1. Tab **Review**: Leer-Zustand verständlich, oder Liste mit **passt** / **passt nicht** (Entscheidungen: Optionen A, B, …). Kommentar mit dem Knopf **Antworten** am Feld; **☑/☐ Screenshot mitschicken** schaltet um.
2. **Sounds**: **Abspielen** / **Anspielen** spielt im Editor; Mix nur ansehen.
3. **Problem melden** nur ansehen.

## 4. Leistung

1. Im Play-Modus **10 s messen** → Median / p95 / schlechtester Wert, Linie gegen 16,6 ms.
2. **Hinspringen** setzt das Spiel an die Stelle; **Claude analysieren lassen** schickt einen Prompt.

## 5. Mehr: Konsole, Ziel

1. **Konsole**: Fehler / Warnungen / Alle, **An Claude geben**, **Leeren** (darf gedrückt werden).
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
