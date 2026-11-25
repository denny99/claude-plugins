# Szenen, Texte und Leitfaden

Gehört zu Skill `pnp-kampagne` („Gerüst“). Hier steht, wie Orte, NPCs, Szenen, Vorlesetexte, Handouts und der
Leitfaden geschrieben werden: Der Architekt plant danach, der Texter schreibt danach, die Reviewer prüfen danach. Wie
ein Text klingt, wenn eine Stimme ihn vorliest: `references/sprechen.md` (gm_guide `sprechen`).

## Umfang: mehr Strecke statt mehr Verzweigungen

Gespielt wird schneller als geplant (Ödland: etwa 12 Minuten je Szene, der Abend nach der Hälfte der Zeit am Haken;
die Hälfte der Fassungen lief nie, aber Stoff fehlte). Darum:
- **Umfang an der Gruppe messen:** bei einer schnellen Gruppe 8–10 echte Szenen für 2,5 Stunden, nicht 5–6 mit vielen
  Fassungen. Lieber eine Szene zu viel, die in den nächsten Abend wandert.
- **Kein Überbau:** keine minutengenauen Zeitpläne, keine Kann-Schwellen, keine doppelten Kürzen-Fassungen, keine
  eigenen Fäden für Helden, die vielleicht kommen. Eine Richtzeit je Szene genügt. Varianten nur, wo ein Text sonst
  falsch wäre (vorausgesetzter Stand), nicht für jede denkbare Wahl. Ausweichszenen nur für die eine naheliegende
  Abzweigung.
- **Stark bleiben müssen** NPC-Bögen, der Plan des Gegners mit Uhr, der Vorrat (Leitfaden) und der Kanon: Damit
  improvisiert die Spielleitung stimmig, wenn die Spieler abweichen. Bilder malt sie am Tisch in etwa 20 Sekunden nach;
  wird es wirklich abwegig, ruft sie offen eine Pause aus (`pnp-spielleiter`).

## Orte

`set_campaign_entry kind place`: `text` = was die Spieler dort erleben, `notes` = was nur die Spielleitung weiß
(Geheimnisse, welche Szene hier spielt). Orte, die in anderen liegen, mit `in`. Was die Helden zu Beginn schon kennen
(Heimatort, das Ziel des Auftrags), mit `known: true`, sonst nichts.

## NPCs

`kind npc`:
- `looks`: **englisch**, nur Sichtbares (Alter, Statur, Gesicht, Kleidung, ein Gegenstand); daraus werden Porträts.
- `sheet`: wer sie sind, was sie wissen und wollen, wie sie reden, was sie verschweigen. Daraus spielt die
  Spielleitung sie; Lücken hier werden am Tisch zu erfundenem Unsinn.
- `voice`: englisch, hörbar beschrieben (Alter, Stimmlage, Tempo, Eigenheit, „German“ am Ende). Jugendliche
  ausdrücklich nicht kindlich beschreiben, sonst macht die Stimmerzeugung ein Kleinkind daraus („a teenage girl of
  fifteen, clear mid-pitched voice, not childish, already sounds almost grown-up“, nicht „a young girl of fourteen“).
  Rufname vorn im Namen („Kühn (Direktor)“), sonst sagt der Erzähler „… geht zu Direktor hinüber“.
- `notes`: Werte (Kreaturen), Würfe, was sie geben, Geräusche. Jedes Wesen, das auftreten kann, bekommt ein eigenes
  Bild; ein gefährliches dazu, wie es sich ankündigt (Spur, Laut, Geruch), bevor es zu sehen ist. Wesen ohne Sprache:
  „spricht nicht, nur Geräusche“ hineinschreiben. Gegner: Werte passend zur Gruppe (an `party` messen, solo deutlich
  schwächer) und ihre **Moral**: wann sie fliehen oder sich ergeben („die Wölfe fliehen, wenn der Graue fällt“), und ob
  sie überhaupt verhandeln („die Brut redet nicht“). Nicht jeder Gegner ist mit Worten zu gewinnen.
- `place`: wo man sie trifft.

## Szenen: jede Angabe in ihrem Feld

`kind scene`, in Spielreihenfolge (`position`). Jede Angabe steht an **einer** Stelle, im Feld dafür; eine Kopie in
`notes` ist eine Stelle, die beim nächsten Fix vergessen wird.

