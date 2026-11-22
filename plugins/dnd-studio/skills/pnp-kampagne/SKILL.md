---
name: pnp-kampagne
description: 'Baut in D&D Studio (MCP-Server dnd-studio) eine spielfertige Pen-and-Paper-Kampagne oder ein Abenteuer, von der Idee bis zum Spielabend – Zusammenfassung, NPCs mit Porträt, Stimme und Standardsätzen, Orte mit Karten, Szenen mit Bild, Vorlesetexte, Würfe, Klänge und Musik je Stimmung aus dem Studio und ein Leitfaden für die KI-Spielleitung. Verwenden, sobald jemand ein Abenteuer, eine Kampagne, ein One-Shot, ein Solo-Abenteuer oder ein Testabenteuer für den Studio-Spieltisch anlegen, ausbauen, umbauen oder „spielfertig machen“ will, auch wenn nur grob („bau mir was Kleines im Breeland für heute Abend“, „mach aus der Idee eine Kampagne“, „ergänz NPCs und Szenen“, „bau das nächste Kapitel nach dem letzten Abend“). Auch für Karten mit Orts-Pins, Handouts und Bögen der Helden, Stimmen und Standardsätze vorab und das Review vor dem Spielabend. Einen Abend leiten: Skill pnp-spielleiter.'
---

# Eine Kampagne in D&D Studio bauen

Ziel ist nicht ein schöner Text, sondern ein **Abend, der läuft**: Eine KI-Spielleitung (Skill `pnp-spielleiter`) oder
ein Mensch soll die Kampagne ohne Nachfragen leiten können, mit Bild, Stimme und Würfeln, und die Spieler hören sie,
statt mitzulesen. Jede Entscheidung unten dient diesem Abend. Die Regeln mit Datum und Zitat sind Lehren aus echten
Spielabenden mit Denny; das Zitat sagt, warum die Regel gilt. Zitate sind Anlässe, nicht Vorlieben einer Person: Die
Regeln gelten für jeden Tisch, sofern der Leitfaden der Kampagne nichts anderes sagt. „Der Mensch“ ist, wer an diesem
Rechner mit dir im Chat schreibt.

Schreibweise: `campaign set`, `map new`, `party sheet`, `results get` meinen das Werkzeug (`campaign`, `map` …) mit
`action: "set"` usw.; die Werkzeuge des MCP-Servers heißen in Claude Code `mcp__plugin_dnd-studio_dnd-studio__<werkzeug>`.

## 0. Klären, bevor gebaut wird

**Eigene Tisch-Regeln:** Liegt im Arbeitsordner dieser Sitzung eine Datei `pnp-regeln.md` (Lehren aus früheren
Nachbesprechungen und Bauten an diesem Rechner), lies sie zu Beginn; sie ergänzt diesen Skill und geht ihm bei
Widerspruch vor.

Kurz fragen, was fehlt (nicht alles auf einmal, sinnvolle Vorgaben vorschlagen):
- Spielsystem (`The One Ring`, `d20`, `other`) und Sprache (Deutsch/Englisch).
- Umfang: One-Shot (1 Abend, 3–5 Szenen), Solo für einen Helden, oder Kampagne über mehrere Abende.
- Welche Helden spielen (`party` lesen: Namen, Bögen, Fertigkeiten). Das Abenteuer soll **jedem** Helden einen eigenen
  Weg geben, der zu seinen Stärken passt.
- Ton (gemütlich, düster, Horror), Ort und Zeit, was auf keinen Fall vorkommen soll.
- Wie tödlich (Helden können sterben, oder Fallen heißt bewusstlos, gefangen, verwundet), wie hart Misserfolge sind
  (großzügig: schwerer, nie aussichtslos / echt: Pläne scheitern, Kämpfe finden statt) und wie lang ein Abend ist.
  Tödlichkeit, Härte und Grenzen werden hier beim Aufsetzen entschieden, stehen im Leitfaden unter Rahmen und gelten
  für die ganze Kampagne; die Spielleitung fragt sie am Abend nicht mehr (Denny 2026-11-13: „das Setting gibt das
  vor“). Fehlt etwas davon bei einer bestehenden Kampagne im Leitfaden, beim Ausbau fragen.
- In welcher Welt spielt sie? Die Lore einer Welt liegt im Wissens-Vault des Studios (Werkzeug `lore`, Skill
  `pnp-lore`); `lore map` zeigt die Welten. Eine neue Kampagne in einer bestehenden Welt bindet `campaign set` mit `world`,
  Architekt und Texter lesen die Lore mit `lore search`. Eine eigene Welt von Grund auf: erst Skill `pnp-weltenbau`.
  Hat der Mensch zusätzlich einen eigenen Obsidian-Vault, steht sein Ordner im Profil (`studio_status` →
  `vault`; setzen mit `profile edit vault`), und `dnd-studio:pnp-lore` gleicht auch ihn ab, nach seinen Regeln; ohne ihn steht die Welt allein im Studio (Lore, `campaign`, Kanon).

`studio_status` zeigt das offene Profil; alles entsteht dort. Wo eine Kampagne schon existiert: `campaign` lesen und
ausbauen statt neu anlegen.

**Wer was baut** (Denny 2026-11-13: feste Agents statt allgemeiner; Modell, Werkzeuge und Regeln stehen in ihrer
Agent-Datei, der Auftrag nennt nur Kampagne, Dateien und Protokoll-Pfad). Der Erbauer koordiniert und schreibt
selbst wenig; die Arbeit machen die Agents des Plugins (Agent-Tool mit diesem `subagent_type`, immer mit dem Präfix
`dnd-studio:`):

| Schritt | Agent | Modell |
|---|---|---|
| Lore der Welt auf Stand (nur Geändertes; ein eigener Obsidian-Vault mit) | `dnd-studio:pnp-lore` | Sonnet |
| Bauplan | `dnd-studio:pnp-architekt` | Opus |
| Szenen, Texte, NPCs, Orte, Leitfaden | `dnd-studio:pnp-texter` | Opus |
| Bilder und Karten | `dnd-studio:pnp-maler` | Sonnet |
| Klänge suchen, prüfen, binden | `dnd-studio:pnp-klang` | Sonnet |
| Stimmen vorab (`prepare_table`) | `dnd-studio:pnp-tischbereit` | Haiku |
| Review | `dnd-studio:pnp-review-technik`, `-konsistenz`, `-spielbarkeit` | Sonnet |
| Mängel beheben | `dnd-studio:pnp-nachbesserer` | Sonnet |

