# Sonderfälle

Gehört zu Skill `pnp-spielleiter`. Lesen, wenn der Fall eintritt.

## Bevor der Kontext voll ist

Wird ein langer Kontext unbemerkt zusammengefasst, gehen Einzelheiten verloren, und mitten in einem Zug stockt der
Tisch. Merkst du, dass es eng wird (langer Abend, eine Warnung zum Kontext), dann an einer ruhigen Stelle, nie mitten in
einem Wurf oder Gespräch:
1. Als Erzähler ansagen: „Kurze Pause, die Spielleitung braucht einen Moment. Gleich geht es weiter.“ und `set_pause`.
2. Alles Wichtige ins Studio: wo die Helden stehen (Szene, Karte, Marker), ihre Werte (`set_status` steht schon), was am
   Tisch erfunden wurde, offene Fäden, was als Nächstes käme. Als Session-Notizen (`set_campaign_entry kind session`
   mit `notes`, für die heutige mit `append`) und, wo es Dauer hat, in die Kampagne (NPC-Notizen; `campaign set` mit
   `threads` und `party_at`).
3. Dem Menschen sagen, dass er jetzt `/compact` auslösen soll, und warten.
4. Danach den Skill neu lesen, `campaign` und `table_state` mit `log` lesen, die Pause beenden (`set_pause on: false`)
   und als Erzähler: „Ich bin zurück.“ Ein Satz, wo sie stehen, und die Frage, was sie tun.

## Zwischenrufe des Menschen

Der Mensch am Rechner wirft im Chat ein, was ihm seltsam vorkommt („das war weird“, „zu langsam“, „der NPC hätte das
nicht gewusst“). Das ist Regie, kein Zug am Tisch: im Chat mit einer Zeile bestätigen, ab dem nächsten Zug danach
handeln, ohne den Tisch anzuhalten oder es den Spielern zu erzählen, und es festhalten, damit es die Nachbesprechung
erreicht, auch über eine Kontext-Zusammenfassung hinweg (das Panel schreibt die Einwürfe nach
`debrief-<Kampagne>-<Datum>.md` in den Datenordner des Plugins; ohne Panel eine Datei „Spieltest-Notizen“ im
Scratchpad oder Arbeitsordner).

## Mitleiten durch einen Menschen

Leitet ein Mensch mit dir zusammen, bedient er dasselbe am Spieltisch im Studio (Karte zeigen und groß, Nebel mit
Links-/Rechtsklick, Marker ziehen, Orte aufdecken, Fundstücke geben). Bevor du Karte oder Marker änderst, `map list`
mit `map` lesen: dort stehen seine Marker und der Nebel, so überschreibst du nichts.

## Wächter und Warten

- **Kein Monitor:** den Befehl des Wächters mit Bash und `run_in_background: true` starten. Dann weckt dich nur
  „fertig“ ohne Ausgabe: `wait_for_players` gibt dir den schon genommenen Zug.
- **`ready: "error"` oder kein `watch`** (ältere Studio-Version oder App): wie früher, `wait_for_players` wartet
  höchstens 50 s, `finished: false` → wieder aufrufen. Eine Pause der Spieler kommt dann einmal zurück (`paused`):
  vorbereiten, sie drücken „Weiter“.
- `null` kommt nach 29 Minuten ohne alles (Monitor hält höchstens 30): einfach `next_watch`.
- **`say_line` kommt nach 50 s zurück** (`playing` / `making`), wenn eine Zeile noch läuft oder entsteht: einfach
  weitermachen, die nächste Zeile wartet.
- **Ungehörtes bei älteren Versionen:** Kam `say_line` schon zurück, steht der ungehörte Rest in `table_state` unter
  `last_unheard` bzw. `last_line`; ganz ohne das Feld zeigt `table_state` mit `log`, welche Teile schon liefen.

## Fehler

- Ein Werkzeug oder Parameter ist unbekannt (ältere Studio-Version): ohne `prepare_table` feste Zeilen einzeln mit
  `say_line prepare`; ohne `sound` ein `play_sound` direkt davor; ohne `parts` einzelne `say_line` nacheinander. Der
  Abend funktioniert, nur langsamer. Ein Studio, das neuer ist als die laufende App, braucht einen Neustart der App.
- Ältere Kampagnen haben die Dateien ihrer Klänge noch in den Notizen statt unter `sounds`.
- Ein Werkzeug läuft in den Timeout: Zustand mit `table_state` (und `log`) prüfen, statt blind zu wiederholen; oft ist
  die Zeile trotzdem gelaufen.
- Die GPU wird woanders gebraucht oder der Mensch sagt „Stop“: sofort aufhören, Bot mit `leave` wegschicken, Stand
  (Szene, letzter Zug) kurz notieren.
- Die App stürzt ab oder wird neu gestartet: `open_players`, `discord join` (bei Räumen nach Orten danach `move`), dann
  prüfen, was `table_state` noch weiß (Werte, Gegner, Szene, Karte), und setzen, was fehlt, bevor der Erzähler mit „Ich
  bin zurück“ und einem Satz zum Stand weitermacht. Den Stand dafür laufend im Kopf oder im Kanon halten.
- Ein NPC klingt falsch (zu jung, zu alt, falsches Geschlecht): in einer Pause `set_voice` mit `from: "description"` und
  einer deutlicheren Beschreibung (Alter ausdrücklich, und was sie nicht ist: „a teenage girl of fifteen … not
  childish, already sounds almost grown-up“), danach seine festen Texte neu vorbereiten (Agent
  `dnd-studio:pnp-tischbereit`).
