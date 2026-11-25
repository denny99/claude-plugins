# Vor dem Abend und Anfang

Gehört zu Skill `pnp-spielleiter`, Abschnitt 1. Lesen, wenn du einen Abend vorbereitest oder beginnst.

## Vorbereiten (bevor Spieler da sind, bevor der Bot beitritt)

1. `campaign` und `party` **einmal** lesen: Szenen, NPCs, Orte, Leitfaden-Seiten (`guide`, besonders „So leitest du …“
   und „Vor dem Abend vorbereiten“), Charakterbögen, dazu `references/erfolgsstufen.md`. Nicht zwischen Zügen
   nachlesen. Bei einer Fortsetzung auch den Kanon (`canon`), die offenen Fäden (`threads`) und wo die Gruppe steht
   (`partyAt`): Was frühere Abende festgelegt haben, gilt.
2. **Stimmen vorab:** `prepare_table` gehört nicht in den Abendkontext. Starte den Agenten `dnd-studio:pnp-tischbereit`
   (Auftrag: Kampagne, `chapter` oder `evening`, feste Zeilen als `lines` `{text, voice, how}`), oder der Mensch macht es
   in einer eigenen Sitzung. Er erzeugt alle Szenen- und Vorlesetexte in ihrer Stimme und die Tiefenkarten der
   Szenen- und Ortsbilder (`depth`; nur mit ihnen bekommen die Bilder am Tisch Parallaxe, am Tisch wird keine gemacht).
   Vorbereitetes kommt am Tisch sofort, **wenn es Wort für Wort in derselben Stimme und mit demselben `how` gesagt
   wird.** Standardsätze gibt es nicht mehr; die ersten Worte jeder Antwort improvisierst du.
   `prepare_table` **einmal** starten, nie ein zweites Mal: Ein zweiter Aufruf hängt sich nur an den laufenden Job.
   Machst du es ohne den Agenten selbst (vor dem Abend, nie am Tisch), wartest du mit `jobs watch` (Befehl im
   Hintergrund, er weckt dich), nicht mit wiederholtem `jobs wait`.
3. Fehlende Bilder für die geplanten Szenen jetzt malen. Am Tisch wird nur nachgemalt, was die Spieler Neues bringen,
   im Hintergrund, nie als Wartezeit zwischen zwei Zügen.
4. **Rahmen aus dem Leitfaden lesen, nicht fragen:** Wie tödlich, wie hart Misserfolge, was nicht vorkommen soll, ist
   beim Aufsetzen der Kampagne festgelegt (`pnp-kampagne`, „Klären, bevor gebaut wird“). Vor dem Abend fragst du nur, was am Abend hängt: wie
   lange er geht, und, sitzt jemand Neues am Tisch, ob es für ihn etwas gibt, das nicht vorkommen soll. Fehlt etwas im
   Leitfaden (ältere Kampagne), nimm die Vorgaben aus dem Skill, Abschnitt 5, und sag es in der Nachbesprechung.
5. **Bögen der Helden:** `party sheet` macht je Held seinen Bogen als PDF (Pfad in der Antwort; `secret: false` ist die
   Tischkopie ohne Geheimnis und Ziel). Ein Bogen mit Geheimnis geht nur geflüstert an seinen Spieler, nie aufs
   Spielerfenster.

## Tisch aufbauen

- **Spielerfenster:** `open_players`, sobald der Mensch will, dass du leitest. Es öffnet sich zum Teilen des Bildschirms
  oder für den zweiten Monitor und spielt die Stimme ohne Klick; ist es offen, kommt es nach vorn.
- **Online:** `discord join`. Scheitert es, nennt die Antwort, was fehlt (`missing: ["token"]` → Token im Studio
  eintragen; Server/Kanäle wählen): dem Menschen genau diesen Schritt sagen, nicht raten. Zeigt `campaign`
  `discordRooms: true`, ist der Kanal nur die Lobby: mit der ersten Szene `discord move`.
- **Der Wächter** braucht einmal die Erlaubnis für Bash (`curl` an `127.0.0.1`); fragt die App, den Menschen zu Beginn
  bitten, sie für die Sitzung zu geben.
- **Sprechknöpfe:** Jeder Held hat seinen eigenen, im Spielerfenster und unter der Nachricht des Bots in Discord. Ein
  Zug ist zu Ende, wenn alle, die gedrückt haben, fertig sind; er kommt als Zeilen `{who, text}`, eine je Sprecher. In
  Discord gibt es Knöpfe nur für Helden, deren Spieler im Sprachkanal sind („Brór (Marvin): reden“); wer noch keinen
  Helden hat, sieht die freien grau („Tobi: wählen“), ein Druck verknüpft ihn. Frei ist auch ein Held, dessen Spieler
  nicht im Kanal ist. Die Knöpfe folgen, wenn jemand kommt oder geht.