Wie der Bau Tokens spart (lesen, bündeln, Agenten abgeben lassen): Abschnitt 6. Was die GPU braucht (Maler,
Tischbereit, Bild-Edits des Nachbesserers), läuft nacheinander, nicht gleichzeitig: sonst
laufen Stimmen in Timeouts. Fehlt ein Agent (das Plugin ist nicht oder zu alt installiert), sagst du das dem Menschen
(Plugin `dnd-studio` aktualisieren). Beim Bau, nie am Tisch, darf dann ein allgemeiner Agent die Aufgabe bekommen, mit
`model` wie in der Tabelle und den Regeln der Agent-Datei im Auftrag.

## 1. Gerüst (Text zuerst, Bilder später)

Vor dem Bauen entwirft der Agent `dnd-studio:pnp-architekt` aus den Antworten von Abschnitt 0, der Gruppe und (bei einer
Fortsetzung) dem Kanon einen Bauplan: Szenen mit den Wegen der Helden, Orte und Karten mit den Plätzen der Marker,
NPCs, Zeitplan (Agent-Tool mit `subagent_type: "dnd-studio:pnp-architekt"`; der Auftrag nennt die Antworten aus 0, ob der Mensch
mitspielt, und den Pfad der Plan-Datei im Scratchpad). Der Mensch segnet ihn ab (spielt er mit, nur Zahlen und
Rahmen), dann wird nach dem Plan gebaut.

1. `campaign new` immer mit `language` (`"German"`, nur auf Wunsch `"English"`; ohne nimmt das Studio `"German"`), dann `campaign set`: `about` (Setting, Zeit, Geschichte in 1–3 Absätzen, Stimmung), `language`,
   `game`, `narrator` (Erzählerstimme in Worten, englisch beschrieben, mit Sprache am Ende: „a calm, warm narrator …,
   German“). Ist das Spiel umgedeutet (Der Eine Ring im Ödland), bekommen die Sonderseiten der Würfel eigene Namen und
   Zeichen: `dice_faces` (Ödland 2026-10-30: die Rune als Atom-Symbol ⚛, das Auge als Totenkopf 💀); die Regeln bleiben.
2. **Orte** (`set_campaign_entry kind place`): `text` = was die Spieler dort erleben, `notes` = was nur die Spielleitung
   weiß (Geheimnisse, welche Szene hier spielt). Orte, die in anderen liegen, mit `in`.
3. **NPCs** (`kind npc`):
   - `looks`: **englisch**, nur Sichtbares (Alter, Statur, Gesicht, Kleidung, ein Gegenstand) – daraus werden Porträts.
   - `sheet`: wer sie sind, was sie wissen und wollen, wie sie reden, was sie verschweigen. Daraus spielt die
     Spielleitung sie; Lücken hier werden am Tisch zu erfundenem Unsinn.
   - `voice`: englisch, hörbar beschrieben (Alter, Stimmlage, Tempo, Eigenheit, „German“ am Ende). Jugendliche
     ausdrücklich nicht kindlich beschreiben, sonst macht die Stimmerzeugung ein Kleinkind daraus (Ödland 2026-10-30:
     „a young girl of fourteen …“ klang wie eine Vierjährige; „a teenage girl of fifteen, clear mid-pitched voice, not
     childish, already sounds almost grown-up“ passte). Nach `set_voice` eine Probe anhören, bevor gespielt wird.
   - `notes`: Werte (Kreaturen), Würfe, was sie geben, Geräusch-Dateien. Jedes Wesen, das auftreten kann, bekommt ein
     eigenes Bild; ein gefährliches dazu, wie es sich ankündigt (Spur, Laut, Geruch), bevor es zu sehen ist. Wesen ohne Sprache: „spricht nicht, nur
     Geräusche“ hineinschreiben. Gegner: Werte passend zur Gruppe (an `party` messen, solo deutlich schwächer) und
     ihre **Moral**: wann sie fliehen oder sich ergeben („die Wölfe fliehen, wenn der Graue fällt“), und ob sie
     überhaupt verhandeln („die Brut redet nicht“). Nicht jeder Gegner ist mit Worten zu gewinnen.
   - `place`: wo man sie trifft.
4. **Szenen** (`kind scene`, in Spielreihenfolge, `position`): `text` = Vorlesetext (3–5 Sätze, gesprochen klingend,
   endet mit einem Haken: einer Frage, einem Geräusch, einer Person, die etwas will). `notes` = **das Rezept für die
   Spielleitung**: Ziel der Szene, welche Würfe (Fertigkeit + ZW der Eigenschaft bzw. DC), was Erfolg und Misserfolg
   bedeuten (so hart, wie der Rahmen sagt), wer hier welchen Weg hat. `variants` für Enden, die vom Spielverlauf
   abhängen. Spielt die Szene auf einer Karte, gehören die **Startfelder** ins Feld `markers`
   der Szene (`[{who, at}]`): wo die Helden ankommen (`who: "Helden"`) und wo die NPCs stehen, als Feld `gx,gy` des
   Kartenplans oder, auf einer Karte mit Orts-Markern, als Ortsname (`at: "Kesselheim"`). Das Studio setzt sie beim
   Szenenstart selbst auf die Karte, und `brokenReferences` meldet, was nicht passt (Name, Ort ohne Pin, Feld in einer
   Wand). Nicht als Freitext in die Notizen.
   - **Der Szenentext ist Erzählerstimme, nichts anderes.** Wörtliche Rede eines NPCs mit Stimme gehört nicht hinein:
     der Text endet vor ihr („… kommt eine heisere, kleine Stimme.“), und die Worte stehen als eigener Vorlesetext in
     der Stimme des NPCs bereit (Punkt 5). Sonst liest der Erzähler Miras Satz mit seiner tiefen Stimme vor (Spieltest
     2026-10-29).
   - **Kein Stand voraussetzen, den der Spieler ändern kann.** Ein Text, der Hannas Laterne in der Hand des Helden
     beschreibt, passt nicht mehr, wenn er sie nie bekommen hat (Spieltest 2026-10-29). Neutral schreiben („dein
     Licht“), oder den Fall als `variants` mit `when` anlegen.
   - **Drei Wege zu jedem wichtigen Hinweis.** Was die Helden wissen müssen, um weiterzukommen, ist auf mindestens drei
     Arten zu finden (ein NPC weiß es, eine Spur zeigt es, ein Fundstück verrät es). Hängt die Geschichte an einem
     einzigen Wurf, bleibt der Abend stecken, sobald er scheitert.
   - **Was, wenn sie es auslassen?** Ein Satz, wo der wichtige Inhalt in der Welt sonst noch zu finden ist (nicht als
     Zufall, der sie zurückholt) oder was ohne die Helden geschieht, und ob die Szene kürzbar ist, wenn die Zeit knapp
     wird.
   - **Erfolgsstufen im Rezept:** Wichtige Proben bekommen neben Erfolg und Misserfolg je eine Zeile für den großen
     Erfolg (welcher Bonus in der Welt) und für das Schiefgehen bei einem Wurf weit drunter oder einem Patzer (Stufen:
     `pnp-spielleiter`, 5). Dann muss die Spielleitung am Tisch nicht erfinden.
   - **Lage statt Weg.** Eine Szene beschreibt eine Lage, die die Helden antreffen (wer will was, was passiert ohne
     sie), nicht den Weg, den sie gehen sollen. Keine Köder, die nur dazu da sind, die Gruppe zurück aufs Rezept zu
     ziehen. Was ein Held tun könnte, steht als Möglichkeit in den Notizen, nicht als Auslöser, der ihn dazu bringt
     (warum: `pnp-spielleiter` 4a, „Die Spieler entscheiden“).
   - **Reisen mit Leben:** Jede Reise zwischen Szenen bekommt im Rezept ein, zwei Details am Weg und, wo die Lage
     Zeit lässt, eine Reise-Lage oder einen Verweis auf den Vorrat (Zeichen, Begegnung, Wurf, Bild). Reisen unter
     Zeitdruck bekommen keine Nebenorte, höchstens eine kurze Gefahr, die den Druck verschärft; nichts, was von der
     Mission wegführt.
   - **Kämpfe, die stattfinden.** So viele Begegnungen, die sich nicht wegreden lassen (Gegner ohne Verhandlung, ein
     Hinterhalt, eine Bestie), wie Ton und Rahmen verlangen (Ödland: zwei, drei je Abend, weil die Gruppe in Kapitel 2
     fast jeden Kampf umging), und bei den übrigen, was Ausweichen kostet (ein Wurf, Zeit, ein Gegenstand, ein
     Verbündeter).
   - **Haken der Helden:** Jeder Held bekommt irgendwo einen Haken aus seinem Hintergrund (eine Bekannte, ein altes
     Versprechen, sein Volk), nicht nur einen Wurf, der zu seinen Fertigkeiten passt.
