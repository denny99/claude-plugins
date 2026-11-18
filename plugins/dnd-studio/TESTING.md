# Test-Playbook dnd-studio

Für eine frische Desktop-Session (Ordner egal, z. B. `~/IdeaProjects/privat/dnd-character-creator`). D&D Studio läuft.
Claude führt Schritt für Schritt: Schritt nennen → Denny macht ihn → „ok“ oder was komisch ist. Komisches sammelt Claude
mit Schritt-Nummer und, wenn vorhanden, Screenshot-Beschreibung in der Befundliste (Pfad steht im Auftrag der Session).
Grundregel: **nichts im Studio ändern**, außer der Schritt sagt es. Profil vorher prüfen: nicht „Meine Familie“.

## 0. Start

1. Session startet ohne Fehlerzeile von dnd-studio. Das Panel geht **nicht** von selbst auf (soll erst bei Tisch/Bau/Review).
2. Über dem Prompt steht der Chip **D&D** in der Starterleiste. Klick öffnet das Panel.
3. Claude ruft `studio_status` auf → antwortet (Verbindung steht, kein ECONNREFUSED).

## 1. Zustand

1. Tab **Zustand**: Kopf mit Houndsridge-Logo (nicht abgeschnitten), Studio-Farben (Filz/Messing).
2. Karte Zustand: Studio-App ✓ mit Version und Port 37641, Verbindung zu Claude ✓ „Token gesetzt“, Plugin `dnd-studio 0.4.5`, Discord-Bot, Alter Studio-Server „keiner im Weg“.
3. **Neu prüfen** aktualisiert die Uhrzeit oben rechts.
4. **Token eintragen** zeigt nur einen Hinweis (Toast), wo der Token hingehört.
5. Schalter Zuhörer, Szenen-Looks: Name + Satz darunter verständlich? Schalten **nicht** nötig.
6. **Regeln** aufklappen: fünf Schalter, jeder mit Erklärungssatz. Wortlaut verständlich?

## 2. Bau

1. Tab **Bau**: GPU-Zeile, Karte Bau-Abschnitte mit 8 Schritten. Nummern als **runde Kreise, Zahl mittig**, Linie dazwischen.
2. Abschnitt „Agenten 0“ eingeklappt bzw. „Noch kein pnp-Agent gelaufen“.
3. Abnahme-Liste (falls Kampagne offen): Lücken mit Pill „fix: <agent>“. Knöpfe nur ansehen.

## 3. Prüfen

1. Tab **Prüfen** leer: verständlicher Leer-Zustand.
2. Denny sagt: „leg einen vorhandenen Klang der Kampagne zur Prüfung ab“ → Claude nutzt `review` (`action: add`). Panel springt auf Prüfen, Eintrag erscheint.
3. **Abspielen** spielt den Klang lokal. **Passt** / **Nochmal machen** (mit Notiz) → Fortschritt zählt mit.
4. Ein Bild zur Prüfung: bleibt **verdeckt** bis _Aufdecken_, öffnet dann im System-Viewer.
5. **Ergebnis an Claude** schickt einen Prompt mit Passt/Nochmal. Danach `review clear`.

## 4. Tisch (nur ansehen, wenn kein Abend läuft)

1. Tab **Tisch** ohne laufenden Tisch: ruhiger Leer-Zustand, keine Fehler.
2. Optional mit Testkampagne: Denny sagt „starte einen kurzen Testtisch“ → Panel öffnet von selbst auf Tisch, Szenenkarte, Klänge als Chips (spielen nur auf Druck), Startreihenfolge via `initiative`.
3. Launcher-Zeile zeigt Tischzustand („… · Runde 1 · X ist dran“), Klick öffnet Tisch.
4. Szenen-Looks: Hintergrund/Farben folgen der Szene; nach Ende kommt das normale Theme zurück.

## 5. Optik

1. Panel schmal ziehen (~320 px): Tabs scrollen, Knöpfe untereinander, nichts abgeschnitten.
2. Hell/Dunkel der App umschalten: alles lesbar.
3. Knöpfe: Wortlaut verständlich ohne Vorwissen? Alles notieren, was man nicht versteht.
