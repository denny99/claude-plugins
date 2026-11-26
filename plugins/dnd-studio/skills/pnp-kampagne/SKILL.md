---
name: pnp-kampagne
description: 'Baut in D&D Studio (MCP-Server dnd-studio) eine spielfertige Pen-and-Paper-Kampagne oder ein Abenteuer, von der Idee bis zum Spielabend – Zusammenfassung, NPCs mit Porträt und Stimme, Orte mit Karten, Szenen mit Bild, Vorlesetexte, Würfe, Klänge und Musik je Stimmung aus dem Studio und ein Leitfaden für die KI-Spielleitung. Verwenden, sobald jemand ein Abenteuer, eine Kampagne, ein One-Shot, ein Solo-Abenteuer oder ein Testabenteuer für den Studio-Spieltisch anlegen, ausbauen, umbauen, prüfen oder „spielfertig machen“ will, auch wenn nur grob („bau mir was Kleines im Breeland für heute Abend“, „mach aus der Idee eine Kampagne“, „ergänz NPCs und Szenen“, „bau das nächste Kapitel nach dem letzten Abend“). Auch für Karten mit Orts-Pins, Handouts und Bögen der Helden, Stimmen und Vorlesetexte vorab und das Review vor dem Spielabend. Grenzen: einen Abend am Tisch vorbereiten und leiten: Skill pnp-spielleiter; eine Welt von Grund auf entwerfen: pnp-weltenbau; die Lore einer Welt pflegen: pnp-lore.'
---

# Eine Kampagne in D&D Studio bauen

Ziel ist nicht ein schöner Text, sondern ein **Abend, der läuft**: Eine KI-Spielleitung (Skill `pnp-spielleiter`) oder
ein Mensch soll die Kampagne ohne Nachfragen leiten können, mit Bild, Stimme und Würfeln, und die Spieler hören sie,
statt mitzulesen. Die Regeln kommen aus echten Spielabenden und gelten für jeden Tisch, sofern der Leitfaden der
Kampagne nichts anderes sagt. „Der Mensch“ ist, wer an diesem Rechner mit dir im Chat schreibt.

Du bist der **Erbauer**: Du klärst, koordinierst und prüfst, die Arbeit machen die Agents des Plugins. Die
Einzelheiten stehen in den Verweisen, die du nur liest, wenn du selbst etwas schreibst, und deren Pfad du den Agents
im Auftrag nennst:
- `references/szenen-und-texte.md`: Umfang, Orte, NPCs, die Felder einer Szene, Vorlesetexte, Handouts, Leitfaden.
- `references/bild-und-klang.md`: Stimmen, Bilder, Karten, Klang und Musik, Schleifen, Effekte der Welt.
- `references/sprechen.md` (gm_guide `sprechen`): Texte, die eine Stimme vorliest, und die Aussprache.

Schreibweise: `campaign set`, `map new`, `party sheet`, `results get` meinen das Werkzeug (`campaign`, `map` …) mit
`action: "set"` usw.; die Werkzeuge des MCP-Servers heißen in Claude Code `mcp__plugin_dnd-studio_dnd-studio__<werkzeug>`.

## Klären, bevor gebaut wird

**Eigene Tisch-Regeln:** Liegt im Arbeitsordner dieser Sitzung eine Datei `pnp-regeln.md` (Lehren aus früheren
Nachbesprechungen und Bauten an diesem Rechner), lies sie zu Beginn; sie ergänzt diesen Skill und geht ihm bei
Widerspruch vor.

Kurz fragen, was fehlt (nicht alles auf einmal, sinnvolle Vorgaben vorschlagen):
- Spielsystem (`The One Ring`, `d20`, `other`) und Sprache (Deutsch/Englisch).
- Umfang: One-Shot (1 Abend), Solo für einen Helden, oder Kampagne über mehrere Abende; wie lang ein Abend ist.
- Welche Helden spielen (`party` lesen: Namen, Bögen, Fertigkeiten). Das Abenteuer soll **jedem** Helden einen eigenen
  Weg geben, der zu seinen Stärken passt.