5. **Vorlesetexte** (`kind text`, auch die Szenentexte): zwei, drei konkrete Sinnesdetails (Geruch, Geräusch, ein
   Ding mit Geschichte) statt Stimmungswörtern, kurz wie in einem guten Roman, im Ton der Kampagne. **Geschrieben
   zum Sprechen** (`references/sprechen.md`, gm_guide `sprechen`): die Art des Textes entscheidet. Beschreibungen und
   stille Momente bleiben, wie sie geschrieben sind, mit einem `[emphasis]` je drei, vier Sätze und ohne `…`; Spannung
   in kurzen Sätzen; NPC-Worte höchstens mit einer Betonung, die die Figur selbst setzt. Die Spieler sehen die Marken nicht. Jeder
   erfundene Name kommt mit seiner Aussprache in `campaign set pronunciations`, nie als Umschreibung in den Text. Anfang und Ende
   sind Szenen, kein Pflichtprogramm (Denny 2026-11-13: „Intros und Outros bissel flach“), darum gehören hinein:
   - **Begrüßung** („Willkommen (zu Beginn)“): kurz, nur Organisatorisches.
   - **Prolog** bei einer neuen Kampagne oder einer Welt, die die Spieler nicht kennen („bei neuen Kampagnen fehlt
     fast immer ein Prolog“): sechs bis zehn Vorlesetexte („Prolog 1: Die Welt“ …), zusammen bis zu zehn Minuten (Denny 2026-11-13:
     „Prolog ruhig 10 min“; etwa 1200–1400 Wörter), jeder
     mit eigenem Bild und Musik: die Welt und wie es sich in ihr lebt, was jeder in ihr weiß, was gerade in der Luft
     liegt, die Begriffe, die am Tisch fallen werden. Erzählt wie der Anfang eines guten Romans, ohne Spoiler; der
     letzte endet dort, wo die Helden einsteigen. Dazu ein Handout „Was eure Figuren wissen“ mit Begriffen und Orten.
   - **Heldenvorstellung** bei vorgefertigten Helden („Charakter-Vorstellungen im Detail, damit man sich entscheiden
     kann“): je Held ein Vorlesetext von etwa einer Minute zu seinem Porträt: wer er ist, ein Moment aus seinem
     Leben, was er kann und was ihm schwerfällt, was er will, und für wen er sich spielt („für jemanden, der gern
     redet und handelt“). Ohne Geheimnis. Dazu die Tischkopie seines Bogens (`secret: false`).
   - **Kapitelanfang** bei einer Fortsetzung: „Was bisher geschah“ als Erzählung mit Bild, die mitten in der Lage
     endet, in der die Helden stehen.
   - **Kapitelende:** ein Schlusstext je möglichem Ende (`variants`), der aufgreift, was die Helden getan haben, und
     ein Ausblick (ein Bild, ein Geräusch, eine offene Frage), der bis zum nächsten Kapitel trägt.

   Dazu Übergänge, feste erste Worte der NPCs als eigener Text mit `voice: "<NPC>"` (dann macht `prepare_table` ihn
   in dessen Stimme; im Titel wann, z. B. „Hanna bittet um Hilfe (Szene 1)“), Enden mit `variants`. Handouts mit `handout`.
   **Handouts mit Geheimnis sind zum Flüstern** (Ödland-Abend 2026-10-30: die Bögen mit dem persönlichen Geheimnis
   mussten zu je einem Spieler, das Spielerfenster zeigt aber allen alles): ein eigenes Handout je Held (der Bogen
   mit seinem Geheimnis, ein Brief nur für ihn), im Titel für wen und wann („Handout: Jules Bogen (für Jule, nach der
   Wahl)“). Die Spielleitung schickt es per `discord whisper handout` an den einen Spieler, nie mit `show_players`
   oder `give_find`, die alle sehen. Im Leitfaden steht, welches Handout wem wann geflüstert wird, und welche Szene
   ein Held besser unter vier Augen spielt, damit er es später selbst enthüllen kann: per DM (Text, Bild, die Worte des
   NPCs als Sprachdatei), während die anderen weiterspielen (`pnp-spielleiter` 4c); einen Nebenraum mit Stimme
   (`discord aside`), bei dem die anderen warten, nur wo das gesprochene Gespräch die Szene trägt.
   **Bögen vorgefertigter Helden:** die Werte als `party set sheet_data`, dann `party sheet` je Held: ein PDF aus
   einer Vorlage (`party templates` listet sie; eine eigene für die Kampagne mit `party save_template`),
   `secret: false` für die Tischkopie ohne Geheimnis und Ziel. Am Abend flüstert die Spielleitung jedem seinen Bogen
   als PDF (`discord whisper` mit `sheet: true`); ein Handout mit dem Geheimnis ist der Ersatz, wo es keinen Bogen
   als PDF gibt.
