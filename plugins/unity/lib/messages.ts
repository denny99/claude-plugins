/** Bridge failure texts for people: German, with a way out (no imports: lib/unity.ts and lib/bridge.ts use it). */

/** Where to fix a picture the editor could not take (also when the editor is throttled in the background). */
export const SHOT_WAY =
  'Unity-Fenster nach vorn holen und den Game-Tab sichtbar lassen, dann nochmal versuchen.'

/**
 * English bridge texts (older bridges, .NET exceptions) → German sentences with a way out; unknown texts pass through.
 * Newer bridges answer in German already; those pass unchanged.
 */
export function germanBridgeError(error: string): string {
  const table: [RegExp, string][] = [
    [/wrote no screenshot|is it visible/i, `Unity hat kein Bild geschrieben. ${SHOT_WAY}`],
    [/Another screenshot is still being written/i, 'Unity schreibt noch ein anderes Bild. Kurz warten und nochmal versuchen.'],
    [/Play-mode screenshots need a visible editor window/i, 'Bilder im Play-Modus brauchen ein sichtbares Editor-Fenster (kein Hintergrund-Lauf).'],
    [/No camera in the open scene/i, 'In der offenen Szene ist keine Kamera. Eine Kamera anlegen oder eine Szene mit Kamera öffnen.'],
    [/Scripts have compile errors/i, 'Die Skripte haben Compile-Fehler. Erst beheben, dann Play starten.'],
    [/Stop Play mode first/i, 'Erst den Play-Modus stoppen.'],
    [/open scene has unsaved changes/i, 'Die offene Szene hat ungespeicherte Änderungen. Erst speichern.'],
    [/A test run is already going/i, 'Es läuft schon ein Testlauf. Warten oder ihn abbrechen.'],
    [/No test run is going/i, 'Es läuft kein Testlauf.'],
    [/needs Play mode/i, 'Das geht nur im Play-Modus. Erst Play starten.'],
    [/A perf recording is already running/i, 'Es läuft schon eine Leistungsmessung.'],
    [/No frames arrived/i, 'Es kamen keine Bilder an: Spiel pausiert, oder Unity läuft gedrosselt im Hintergrund. Unity-Fenster nach vorn holen.'],
  ]
  for (const [re, de] of table) if (re.test(error)) return de
  return error
}
