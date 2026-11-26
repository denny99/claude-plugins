# Stimmen, Bilder, Karten und Klang

Gehört zu Skill `pnp-kampagne` („Stimmen“ und „Bilder, Karten, Klang“). Hier stehen die Einzelheiten: Der Maler
(`dnd-studio:pnp-maler`) und der Klang-Macher (`dnd-studio:pnp-klang`) arbeiten danach, die Reviewer prüfen danach.

## Stimmen

- `set_voice` für Erzähler und jeden sprechenden NPC, alle in einem Aufruf (`voices: [{who, from, description}, …]`):
  `from: "description"` macht aus `voice` eine Stimme (etwa eine Minute je Stimme), `ready` nimmt eine fertige,
  `creature` legt einen Klang darüber (Drache, Geist …). Jede sprechende Figur braucht eine eigene Stimmprobe; ohne
  `set_voice` erfände die Engine eine fremde Stimme. Nach `set_voice` eine Probe anhören, bevor gespielt wird.
- **Effekte je Stimme:** eigene, benannte Ketten aus Bausteinen im Profil (`voice_effect` list/new/set/remove;
  Bausteine tempo, band, drive, hiss, crackle, dry, gain). Eine Stimme bekommt einen per Name (`set_voice effect`, der
  Erzähler auch `campaign set narrator_effect`); sie liegen über jeder Zeile, vorab erzeugt wie live gestreamt.
  Vorlagen: Röhrenradio leicht/mittel/voll (voll war am Tisch zu viel: mittel zuerst). `tempo` nur sanft (0.9–1.1,
  mehr klingt robotisch). Längere Pausen gibt es nicht: nachträglich eingefügte Stille klingt wie ein Schnitt. Nur,
  wenn die Kampagne es will; nach einer Änderung `prepare_table`, es legt den Effekt über denselben Take. Im Studio:
  das Schild „Effekte“ auf der Stimmkarte, dort auch „Effekte bearbeiten“.
- **Aussprache** (`campaign set pronunciations`): die eigenen Namen und Wörter der Kampagne, wie die Stimme sie sagen
  soll (`{"Korath": "[emphasis] Ko-rat", "Gasriese*": "[emphasis] Gas-Riese"}`); die Texte behalten ihre Schreibweise.
  Einen Satz mit dem Wort in Varianten sprechen lassen und den Menschen wählen lassen. Einzelheiten:
  `references/sprechen.md`.

## Bilder

Bilder belegen die GPU minutenlang: erst wenn der Text steht, gebündelt malen und gebündelt abwarten (`jobs watch`).
- `paint_campaign`: ein Aufruf für alles, mit `items` (`[{kind, name}, …]`, Arten gemischt; je Art werden die
  Bildworte erst alle geschrieben, dann gemalt): NPC-Porträts, Orte, Szenen. Jede Szene braucht ein Bild, das die
  Spieler beim Vorlesen sehen. Jeder sprechende NPC braucht ein Porträt: Es erscheint im Spielerfenster, während er
  spricht, und ist sein Marker auf der Karte. Ein Handout (`handout: true`, ein Gegenstand wie Horn oder Laterne) wird
  mit `kind: "text"` ein Close-up des Gegenstands, keine Szene. Antwortet `paint_campaign` mit `working`, schreibt das
  Sprachmodell noch die Bildworte: denselben Aufruf noch einmal. Zum Reparieren nie erneut `paint_campaign` (es
  überschreibt abgenommene Bilder), sondern `picture` und `set_picture`.
- **Jedes neue Motiv entsteht mit Krea 2:** Alles aus Worten ohne Referenz (Ort, Szene, NSC, Wesen, Gegenstand) mit
  `picture` ohne Basis und `advanced_create: true`. FLUX Klein oder ein Referenzbild erst danach und nur, wenn es nötig
  ist: mit dem Ergebnis als Basis Helden hineinsetzen, Licht, Blickwinkel, ein Detail ändern (oder `advanced_edit`).
  Zeigt das Bild einen Helden oder einen NPC mit Porträt, ist dieser Edit Pflicht: die Figur kommt mit ihrem Porträt
  hinein (`person`, bei mehreren `replace`), danach auf dem Kontaktbogen gegen das Porträt prüfen. Ein reines
  Krea-Bild zeigt sonst fremde Gesichter (Kreide und Eisen, 2026-11-25).
  Krea sieht keine Bilder: kein `person`, keine Helden mit Foto in der Idee, keine `references`, keine `pose`; NSCs nur
  über ihr Aussehen in Worten. Für viele solche Bilder (`paint_campaign`) `options set kreaCreate: true`, danach wieder
  `false`: Solange es an ist, verweigern `paint_player` und `paint_map`. Fehlt Krea, meldet der Aufruf „models
  missing“ (`models install missing: true`, ~13 GB).
