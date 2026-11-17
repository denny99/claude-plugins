import { describe, expect, test } from 'claude-code/testing'

import { affectedAreas, affectedText, changedFiles, landingsReminder } from '../lib/affected'
import {
  commitReason,
  gitCommits,
  metaFindings,
  metaReason,
  parsePorcelain,
  splitCommand,
  writeCommitReason,
  writesBeforeCommit,
} from '../lib/command'
import { batchCompileArgs, filtersFromDoc, parseProjectConfig, type TestFilterPreset } from '../lib/unity'
import { libraryCopyArgs, libraryCopyLine, worktreeAddArgs, worktreePaths } from '../lib/worktree'

const reasonFor = (cmd: string) => metaReason(cmd, metaFindings(cmd))

describe('command lines', () => {
  test('splits at operators, keeps quotes, tracks cd', () => {
    const s = splitCommand(`cd unity && git mv "Assets/A B.cs" 'Assets/C.cs'; echo done`)
    expect(s.map(x => x.words)).toEqual([
      ['cd', 'unity'],
      ['git', 'mv', 'Assets/A B.cs', 'Assets/C.cs'],
      ['echo', 'done'],
    ])
    expect(s[1]?.cd).toBe('unity')
  })

  test('git commit detection: global options, -C, cd; other subcommands ignored', () => {
    expect(gitCommits('git commit -m "x"')).toEqual([{}])
    expect(gitCommits('git -C ../wt -c user.name=x commit -am y')).toEqual([{ dir: '../wt' }])
    expect(gitCommits('cd .worktrees/a && git add . && git commit -m z')).toEqual([{ dir: '.worktrees/a' }])
    expect(gitCommits('git log --grep commit; echo "git commit"')).toEqual([])
  })

  test('restore-before-commit reason names the exact checkout', () => {
    const mod = parsePorcelain(' M unity/Packages/packages-lock.json\nM  other.json\n?? new.txt\n')
    expect(mod).toEqual([
      { staged: false, path: 'unity/Packages/packages-lock.json' },
      { staged: true, path: 'other.json' },
    ])
    const r = commitReason(mod) ?? ''
    expect(r).toContain('git checkout -- unity/Packages/packages-lock.json')
    expect(r).toContain('git checkout HEAD -- other.json')
    expect(commitReason(mod.slice(0, 1), '/g/.worktrees/a')).toContain(
      'git -C /g/.worktrees/a checkout -- unity/Packages/packages-lock.json',
    )
    expect(commitReason([])).toBeUndefined()
  })
})

