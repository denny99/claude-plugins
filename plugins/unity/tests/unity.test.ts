import { describe, expect, test } from 'claude-code/testing'

import { editNotes, metaCandidates } from '../features/guards'
import { draftJson, jobsFromDocs } from '../features/init'
import { readCompile, readStatus } from '../lib/bridge'
import type { HostEnv } from '../lib/host'
import { augmentedPath, pathDelimiter } from '../lib/host'
import { dirname, join, norm, relative } from '../lib/path'
import { exitCodeOf, wrapCommand } from '../lib/shell'
import {
  batchAllowed,
  batchTestArgs,
  compileContext,
  detectProject,
  editorCandidates,
  editorLogPath,
  filtersFromDoc,
  findEditor,
  lastCompileBlock,
  matchesGlob,
  parseCompilerMessages,
  parseNUnitXml,
  parseProjectConfig,
  parseProjectVersion,
  parseSecondaryInstallPath,
  rankResults,
  splitFilter,
  testReport,
  formatMessage,
  toUnityFilter,
} from '../lib/unity'

const MAC: HostEnv = { platform: 'macos', home: '/Users/d', path: '/usr/bin' }
const WIN: HostEnv = {
  platform: 'windows',
  home: 'C:/Users/d',
  localAppData: 'C:/Users/d/AppData/Local',
  appData: 'C:/Users/d/AppData/Roaming',
  programFiles: 'C:/Program Files',
  path: 'C:/Windows',
}

function memFs(files: Record<string, string>, dirs: Record<string, string[]> = {}) {
  return {
    read: async (p: string) => {
      const v = files[p]
      if (v === undefined) throw new Error(`ENOENT ${p}`)
      return v
    },
    exists: async (p: string) => p in files || p in dirs,
    list: async (p: string) => (dirs[p] ?? []).map(name => ({ name, kind: 'dir' as const })),
  }
}

const VERSION = 'm_EditorVersion: 6000.6.7f1\nm_EditorVersionWithRevision: 6000.6.7f1 (b22767f04f04)\n'

describe('paths and host', () => {
  test('normalizes Windows paths and keeps drive roots', () => {
    expect(norm('C:\\a\\\\b')).toBe('C:/a/b')
    expect(join('C:\\proj', 'Temp', 'x')).toBe('C:/proj/Temp/x')
    expect(dirname('C:/a')).toBe('C:/')
    expect(relative('C:/Proj', 'c:/proj/Assets/A.cs')).toBe('Assets/A.cs')
    expect(relative('/p', '/q/A.cs')).toBe('/q/A.cs')
    expect(pathDelimiter('windows')).toBe(';')
    expect(augmentedPath('windows', 'C:/Users/d', 'C:\\Windows;C:\\Git\\bin')).toBe('C:\\Windows;C:\\Git\\bin')
    expect(augmentedPath('macos', '/Users/d', '/usr/bin').split(':')[0]).toBe('/opt/homebrew/bin')
  })

  test('wrapped commands report their exit code', () => {
    expect(wrapCommand('unity -batchmode', '/p')).toContain('cd /p && unity -batchmode')
    expect(exitCodeOf('x\n[unity-run] exit 2\n')).toBe(2)
    expect(exitCodeOf('still running')).toBeUndefined()
  })
})

describe('project detection', () => {
  test('finds the project at the root or one level down', async () => {
    expect(parseProjectVersion(VERSION)).toEqual({ version: '6000.6.7f1', revision: 'b22767f04f04' })
    const atRoot = await detectProject('/g', memFs({ '/g/ProjectSettings/ProjectVersion.txt': VERSION }))
    expect(atRoot?.root).toBe('/g')
    const below = await detectProject(
      '/game',
      memFs(
        { '/game/unity/ProjectSettings/ProjectVersion.txt': VERSION },
        { '/game': ['docs', 'node_modules', 'unity'] },
      ),
    )
    expect(below).toMatchObject({ root: '/game/unity', sessionRoot: '/game', version: '6000.6.7f1', name: 'unity' })
    expect(await detectProject('/x', memFs({}, { '/x': ['a'] }))).toBeUndefined()
  })
})

