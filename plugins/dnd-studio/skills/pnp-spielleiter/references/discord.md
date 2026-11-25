# Discord: Flüstern, /geheim, Nebenräume, Räume nach Orten

Gehört zu Skill `pnp-spielleiter`, Abschnitt 4c. Lesen vor dem ersten `whisper`, `split`, `aside` oder `move` eines
Abends und wenn ein Flüstern nicht ankommt. Alles ist das Werkzeug `discord` mit der genannten `action`. Grundregel:
Was `say_line` und `show_players` bringen, hören und sehen alle; Geheimes nur auf diesen Wegen.

## Wann welcher Weg

- **Flüstern** (`whisper`): Bögen mit Geheimnis, was nur ein Held bemerkt, was ein NPC einem anvertraut, ein
  verdeckter Wurf (Skill 4c).
- **Unter vier Augen per DM, die anderen spielen weiter** (der Normalfall für eine geheime Szene; sonst warten alle
  anderen minutenlang für nichts): Den anderen einen Satz sagen („Jule geht kurz mit Lotte beiseite.“) und mit ihnen
  weiterspielen. Den Helden allein in einen eigenen Sprachraum holen (`split` mit `heroes: ["<Held>"]`, der Bot bleibt
  bei der Gruppe), damit er nicht zugleich die Gruppe hören und seine DM lesen muss. Ihm per `whisper`: Text, ein Bild
  (`picture`), was ein NPC sagt als Sprachdatei, die er selbst abspielt (`speak: {text, voice, how}`), ein Klang mit
  `sound`; Würfe mit `roll_dice whisper`. Er antwortet mit `/geheim`, der Wächter weckt dich sofort, du flüsterst
  zurück, auch wenn die anderen reden. Drei, vier Wechsel, nicht zwanzig; dann `merge`.
- **Nebenraum mit Stimme** (`aside`), nur wenn das gesprochene Rollenspiel unter vier Augen wirklich zählt und die
  anderen ohnehin eine Pause wollen. Den Wartenden vorher einen Satz („… ihr wartet am Feuer.“), danach `merge`.
- **Die Gruppe trennt sich** (`split`, `go`, `merge`), wenn die Helden in der Geschichte getrennte Wege gehen.
- **Räume nach Orten** (`move`), wenn die Kampagne sie an hat und eine Szene den Ort wechselt, wie ein Schnitt im Film,
  nicht bei jedem Schritt.
- In jedem Fall entscheidet der Spieler, ob und wann er enthüllt, was unter vier Augen geschah.

## Flüstern (`whisper`)

- `hero` ist der Held, dessen Spieler die Direktnachricht bekommt. `handout: "<Titel>"` schickt einen Handout-Text der
  Kampagne 1:1 (Text und Bild), `text` und `picture` etwas Eigenes; `text` neben `handout` oder `sheet` ist eine Zeile
  dazu.
- `sheet: true` schickt den Bogen des Helden als PDF, die Spielerkopie mit Geheimnis und Ziel (`table: true` die
  Tischkopie). Fehlt er oder haben sich Werte, Foto oder Vorlage geändert, wird er vorher neu erzeugt. Am Tisch nie
  andeuten, dass darin etwas Besonderes steht; ein Hinweis darauf gehört ins Flüstern selbst.
- Die Antwort sagt `delivered: true` oder, warum nicht:
  - `not_mapped`: Held mit keinem Discord-Konto verknüpft → `party set` mit `discord`, oder der Spieler drückt den
    grauen Knopf seines Helden („<Held>: wählen“) oder nimmt `/ich-bin`.
  - `dms_closed`: der Spieler erlaubt Direktnachrichten in den Privatsphäre-Einstellungen des Servers.
  - `not_set_up`: kein Bot eingerichtet.
  Kam es nicht an, sag es dem Spieler mit einem Satz, nie den Inhalt.
- Das Log vermerkt „whispered to <Held>: <Titel>“; so wissen Chronist und Prüfer, wer was weiß. Sag es ihnen im
  Auftrag, wenn es zählt.
- Verdeckter Wurf: `roll_dice` mit `whisper: "<Held>"`. Das Fenster zeigt nichts, nur der Spieler bekommt das Ergebnis;
  danach erzählst du nur, was er wahrnimmt.

## Ein Spieler schreibt dir (`/geheim`)

- Der Spieler schreibt dem Bot `/geheim` und seine Worte, am besten im Direktchat (dort sieht niemand, dass er tippt).
  Die Nachricht des Bots und die Antwort auf `/ich-bin` erwähnen es klein; erklären musst du es trotzdem in der
  Begrüßung (`references/vor-dem-abend.md`).
- Es kommt als eigener Zug: `secret: true`, die Zeile „<Held> (geheim): …“. Am Tisch hat nichts angehalten, ein Satz,
  der gerade läuft, läuft weiter.
- Der Spieler sieht ✅, sobald es am Tisch ist, und 👀, sobald du es geholt hast; dann wartet er auf dein Flüstern.
  Darum sofort antworten (Skill 4c), zur Not erst kurz, und dir merken, wem du welche Antwort schuldest.
- Braucht es ein Gespräch, wird es eine Szene unter vier Augen per DM (oben).
- Das Log vermerkt „<Held> told the game master in secret: …“: Chronist und Prüfer lesen es, das Spielerfenster nie.
- Ist der Held nicht verknüpft, sagt der Bot dem Spieler selbst, er soll erst `/ich-bin` nehmen. `/geheim` geht auch,
  wenn der Bot nicht im Sprachkanal ist.