6. **Leitfaden** (`kind guide`): eine Seite „So leitest du …“: Ablauf der Szenen, Würfe in diesem System, wie großzügig,
   welcher Held welchen Weg hat, Kampf vereinfacht. Dazu gehören hinein:
   - **Rahmen:** wie tödlich, wie hart Misserfolge, wie lang ein Abend, was nicht vorkommen soll. Die Spielleitung liest es hier.
   - **Was passiert, wenn die Helden nichts tun:** der Plan des Gegners als zwei, drei Schritte mit Zeitpunkt („nach
     Szene 3 holen die Wölfe die erste Ziege, nach Szene 5 greifen sie das Dorf an“). So bewegt sich die Welt.
   - **Vorrat zum Improvisieren:** fünf, sechs freie Namen in der Sprache des Settings, ein paar Gerüchte (wahr und
     falsch) und drei kleine Begegnungen unterwegs. Dann erfindet die Spielleitung am Tisch stimmig statt beliebig.
   - Bei Kampagnen: wo ein Abend gut endet (ein Haken zum Weiterspielen), und was es als Belohnung gibt (Erfahrung,
     Schätze, Ansehen).
   - Bei Discord: was wem geflüstert wird und welche Szene unter vier Augen spielt (Punkt 5). Soll die Gruppe in
     Räumen nach Orten sitzen, schaltet `campaign set` mit `discord_rooms: true` sie ein (Standard aus); die
     Spielleitung zieht dann bei jedem Ortswechsel einer Szene um (`pnp-spielleiter`, 4c).

   Eine zweite Seite „Vor dem Abend vorbereiten“: welche Texte in welcher Stimme vorbereitet werden (siehe
   `pnp-spielleiter`).

**Mehr Strecke statt mehr Verzweigungen** (Ödland Kapitel 2, Abend 1, 2026-11-01, Denny: „wir waren jetzt schon viel
zu schnell durch? doppelt so schnell XD“). Geplant waren 2:10 Pflicht mit Kann-Schwellen, Kürzen-Fassungen,
Minutenplan und einem Spontan-Faden für einen Helden, der vielleicht kommt. Gespielt wurde etwa 12 Minuten je Szene,
nach 1:25 war der Abend am Haken. Die Hälfte der Einträge lief nie, aber Stoff fehlte. Darum:
- **Umfang an der Gruppe messen:** bei einer schnellen Gruppe 8–10 echte Szenen für 2,5 Stunden, nicht 5–6 mit vielen
  Fassungen. Lieber eine Szene zu viel, die in den nächsten Abend wandert.
- **Ein Vorrat kleiner Situationen** im Leitfaden (8–10 Stück: eine Begegnung unterwegs, ein NPC mit einer Bitte, ein
  Fund, ein Mini-Kampf, eine Wetter- oder Strahlungslage), jede mit Wurf, Folge und optionalem Bild. Die passen
  fast überall und füllen, wenn die Spieler schneller sind oder einen Weg gehen, den niemand geplant hat.
- **Kein Überbau:** keine minutengenauen Zeitpläne, keine Kann-Schwellen, keine doppelten Kürzen-Fassungen, keine
  eigenen Fäden für Helden, die vielleicht kommen. Eine Richtzeit je Szene genügt. Varianten nur, wo ein Text sonst
  falsch wäre (vorausgesetzter Stand), nicht für jede denkbare Wahl. Ausweichszenen nur für die eine naheliegende
  Abzweigung (im selben Abend lief genau die).
- **Stark bleiben müssen** NPC-Bögen, der Plan des Gegners mit Uhr und der Kanon: Damit improvisiert die Spielleitung
  stimmig, wenn die Spieler abweichen (sie taten es fast in jeder Szene). Bilder malt die Spielleitung am Tisch in
  etwa 20 Sekunden nach (Denny); wird es wirklich abwegig, ruft sie offen eine Pause aus (`pnp-spielleiter`, 3).

Nach dem Gerüst `campaign` lesen: `brokenReferences` muss leer sein (Erwähnungen ohne Eintrag reparieren).

**Weiterspielen und Ausbauen einer gespielten Kampagne:** Was an den Abenden festgelegt wurde, steht im Kanon
(`campaign`, Liste `canon`; der Chronist der Spielleitung schreibt ihn mit `set_campaign_entry kind canon`). Neue
Szenen, Texte und NPCs bauen darauf auf und widersprechen ihm nicht (Preise, Versprechen, wer was weiß, der Stand der
Helden). Kanon-Einträge sind Tatsachen vom Tisch, kein Bauplan: nicht umschreiben, nur den, der durch den Umbau
wirklich nicht mehr gilt, mit `remove` wegnehmen. Die offenen Fäden und wo die Gruppe steht, setzt `campaign set` mit
`threads` (ersetzt die Liste; was fehlt, gilt als gelöst) und `party_at` (ein Ortsname): bei einem neuen Kapitel die
Fäden, mit denen es beginnt, und den Ort, an dem der Abend anfängt.

## 2. Stimmen und Standardsätze

- `set_voice` für Erzähler und jeden sprechenden NPC (alle in einem Aufruf: `voices: [{who, from, description}, …]`): `from: "description"` macht aus `voice` eine Stimme (etwa eine
  Minute je Stimme), `ready` nimmt eine fertige, `creature` legt einen Klang darüber (Drache, Geist …). **Ohne eigene
  Stimmprobe keine Standardsätze:** Für eine Figur ohne `set_voice` werden keine erzeugt (die Engine erfände sonst eine
  fremde Stimme, Spieltest 2026-10-28), und ihre Füller fehlen am Tisch.
- **Effekte je Stimme**: Effekte sind eigene, benannte Ketten aus Bausteinen im Profil (`voice_effect` list/new/set/
  remove; Bausteine tempo, band, drive, hiss, crackle, dry, gain). Eine Stimme bekommt einen per Name
  (`set_voice effect`, der Erzähler auch `campaign set narrator_effect`); sie liegen nach S2-Pro über jeder Zeile,
  vorab erzeugt wie live gestreamt. Vorlagen: Röhrenradio leicht/mittel/voll (voll war am Tisch zu viel: mittel zuerst).
  `tempo` nur sanft (0.9–1.1, mehr klingt robotisch). Längere Pausen gibt es nicht: nachträglich eingefügte Stille
  klingt wie ein Schnitt. Nur, wenn die Kampagne es will; nach einer Änderung `prepare_table`, es legt den
  Effekt über denselben Take. Im Studio: das Schild „Effekte“ auf der Stimmkarte, dort auch „Effekte bearbeiten“.