- Ton (gemütlich, düster, Horror), Ort und Zeit, was auf keinen Fall vorkommen soll.
- **Der Rahmen:** wie tödlich (Helden können sterben, oder Fallen heißt bewusstlos, gefangen, verwundet) und wie hart
  Misserfolge sind (großzügig: schwerer, nie aussichtslos / echt: Pläne scheitern). Die Härte gilt für Misserfolge,
  nicht für Kämpfe: Kämpfe sind bei jeder Härte gefährlich, Gegner weichen nicht beim ersten Erfolg. Tödlichkeit, Härte
  und Grenzen werden hier entschieden, stehen im Leitfaden unter Rahmen und gelten für die ganze Kampagne; die
  Spielleitung fragt sie am Abend nicht mehr, weil das Setting sie vorgibt. Fehlt etwas davon bei einer bestehenden
  Kampagne im Leitfaden, beim Ausbau fragen.
- In welcher Welt spielt sie? Die Lore einer Welt liegt im Wissens-Vault des Studios (Werkzeug `lore`, Skill
  `pnp-lore`); `lore map` zeigt die Welten. Eine neue Kampagne in einer bestehenden Welt bindet `campaign set` mit
  `world`, Architekt und Texter lesen die Lore mit `lore search`. Eine eigene Welt von Grund auf: erst Skill
  `pnp-weltenbau`. Hat der Mensch zusätzlich einen eigenen Obsidian-Vault, steht sein Ordner im Profil
  (`studio_status` → `vault`; setzen mit `profile edit vault`), und `dnd-studio:pnp-lore` gleicht auch ihn ab, nach
  seinen Regeln; ohne ihn steht die Welt allein im Studio (Lore, `campaign`, Kanon).

`studio_status` zeigt das offene Profil; alles entsteht dort. Wo eine Kampagne schon existiert: `campaign` lesen und
ausbauen statt neu anlegen.

## Wer was baut

Feste Agents statt allgemeiner: Modell, Werkzeuge und Regeln stehen in ihrer Agent-Datei, der Auftrag nennt nur
Kampagne, Dateien (Bauplan, die passenden Verweise oben mit vollem Pfad) und Protokoll-Pfad. Agent-Tool mit diesem
`subagent_type`, immer mit dem Präfix `dnd-studio:`:

| Schritt | Agent | Modell |
|---|---|---|
| Lore der Welt auf Stand (nur Geändertes; ein eigener Obsidian-Vault mit) | `dnd-studio:pnp-lore` | Sonnet |
| Bauplan | `dnd-studio:pnp-architekt` | Opus |
| Szenen, Texte, NPCs, Orte, Leitfaden | `dnd-studio:pnp-texter` | Opus |
| Bilder und Karten | `dnd-studio:pnp-maler` | Sonnet |
| Klänge machen, prüfen, binden | `dnd-studio:pnp-klang` | Sonnet |
| Stimmen vorab (`prepare_table`) | `dnd-studio:pnp-tischbereit` | Haiku |
| Review | `dnd-studio:pnp-review-technik`, `-konsistenz`, `-spielbarkeit` | Sonnet |
| Mängel beheben | `dnd-studio:pnp-nachbesserer` | Sonnet |

Was die GPU braucht (Maler, Klang, Tischbereit, Bild-Edits des Nachbesserers), läuft nacheinander, nicht
gleichzeitig: sonst laufen Stimmen in Timeouts. Fehlt ein Agent (das Plugin ist nicht oder zu alt installiert), sagst
du das dem Menschen (Plugin `dnd-studio` aktualisieren). Beim Bau, nie am Tisch, darf dann ein allgemeiner Agent die
Aufgabe bekommen, mit `model` wie in der Tabelle und den Regeln der Agent-Datei im Auftrag.

## Ablauf

