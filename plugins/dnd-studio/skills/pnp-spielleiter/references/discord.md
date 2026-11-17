# Discord: Flüstern, Nebenräume, Räume nach Orten

Die Einzelheiten zu Abschnitt 4c von `pnp-spielleiter`. Dort steht, wann du welchen Weg nimmst; hier, wie er sich
verhält, was seine Antwort bedeutet und was der Bot dafür braucht. Alles ist das Werkzeug `discord` mit der genannten
`action`.

## Flüstern (`whisper`)

- `hero` ist der Held, dessen Spieler die Direktnachricht bekommt. `handout: "<Titel>"` schickt einen Handout-Text der
  Kampagne 1:1 (Text und Bild), `text` und `picture` etwas Eigenes; `text` neben `handout` oder `sheet` ist eine Zeile
  dazu.
- `sheet: true` schickt den Bogen des Helden als PDF, die Spielerkopie mit Geheimnis und Ziel (aus `sheet_data` des
  Helden, siehe `party set`; `table: true` die Tischkopie ohne beides). Fehlt der Bogen oder haben sich Werte, Foto oder
  Vorlage seitdem geändert (Stufenaufstieg zwischen zwei Abenden), wird er vorher neu erzeugt.
- Die Antwort sagt `delivered: true` oder, warum nicht:
  - `not_mapped`: der Held ist mit keinem Discord-Konto verknüpft → `party set` mit `discord`, oder der Spieler drückt
    den grauen Knopf seines Helden unter der Nachricht des Bots („<Held>: wählen“) oder nimmt `/ich-bin`.
  - `dms_closed`: der Spieler nimmt keine Direktnachrichten vom Server; er erlaubt sie in den
    Privatsphäre-Einstellungen des Servers.
  - `not_set_up`: kein Bot eingerichtet.
  Kam es nicht an, sag es dem Spieler mit einem Satz, nie den Inhalt.
- Das Log des Tisches vermerkt „whispered to <Held>: <Titel>“. So wissen Chronist und Prüfer, wer was weiß; sag es
  ihnen im Auftrag, wenn es zählt.
- Verdeckter Wurf: `roll_dice` mit `whisper: "<Held>"`. Das Spielerfenster zeigt nichts, nur der Spieler bekommt das
  Ergebnis, du siehst es in der Antwort.

## Ein Spieler schreibt dir (`/geheim`)

- Der Spieler schreibt dem Bot `/geheim` und seine Worte, am besten im Direktchat mit ihm (dort sieht niemand, dass er
  tippt). Die Nachricht des Bots im Textkanal und die Antwort auf `/ich-bin` erwähnen es klein; erklären musst du es
  trotzdem in der Begrüßung (Abschnitt 3).
- `wait_for_players` bringt es als eigenen Zug: `secret: true`, die Zeile `{who, text, secret: true}` („<Held>
  (geheim): …“). Am Tisch hat nichts angehalten, ein Satz, der gerade läuft, läuft weiter.
- Das Log vermerkt „<Held> told the game master in secret: …“: Chronist und Prüfer lesen es, das Spielerfenster nie.
- Ist der Held nicht verknüpft, sagt der Bot dem Spieler selbst, er soll erst `/ich-bin` nehmen. `/geheim` geht auch,
  wenn der Bot nicht im Sprachkanal ist.

## Unter vier Augen (`aside`)

- `hero`: der Held kommt in einen Nebenraum („<Kampagne> – <Name> unter vier Augen“, oder `room`), der Bot geht mit.
  Die anderen warten im Tischkanal und hören nichts.
- Dort spielst du ganz normal (`say_line`, `wait_for_players`). Solange der Bot im Nebenraum ist, hält das Studio das
  geteilte Spielerfenster von selbst heraus (das sehen alle):
  - `say_line` hört nur der Nebenraum; das Fenster zeigt weder Untertitel noch Porträt, auch nicht mit `table: true`.
    Die Antwort nennt den Raum (`room`).
  - `show_players` mit Bild, Titel und Worten geht per DM an die Helden im Raum; das Fenster behält seine Szene. Karte
    und Clip lehnt es ab, bis alle wieder am Tisch sind.
  - `roll_dice` würfelt verdeckt und flüstert das Ergebnis den Helden im Raum.
  - `give_find` legt den Fund ab, zeigt ihn aber nicht im Fenster.
  - `play_sound` hört ohnehin nur der Raum, in dem der Bot ist.
  - Noch sichtbar im Fenster: `spotlight` und `set_status`. Solange der Held weg ist, lass sie für ihn weg.
- Dauert es länger als ein paar Minuten, zwischendurch mit `go` und `room: "table"` bei den Wartenden vorbeischauen,
  dann zurück.
- `merge` holt alle zurück und räumt den Raum weg. Ob und wann der Held es enthüllt, entscheidet sein Spieler.

## Die Gruppe trennt sich (`split`, `go`, `merge`)

