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
2. Karte Zustand: Studio-App ✓ mit Version und Port 37641, Verbindung zu Claude ✓ „Token gesetzt“, Plugin `dnd-studio 0.12.2`, Discord-Bot, Alter Studio-Server „keiner im Weg“.
3. **Neu laden** (Kopf) aktualisiert die Uhrzeit oben rechts.
4. Es gibt keinen Token-Knopf mehr.
5. Karten **Hintergründe** und **Regeln am Tisch**: Schalter mit Name + Satz darunter verständlich? Schalten **nicht** nötig.

## 2. Bau

1. Tab **Bau**: GPU-Zeile, Karte Bau-Abschnitte mit 8 Schritten. Nummern als **runde Kreise, Zahl mittig**, Linie dazwischen.
2. Abschnitt „Agenten 0“ eingeklappt bzw. „Noch kein pnp-Agent gelaufen“.
3. Karte **Abnahme-Check** (falls Kampagne offen): Lücken mit Pill „fix: <agent>“. Je Zeile **Details** klappt die Vorschau auf, **↗ Öffnen** als Link; **⚠ Bau-Stand zurücksetzen** nur ansehen (fragt vorher nach). Knöpfe nur ansehen.

## 3. Abnahme

1. Tab **Abnahme** leer: verständlicher Leer-Zustand.
2. Denny sagt: „leg einen vorhandenen Klang der Kampagne zur Prüfung ab“ → Claude nutzt `review` (`action: add`). Panel springt auf Abnahme, Eintrag erscheint.
3. **Abspielen** spielt den Klang lokal. **Passt** / **Nochmal** (Notiz mit **Merken** hinter **Details**) → Fortschritt zählt mit.
4. Ein Bild zur Prüfung: bleibt **verdeckt** bis _Aufdecken_, öffnet dann im System-Viewer.
5. Karte **Prüfung**: **An Claude schicken** schickt einen Prompt mit Passt/Nochmal. Danach `review clear`.

## 4. Tisch (nur ansehen, wenn kein Abend läuft)

1. Tab **Tisch** ohne laufenden Tisch: ruhiger Leer-Zustand, keine Fehler. `/dnd abnahme` öffnet den Tab Abnahme.
2. Optional mit Testkampagne: Denny sagt „starte einen kurzen Testtisch“ → Panel öffnet von selbst auf Tisch, Karte **Tisch**, Szenenkarte, Klänge als Zeilen mit **Abspielen** (nur auf Druck) und ein **Klang stoppen**, Startreihenfolge im Feld **Reihenfolge** + **Starten** (oder via `initiative`). NPC-Zeilen mit **Sprechen**, **Gruppe übernehmen**, Discord **Beitreten**. Karten **Zuhörer** (Schalter **Offenes Mikro**, Ausschalten ohne Rückfrage), **Pause** · **Abendende** · **Einwürfe**; nur ansehen.
3. Launcher-Zeile zeigt Tischzustand („… · Runde 1 · X ist dran“), Klick öffnet Tisch.
4. Tisch-Hintergrund: am laufenden Tisch steht der Pixel-Spieltisch (Kerze flackert, ab und zu rollt ein Würfel), hell und dunkel; nach Ende kommt das normale Theme zurück.

## 5. Welt und Lore

1. Tab **Welt**: Karte mit der Welt (z. B. Ödland, Kampagnen: Die Rostmark-Chroniken), Notizen je Art, offene Fragen;
   darunter **Welt-Abschnitte** mit 10 nummerierten Schritten und „x von 10“, je Schritt wer daran arbeitet. Knopf
   **Schritt N angehen** nur ansehen (schickt einen Prompt an Claude).
2. Ohne Notizen in der Welt und mit offener Kampagne: Hinweis und Knopf **Aus Kampagne übernehmen**.
3. Tab **Lore**: **Lore-Abschnitte** mit 6 Schritten; Notizen nach Art (Orte, Fraktionen …), Suche (z. B. „Kesselheim“),
   **Lesen** öffnet eine Notiz mit Links, Rückverweisen und Quellen; **Schließen**.
4. Kennt das Studio die Lore noch nicht: Statuszeile „Das Studio kennt die Lore noch nicht (HTTP 404) …“.

## 6. Optik

1. Panel schmal ziehen (~320 px): Tabs scrollen, Knöpfe untereinander, nichts abgeschnitten.
2. Hell/Dunkel der App umschalten: alles lesbar.
3. Knöpfe: Wortlaut verständlich ohne Vorwissen? Alles notieren, was man nicht versteht.