| Feld | Was hinein gehört |
|---|---|
| `text` | der Vorlesetext: 3–5 Sätze, gesprochen klingend, endet mit einem Haken (einer Frage, einem Geräusch, einer Person, die etwas will) |
| `goal` | wofür die Szene da ist, eine Zeile |
| `setup` | was bereitliegt: Karte, Handout, Schleife (`animate loop`), Effekt der Welt (`overlay`) |
| `markers` | Startfelder `[{who, at}]`: `who` ein Held, „Helden“ oder ein NPC; `at` ein Ort mit Pin auf der Karte der Szene (`"Kesselheim"`) oder ein Feld `"gx,gy"` des Kartenplans. Das Studio setzt sie beim Szenenstart selbst; `brokenReferences` meldet, was nicht passt (Name, Ort ohne Pin, Feld in einer Wand) |
| `rolls` | die Würfe: Fertigkeit und ZW der Eigenschaft bzw. DC, und was der Wurf zeigt („Wahrnehmung 12: der Vorhang bewegt sich“) |
| `secret` | was nur die Spielleitung weiß |
| `notes` | das Rezept: die Lage (wer will was, was passiert ohne die Helden), was Erfolg und Misserfolg für die Szene bedeuten, die Wege der Helden, was, wenn sie die Szene auslassen, die Richtzeit; welche Bilder und Klänge gebraucht werden |
| `variants` | Fassungen eines Textes, die vom Spielverlauf abhängen (`when`) |
| `cues`, `exits` | wo die Szene sie braucht: ihre Schritte in Spielreihenfolge (Text, Klang, Bild je Schritt) und die Wege hinaus mit Bedingung |

Zeiten eines Kapitels (Abfahrt, Fahrzeiten, wann der Gegner wo ist) stehen in **einer** Uhr-Tabelle auf einer
Leitfaden-Seite; eine Szene nennt ihre Zeit kurz („Sa 6 Uhr, siehe Uhr“). Die Tabelle einmal ganz durchrechnen (Wege
hin und zurück, wer wen überholen kann), bevor die Szenen geschrieben werden.

Was eine Szene trägt:
- **Der Szenentext ist Erzählerstimme, nichts anderes.** Wörtliche Rede eines NPCs mit Stimme gehört nicht hinein: Der
  Text endet vor ihr („… kommt eine heisere, kleine Stimme.“), und die Worte stehen als eigener Vorlesetext in der
  Stimme des NPCs bereit. Sonst liest der Erzähler den Satz des NPCs mit seiner Stimme vor.
- **Kein Stand voraussetzen, den der Spieler ändern kann.** Ein Text, der eine Laterne in der Hand des Helden
  beschreibt, passt nicht mehr, wenn er sie nie bekommen hat. Neutral schreiben („dein Licht“) oder den Fall als
  `variants` mit `when` anlegen.
- **Drei Wege zu jedem wichtigen Hinweis.** Was die Helden wissen müssen, um weiterzukommen, ist auf mindestens drei
  Arten zu finden (ein NPC weiß es, eine Spur zeigt es, ein Fundstück verrät es). Hängt die Geschichte an einem
  einzigen Wurf, bleibt der Abend stecken, sobald er scheitert.
- **Was, wenn sie es auslassen?** Ein Satz, wo der wichtige Inhalt in der Welt sonst noch zu finden ist (nicht als
  Zufall, der sie zurückholt) oder was ohne die Helden geschieht, und ob die Szene kürzbar ist, wenn die Zeit knapp
  wird.
- **Erfolgsstufen im Rezept:** Wichtige Proben bekommen neben Erfolg und Misserfolg je eine Zeile für den großen Erfolg
  (welcher Bonus in der Welt) und für das Schiefgehen bei einem Wurf weit drunter oder einem Patzer (Stufen:
  `pnp-spielleiter`, `references/erfolgsstufen.md`). Dann muss die Spielleitung am Tisch nicht erfinden.
- **Lage statt Weg.** Eine Szene beschreibt eine Lage, die die Helden antreffen (wer will was, was passiert ohne sie),
  nicht den Weg, den sie gehen sollen. Keine Köder, die nur dazu da sind, die Gruppe zurück aufs Rezept zu ziehen. Was
  ein Held tun könnte, steht als Möglichkeit in den Notizen, nicht als Auslöser, der ihn dazu bringt (die Spieler
  entscheiden, `pnp-spielleiter`).
- **Reisen mit Leben:** Jede Reise zwischen Szenen bekommt im Rezept ein, zwei Details am Weg und, wo die Lage Zeit
  lässt, eine Reise-Lage oder einen Verweis auf den Vorrat. Reisen unter Zeitdruck bekommen keine Nebenorte, höchstens
  eine kurze Gefahr, die den Druck verschärft; nichts, was von der Mission wegführt.