describe('editor and log per OS', () => {
  test('macOS: Hub default, then the Hub secondary install path', async () => {
    expect(editorCandidates(MAC, '6000.6.7f1', '/Volumes/U')).toEqual([
      '/Applications/Unity/Hub/Editor/6000.6.7f1/Unity.app/Contents/MacOS/Unity',
      '/Volumes/U/6000.6.7f1/Unity.app/Contents/MacOS/Unity',
    ])
    const fs = memFs({
      '/Users/d/Library/Application Support/UnityHub/secondaryInstallPath.json': '"/Volumes/U"',
      '/Volumes/U/6000.6.7f1/Unity.app/Contents/MacOS/Unity': '',
    })
    expect((await findEditor(MAC, '6000.6.7f1', fs)).path).toBe('/Volumes/U/6000.6.7f1/Unity.app/Contents/MacOS/Unity')
    expect((await findEditor(MAC, '6000.6.7f1', fs, '/my/Unity')).path).toBe('/my/Unity')
    expect(editorLogPath(MAC)).toBe('/Users/d/Library/Logs/Unity/Editor.log')
  })

  test('Windows: Program Files Hub path, AppData secondary path, LOCALAPPDATA log', async () => {
    expect(parseSecondaryInstallPath('"D:\\\\Unity"')).toBe('D:/Unity')
    expect(parseSecondaryInstallPath('""')).toBeUndefined()
    const fs = memFs({
      'C:/Users/d/AppData/Roaming/UnityHub/secondaryInstallPath.json': '"D:\\\\Unity"',
      'D:/Unity/6000.6.7f1/Editor/Unity.exe': '',
    })
    const found = await findEditor(WIN, '6000.6.7f1', fs)
    expect(found.tried[0]).toBe('C:/Program Files/Unity/Hub/Editor/6000.6.7f1/Editor/Unity.exe')
    expect(found.path).toBe('D:/Unity/6000.6.7f1/Editor/Unity.exe')
    expect(editorLogPath(WIN)).toBe('C:/Users/d/AppData/Local/Unity/Editor/Editor.log')
  })
})

describe('compiler messages', () => {
  const LOG = [
    'Starting: /Applications/Unity/.../bee_backend --profile old',
    'Assets/Old.cs(1,1): error CS0001: old error',
    '- Starting script compilation',
    'Assets/Game/Player.cs(12,5): error CS1002: ; expected',
    'Assets/Game/Player.cs(12,5): error CS1002: ; expected',
    "Assets\\Game\\Enemy.cs(3,10): warning CS0168: The variable 'e' is declared but never used",
    'Assets/Other.cs(9,1): warning CS0414: field assigned but never used',
    'some other line',
  ].join('\r\n')

  test('parses the last compile block, dedups, normalizes paths', () => {
    const msgs = parseCompilerMessages(lastCompileBlock(LOG))
    expect(msgs).toHaveLength(3)
    expect(msgs[0]).toEqual({
      severity: 'error',
      file: 'Assets/Game/Player.cs',
      line: 12,
      column: 5,
      code: 'CS1002',
      message: '; expected',
    })
    expect(msgs[1]?.file).toBe('Assets/Game/Enemy.cs')
  })

  test('the gate text: all errors, warnings only for edited files', () => {
    const msgs = parseCompilerMessages(lastCompileBlock(LOG))
    const text = compileContext(msgs, ['/p/Assets/Game/Enemy.cs']) ?? ''
    expect(text).toContain('1 error(s)')
    expect(text).toContain('Assets/Game/Player.cs(12,5): error CS1002: ; expected')
    expect(text).toContain('Enemy.cs(3,10): warning CS0168')
    expect(text).not.toContain('Other.cs')
    expect(
      compileContext(
        msgs.filter(m => m.severity === 'warning'),
        ['/p/Assets/X.cs'],
      ),
    ).toBeUndefined()
  })
})

