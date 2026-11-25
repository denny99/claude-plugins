# Sonderfälle

Gehört zu Skill `pnp-spielleiter`. Lesen, wenn der Fall eintritt.

## Bevor der Kontext voll ist

Pause, sichern, zurückkommen (Denny, 2026-10-29). Ein langer Abend füllt deinen
Kontext; wird er zusammengefasst (compact), ohne dass es jemand merkt, gehen Einzelheiten verloren, und mitten in
einem Zug stockt der Tisch. Merkst du, dass es eng wird (der Abend ist lang, eine Warnung zum Kontext kommt), dann
an einer ruhigen Stelle, nie mitten in einem Wurf oder Gespräch:
1. Als Erzähler ansagen: „Kurze Pause, die Spielleitung braucht einen Moment. Gleich geht es weiter.“ und `set_pause`.
2. Alles Wichtige ins Studio, nicht nur in deinen Kopf: Wo die Helden stehen (Szene, Karte, Marker), ihre Werte
   (`set_status` steht schon), was am Tisch erfunden wurde (Namen, Orte, Tatsachen), offene Fäden und was als
   Nächstes käme. Als Session-Notizen (`set_campaign_entry kind session` mit `notes`, für die heutige mit `append`) und,
   wo es Dauer hat, in die Kampagne (NPC-Notizen; `campaign set` mit `threads` und `party_at`, siehe 7).
3. Dem Menschen am Rechner sagen, dass er jetzt `/compact` auslösen soll, und warten.
4. Danach `campaign` und `table_state` mit `log` lesen, die Pause beenden (`set_pause on: false`) und als Erzähler
   sagen: „Ich bin zurück.“ Mit einem Satz, wo sie stehen, und der Frage, was sie tun.

## Mitleiten durch einen Menschen

- **Leitet ein Mensch mit dir zusammen,** bedient er dasselbe am Spieltisch im Studio (Karte zeigen und groß, Nebel mit
  Links-/Rechtsklick, Marker ziehen, Orte aufdecken, Fundstücke geben). Bevor du Karte oder Marker änderst, `map list`
  mit `map` lesen: dort stehen seine Marker und der Nebel, so überschreibst du nichts.

## Fehler

- Ein Werkzeug oder Parameter ist unbekannt (ältere Studio-Version): ohne `prepare_table` feste Zeilen einzeln mit
  `say_line prepare`; ohne `sound` ein `play_sound`
  direkt davor; ohne `parts` einzelne `say_line` nacheinander. Der Abend funktioniert, nur langsamer. Ein Studio,
  das neuer ist als die laufende App, braucht einen Neustart der App, bevor neue Parameter da sind.
- Ein Werkzeug läuft in den Timeout: Zustand mit `table_state` (und `log`) prüfen, statt blind zu wiederholen; oft
  ist die Zeile trotzdem gelaufen.
- Die GPU wird woanders gebraucht oder der Mensch sagt „Stop“: sofort aufhören, Bot mit `leave` wegschicken, Stand
  (Szene, letzter Zug) kurz notieren.
- Die App stürzt ab oder wird neu gestartet: `open_players`, `discord join` (bei Räumen nach Orten danach `move`),
  dann prüfen, was `table_state` noch
  weiß (Werte, Gegner, Szene, Karte) und setzen, was fehlt, bevor der Erzähler mit „Ich bin zurück“ und einem Satz
  zum Stand weitermacht. Den Stand (Werte, wer wo, letzter Zug) dafür laufend im Kopf oder im Kanon halten.
- Ein NPC klingt falsch (zu jung, zu alt, falsches Geschlecht): in einer Pause `set_voice` mit `from: "description"`
  und einer deutlicheren Beschreibung (Ödland-Abend: die vierzehnjährige Lotte klang wie eine Vierjährige; „a
  teenage girl of fifteen … not childish, already sounds almost grown-up“ half), danach seine festen Texte neu
  vorbereiten.