1. Klären (oben), bei einer bestehenden Welt oder Fortsetzung `pnp-lore` auf Stand bringen.
2. **Bauplan:** `pnp-architekt` entwirft ihn; der Mensch segnet ihn ab.
3. **Gerüst:** Kampagne anlegen, `pnp-texter` schreibt Orte, NPCs, Szenen, Vorlesetexte und Leitfaden.
4. **Stimmen** setzt du selbst.
5. **Bilder, Karten, Klang:** `pnp-maler`, dann `pnp-klang`.
6. **Abnahme**, dann `prepare_table` über `pnp-tischbereit` (die Technik prüft seine Antwort).
7. **Review und Nachbessern** in der festen Schleife.
8. **`prepare_table` ein zweites Mal** nach der letzten Nachbesserung, wenn sie Vorlesetexte, NPC-Worte, Aussprachen,
   Stimmen oder Bilder geändert hat (der Nachbesserer vermerkt es): Erst dieser Lauf macht den Stand, der am Abend
   klingt.
9. Bericht an den Menschen.

## Bauplan

Vor dem Bauen entwirft `dnd-studio:pnp-architekt` aus den Antworten beim Klären, der Gruppe und (bei einer
Fortsetzung) dem Kanon einen Bauplan: Szenen mit den Wegen der Helden, Orte und Karten mit den Plätzen der Marker,
NPCs, Zeitplan. Der Auftrag nennt die Antworten, ob der Mensch mitspielt, den Pfad von
`references/szenen-und-texte.md` und den Pfad der Plan-Datei im Scratchpad. Der Mensch segnet den Plan ab (spielt er
mit, nur Zahlen und Rahmen), dann wird nach dem Plan gebaut. Am wichtigsten beim Umfang: lieber mehr Strecke als mehr
Verzweigungen (`references/szenen-und-texte.md`, „Umfang“).

## Gerüst: Kampagne, Texte, Leitfaden

Text zuerst, Bilder später.
1. `campaign new` immer mit `language` (`"German"`, nur auf Wunsch `"English"`; ohne nimmt das Studio `"German"`),
   dann `campaign set`: `about` (Setting, Zeit, Geschichte in 1–3 Absätzen, Stimmung), `language`, `game`, `narrator`
   (Erzählerstimme in Worten, englisch beschrieben, mit Sprache am Ende: „a calm, warm narrator …, German“). Ist das
   Spiel umgedeutet (Der Eine Ring im Ödland), bekommen die Sonderseiten der Würfel eigene Namen und Zeichen:
   `dice_faces` (die Rune als Atom-Symbol ⚛, das Auge als Totenkopf 💀); die Regeln bleiben.
2. `dnd-studio:pnp-texter` mit Bauplan, `references/szenen-und-texte.md` und `references/sprechen.md` im Auftrag.
   Kurz, was er liefert:
   - **Szenen** mit jeder Angabe in ihrem Feld: `text` (Vorlesetext, nur Erzählerstimme), `goal`, `setup`, `markers`
     (Startfelder), `rolls`, `secret`, und in `notes` das Rezept (Lage, Erfolg und Misserfolg, Wege der Helden, was
     ohne sie geschieht), ohne zu wiederholen, was in den anderen Feldern steht; `variants` nur, wo ein Text sonst
     falsch wäre.
   - **Vorlesetexte:** Begrüßung (`variants` für Sprechknöpfe und Push-to-Talk), bei neuer Kampagne der Prolog, bei vorgefertigten
     Helden ihre Vorstellung, Kapitelanfang und -ende, die festen ersten Worte der NPCs in deren Stimme. Vorbereitet
     wird nur, was vorgelesen wird; den Rest improvisiert die Spielleitung.
   - **Handouts** (mit Geheimnis: zum Flüstern, je Held eines) und die **Bögen** vorgefertigter Helden.
   - **Leitfaden** „So leitest du …“ mit Rahmen, Plan des Gegners, einem Vorrat zum Improvisieren und, wo es Zeiten
     gibt, der Uhr-Tabelle; dazu die Seite „Vor dem Abend vorbereiten“.