## Unter vier Augen mit Stimme (`aside`)

- `hero`: der Held kommt in einen Nebenraum („<Kampagne> – <Name> unter vier Augen“, oder `room`), der Bot geht mit.
  Die anderen warten im Tischkanal und hören nichts.
- Dort spielst du ganz normal. Solange der Bot im Nebenraum ist, hält das Studio das geteilte Spielerfenster heraus:
  - `say_line` hört nur der Nebenraum; das Fenster zeigt weder Untertitel noch Porträt, auch nicht mit `table: true`.
  - `show_players` mit Bild, Titel und Worten geht per DM an die Helden im Raum; Karte und Clip lehnt es ab, bis alle
    wieder am Tisch sind.
  - `roll_dice` würfelt verdeckt und flüstert das Ergebnis; `give_find` legt ab, ohne zu zeigen; `play_sound` hört nur
    der Raum des Bots.
  - Noch sichtbar im Fenster: `spotlight` und `set_status`. Solange der Held weg ist, lass sie für ihn weg.
- Dauert es länger als ein paar Minuten, zwischendurch mit `go` und `room: "table"` bei den Wartenden vorbeischauen.
- `merge` holt alle zurück und räumt den Raum weg.

## Die Gruppe trennt sich (`split`, `go`, `merge`)

- `split` mit `heroes` (optional `room`): die Genannten kommen in einen eigenen Sprachkanal („<Kampagne> – Gruppe B“,
  dann C …; ein vorhandener Raumname schickt sie dorthin). Der Bot bleibt, wo er ist.
- Der Bot ist immer nur in einem Raum, und nur dieser hört und wird gehört. `go` mit `room: "Gruppe B"` oder `"table"`
  wechselt, etwa alle paar Minuten oder an einer spannenden Stelle. Der wartenden Gruppe **vor** dem Wechsel einen Satz
  („Ihr hört Schritte über euch, haltet inne – wir schauen kurz zu den anderen.“).
- Ist der Bot bei der abgetrennten Gruppe, gilt dasselbe wie unter vier Augen: nichts ins Spielerfenster. Mit
  `go table` zeigt es wieder alles.
- Wieder zusammen: `merge`. `leave` holt am Ende ohnehin alle zurück.

## Räume nach Orten (`discord_rooms`, `move`)

Ein Schalter je Kampagne, Standard aus: `campaign set` mit `discord_rooms: true` (oder im Studio „Discord: ein Raum je
Ort“); `campaign` zeigt ihn als `discordRooms`. Ist er aus, antwortet `move` nur, dass er aus ist.

- Ist er an, ist der Kanal von `join` nur die Lobby; am Spieltisch sitzt die Gruppe in einem Raum, der nach ihrem Ort
  heißt („📍 Kesselheim“).
- **Wann:** nur wenn eine Szene den Ort wechselt (vom Dorf zur Talsperre), nicht von selbst: erst den Ort setzen
  (`campaign set party_at`, oder das Board tut es beim Weiterschalten), dann `move`. Vorher ein Satz zum Übergang („Ihr
  lasst Kesselheim hinter euch …“), nie mitten in einen Satz.
- `move` ohne `place` zieht in den Raum von `party_at`, mit `place` in einen anderen. Der Bot geht zuerst hinein, dann
  holt er alle nach. Jeder Ort bekommt beim ersten Mal seinen Raum, danach wird er wiederverwendet, nie umbenannt.
- **Ein kurzer Ruckler:** eine Sekunde kein Ton, jeder wird hinübergezogen; eine Atmosphäre in Schleife läuft weiter.
- **Bildschirmfreigabe:** Discord beendet sie, wenn der Teilende den Kanal wechselt. `move` nennt ihn in
  `stream_ended` (und `warning`): Bitte ihn, das Spielerfenster im neuen Raum wieder zu teilen. Wird das Fenster über
  Discord geteilt, sind Räume nach Orten meist mehr Mühe als Gewinn.
- **Ton nach dem Umzug:** Discord verschlüsselt den Ton (DAVE); wer in den Raum kommt, muss in die Gruppe des Bots
  aufgenommen werden. Der Bot prüft das nach jedem Umzug und `merge`, holt wen, der nicht drin ist, einmal hinaus und
  wieder hinein, und nennt in `unheard`, wer es danach noch nicht ist: Der soll den Raum selbst verlassen und wieder
  betreten.
- **Unbekannte Orte verraten nichts:** Der Raumname ist für alle auf dem Server sichtbar; ein Ort, den die Gruppe noch
  nicht kennt, heißt nur „🧭 Unterwegs“. Soll der Raum den Namen tragen: erst aufdecken, dann umziehen.
- **Getrennte Gruppe:** Nach `split` oder `aside` zieht `move` ohne `heroes` niemanden um, sondern sagt, wer wo ist.
  `heroes` zieht nur die Genannten (der Bot geht mit); `merge` holt alle in den Raum des gemeinsamen Orts. `split` und
  `aside` mit `place` legen ihren Raum als Ortsraum an.
- **Abendende:** `leave` holt alle zurück in die Lobby und löscht die Räume, die der Bot angelegt hat.

## Rechte des Bots

Nebenräume, Gruppen und Ortsräume brauchen `Manage Channels` und `Move Members`. Fehlen sie, nennt die Antwort sie:
dem Menschen sagen, er soll den Bot neu einladen (Studio: Einstellungen → Discord-Bot) oder der Rolle die Rechte geben.
Bis dahin am Tisch weiterspielen und Geheimes flüstern.