- **Aussprache** (`campaign set pronunciations`): die eigenen Namen und Wörter der Kampagne, wie die Stimme sie sagen
  soll (`{"Korath": "[emphasis] Ko-rat", "Gasriese*": "[emphasis] Gas-Riese"}`); die Texte behalten ihre Schreibweise.
  Einen Satz mit dem Wort in Varianten sprechen lassen und den Menschen wählen lassen. Einzelheiten:
  `references/sprechen.md`.
- **Standardsätze** (`set_campaign_entry stock`, Erzähler: `campaign set narrator_stock`): NPCs `greet`, `bye`,
  `think`, `yes`, `no`, `gesture`, der Erzähler dieselben mit `approach` statt `gesture`. Sie machen den Abend schnell,
  weil sie vorab erzeugt werden und am Tisch sofort kommen. Wie viele, in welcher Art und über welche Stimmungen:
  `references/standardsaetze.md` (die Quelle dafür). Spielt der Tisch mit offenem Mikro (Zuhörer), braucht der
  Erzähler außerdem die Brücken `look` und `act` und viele `think`-Sätze (ebenda).

## 3. Bilder, Karten, Klang (die langsamen Teile, gesammelt)

Bilder belegen die GPU minutenlang. Deshalb erst wenn der Text steht, gebündelt, und gebündelt abwarten statt
einzeln (`jobs watch`: den Befehl mit Bash im Hintergrund starten, er weckt dich, wenn alle fertig sind):
- `paint_campaign`: ein Aufruf für alles, mit `items` (`[{kind, name}, …]`, Arten gemischt; je Art werden die Bildworte
  erst alle geschrieben, dann gemalt): NPC-Porträts, Orte, Szenen. Jede Szene braucht ein Bild, das die
  Spieler beim Vorlesen sehen. Jeder sprechende NPC braucht ein Porträt: Es erscheint im Spielerfenster, während er
  spricht, und ist sein Marker auf der Karte. Mit `results get` prüfen; Schlechtes neu malen. Ein Handout
  (`handout: true`, ein Gegenstand wie Horn oder Laterne) wird mit `kind: "text"` ein Close-up des Gegenstands, keine
  Szene; antwortet `paint_campaign` mit `working`, schreibt das Sprachmodell noch die Bildworte: denselben Aufruf
  noch einmal.
- **Bekannte Orte bleiben wiedererkennbar** (Denny nach Ödland Kapitel 2, Abend 1, 2026-11-01: Orte, an denen die
  Gruppe schon war, sahen auf neuen Bildern anders aus). Hat ein Ort schon ein Bild (Ort oder Szene, auch aus einem
  früheren Kapitel), entsteht jedes neue Bild von ihm als Edit mit diesem Bild als Basis (`picture` mit dem alten
  Bild, FLUX Klein): nur Tageszeit, Licht, Wetter, Figuren oder Blickwinkel ändern. Neu aus Text nur, was noch nie
  gezeigt wurde. Danach Alt und Neu nebeneinander ansehen: Bauten, Formen und Farben müssen dieselben sein.
- **Neue Motive, die Klein schlecht kennt** (Monster, fremde Kreaturen, Sci-Fi-Maschinen, seltsame Bauten): das
  Ausgangsbild mit `picture` ohne Basis und `advanced_create: true` (Krea 2, nur aus Worten), dann mit diesem Ergebnis
  als Basis normal weiter (Klein: Helden hinein, Licht, Blickwinkel; oder `advanced_edit`). Krea sieht keine Bilder:
  kein `person`, keine Helden mit Foto in der Idee, keine `references`, keine `pose`; NSCs nur über ihr Aussehen in
  Worten. Für viele solche Bilder (`paint_campaign`) `options set kreaCreate: true`, danach wieder `false`: solange es an
  ist, verweigern `paint_player` und `paint_map`. Fehlt Krea, meldet der Aufruf „models missing“ (`models install
  missing: true`, ~13 GB).
- **Karten gehören dazu, nicht nur Bilder.** Die Spieler wollen wissen, wo sie sind und wohin es geht; die Spielleitung
  zeigt sie am Tisch. Zwei Ebenen:
  1. **Kampagnenkarte** (die Gegend, alle Orte darauf): `paint_campaign` mit der Weltkarte (Kind world / Weltkarte),
     oder als eigene Karte. Jeder Ort ohne `in` liegt auf ihr; `pin_place` setzt seinen Marker. Eine große Gegend
     (mehr als 2×2 Kacheln) entsteht als **ein Bild**: `picture` (eine gedruckte Landkarte genau von oben, die Lage
     der Orte in Worten, Stil etwa „D&D sourcebook illustration“, nicht ein Filmstil), mit `picture_tool resolution 2`
     vergrößert, dann `map new` mit `picture` und `tiles` (Ödland 2026-11-14: Kachel für Kachel aus dem Plan gemalt
     wurde die Weltkarte zweimal zu Äckern aus der Nähe; ein Bild las sich als echte Regionalkarte). Teilregionen
     ebenso, je eine eigene Karte.
  2. **Eine Karte pro wichtigem Ort** (Dorf, Lichtung, Ruine, Höhle): `map new` mit Typ (welche Art Ort: nie raten,
     im Zweifel fragen), Look und Stil, dann `map plan` (was liegt wo, Feld für Feld: Wege, Gebäude, Wald, Wasser, der
     Eingang, wo die Gefahr wartet), dann `paint_map` (ganz). Den Ort mit `set_campaign_entry kind place map "<Karte>"`
     verknüpfen; Orte darin (`in`) bekommen ihren Marker dort.
  - Karten zeigen, was die Szenen brauchen: in der Ruine der schmale Eingang und der Absatz oben, auf der Lichtung der
    Meiler und der Pfad nach Nordosten. Steht etwas in den Szenen-Notizen, muss es auf der Karte zu finden sein.
  - `map list` zeigt den Stand (gemalte und geplante Felder); `paint_map seams` glättet Kanten zwischen Kacheln.
    Passt der `look` einer Karte nicht zum gemalten Bild, korrigiert ihn `map set` mit `look`.
  - **Marker statt Beschriftung.** Karten bekommen keine aufgemalten Namen; was was ist, sagen die Orts-Marker. Darum
    jeden Ort mit `pin_place` genau auf das setzen (alle Orte einer Karte in einem Aufruf: `pins: [{place, x, y}, …]`), was das gemalte Bild an dieser Stelle zeigt (die Mauer auf die
    gemalte Talsperre, nicht daneben): die Karte mit `map list` und `map` ansehen und die Lage prüfen. Ein Ort, der
    erst entdeckt werden soll, bekommt seinen Marker trotzdem: im Spielerfenster erscheint ein Ort erst, wenn die
    Spielleitung ihn aufdeckt (`show_players reveal_places`). Was die Helden zu Beginn schon kennen (Heimatort, das
    Ziel des Auftrags), mit `set_campaign_entry known: true` vormerken, sonst nichts. Ohne Marker versteht am Tisch
    niemand die Karte (Ödland-Abend 2026-10-30, Denny: „i did not understand what what was and
    there were no map markers placed“).