3. Danach `campaign` mit `overview: true`: `brokenReferences` muss leer sein (Erwähnungen ohne Eintrag reparieren).

**Weiterspielen und Ausbauen einer gespielten Kampagne:** Was an den Abenden festgelegt wurde, steht im Kanon
(`campaign`, Liste `canon`; der Chronist der Spielleitung schreibt ihn mit `set_campaign_entry kind canon`). Neue
Szenen, Texte und NPCs bauen darauf auf und widersprechen ihm nicht (Preise, Versprechen, wer was weiß, der Stand der
Helden). Kanon-Einträge sind Tatsachen vom Tisch, kein Bauplan: nicht umschreiben, nur den, der durch den Umbau
wirklich nicht mehr gilt, mit `remove` wegnehmen. Die offenen Fäden und wo die Gruppe steht, setzt `campaign set` mit
`threads` (ersetzt die Liste; was fehlt, gilt als gelöst) und `party_at` (ein Ortsname): bei einem neuen Kapitel die
Fäden, mit denen es beginnt, und den Ort, an dem der Abend anfängt.

## Stimmen

`set_voice` für Erzähler und jeden sprechenden NPC, alle in einem Aufruf (`voices: [{who, from, description}, …]`).
Jede sprechende Figur braucht eine eigene Stimmprobe, die du oder der Mensch anhört, bevor gespielt wird. Dazu die
Aussprache aller erfundenen Namen (`campaign set pronunciations`) und, nur wenn die Kampagne es will, Effekte je Stimme
(`voice_effect`). Einzelheiten: `references/bild-und-klang.md`, „Stimmen“, und `references/sprechen.md`.

## Bilder, Karten, Klang

Die langsamen Teile, gesammelt, erst wenn der Text steht. `dnd-studio:pnp-maler` bekommt die Bilder und Karten aus
dem Protokoll des Texters, `dnd-studio:pnp-klang` danach die Klangliste, beide mit `references/bild-und-klang.md` im
Auftrag. Worauf es ankommt:
- Jede Szene hat ein Bild, jeder sprechende NPC ein Porträt; neue Motive mit Krea 2, bekannte Orte als Edit ihres
  alten Bildes. Zeigt ein Bild einen Helden oder einen NPC mit Porträt: erst Krea 2 für die Szene, danach ein
  FLUX-Edit mit dem Krea-Bild als Basis, der die Figuren mit ihren Porträts hineinsetzt (`person`); nie nur das
  Krea-Bild, sonst sehen die Figuren am Tisch anders aus als ihre Porträts.
- Eine Kampagnenkarte mit allen Orten und eine Karte je wichtigem Ort; Marker statt aufgemalter Namen, jeder Marker auf
  dem, was das Bild an der Stelle zeigt.
- Klänge macht das Studio (`make_sound`), geprüft mit `check_sound`; Musik je Stimmung als Rückfall, jede Szene ihre
  eigene, jeder Kampfort seine Kampfmusik; Schleifen für die wichtigen Szenen; Effekte der Welt, wo sie die Welt
  besonders machen.

## Abnahme

Gehe den Abend im Kopf einmal als Spielleitung durch. Was zählbar ist, zeigt der **Abnahme-Check im D&D-Panel** (Tab
Bau) mit dem Agenten, der eine Lücke behebt; ohne Panel liest du `campaign` mit `overview: true`. Darüber hinaus prüfst
du nur, was kein Reviewer sieht: Passt der Bau zum abgesegneten Plan und zum Rahmen, und hast du die Stimmproben
gehört? Dann `prepare_table` über `dnd-studio:pnp-tischbereit` (ein Job je Kapitel oder Abend, nicht die ganze
Kampagne; nach den Bildern, nicht gleichzeitig). Die vollständige Prüfung macht das Review.

## Review und Nachbessern