- **Bekannte Orte bleiben wiedererkennbar:** Hat ein Ort schon ein Bild (Ort oder Szene, auch aus einem früheren
  Kapitel), entsteht jedes neue Bild von ihm als Edit mit diesem Bild als Basis (`picture` mit dem alten Bild, FLUX
  Klein): nur Tageszeit, Licht, Wetter, Figuren oder Blickwinkel ändern. Neu aus Text nur, was noch nie gezeigt wurde.
  Danach Alt und Neu nebeneinander ansehen: Bauten, Formen und Farben müssen dieselben sein.
- Prüfen: 12–16 Bilder auf einem Kontaktbogen (`results sheet`), groß (`results get`) nur die Verdächtigen; Schlechtes
  neu malen. Kosmetisches nach zwei Versuchen nicht mehr jagen.

## Karten

Die Spieler wollen wissen, wo sie sind und wohin es geht; die Spielleitung zeigt Karten am Tisch. Zwei Ebenen:
1. **Kampagnenkarte** (die Gegend, alle Orte darauf): `paint_campaign` mit der Weltkarte (Kind world / Weltkarte) oder
   als eigene Karte. Jeder Ort ohne `in` liegt auf ihr. Eine große Gegend (mehr als 2×2 Kacheln) entsteht als **ein
   Bild**: `picture` (eine gedruckte Landkarte genau von oben, die Lage der Orte in Worten, Stil etwa „D&D sourcebook
   illustration“, nicht ein Filmstil), mit `picture_tool resolution 2` vergrößert, dann `map new` mit `picture` und
   `tiles`. Kachel für Kachel aus dem Plan gemalt wird eine Weltkarte zu Äckern aus der Nähe. Teilregionen ebenso, je
   eine eigene Karte.
2. **Eine Karte pro wichtigem Ort** (Dorf, Lichtung, Ruine, Höhle): `map new` mit Typ (welche Art Ort: nie raten, im
   Zweifel fragen), Look und Stil, dann `map plan` (was liegt wo, Feld für Feld: Wege, Gebäude, Wald, Wasser, der
   Eingang, wo die Gefahr wartet), dann `paint_map` (ganz). Den Ort mit `set_campaign_entry kind place map "<Karte>"`
   verknüpfen; Orte darin (`in`) bekommen ihren Marker dort.

- Karten zeigen, was die Szenen brauchen: in der Ruine der schmale Eingang und der Absatz oben, auf der Lichtung der
  Meiler und der Pfad nach Nordosten. Steht etwas in einer Szene, muss es auf der Karte zu finden sein.
- `map list` zeigt den Stand (gemalte und geplante Felder; ohne Bilder: `map` und `pictures: false`); `paint_map
  seams` glättet Kanten zwischen Kacheln. Passt der `look` einer Karte nicht zum gemalten Bild, korrigiert ihn `map
  set` mit `look`.
- **Marker statt Beschriftung.** Karten bekommen keine aufgemalten Namen; was was ist, sagen die Orts-Marker. Darum
  jeden Ort mit `pin_place` genau auf das setzen, was das gemalte Bild an dieser Stelle zeigt (die Mauer auf die
  gemalte Talsperre, nicht daneben), alle Orte einer Karte in einem Aufruf (`pins: [{place, x, y}, …]`), und die Lage
  auf der Karte prüfen. Ein Ort, der erst entdeckt werden soll, bekommt seinen Marker trotzdem: Im Spielerfenster
  erscheint er erst, wenn die Spielleitung ihn aufdeckt (`show_players reveal_places`). Ohne Marker versteht am Tisch
  niemand die Karte.
- Figuren auf der Karte setzt das Studio beim Szenenstart aus den `markers` der Szene; vor dem Abend stehen keine dort.