- Geräusche und Musik macht **das Studio mit `make_sound`** (Stable Audio 3, seit 2026-11-17 deutlich besser; Denny),
  alle Klänge eines Kapitels in einem Aufruf: `sounds: [{name, kind, idea, seconds}, …]`.
  Echte Aufnahmen, z. B. von Pixabay (pixabay.com/sound-effects, /music) oder Freesound, nur wenn das Studio nach zwei
  Versuchen nichts Brauchbares liefert oder ein Lied mit Gesang gebraucht wird (so arbeitet `dnd-studio:pnp-klang`). Herunterladen nur mit Freigabe des Menschen; dann mit `add_file` ins Studio.
  Suchen mit kurzen Worten wie auf Freesound, eine Quelle je Klang („goat bleating, close“, „fire whoosh“), für eine
  Schleife lange, gleichmäßige Aufnahmen. Vor dem Binden mit **`check_sound`** hören lassen: was der Klang sein soll und
  zwei, drei Verwechslungen, die am Tisch stören würden („heavy rain on a metal roof“, „applause“, „music“); liegt
  das Gewollte nicht vorn oder unter etwa 0,3 `cos`, einen anderen nehmen (nach Titeln allein fielen 5 von 14 durch).
  Der Mensch hört vor dem Abend trotzdem einmal hinein. Dann an die Szene oder den Vorlesetext binden:
  `set_campaign_entry` mit `sounds: [{sound: <Datei aus add_file>, name: "Wolfsheulen"}]` (Atmosphäre und Musik
  laufen in Schleife, ein Effekt einmal; `volume` nach Bedarf). `sounds` ersetzt die ganze Liste: immer alle Klänge
  der Szene mitschicken. In `campaign` erscheint jeder als `file`; diese `file` bekommen `play_sound` und
  `say_line sound` am Tisch. Am Tisch hat jeder Klang einen Knopf, die Spielleitung – Mensch oder Claude – startet
  ihn, wenn er passt; im Studio geht dasselbe im Dialog der Szene unter „Klänge“. Ein Klang, der zu keiner Szene
  gehört (ein Wesen, das überall heult), in die Notizen des NPC.
- **Musik nach Stimmung** (Denny 2026-11-21): Je Kampagne eine Musik für `explore`, `tense`, `fight`, `rest`
  (`make_sound` mit `kind: "bgmusic"`, lange Schleifen), gebunden mit `campaign set` und `mood_music: { explore: <Datei>,
  fight: <Datei>, … }`. Eine Szene mit eigener Musik je Stimmung: in ihren `sounds` den Klang mit `mood: "fight"`.
  Am Tisch blendet die Musik dann mit der Stimmung über, ein Kampf schaltet von selbst um.
- **Schleifen für die wichtigen Szenen** (Ankunft an einem Ort, der Höhepunkt, ein Ort mit Feuer, Nebel oder Wasser):
  `animate { start: <Szenenbild>, loop: true, idea: "was sich bewegt: das Feuer flackert, Rauch zieht" }` macht ein
  lebendes Standbild (Kamera und Personen still, ohne Ton, 5 s, nahtlos). Nur vor dem Abend: mit offenem Tisch passt
  das Video neben der Stimme nicht auf die Karte. Die Schleife in die Notizen der Szene, damit die Spielleitung sie
  mit `show_players loop: true` zeigt.
- **Tiefenkarten** für die Parallaxe im Spielerfenster macht `prepare_table` selbst (Abschnitt 4, `dnd-studio:pnp-tischbereit`).
- **Eigene Effekte der Welt** (Denny 2026-11-21: Strahlung im Ödland): was die Welt besonders macht, als Effekt über dem
  Bild aus Bausteinen, ohne GPU: `campaign set` mit `effects: { strahlung: { tint: "#b8ff3a", glow: 0.6, grain: 0.5,
  flicker: 0.4, aberration: 0.35, pulse: 0.6, particles: "glow", sound: <Geigerzähler> } }` (`particles`: glow,
  sparks, dust; alle Stärken 0–1). Die Spielleitung zeigt ihn mit `show_players overlay: "strahlung"`. In den Notizen
  der Szenen vermerken, wo er passt; im Leitfaden, was er bedeutet.

## 4. Abnahme: Ist der Abend spielfertig?

Gehe den Abend im Kopf einmal als Spielleitung durch und prüfe:
- Jede Szene hat Bild, Vorlesetext und Rezept in den Notizen; die Reihenfolge stimmt.
- Es gibt eine Kampagnenkarte mit allen Orten als Marker, und jeder Ort, an dem eine Szene spielt, hat seine Karte.
- Jeder sprechende NPC hat Porträt, Stimme (mit Stimmprobe), `sheet`, Standardsätze; jeder stumme hat Geräusche.
- Jeder gebundene Klang ist da (mit `make_sound` gemacht, eine Aufnahme nur als Ausweg) und mit `check_sound` gegen
  das gehört, was er sein soll.
- Die Kampagne hat Musik je Stimmung (`campaign` zeigt `moodMusic`: mindestens `explore` und `fight`), und die
  wichtigen Szenen haben ihre Schleife (`animate loop`, in den Notizen der Szene).
- Bei einem Kapitel einer Kampagne: `threads` und `party_at` gesetzt (`campaign` zeigt `threads` und `partyAt`).
- Jede Szene auf einer Karte hat ihre Startfelder in `markers`, und `brokenReferences` ist leer.
- Jeder Held hat einen Weg, der zu seinem Bogen passt, und jeder Wurf nennt die Fertigkeit, die er auch hat.
- Jeder Hinweis, ohne den es nicht weitergeht, ist auf drei Wegen zu finden; jeder Gegner hat Werte und Moral.
- Begrüßung, bei neuer Kampagne Prolog, bei vorgefertigten Helden ihre Vorstellung, Kapitelanfang und -ende und
  Leitfaden (mit Rahmen, Plan des Gegners und Vorrat) sind da; `brokenReferences` ist leer.