- **Wer heute spielt:** Das Fenster zeigt nur die Helden der Runde. Mit Discord sind das von selbst die im Kanal; sonst,
  oder wenn es nicht stimmt, nach „Wer spielt?“ `party playing` mit `heroes` (`[]` heißt alle). Der Mensch schaltet es
  im Studio unter „Spielt heute“.
- **Push-to-Talk** (aus, außer für einen Abend eingeschaltet): Wollen die Spieler ohne Knopf reden, `discord` mit
  `push_to_talk: true`. Wer redet, hält Discords eigene Push-to-Talk-Taste; der Bot beendet den Zug, wenn alle Tasten
  los sind. Dann gibt es kein `partial`. Ein offenes Mikro mit Rufwort gibt es nicht. Die Begrüßung nimmt die Fassung
  (`variants`) der Sprechart, die heute gilt.
- `table_state`: `discord: true`? Spieler zugeordnet? Unbekannte Sprecher kommen mit ihrer Discord-ID → fragen „Wer
  spielt <Charakter>?“ → `party set` mit `who` und `discord`.
- **Solo:** zuerst fragen, wer spielt. In Discord: „Drück unter der Nachricht des Bots den Knopf deines Helden.“

## Anfang des Abends

Begrüßung (vorbereiteter Text, `say_line` voice `narrator`) → Prolog oder „Was bisher geschah“ → bei vorgefertigten
Helden ihre Vorstellung und die Wahl → erste Szene: `show_players` mit Bild **vor** der Stimme, dann der Szenentext →
die Zugschleife (Skill, Abschnitt 3).

**Anfang und Ende sind Szenen, kein Pflichtprogramm:** Der Anfang entscheidet, ob die Runde in der Welt ankommt.
- **Organisatorisches kurz und getrennt:** Begrüßung, /geheim, wer spielt: zwei, drei Sätze. Dann ein hörbarer Wechsel
  (Musik an, Bild, eine Pause), und die Geschichte beginnt.
- **/geheim erklären,** wenn ihr über Discord spielt (sonst weiß keiner, dass es ihn gibt): „Wollt ihr mir etwas sagen,
  das die anderen nicht mitbekommen sollen, schreibt dem Bot privat `/geheim` und eure Worte, am besten im Direktchat
  mit ihm, da sieht niemand, dass ihr tippt. Ein ✅ heißt angekommen, 👀 heißt, ich hab es gelesen; die Antwort kommt
  privat.“
- **Prolog bei einer neuen Kampagne oder Welt:** der vorbereitete Prolog (`pnp-kampagne/references/szenen-und-texte.md`, „Vorlesetexte“) in mehreren Teilen, jeder
  mit Bild und Musik darunter: die Welt, was jeder in ihr weiß, was in der Luft liegt, die wichtigsten Begriffe.
  Erzählt, nicht aufgezählt; er endet, wo die Helden einsteigen. Begriffe, die später neu auftauchen, beim ersten Mal
  in einem Halbsatz erklären.
- **Ein Spieler handelt schon während Begrüßung oder Prolog:** dieselbe Schnitt-Regel wie im Spiel. Ändert er die
  Handlung, schneiden und ihm antworten; vom Rest kommt nur, was er noch braucht (Würfel, ein Probewurf, ein Begriff),
  später bei passender Gelegenheit in einem Satz. Den übrigen Vorspann nicht nachholen.
- **Heldenvorstellung bei vorgefertigten Helden:** jeder mit Porträt im Spielerfenster und seinem vorbereiteten Text
  (wer er ist, was er kann und nicht, was er will, wie er sich spielt), ohne sein Geheimnis. Dann Zeit für Fragen und
  die Wahl; erst wenn jeder seinen Helden hat, die Bögen mit Geheimnis flüstern.
- **Fortsetzung:** „Was bisher geschah“ als kleine Erzählung mit Bild und Musik (vorbereitet oder `write_text recap:
  true`), keine Liste; sie endet mitten in der Lage der Helden (bei einem Cliffhanger genau dort).
  Als kleiner Film: `show_players` mit `recap` (dein Text) und `music`; die Bilder der letzten Sitzung laufen mit
  Überblendung, der Erzähler liest, der Aufruf kommt zurück, wenn die Erzählung vorbei ist (eigene Bilder mit
  `slides`). Danach `play_sound stop` oder gleich die Stimmung der ersten Szene.
- **Trailer/Intro:** Gibt es einen Clip (`animate`, `cut_film`), läuft er vor der Begrüßung: `show_players` mit dem
  Clip als `picture`, `title`, `after` (erstes Szenenbild) und `until_end: true`; die Begrüßung kommt danach.
- Jeder Teil endet mit der Übergabe, der letzte mit der ersten Frage der Szene.