- **Kämpfe, die stattfinden.** So viele Begegnungen, die sich nicht wegreden lassen (Gegner ohne Verhandlung, ein
  Hinterhalt, eine Bestie), wie Ton und Rahmen verlangen (im Ödland zwei, drei je Abend, weil die Gruppe sonst fast
  jeden Kampf umging), und bei den übrigen, was Ausweichen kostet (ein Wurf, Zeit, ein Gegenstand, ein Verbündeter).
- **Kämpfe sind gefährlich**, bei jeder Härte: Gegner brechen nicht beim ersten Erfolg (der Anführer hat Mut für
  mehrere, das Rudel weicht erst beim zweiten), und was danach kommt (der Rückweg mit Verfolgern, ein zweiter Angriff),
  geschieht auch, wenn der Anführer gewichen ist. Die Härte im Rahmen sagt, was ein Misserfolg kostet, nicht, wie
  schnell ein Gegner aufgibt.
- **Haken der Helden:** Jeder Held bekommt irgendwo einen Haken aus seinem Hintergrund (eine Bekannte, ein altes
  Versprechen, sein Volk) und einen großen Moment, nicht nur einen Wurf, der zu seinen Fertigkeiten passt. Ein
  Geheimnis lässt sich enthüllen oder bewusst behalten, und beides wird belohnt.

## Vorlesetexte

`kind text`, dazu die Szenentexte: zwei, drei konkrete Sinnesdetails (Geruch, Geräusch, ein Ding mit Geschichte) statt
Stimmungswörtern, kurz wie in einem guten Roman, im Ton der Kampagne, gleich mit den Marken zum Sprechen geschrieben
(`references/sprechen.md`). Jeder erfundene Name kommt mit seiner Aussprache in `campaign set pronunciations`, nie als
Umschreibung in den Text.

**Vorbereitet wird, was vorgelesen wird:** die Szenen- und Vorlesetexte und die festen ersten Worte der NPCs. Alles
andere (die ersten Worte einer Antwort, Übergänge zwischen Zügen, Nachfragen) improvisiert die Spielleitung am Tisch.

Anfang und Ende sind Szenen, kein Pflichtprogramm:
- **Begrüßung** („Willkommen (zu Beginn)“): kurz, nur Organisatorisches. Was zur Bedienung gesagt wird, gibt es als
  `variants` (`when`) je Sprechart: **Sprechknöpfe** (Standard: jeder drückt zum Reden seinen Knopf, im Spielerfenster
  oder im Discord-Direktchat mit dem Bot; der Zug ist zu Ende, wenn alle, die gedrückt haben, fertig sind) und
  **Push-to-Talk** (nur, wenn es für den Abend eingeschaltet wird: reden, solange man Discords eigene
  Push-to-Talk-Taste hält; der Bot beendet den Zug, wenn alle Tasten los sind). Ein offenes Mikro mit Rufwort gibt es
  nicht.
- **Prolog** bei einer neuen Kampagne oder einer Welt, die die Spieler nicht kennen (er fehlt sonst fast immer): sechs
  bis zehn Vorlesetexte („Prolog 1: Die Welt“ …), zusammen bis zu zehn Minuten (etwa 1200–1400 Wörter), jeder mit
  eigenem Bild und Musik: die Welt und wie es sich in ihr lebt, was jeder in ihr weiß, was gerade in der Luft liegt,
  die Begriffe, die am Tisch fallen werden. Erzählt wie der Anfang eines guten Romans, ohne Spoiler; der letzte endet
  dort, wo die Helden einsteigen. Dazu ein Handout „Was eure Figuren wissen“ mit Begriffen und Orten.
- **Heldenvorstellung** bei vorgefertigten Helden (damit man sich entscheiden kann): je Held ein Vorlesetext von etwa
  einer Minute zu seinem Porträt: wer er ist, ein Moment aus seinem Leben, was er kann und was ihm schwerfällt, was er
  will, und für wen er sich spielt („für jemanden, der gern redet und handelt“). Ohne Geheimnis. Dazu die Tischkopie
  seines Bogens (`secret: false`).
- **Kapitelanfang** bei einer Fortsetzung: „Was bisher geschah“ als Erzählung mit Bild, die mitten in der Lage endet,
  in der die Helden stehen.
- **Kapitelende:** ein Schlusstext je möglichem Ende (`variants`), der aufgreift, was die Helden getan haben, und ein
  Ausblick (ein Bild, ein Geräusch, eine offene Frage), der bis zum nächsten Kapitel trägt.