describe('tests', () => {
  const XML = `<?xml version="1.0"?>
<test-run result="Failed(Child)">
  <test-suite type="Assembly">
    <test-case id="1" name="Adds" fullname="Game.Tests.MathTests.Adds" result="Passed" duration="0.01" />
    <test-case id="2" name="Divides" fullname="Game.Tests.MathTests.Divides" result="Failed" duration="0.2">
      <failure><message><![CDATA[Expected: 2
  But was: 3]]></message><stack-trace><![CDATA[at Game.Tests.MathTests.Divides () [0x0] in /p/Assets/Tests/MathTests.cs:14]]></stack-trace></failure>
    </test-case>
    <test-case id="3" name="Old" fullname="Game.Tests.MathTests.Old" result="Failed" />
    <test-case id="4" name="Skip&amp;Me" fullname="Game.Tests.Skip&amp;Me" result="Skipped" />
  </test-suite>
</test-run>`

  test('NUnit XML, newly red first, report', () => {
    const results = parseNUnitXml(XML)
    expect(results.map(r => r.status)).toEqual(['Passed', 'Failed', 'Failed', 'Skipped'])
    expect(results[1]?.message).toBe('Expected: 2\n  But was: 3')
    expect(results[3]?.fullName).toBe('Game.Tests.Skip&Me')
    const ranked = rankResults(results, {
      'Game.Tests.MathTests.Old': 'Failed',
      'Game.Tests.MathTests.Divides': 'Passed',
    })
    expect(ranked[0]).toMatchObject({ fullName: 'Game.Tests.MathTests.Divides', newlyRed: true })
    expect(ranked[1]).toMatchObject({ fullName: 'Game.Tests.MathTests.Old', newlyRed: false })
    const report = testReport({ state: 'done', mode: 'EditMode', results }, { 'Game.Tests.MathTests.Old': 'Failed' })
    expect(report.split('\n')[0]).toBe('EditMode: 1 passed, 2 failed, 1 skipped of 4.')
    expect(report).toContain('NEW FAIL Game.Tests.MathTests.Divides')
    expect(report).toContain('  at Game.Tests.MathTests.Divides () [0x0] in /p/Assets/Tests/MathTests.cs:14')
    expect(batchTestArgs('/p', 'EditMode', '/p/Logs/r.xml', 'A;B')).toEqual([
      '-batchmode',
      '-nographics',
      '-projectPath',
      '/p',
      '-runTests',
      '-testPlatform',
      'EditMode',
      '-testResults',
      '/p/Logs/r.xml',
      '-testFilter',
      'A;B',
      '-logFile',
      '-',
    ])
  })

  test('filters: config areas, doc areas, dotnet syntax, ; split', () => {
    const doc = [
      '## 1. Kern — `Sim/Core/`',
      '- **Tests:** `Core/SeededRandomTests.cs` — Filter `FullyQualifiedName~Cozy.Sim.Tests.Core` (~1 s).',
      '### Ort (eine neue Ortsart)',
      '- Fängt … Filter `FullyQualifiedName~Places|FullyQualifiedName~Tuning`.',
      '## Ohne Filter',
      'nothing here',
    ].join('\n')
    expect(filtersFromDoc(doc)).toEqual([
      { name: '1. Kern', filter: 'Cozy\\.Sim\\.Tests\\.Core', source: 'docs' },
      { name: 'Ort (eine neue Ortsart)', filter: 'Places|Tuning', source: 'docs' },
    ])
    expect(toUnityFilter('MyTests.Foo')).toBe('MyTests.Foo')
    expect(splitFilter(' A ; ;B')).toEqual(['A', 'B'])
    const cfg = parseProjectConfig(
      JSON.stringify({
        tests: { areas: { Core: 'G.Core' } },
        editorEnv: { MUTE: '1', bad: 2 },
        customJobs: [{ name: 'Smoke', command: 'node t.mjs' }, { name: 'x' }],
      }),
    )
    expect(cfg).toEqual({
      areas: { Core: 'G.Core' },
      editorEnv: { MUTE: '1' },
      customJobs: [{ name: 'Smoke', command: 'node t.mjs' }],
    })
    expect(parseProjectConfig('not json')).toEqual({})
  })
})

describe('lockfile / bridge heartbeat', () => {
  test('batch only when no editor holds the project', () => {
    expect(batchAllowed({ lock: 'free', bridgeUp: false }).ok).toBe(true)
    expect(batchAllowed({ lock: 'stale', bridgeUp: false }).ok).toBe(true)
    expect(batchAllowed({ lock: 'held', bridgeUp: false }).ok).toBe(false)
    expect(batchAllowed({ lock: 'free', bridgeUp: true }).ok).toBe(false)
  })

  test('a heartbeat older than 10 s means the bridge is down', async () => {
    const fs = memFs({
      '/p/Temp/ClaudeBridge/status.json': JSON.stringify({ updatedAt: 1000, isPlaying: true, compileSeq: 4 }),
    })
    expect(await readStatus(fs, '/p', 3000)).toMatchObject({ up: true, status: { isPlaying: true, compileSeq: 4 } })
    expect(await readStatus(fs, '/p', 12000)).toMatchObject({ up: false, why: 'stale' })
    expect(await readStatus(memFs({}), '/p', 1)).toEqual({ up: false, why: 'missing' })
  })
})