describe('.meta guard', () => {
  test('mv rename without .meta → both renames', () => {
    expect(reasonFor('mv Assets/Game/A.cs Assets/Game/B.cs')).toContain(
      'mv Assets/Game/A.cs Assets/Game/B.cs && mv Assets/Game/A.cs.meta Assets/Game/B.cs.meta',
    )
  })
  test('git mv into a folder, several sources → metas added before the folder', () => {
    expect(reasonFor('git mv -k Assets/A.cs Assets/B.prefab Assets/Old/')).toContain(
      'git mv -k Assets/A.cs Assets/B.prefab Assets/A.cs.meta Assets/B.prefab.meta Assets/Old/',
    )
  })
  test('rm / git rm -r folder → metas added; rest of the line kept', () => {
    expect(reasonFor('rm -f unity/Assets/X.cs && echo ok')).toContain(
      'rm -f unity/Assets/X.cs unity/Assets/X.cs.meta && echo ok',
    )
    expect(reasonFor('git rm -r Assets/Old/')).toContain('git rm -r Assets/Old/ Assets/Old.meta')
  })
  test('Windows: move, del, Move-Item, Remove-Item', () => {
    expect(reasonFor('move Assets\\A.cs Assets\\B.cs')).toContain(
      'move Assets\\A.cs Assets\\B.cs && move Assets\\A.cs.meta Assets\\B.cs.meta',
    )
    expect(reasonFor('del /Q Assets\\A.cs')).toContain('del /Q Assets\\A.cs Assets\\A.cs.meta')
    expect(reasonFor('Move-Item -Path Assets/A.cs -Destination Assets/B.cs -Force')).toContain(
      'Move-Item -Force Assets/A.cs Assets/B.cs; Move-Item -Force Assets/A.cs.meta Assets/B.cs.meta',
    )
    expect(reasonFor('Remove-Item "Assets/My File.cs"')).toContain(
      'Remove-Item "Assets/My File.cs"; Remove-Item "Assets/My File.cs.meta"',
    )
  })
  test('allowed: meta in the same command, outside Assets/, wildcards, .meta itself, other commands', () => {
    for (const ok of [
      'mv Assets/A.cs Assets/B.cs && mv Assets/A.cs.meta Assets/B.cs.meta',
      'git mv Assets/A.cs Assets/A.cs.meta Assets/Sub/',
      'rm Assets/A.cs Assets/A.cs.meta',
      'mv docs/a.md docs/b.md',
      'rm Assets/Gen/*.cs',
      'rm Assets/A.cs.meta',
      'cat Assets/A.cs',
      'git rm --cached Library/x',
    ])
      expect(metaFindings(ok)).toEqual([])
  })
  test('no finding for heredoc bodies or Unity copies under Library/, Temp/, PackageCache', () => {
    for (const ok of [
      "cat > notes.md <<'EOF'\nrm Assets/A.cs\nmv Assets/B.cs Assets/C.cs\nEOF\necho done",
      'git commit -F - <<EOF\nrm Assets/Old.cs\nEOF',
      'cat <<-END\n\tmv Assets/A.png Assets/B.png\n\tEND',
      'rm -rf Library/PackageCache/com.x@1.0/Assets/Foo.cs',
      'rm unity/Library/Bee/Assets/Gen.cs',
      'mv Temp/Assets/x.cs Temp/Assets/y.cs',
      'rm PackageCache/com.y/Assets/Z.cs',
    ])
      expect(metaFindings(ok)).toEqual([])
    // A command after the heredoc is still read, and Assets/Temp/ is an ordinary asset folder.
    expect(metaFindings("cat <<'EOF' > a.txt\nhello\nEOF\nrm Assets/A.cs")).toHaveLength(1)
    expect(metaFindings('rm Assets/Temp/A.cs')).toHaveLength(1)
  })
  test('git rm --cached stays flagged and the reason says why', () => {
    const r = reasonFor('git rm --cached Assets/A.cs') ?? ''
    expect(r).toContain('git rm --cached only untracks')
    expect(r).toContain('git rm --cached Assets/A.cs Assets/A.cs.meta')
  })
})

describe('worktree', () => {
  test('paths: worktreeDir + project folder inside', () => {
    expect(worktreePaths('/g', '/g/unity', '.worktrees', 'wt1')).toEqual({
      path: '/g/.worktrees/wt1',
      projectRoot: '/g/.worktrees/wt1/unity',
      library: { from: '/g/unity/Library', to: '/g/.worktrees/wt1/unity/Library' },
    })
    expect(worktreePaths('/g', '/g', undefined, 'x').projectRoot).toBe('/g/.worktrees/x')
    expect(worktreeAddArgs('/g', '/g/.worktrees/x')).toEqual(['-C', '/g', 'worktree', 'add', '/g/.worktrees/x'])
  })
  test('Library copy argv per OS', () => {
    expect(libraryCopyArgs('macos', '/a/Library', '/b/Library')).toEqual(['cp', '-c', '-R', '/a/Library', '/b/Library'])
    expect(libraryCopyArgs('linux', '/a/Library', '/b/Library')).toEqual([
      'cp',
      '--reflink=auto',
      '-R',
      '/a/Library',
      '/b/Library',
    ])
    expect(libraryCopyArgs('windows', 'C:/g/Library', 'C:/g/.worktrees/x/Library')).toEqual([
      'robocopy',
      'C:\\g\\Library',
      'C:\\g\\.worktrees\\x\\Library',
      '/E',
      '/NFL',
      '/NDL',
    ])
    const win = libraryCopyLine('windows', 'C:/g/Library', 'C:/w/Library')
    expect(win.startsWith("MSYS2_ARG_CONV_EXCL='*' robocopy")).toBe(true)
    expect(win).toContain('[ "$__rc" -lt 8 ]')
    expect(libraryCopyLine('macos', '/a b/Library', '/c/Library')).toBe("cp -c -R '/a b/Library' /c/Library")
  })
})