Dazu Übergänge zwischen Szenen und die festen ersten Worte der NPCs als eigener Text mit `voice: "<NPC>"` (dann macht
`prepare_table` ihn in dessen Stimme; im Titel wann, z. B. „Hanna bittet um Hilfe (Szene 1)“).

## Handouts und Bögen

Handouts mit `handout`. **Handouts mit Geheimnis sind zum Flüstern** (das Spielerfenster zeigt allen alles): ein
eigenes Handout je Held (der Bogen mit seinem Geheimnis, ein Brief nur für ihn), im Titel für wen und wann („Handout:
Jules Bogen (für Jule, nach der Wahl)“). Die Spielleitung schickt es per `discord whisper handout` an den einen
Spieler, nie mit `show_players` oder `give_find`, die alle sehen. Eine Szene, die ein Held besser unter vier Augen
spielt, damit er es später selbst enthüllen kann, läuft per DM (Text, Bild, die Worte des NPCs als Sprachdatei),
während die anderen weiterspielen; einen Nebenraum mit Stimme (`discord aside`), bei dem die anderen warten, nur wo das
gesprochene Gespräch die Szene trägt.

**Bögen vorgefertigter Helden:** die Werte als `party set sheet_data`, dann `party sheet` je Held: ein PDF aus einer
Vorlage (`party templates` listet sie; eine eigene für die Kampagne mit `party save_template`), `secret: false` für die
Tischkopie ohne Geheimnis und Ziel. Am Abend flüstert die Spielleitung jedem seinen Bogen als PDF (`discord whisper`
mit `sheet: true`); ein Handout mit dem Geheimnis ist der Ersatz, wo es keinen Bogen als PDF gibt.

## Leitfaden

`kind guide`, eine Seite „So leitest du …“: Ablauf der Szenen, Würfe in diesem System, welcher Held welchen Weg hat,
Kampf vereinfacht. Dazu gehören hinein:
- **Rahmen:** wie tödlich, wie hart Misserfolge, wie lang ein Abend, was nicht vorkommen soll. Die Spielleitung liest
  es hier und fragt es am Abend nicht mehr. Nicht „großzügig, sie weichen beim ersten Erfolg“: Kämpfe sind bei jeder
  Härte gefährlich.
- **Was passiert, wenn die Helden nichts tun:** der Plan des Gegners als zwei, drei Schritte mit Zeitpunkt („nach Szene
  3 holen die Wölfe die erste Ziege, nach Szene 5 greifen sie das Dorf an“). So bewegt sich die Welt.
- **Ein Vorrat zum Improvisieren:** fünf, sechs freie Namen in der Sprache des Settings, ein paar Gerüchte (wahr und
  falsch) und 8–10 kleine Situationen (eine Begegnung unterwegs, ein NPC mit einer Bitte, ein Fund, ein Mini-Kampf,
  eine Wetter- oder Strahlungslage), jede mit Wurf, Folge und optionalem Bild. Sie passen fast überall und füllen, wenn
  die Spieler schneller sind oder einen Weg gehen, den niemand geplant hat; die Spielleitung erfindet damit stimmig
  statt beliebig.
- Die **Uhr-Tabelle** des Kapitels, wenn es Zeiten gibt.
- Bei Kampagnen: wo ein Abend gut endet (ein Haken zum Weiterspielen), und was es als Belohnung gibt (Erfahrung,
  Schätze, Ansehen).
- Bei Discord: welches Handout wem wann geflüstert wird und welche Szene unter vier Augen spielt. Soll die Gruppe in
  Räumen nach Orten sitzen, schaltet `campaign set` mit `discord_rooms: true` sie ein (Standard aus); die Spielleitung
  zieht dann bei jedem Ortswechsel einer Szene um.
- Effekte der Welt (`effects`): was sie bedeuten und in welchen Szenen sie passen.

Eine zweite Seite **„Vor dem Abend vorbereiten“**: was die Spielleitung tut, bevor Spieler da sind. Welches Kapitel
oder welcher Abend für `prepare_table` gilt und welche festen NPC-Zeilen es als `lines` mitbekommt, welche Bögen und
Handouts wem zu Beginn geflüstert werden, welche Karte zuerst gezeigt wird, und was vorher einmal angehört werden
sollte (eine neue Stimme, ein grenzwertiger Klang). Keine Liste vorgefertigter Sätze: Was nicht vorgelesen wird,
improvisiert die Spielleitung.
