# Mit dem Zuhörer (offenes Mikro)

Gehört zu Skill `pnp-spielleiter`, Abschnitt 3. Lesen, sobald `table_state` `listener: "haiku"` zeigt oder der Tisch
mit offenem Mikro spielen will, vor dem ersten Zug. Was der Schalter in Discord ändert (Knöpfe, Absenden, wann ein Zug
endet): `discord.md`, „Offenes Mikro mit dem Zuhörer“.

Denny 2026-11-17: offenes Mikro in Discord, „token sparend“. Die Spieler reden ohne Knöpfe, und nicht jeder Zug ist für
dich. Statt des Wächters wartet der Agent `dnd-studio:pnp-zuhoerer` (Haiku) und weckt dich nur, wenn die Spielleitung
gebraucht wird. **Er bleibt und weckt dich mit einer Nachricht** (Denny 2026-11-19: „mit diesem Restarten von diesem
Agent, das ist irgendwie scheiße“): Jedes Ende eines Zuhörers ließ den Tisch taub, bis der nächste lief.

## Starten, wecken lassen, neu starten

1. **Einen Zuhörer starten** (Agent `dnd-studio:pnp-zuhoerer`, `run_in_background: true`), wenn keiner läuft: zum
   Abendbeginn, wenn sein Ende (die Rückgabe, nicht eine Nachricht) dich geweckt hat, nach einem Fehler. Sonst läuft
   er schon: keinen zweiten starten, zwei nehmen sich die Züge weg. Einschalten: `discord` mit `listener: "haiku"`,
   aus mit `"off"`. Merk dir seine ID aus der Antwort des Agent-Werkzeugs.
   Der Auftrag nennt in wenigen Zeilen, was du gleich sagst und ob du danach auf eine Antwort oder einen Wurf wartest,
   wer in der Szene ist, die NPCs der Szene und deinen Namen am Tisch („Spielleiter“, „Meister“, wie die Gruppe dich
   nennt).
   Gibt es den Agenten nicht (Plugin nicht oder zu alt installiert), keinen allgemeinen Agenten starten: dem Menschen
   sagen, dass das Plugin aktualisiert werden muss, den Zuhörer ausschalten (`"off"`) und selbst mit dem Wächter
   warten (Abschnitt 3).
2. Seine **Nachricht** weckt dich (`{woke, why, turn, bridge, between}` als Text von ihm): antworten, dann **ihm die
   neue Lage schicken** (`SendMessage` an seine ID, zwei, drei Zeilen wie der Auftrag), dann den Zug beenden. Keinen
   Wächter starten, kein `wait_for_players`: das macht er. Die Lage zuerst schicken, wenn deine Antwort lang wird.
3. Sein **Ende** (die Rückgabe des Agenten) kommt bei der ersten Weckung nach etwa 60 Minuten (oder nach 40 Weckungen) (dann frisch, sein
   Kontext wäre sonst voll), nach sehr vielen Zügen ohne Weckung, bei einem Fehler oder auf „Schluss“: den Zug
   beantworten wie eine Nachricht und **mit deiner Antwort einen neuen Zuhörer starten**. `woke: false`: nichts
   beantworten, nur einen neuen starten. Am Ende des Abends schickst du ihm „Schluss“.
4. Kommt er nicht (Fehler, `why: "Wächter geht nicht"`): mit dem Wächter weiter (Abschnitt 3), und dem Menschen eine
   Zeile.

## Was seine Nachricht bringt

- **`prepare: true`** (Denny 2026-11-21, „vorrechnen, während jemand noch redet“): Der Zug läuft noch, jemand redet
  weiter (`partial.talking`). **Nicht sprechen, nichts zeigen, nicht würfeln**: am Tisch geschieht nichts. Nur
  vorbereiten, was dann sofort kommen soll: die Antwort durchdenken, die Zeilen mit `say_line` `prepare: true`
  machen (dieselben Worte spielen später sofort), Bilder anstoßen. Dann ihm die Lage schicken („vorbereitet: Antwort an
  Jule und Tobi, warte auf Yannick“) und den Zug beenden. Die echte Weckung kommt, sobald alle still sind: dann die
  vorbereiteten Zeilen sagen, angepasst an das, was der Rest noch sagte. `woke: false` mit `why: "doch nicht"`: das
  Vorbereitete nicht sagen.

- `turn` beantworten wie einen Zug aus `wait_for_players` (`secret: true` wie dort: flüstern). `turn: null` mit `why`
  Pause: vorbereiten.
- `why: "geheim"` (oder `secret_waiting`): Der Zuhörer holt kein Geheimnis, das tust du: `wait_for_players` mit
  `secret: true` und flüstern (Abschnitt 4c). Ihn weckt dasselbe Geheimnis nicht noch einmal.
- Hat er nicht geschnitten (`why` sagt es, `cut_line` mit `keep`), läuft deine Zeile noch zu Ende: deine Antwort
  kommt danach, sie knüpft an das Erzählte an.
- `between` ist, was die Gruppe ohne dich beredet hat. Lies es, bevor du antwortest, und nimm auf, was zählt („Ihr
  habt euch für die Bestechung entschieden …“); den Wortlaut hat `table_state log`.