- `prepare_table` über `dnd-studio:pnp-tischbereit` (ein Job je Kapitel oder Abend, nicht die ganze Kampagne), damit am Abend alles sofort klingt (nach den Bildern, nicht gleichzeitig).

## 5. Review: drei Prüfer, bis es sitzt

Wer gebaut hat, übersieht die eigenen Lücken. Deshalb prüfen nach der Abnahme **drei Reviewer** in frischem Kontext
(eigene Agenten, gleichzeitig), jeder mit einem Fachbereich, und die Kampagne geht erst zum Menschen, wenn alle drei
nichts mehr finden (Denny, 2026-10-30), nach dem festen Ablauf unten. Jeder Reviewer liest die Kampagne selbst (`campaign`, `results get`,
`map list`, die Stimmbeschreibungen), nicht die Meinung des Erbauers, und prüft am Studio, nicht am Text allein. Die drei sind
Agents des Plugins (`dnd-studio:…`), jeder mit seiner Prüfliste und
nur lesenden Werkzeugen: `dnd-studio:pnp-review-technik`, `dnd-studio:pnp-review-konsistenz`, `dnd-studio:pnp-review-spielbarkeit` (Agent-Tool mit
diesem `subagent_type`). Ihre Agent-Dateien tragen die vollständige Prüfliste; hier steht die Kurzfassung. Der Auftrag
nennt die Kampagne, ob der Mensch mitspielt, die gewünschte Länge, den Pfad der Mängel-Datei und, für die Technik, die
letzte Antwort von `prepare_table` (`done`, `made`, `total`, `failed`): Die Reviewer können nur lesen und rufen es
nicht selbst auf. Stimmen hören können sie nicht: Die Probe nach `set_voice` hört der Erbauer oder der Mensch, die
Reviewer prüfen die Beschreibung. Klänge hört die Technik mit `check_sound` selbst nach. Fehlen die Agents (Plugin nicht oder
zu alt installiert; dem Menschen sagen), bekommt ein allgemeiner Agent die Prüfliste seines Bereichs und nur lesende Werkzeuge:

1. **Vollständigkeit und Technik** (`dnd-studio:pnp-review-technik`) – ist alles da und läuft es? Jedes Bild gemalt (Szenen,
   Orte, sprechende NPCs, Helden), Karten ganz gemalt, ohne Nähte, alle Orte mit Marker, und jeder Marker sitzt auf
   dem, was die Karte an der Stelle zeigt (Karte ansehen, nicht nur zählen); jede Szene auf einer Karte hat
   Startfelder für Helden und NPCs in `markers`, die auf begehbaren Feldern liegen; jede sprechende Figur mit eigener Stimmprobe,
   Standardsätze erzeugt (`prepare_table` gelaufen, ohne Lücken und ohne `failed`); Klänge gebunden, ihre Dateien da,
   mit `make_sound` gemacht (echte Aufnahmen nur, wo das nicht reichte), mit `check_sound` gegen ihren Namen gehört, Schleifen und Lautstärken
   richtig; Handouts, Begrüßung, Leitfaden da, ein Handout mit Geheimnis zum Flüstern; bei einem Kapitel `threads`
   und `party_at` gesetzt; `brokenReferences` leer.
2. **Konsistenz und Korrektheit** (`dnd-studio:pnp-review-konsistenz`) – stimmt es? Jeder Wurf nennt eine Fertigkeit, die die
   Helden haben, mit passender Schwierigkeit; Gegnerwerte an der Party gemessen; ein umgebogenes Regelwerk überall
   gleich umgebogen (auch `dice_faces`); Namen, Orte, Fraktionen und Zeitlinie widersprechen sich nicht, keine Reste
   aus einem anderen Setting; Bilder passen zu `looks` (je Bild ansehen: falsche Person, kaputte Hände, falscher
   Stil); Stimmbeschreibungen passen (Alter, Geschlecht, „German“, Jugendliche nicht kindlich); Standardsätze mit
   niedrigem `how`, Rufname vorn; Szenentexte reine Erzählerstimme ohne wörtliche Rede und ohne vorausgesetzten Stand;
   keine unabsichtlichen Spoiler in Texten, Bildern und Namen; was nur einen Helden angeht, steht im Handout zum
   Flüstern statt in einem Text für alle; was gesprochen wird, ist zum Sprechen geschrieben (`references/sprechen.md`:
   die Art des Textes entscheidet, `[emphasis]` sparsam und nie auf Füllwörtern, kein zerhackter Text, keine Großbuchstaben und keine
   Umschreibung eines Namens im Text) und jeder erfundene Name steht in `pronunciations`.
3. **Umfang und Spielbarkeit** (`dnd-studio:pnp-review-spielbarkeit`) – trägt der Abend? Genug Stoff für die gewünschte Länge
   im Tempo dieser Gruppe (Abschnitt 1, „Mehr Strecke statt mehr Verzweigungen“), dazu der Situations-Vorrat;
   eine Ausweichszene für die naheliegende Abzweigung, kein Überbau aus Kann-Schwellen und Fassungen; drei Wege zu
   jedem Hinweis; jeder Held mit Haken und großem Moment, ein Geheimnis lässt sich enthüllen oder bewusst behalten (beides belohnt); Plan des Gegners und Vorrat zum
   Improvisieren; bei offenem Ende tragen die Fäden einen nächsten Abend, bei einer Fortsetzung passt alles zum Kanon.

**Der Ablauf** (Ödland Kapitel 3, 2026-11-21, Denny: „die Review-Schleife ist absurd so“: drei Runden mit je rund
30 Mängeln; ein Viertel hatte die Nachbesserung selbst gemacht, ein Viertel blieb „offen“ ohne Zuständigen, die
Erstprüfung las nur Stichproben). Darum ist die Schleife fest:

1. **Erstprüfung**, die drei gleichzeitig, jeder liest seinen Bereich **ganz** und listet unter „Geprüft“ und „Nicht
   geprüft“, was er gelesen hat. Ist die Kampagne zu groß für einen (ein Kapitel mit 15+ Szenen), teilt der Erbauer
   nach Abend oder Kapitel und startet je Teil einen Reviewer, statt dass einer Stichproben liest. Jeder Mangel hat eine
   ID und nennt alle Fundstellen.