- `split` mit `heroes` (optional `room`): die genannten Helden kommen in einen eigenen Sprachkanal („<Kampagne> – Gruppe
  B“, dann C …; ein vorhandener Raumname schickt sie dorthin). Der Bot bleibt, wo er ist.
- Der Bot ist immer nur in einem Raum, und nur dieser hört und wird gehört. `go` mit `room: "Gruppe B"` oder `"table"`
  wechselt, etwa alle paar Minuten oder an einer spannenden Stelle. Der wartenden Gruppe **vor** dem Wechsel einen Satz
  sagen („Ihr hört Schritte über euch, haltet inne – wir schauen kurz zu den anderen.“).
- Ist der Bot bei der abgetrennten Gruppe (`go` in deren Raum), gilt dasselbe wie unter vier Augen: Zeilen, Bilder und
  Würfe gehen nur an diesen Raum, nicht ins Spielerfenster. Mit `go table` zeigt das Fenster wieder alles.
- Finden sie wieder zusammen: `merge`. `leave` holt am Ende ohnehin alle zurück und räumt die Räume weg.

## Räume nach Orten (`discord_rooms`, `move`)

Denny, 2026-11-01. Ein Schalter je Kampagne, Standard aus: `campaign set` mit `discord_rooms: true` (oder im Studio auf
dem Blatt der Kampagne „Discord: ein Raum je Ort“); `campaign` zeigt ihn als `discordRooms`. Ist er aus, gilt alles
oben, und `move` antwortet nur, dass er aus ist.

- Ist er an, ist der Sprachkanal, den der Bot bei `join` betritt, nur die Lobby. Am Spieltisch sitzt die Gruppe in einem
  Sprachraum, der nach ihrem Ort heißt („📍 Kesselheim“).
- `move` ohne `place` zieht in den Raum des Orts, an dem die Gruppe laut Kampagne ist (`party_at`; `campaign set
  party_at`, oder das Board setzt ihn beim Weiterschalten zur nächsten Szene); mit `place: "<Ort>"` in einen anderen.
  Der Bot geht zuerst hinein, dann holt er alle aus der Lobby und den anderen Ortsräumen nach. Jeder Ort bekommt beim
  ersten Mal seinen Raum, danach wird er wiederverwendet, nie umbenannt.
- **Ein kurzer Ruckler:** Beim Umzug ist der Ton eine Sekunde weg, und jeder Spieler wird hinübergezogen. Eine
  Atmosphäre in Schleife läuft drüben weiter.
- **Bildschirmfreigabe:** Discord beendet sie, wenn der Teilende den Kanal wechselt, und ein Stream ist nur im eigenen
  Kanal zu sehen; Zurückbleiben hilft also nicht. `move` zieht ihn trotzdem um und nennt ihn in `stream_ended` (und
  `warning`): Bitte ihn, das Spielerfenster im neuen Raum wieder zu teilen. Wird das Spielerfenster über Discord
  geteilt, sind Räume nach Orten meist mehr Mühe als Gewinn.
- **Ton nach dem Umzug:** Discord verschlüsselt den Ton (DAVE), und jeder, der in den Raum kommt, muss in die Gruppe
  des Bots aufgenommen werden. Beim Spieltest vom 2026-11-02 hörte Marvin (Discord im Browser) nach jedem Umzug nichts
  mehr, bis er den Raum von Hand verließ und wieder betrat. Der Bot prüft das jetzt nach jedem Umzug und `merge`,
  holt wen, der nach einigen Sekunden nicht in der Gruppe ist, einmal hinaus und wieder hinein, und nennt in
  `unheard`, wer es danach noch nicht ist: Der soll den Raum selbst verlassen und wieder betreten.
- **Unbekannte Orte verraten nichts:** Der Raumname ist für alle auf dem Server sichtbar. Ein Ort, den die Gruppe noch
  nicht kennt (nicht `known`, nicht mit `show_players reveal_places` aufgedeckt), heißt deshalb nur „🧭 Unterwegs“.
  Soll der Raum den Namen tragen: erst aufdecken, dann umziehen.
- **Getrennte Gruppe:** Nach `split` oder `aside` zieht `move` ohne `heroes` niemanden um, sondern sagt, wer wo ist.
  `heroes` zieht nur die Genannten (der Bot geht mit); `merge` holt alle in den Raum des gemeinsamen Orts statt in die
  Lobby. `split` und `aside` mit `place` legen ihren Raum als Ortsraum an; ohne `place` heißt er wie oben.
- **Abendende:** `leave` holt alle zurück in die Lobby und löscht die leeren Ortsräume, die der Bot angelegt hat.

## Rechte des Bots

Nebenräume, Gruppen und Ortsräume brauchen die Rechte `Manage Channels` und `Move Members`. Fehlen sie, nennt die
Antwort sie: dem Menschen sagen, er soll den Bot neu einladen (Studio: Einstellungen → Discord-Bot) oder der Rolle die
Rechte geben. Bis dahin am Tisch weiterspielen und Geheimes flüstern.