describe('guards and init', () => {
  const base = {
    tool: 'Write' as const,
    path: '/g/unity/Assets/Game/New/Thing.cs',
    text: 'class Thing {}',
    existedBefore: false,
    sessionRoot: '/g',
    projectRoot: '/g/unity',
    missingMeta: [] as string[],
    isPlaying: false,
  }

  test('meta, YAML, wall clock, banned APIs, reminders, play restart', () => {
    expect(metaCandidates('/g/unity', '/g/unity/Assets/Game/New/Thing.cs')).toEqual([
      '/g/unity/Assets/Game/New/Thing.cs',
      '/g/unity/Assets/Game/New',
      '/g/unity/Assets/Game',
    ])
    expect(metaCandidates('/g/unity', '/g/docs/x.md')).toEqual([])
    const notes = editNotes(
      {
        ...base,
        path: '/g/unity/Assets/Game/Tests/TimerTests.cs',
        text: 'var sw = Stopwatch.StartNew(); var r = new System.Random();',
        missingMeta: ['/g/unity/Assets/Game/Tests/TimerTests.cs'],
        isPlaying: true,
      },
      {
        bannedApis: [{ glob: 'Assets/Game/**', patterns: ['System.Random', 'DateTime.Now'] }],
        syncReminders: [{ glob: '*.cs', message: 'Sync the code map.' }],
      },
    )
    expect(notes.find(n => n.startsWith('New asset without .meta'))).toContain('Assets/Game/Tests/TimerTests.cs')
    expect(notes.some(n => n.startsWith('Wall-clock in a test (Stopwatch)'))).toBe(true)
    expect(notes).toContain('Banned here by .claude/unity.json (Assets/Game/**): System.Random.')
    expect(notes).toContain('Sync the code map.')
    expect(notes.some(n => n.includes('needs a Play restart'))).toBe(true)
    expect(
      editNotes({ ...base, tool: 'Edit', path: '/g/unity/Assets/Scenes/Main.unity', existedBefore: true }, {})[0],
    ).toContain('Unity-serialized YAML')
    expect(editNotes(base, {})).toEqual([])
    expect(matchesGlob('unity/Assets/Loc/texts.de.json', '**/texts.*.json')).toBe(true)
  })

  test('/unity-init finds wrapper commands in docs code blocks', () => {
    const md = [
      '```bash',
      'node tools/unity.mjs compile          # comment',
      'node tools/unity.mjs editmode',
      'node tools/unity.mjs pictures -seed <n>',
      'dotnet test x',
      '```',
      'node tools/outside.mjs',
    ].join('\n')
    expect(jobsFromDocs(md)).toEqual([
      { name: 'compile', command: 'node tools/unity.mjs compile' },
      { name: 'editmode', command: 'node tools/unity.mjs editmode' },
    ])
    expect(JSON.parse(draftJson({ areas: { A: 'x' }, worktreeDir: '.worktrees' }))).toEqual({
      worktreeDir: '.worktrees',
      tests: { areas: { A: 'x' } },
      editorEnv: {},
    })
  })
})

describe('smoke-test regressions', () => {
  test('a compiler message is located once, also when the message (old bridge) repeats the prefix', () => {
    const where = { severity: 'error' as const, file: 'Assets/Smoke.cs', line: 1, column: 41, code: 'CS0029' }
    const line = "Assets/Smoke.cs(1,41): error CS0029: Cannot implicitly convert type 'string' to 'int'"
    expect(formatMessage({ ...where, message: line })).toBe(line)
    expect(formatMessage({ ...where, message: "Cannot implicitly convert type 'string' to 'int'" })).toBe(line)
    expect(formatMessage({ severity: 'warning', message: 'error-free text: kept' })).toBe(
      'warning: error-free text: kept',
    )
  })

  test('compile.json: the bridge code field wins, old bridges still give the code from the message', async () => {
    const fs = memFs({
      '/p/Temp/ClaudeBridge/compile.json': JSON.stringify({
        seq: 2,
        messages: [
          { severity: 'error', message: 'bare', file: 'Assets/A.cs', line: 1, column: 2, code: 'CS1002' },
          {
            severity: 'error',
            message: 'Assets/B.cs(3,4): error CS0103: old',
            file: 'Assets/B.cs',
            line: 3,
            column: 4,
          },
        ],
      }),
    })
    const c = await readCompile(fs, '/p')
    expect(c?.messages.map(m => m.code)).toEqual(['CS1002', 'CS0103'])
    expect(c?.messages.map(formatMessage)).toEqual([
      'Assets/A.cs(1,2): error CS1002: bare',
      'Assets/B.cs(3,4): error CS0103: old',
    ])
  })

  test('a failed test stack line already starting with "at" is not prefixed twice', () => {
    const report = testReport(
      {
        state: 'done',
        mode: 'EditMode',
        results: [
          {
            fullName: 'EditTests.Fails',
            status: 'Failed',
            message: 'Expected: 1  But was: 2',
            stack: 'at EditTests.Fails () [0x00001] in /p/Assets/Tests/EditTests.cs:12',
          },
        ],
      } as never,
      {},
    )
    expect(report).toContain('  at EditTests.Fails () [0x00001] in /p/Assets/Tests/EditTests.cs:12')
    expect(report).not.toContain('at at')
  })

  test('status.json: batchmode is read when present, absent from older bridges', async () => {
    const at = (extra: object) =>
      memFs({ '/p/Temp/ClaudeBridge/status.json': JSON.stringify({ updatedAt: 1000, ...extra }) })
    expect(await readStatus(at({ batchmode: true }), '/p', 2000)).toMatchObject({ status: { batchmode: true } })
    const old = await readStatus(at({}), '/p', 2000)
    expect(old.status && 'batchmode' in old.status).toBe(false)
  })
})