2. **Nachbesserung:** `dnd-studio:pnp-nachbesserer` ersetzt statt anzuhängen, ändert eine Tatsache an allen
   Fundstellen, liest jeden Fix nach und gibt jedem Mangel, den er nicht selbst behebt, genau eine Kategorie (`an
   Maler`, `an Klang`, `Mensch`, `bleibt`, `falsch gemeldet`). Er listet die geänderten Einträge.
3. **Folgeaufträge erledigen, bevor geprüft wird:** Der Erbauer gibt alle Zeilen `an Maler` gesammelt an
   `pnp-maler` und alle `an Klang` an `pnp-klang`, stellt die Fragen `Mensch` dem Menschen (spielt er mit: nur, was ohne
   Spoiler geht, sonst entscheidet der Erbauer), und wartet, bis alles fertig ist. Erst dann die nächste Runde, sonst
   meldet sie dieselben Punkte wieder.
4. **Nachprüfung**, nur die Reviewer, die etwas gefunden hatten: Sie bekommen ihre letzte Mängel-Datei und das
   Protokoll des Nachbesserers, prüfen jeden Mangel und jeden geänderten Eintrag ganz, und melden Neues außerhalb
   davon nur, wenn es den Abend bricht. Keine neue Erstprüfung.
5. Schritte 2–4 **höchstens zweimal** nach der Erstprüfung. Läuft eine Nachprüfung nicht deutlich kleiner als die Runde
   davor (weniger als halb so viele Mängel), stimmt etwas am Ablauf: der Erbauer sieht sich an, woher die Mängel
   kommen (Fix-Fehler, ungeprüft offen, übersehen), statt eine weitere Runde zu starten.

Was gilt als erledigt: Text, Regeln, Logik, Kanon, Spoiler, Hinweise, Stimmen, Klänge und fehlende Bilder müssen
stimmen (Denny, 2026-11-01: „es soll schon möglichst fehlerfrei sein“). **Kosmetisches an Bildern** (ein Licht zu
viel, ein Detail der Karte fehlt, eine leichte Naht) wird nach zwei Versuchen nicht mehr gejagt, sondern als `bleibt`
gelistet: Bildmodelle haben Grenzen, und jedes Nachmalen bringt eigene neue Fehler (Ödland, Talsperre, 2026-11-01).
Was am Ende offen bleibt, bekommt der Mensch als Liste.

**Spielt der Mensch selbst mit, bleibt alles spoilerfrei:** Erbauer und Reviewer arbeiten in eigenen Agenten, Mängel
stehen nur in den Dateien, und an den Menschen gehen nur Zahlen (Szenen, Orte, NPCs, Mängel je Bereich und Runde),
nie Plot, Geheimnisse oder Gegner. Was die Spieler ohnehin sehen sollen (die Vorstellung der vorgefertigten Helden),
darf in den Bericht.

Dem Menschen am Ende kurz sagen, was steht, was fehlt (z. B. „Karten nicht gemalt, GPU war belegt“) und wie man
startet. Für Weitergabe: `campaign export`.

## 6. Sparsam mit Tokens (beim ganzen Bau)

Denny, 2026-11-08: „token effizienz“; Bilder prüfen und eine Stunde Ausbau kosteten rund 3 Millionen. Das gilt für
dich und jeden Agenten des Baus:
- `campaign` erst mit `overview: true`, dann nur mit `only` und `names` lesen. Die ganze Kampagne ist die größte Antwort
  der Werkzeuge. Bei einer großen Kampagne (mehrere Kapitel, viele NPCs) die Übersicht mit `chapter` (und `evening`)
  auf das Kapitel begrenzen, an dem gebaut wird: Sonst zählt sie die großen Listen nur (`truncated`), und die Zeilen
  fehlen. Abende heißen mit ihrer Nummer über die ganze Kampagne („Abend 4“); die alten Bezeichnungen (A, B) gehen
  weiter. `results list` mit `name` und `brief`, `settings` ohne `available`.
- Viele Bilder ansehen: je 12–16 auf einen Kontaktbogen (`results sheet`), groß (`results get`) nur die Verdächtigen.
- Jobs eines Stapels in einem `jobs watch` bündeln (im Hintergrund; ein Agent: `background: false`, im Vordergrund)
  statt `jobs wait` alle 50 s, und zwischen den Wartezeiten nichts anderes lesen: Jede Runde schickt den ganzen Kontext
  neu.
- Vor einem langen Agenten mit einem Probeaufruf prüfen, ob sein Weg geht (ist die Ergebnisliste überhaupt gefüllt?).
- **Jeden Eintrag einmal schreiben:** alles zu einem Eintrag sammeln, dann ein `set_campaign_entry` mit allen Feldern;
  viele Einträge in einem Aufruf mit `entries`. Jeder Aufruf ist eine volle Runde (ein Bau schrieb 190-mal, ein
  Nachbesserer 72-mal für 11 Einträge, ein Maler setzte 64 Orts-Marker mit 64 Aufrufen).
- **Listen statt Einzelaufrufe:** Fast jedes Werkzeug nimmt mehrere Dinge auf einmal: `pin_place pins`, `set_picture
  pictures`, `set_voice voices`, `write_text texts`, `party set players`, `map plan patches`, `paint_map tiles`,
  `picture`/`picture_tool pictures`, `make_3d`/`model_tool models`, `make_sound sounds`, `add_file paths`, `results get
  ids`. Ein Feld neben der Liste gilt für jeden Eintrag; ein Fehler hält den Rest nicht auf (`failed`, je Eintrag
  `error`). Job-Werkzeuge geben alle `job_ids` zurück: die in einem `jobs watch` abwarten. Braucht ein Aufruf
  länger als 25 s zum Vorbereiten, kommt statt der Jobs eine Aufruf-ID (`call-…`): sie steht für alle seine Jobs.
- Karten-Plan lesen ohne Bilder: `map list` mit `map` und `pictures: false`.
- **Lange Agenten geben ab:** Die Bau-Agenten (Texter, Maler, Klang, Nachbesserer) hören nach etwa 60
  Werkzeugaufrufen oder bei großem Kontext auf, schreiben ihr Protokoll vollständig (fertig, offen, welche Einträge)
  und melden die Zahlen. Den Rest bekommt ein frischer Agent mit dem Protokoll im Auftrag, nicht derselbe zurück
  (sein ganzer Kontext würde bei jedem Schritt neu gelesen).
- Mechanische Arbeit (aufräumen, zählen) auf einem kleinen Modell. Prüfen nur, was sich geändert hat; ab Runde 2 nur
  die offenen Punkte.