## Klang und Musik

- Geräusche und Musik macht **das Studio mit `make_sound`** (Stable Audio 3), alle Klänge eines Kapitels in einem
  Aufruf: `sounds: [{name, kind, idea, seconds}, …]`. Echte Aufnahmen (pixabay.com/sound-effects, /music, Freesound)
  nur, wenn das Studio nach zwei Versuchen nichts Brauchbares liefert oder ein Lied mit Gesang gebraucht wird;
  Herunterladen nur mit Freigabe des Menschen, dann mit `add_file` ins Studio. Suchen mit kurzen Worten, eine Quelle je
  Klang („goat bleating, close“, „fire whoosh“), für eine Schleife lange, gleichmäßige Aufnahmen.
- Vor dem Binden mit **`check_sound`** hören lassen: was der Klang sein soll und zwei, drei Verwechslungen, die am
  Tisch stören würden („heavy rain on a metal roof“, „applause“, „music“); liegt das Gewollte nicht vorn oder unter
  etwa 0,3 `cos`, einen anderen nehmen (nach Titeln allein fiel ein Drittel durch). Der Mensch hört vor dem Abend
  trotzdem einmal hinein.
- **Binden:** `set_campaign_entry` mit `sounds: [{sound: <Datei aus add_file>, name: "Wolfsheulen"}]` (Atmosphäre und
  Musik laufen in Schleife, ein Effekt einmal; `volume` nach Bedarf, Musik und Atmo unter Sprache höchstens 0.3).
  `sounds` ersetzt die ganze Liste: immer alle Klänge des Eintrags mitschicken. In `campaign` erscheint jeder als
  `file`; diese `file` bekommen `play_sound` und `say_line sound` am Tisch. Am Tisch hat jeder Klang einen Knopf; im
  Studio geht dasselbe im Dialog der Szene unter „Klänge“. Ein Klang, der zu keiner Szene gehört (ein Wesen, das
  überall heult), in die Notizen des NPC.
- **Musik nach Stimmung:** Je Kampagne eine Musik für `explore`, `tense`, `fight`, `rest` (`make_sound` mit `kind:
  "bgmusic"`, lange Schleifen), gebunden mit `campaign set mood_music: { explore: <Datei>, fight: <Datei>, … }`. Das ist
  nur der Rückfall: **Jede Szene bekommt eigene Musik** in ihren `sounds` mit `mood` (sonst laufen 20 Minuten dieselbe
  Gitarre), jeder Ort, an dem gekämpft wird, seine eigene Kampfmusik (`mood: "fight"`), die zum Gegner passt und meist
  düsterer ist als die der Kampagne. Am Tisch blendet die Musik mit der Stimmung über, ein Kampf schaltet von selbst um.

## Schleifen, Tiefenkarten, Effekte der Welt

- **Schleifen für die wichtigen Szenen** (Ankunft an einem Ort, der Höhepunkt, ein Ort mit Feuer, Nebel oder Wasser):
  `animate { start: <Szenenbild>, loop: true, idea: "was sich bewegt: das Feuer flackert, Rauch zieht" }` macht ein
  lebendes Standbild (Kamera und Personen still, ohne Ton, 5 s, nahtlos). Nur vor dem Abend: Mit offenem Tisch passt
  das Video neben der Stimme nicht auf die GPU. Die Schleife in `setup` der Szene („Schleife: <Datei>“), damit die
  Spielleitung sie mit `show_players loop: true` zeigt.
- **Tiefenkarten** für die Parallaxe im Spielerfenster macht `prepare_table` selbst (`dnd-studio:pnp-tischbereit`).
- **Eigene Effekte der Welt** (Strahlung im Ödland): was die Welt besonders macht, als Effekt über dem Bild aus
  Bausteinen, ohne GPU: `campaign set` mit `effects: { strahlung: { tint: "#b8ff3a", glow: 0.6, grain: 0.5, flicker:
  0.4, aberration: 0.35, pulse: 0.6, particles: "glow", sound: <Geigerzähler> } }` (`particles`: glow, sparks, dust;
  alle Stärken 0–1). Die Spielleitung zeigt ihn mit `show_players overlay: "strahlung"`. In `setup` der Szenen
  vermerken, wo er passt; im Leitfaden, was er bedeutet.