Wer gebaut hat, übersieht die eigenen Lücken. Darum prüfen nach der Abnahme **drei Reviewer** in frischem Kontext,
gleichzeitig, jeder mit seinem Fachbereich und seiner vollständigen Prüfliste in der Agent-Datei, nur lesend:
- `dnd-studio:pnp-review-technik`: Ist alles da und läuft es (Bilder, Karten, Marker, Stimmen, Klänge, Felder)?
- `dnd-studio:pnp-review-konsistenz`: Stimmt es (Regeln, Namen, Bilder, Stimmbeschreibungen, Texte zum Sprechen,
  Spoiler, Privates)?
- `dnd-studio:pnp-review-spielbarkeit`: Trägt der Abend (Umfang, Wege, Haken, Plan des Gegners, Vorrat, Kanon)?

Der Auftrag nennt die Kampagne, ob der Mensch mitspielt, die gewünschte Länge, den Pfad der Mängel-Datei, die Pfade
der Verweise und, für die Technik, die letzte Antwort von `prepare_table` (`done`, `made`, `total`, `failed`): Die
Reviewer rufen es nicht selbst auf. Stimmen hören können sie nicht: die Probe hört der Erbauer oder der Mensch, die
Reviewer prüfen die Beschreibung. Fehlen die Agents, bekommt ein allgemeiner Agent die Prüfliste seines Bereichs und
nur lesende Werkzeuge.

**Die feste Schleife** (frei laufende Runden brachten dreimal rund 30 Mängel, weil Stichproben gelesen, Fixes neue
Fehler machten und Offenes niemandem gehörte):
1. **Erstprüfung**, die drei gleichzeitig, jeder liest seinen Bereich **ganz** und listet unter „Geprüft“ und „Nicht
   geprüft“, was er gelesen hat. Ist die Kampagne zu groß für einen (ein Kapitel mit 15+ Szenen), teilst du nach Abend
   oder Kapitel und startest je Teil einen Reviewer. Jeder Mangel hat eine ID und nennt alle Fundstellen.
2. **Nachbesserung:** `dnd-studio:pnp-nachbesserer` bekommt die Mängel-Dateien, ersetzt statt anzuhängen, ändert eine
   Tatsache an allen Fundstellen, liest jeden Fix nach und gibt jedem Mangel, den er nicht selbst behebt, genau eine
   Kategorie (`an Maler`, `an Klang`, `Mensch`, `bleibt`, `falsch gemeldet`).
3. **Folgeaufträge erledigen, bevor geprüft wird:** alle Zeilen `an Maler` gesammelt an `pnp-maler`, alle `an Klang`
   an `pnp-klang`, die Fragen `Mensch` an den Menschen (spielt er mit: nur, was ohne Spoiler geht, sonst entscheidest
   du), und warten, bis alles fertig ist. Sonst meldet die nächste Runde dieselben Punkte wieder.
4. **Nachprüfung**, nur die Reviewer, die etwas gefunden hatten, mit ihrer letzten Mängel-Datei und dem Protokoll des
   Nachbesserers: jeden Mangel und jeden geänderten Eintrag ganz; Neues außerhalb davon nur, wenn es den Abend bricht.
5. Schritte 2–4 **höchstens zweimal** nach der Erstprüfung. Ist eine Nachprüfung nicht deutlich kleiner als die Runde
   davor (weniger als halb so viele Mängel), stimmt etwas am Ablauf: Sieh dir an, woher die Mängel kommen (Fix-Fehler,
   ungeprüft offen, übersehen), statt eine weitere Runde zu starten.

Danach der zweite Lauf von `prepare_table` (Ablauf, Schritt 8).

**Was als erledigt gilt:** Text, Regeln, Logik, Kanon, Spoiler, Hinweise, Stimmen, Klänge und fehlende Bilder müssen
stimmen, möglichst fehlerfrei. **Kosmetisches an Bildern** (ein Licht zu viel, ein Detail der Karte fehlt, eine leichte
Naht) wird nach zwei Versuchen nicht mehr gejagt, sondern als `bleibt` gelistet: Jedes Nachmalen bringt eigene neue
Fehler. Was am Ende offen bleibt, bekommt der Mensch als Liste.