describe('narrow-test picker', () => {
  const presets: TestFilterPreset[] = [
    { name: 'Core', filter: 'Game.Tests.Core', source: 'config' },
    { name: 'World', filter: 'Game.Tests.World', source: 'config', paths: ['Assets/Game/Places/**'] },
  ]
  test('changed files → areas by paths or folder names; uncovered and outside files', () => {
    const files = changedFiles(
      'unity/Assets/Game/Core/Adder.cs\nunity/Assets/Game/Places/Town.cs\nREADME.md\n',
      'unity/Assets/Game/Ui/Hud.cs\nunity/Assets/Game/Core/Adder.cs.meta\n',
    )
    const a = affectedAreas(files, presets, 'unity')
    expect(a.areas).toEqual([
      { name: 'Core', filter: 'Game.Tests.Core', files: ['unity/Assets/Game/Core/Adder.cs'] },
      { name: 'World', filter: 'Game.Tests.World', files: ['unity/Assets/Game/Places/Town.cs'] },
    ])
    expect(a.uncovered).toEqual(['unity/Assets/Game/Ui/Hud.cs'])
    expect(a.ignored).toBe(2)
    expect(affectedText(a)).toContain('No area covers 1 changed file(s)')
  })
  test('landings reminder after N', () => {
    expect(landingsReminder({ count: 4, every: 5 })).toBeUndefined()
    expect(landingsReminder({ count: 5, every: 5 })).toContain('5 commits landed since the last full test suite')
  })
  test('config: tests.paths + fullSuiteEvery; code-map paths per area', () => {
    const cfg = parseProjectConfig(
      JSON.stringify({ tests: { areas: { W: 'X' }, paths: { W: 'Assets/W/**' } }, fullSuiteEvery: 3 }),
    )
    expect(cfg.areaPaths).toEqual({ W: ['Assets/W/**'] })
    expect(cfg.fullSuiteEvery).toBe(3)
    const doc = '## Sim\nCode in `Assets/Cozy/Sim/`.\nFilter `Cozy.Tests.Sim`\n## Ui\nFilter `Cozy.Tests.Ui`\n'
    expect(filtersFromDoc(doc)).toEqual([
      { name: 'Sim', filter: 'Cozy.Tests.Sim', source: 'docs', paths: ['Assets/Cozy/Sim/'] },
      { name: 'Ui', filter: 'Cozy.Tests.Ui', source: 'docs' },
    ])
  })
  test('batch runs log to a file when given one', () => {
    expect(batchCompileArgs('/p', '/p/Logs/c.log').slice(-2)).toEqual(['-logFile', '/p/Logs/c.log'])
  })
})

describe('writes to a restore-before-commit file in the same line as a commit', () => {
  const lock = ['Packages/packages-lock.json']
  test('redirects, sed -i, tee, cd + relative path and package managers count; after the commit or no commit do not', () => {
    expect(writesBeforeCommit('echo x >> Packages/packages-lock.json && git add -A && git commit -m t', lock)).toEqual(
      lock,
    )
    expect(writesBeforeCommit('echo x>Packages/packages-lock.json; git commit -am t', lock)).toEqual(lock)
    expect(writesBeforeCommit("sed -i '' 's/a/b/' Packages/packages-lock.json && git commit -am t", lock)).toEqual(lock)
    expect(writesBeforeCommit('cd Packages && echo y | tee -a packages-lock.json && git commit -am t', lock)).toEqual(
      lock,
    )
    expect(writesBeforeCommit('npm i && git commit -am t', ['package-lock.json'])).toEqual(['package-lock.json'])
    expect(writesBeforeCommit('git commit -m t && echo x >> Packages/packages-lock.json', lock)).toEqual([])
    expect(writesBeforeCommit('echo x >> Packages/packages-lock.json', lock)).toEqual([])
    expect(writesBeforeCommit('echo x >> Assets/A.cs && git commit -am t', lock)).toEqual([])
    expect(writesBeforeCommit('npm i && git commit -am t', lock)).toEqual([])
  })
  test('the reason names the file and how to go on', () => {
    const r = writeCommitReason(lock) ?? ''
    expect(r).toContain('Packages/packages-lock.json')
    expect(r).toContain('git checkout -- Packages/packages-lock.json')
    expect(writeCommitReason([])).toBeUndefined()
  })
})