- `bridge` ist der Satz, den der Erzähler schon gesagt hat, während du nachdachtest („Jule kratzt am Ruß der
  Sicherung.“). **Nicht wiederholen**, auch nicht umformuliert: deine Antwort beginnt danach, mit dem, was geschieht
  („Darunter kommt ein Draht zum Vorschein …“), nicht mit „Jule kratzt den Ruß ab, und …“. Er nimmt nichts vorweg;
  was gelingt oder was der NPC sagt, entscheidest du.

## Geschnittene Zeilen und Brücken

- Ein Zug endet erst, wenn alle still sind; wer einen langen Plan erzählt, wird durch Zwischenrufe nicht abgeschnitten,
  auch nicht durch ein „Erzähler“ dazwischen (das zählt erst am Zugende, wie Absenden). Nur Dauergerede ohne Pause
  wird nach 60 s gekappt (`capped`): dazu weckt dich der Zuhörer nur zum Vorbereiten.
- Die Stimme schneidet deine Zeile nicht mehr von selbst; der Zuhörer tut es, wenn ein Zug wichtig ist (`cut_line`),
  und Absenden tut es sofort. `say_line` kommt dann `interrupted` zurück: am Tisch nichts weiter tun, bis die
  Nachricht oder Rückgabe des Zuhörers da ist, dann sie beantworten (`unheard` danach, wenn es noch passt). „Reinreden
  geht vor“ heißt im Zuhörer-Modus: auf ihn warten, nicht `wait_for_players`.
- Mit dem Schnitt spielt der Tisch sofort eine Brücke, damit deine Denkzeit nicht still ist (Denny 2026-11-19).
  **Meist schreibt der Zuhörer sie selbst** (`cut_line` mit `bridge_text`): ein Satz, der genau zu diesem Zug passt,
  live in der Stimme des Erzählers, allein (kein Denksatz davor). Fängt die Stimme nicht binnen zweieinhalb Sekunden an (gerade belegt oder geparkt),
  kommt stattdessen ein vorbereiteter Satz des Erzählers: `approach` („Tobi geht zu Bartel hinüber.“), wenn sich ein
  Held an einen NPC wendet, `look` oder `act` für Züge ohne NPC, sonst ein `think` („Ist angekommen.“, „Lass mal
  sehen.“). Diese Ersatz-Brücken bleiben also nötig; wie man sie schreibt: `../pnp-kampagne/references/standardsaetze.md`.
- Deine Antwort setzt keine zweite Brücke davor: kein `opener: "think"` für den Erzähler, und ein `from` spielt keine
  zweite `approach`-Brücke. Sie fängt gleich mit der Sache an. Lässt der Zuhörer eine Zeile von dir ausreden, spielt
  die Brücke erst nach ihrem Ende, falls deine Antwort dann noch nicht da ist. Welcher Satz lief, steht in seiner
  Nachricht (`bridge`) und in `table_state log`.

## Am Tisch mit offenem Mikro

- **Die Begrüßung erklärt, wie man dich ruft** (Live-Test 2026-11-18, vier Spieler, nebenher ein Videospiel: „es kommt
  zwar alles an, aber es löst nicht aus“): einfach reden; wer „Spielleitung“ oder „Erzähler“ sagt oder **Absenden**
  drückt, holt dich sofort (beides weckt ohne Haikus Abwägung; die Nachricht des Bots zeigt, ob gehört, geprüft wird
  oder du nachdenkst). Sag das am Anfang und noch einmal, wenn die Runde wartet und nichts ankommt. Nie „drück den
  Knopf“: beim offenen Mikro hörst du alles (Archet 2026-11-23); hat die Kampagne eine Fassung der Begrüßung für das
  offene Mikro, nimm die.
- **Zuschauer:** Wer im Kanal ist, aber nicht in `party playing` steht, kommt mit `spectator: true` in die Züge. Er
  spielt keinen Helden, auch wenn eine alte Verknüpfung einen nennt; seine Worte sind Regie oder Geplauder, kein Zug.
- **Der Auftrag beschreibt die Lage, er ordnet nichts vorab ein.** Schreib nicht „das Videospiel ist Geplauder“: Ein
  Entschluss fiel mitten im Videospiel-Gerede („ich bau eine Bombe und mach Harakiri“) und wurde als Scherz übergangen.
  Nenne, worauf du wartest, und lass die Regeln des Zuhörers entscheiden.
- **Bleibt es still, schau ins Log.** Sagen die Spieler, sie hätten längst gesagt, was sie tun, lies `table_state` mit
  `log` und handle nach dem, was dort steht, statt auf den nächsten Zuhörer zu warten.
- **Der Tisch stimmt den Zuhörer selbst** (Denny 2026-11-19: „listener config müsste man während dem game anpassen
  können“). Sagt jemand, der Zuhörer soll etwas anders machen („Fragen nach der Welt müssen durch“, „Lachen nie“),
  oder hat er etwas verpasst, das die Runde gebraucht hätte: die Regel in einem kurzen Satz zu den Regeln des Tischs
  (`campaign set listener_rules`, die ganze Liste; `campaign` zeigt sie unter `listenerRules`). Der Zuhörer bekommt sie
  mit jedem Wächter, sie gelten ab dem nächsten Zug; kein neuer Zuhörer nötig. Kurz bestätigen, was du dir gemerkt
  hast; ein Feld dafür gibt es im Studio nicht.