**Spielt der Mensch selbst mit, bleibt alles spoilerfrei:** Erbauer und Reviewer arbeiten in eigenen Agenten, Mängel
stehen nur in den Dateien, und an den Menschen gehen nur Zahlen (Szenen, Orte, NPCs, Mängel je Bereich und Runde), nie
Plot, Geheimnisse oder Gegner. Was die Spieler ohnehin sehen sollen (die Vorstellung der vorgefertigten Helden), darf
in den Bericht.

Dem Menschen am Ende kurz sagen, was steht, was fehlt (z. B. „Karten nicht gemalt, GPU war belegt“) und wie man
startet. Für Weitergabe: `campaign export`.

## Sparsam mit Tokens

Bilder prüfen und eine Stunde Ausbau kosteten einmal rund 3 Millionen Tokens. Das gilt für dich und jeden Agenten:
- `campaign` erst mit `overview: true`, dann nur mit `only` und `names` lesen; die ganze Kampagne ist die größte
  Antwort der Werkzeuge. Bei einer großen Kampagne die Übersicht mit `chapter` (und `evening`) auf das Kapitel
  begrenzen, an dem gebaut wird: Sonst zählt sie die großen Listen nur (`truncated`), und die Zeilen fehlen. Abende
  heißen mit ihrer Nummer über die ganze Kampagne („Abend 4“); die alten Bezeichnungen (A, B) gehen weiter. `results
  list` mit `name` und `brief`, `settings` ohne `available`, Karten-Plan mit `map list`, `map` und `pictures: false`.
- Viele Bilder ansehen: je 12–16 auf einen Kontaktbogen (`results sheet`), groß (`results get`) nur die Verdächtigen.
- Jobs eines Stapels in einem `jobs watch` bündeln (im Hintergrund; ein Agent: `background: false`, im Vordergrund)
  statt `jobs wait` alle 50 s, und zwischen den Wartezeiten nichts anderes lesen: Jede Runde schickt den ganzen Kontext
  neu.
- Vor einem langen Agenten mit einem Probeaufruf prüfen, ob sein Weg geht (ist die Ergebnisliste überhaupt gefüllt?).
- **Jeden Eintrag einmal schreiben:** alles zu einem Eintrag sammeln, dann ein `set_campaign_entry` mit allen Feldern;
  viele Einträge in einem Aufruf mit `entries`. Jeder Aufruf ist eine volle Runde.
- **Listen statt Einzelaufrufe:** Fast jedes Werkzeug nimmt mehrere Dinge auf einmal (`pin_place pins`, `set_picture
  pictures`, `set_voice voices`, `write_text texts`, `party set players`, `map plan patches`, `paint_map tiles`,
  `picture`/`picture_tool pictures`, `make_3d`/`model_tool models`, `make_sound sounds`, `add_file paths`, `results get
  ids`). Ein Feld neben der Liste gilt für jeden Eintrag; ein Fehler hält den Rest nicht auf (`failed`, je Eintrag
  `error`). Job-Werkzeuge geben alle `job_ids` zurück: die in einem `jobs watch` abwarten. Braucht ein Aufruf länger
  als 25 s zum Vorbereiten, kommt statt der Jobs eine Aufruf-ID (`call-…`): sie steht für alle seine Jobs.
- **Lange Agenten geben ab:** Die Bau-Agenten hören nach etwa 60 Werkzeugaufrufen oder bei großem Kontext auf,
  schreiben ihr Protokoll vollständig (fertig, offen, welche Einträge) und melden die Zahlen. Den Rest bekommt ein
  frischer Agent mit dem Protokoll im Auftrag, nicht derselbe zurück (sein ganzer Kontext würde bei jedem Schritt neu
  gelesen).
- Mechanische Arbeit (aufräumen, zählen) auf einem kleinen Modell. Prüfen nur, was sich geändert hat; ab Runde 2 nur
  die offenen Punkte.
