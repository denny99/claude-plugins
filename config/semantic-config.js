/**
 * Semantic Release configuration for the denny99 plugin marketplace (one release per plugin).
 *
 * Every plugin under plugins/<name> runs `semantic-release --extends ../../config/semantic-config.js
 * semantic-release-monorepo` from its own folder (root `npm run release` runs them all). semantic-release-monorepo
 * only looks at commits that touch that folder and tags `<name>-v<version>`.
 *
 * Release Strategy (as in the deltastone projects):
 *
 * - Fix: patch
 * - Feat, Imp: minor
 * - BREAKING CHANGE: major
 * - Chore, ci, test, docs, …: no release
 *
 * A release writes the version into the plugin's entry in .claude-plugin/marketplace.json (main only; develop has no
 * versions, so the latest channel updates by commit), the plugin's CHANGELOG.md, a tag and a GitHub release.
 * Nothing is published to npm.
 */
module.exports = {
  branches: ['+([0-9])?(.{+([0-9]),x}).x', 'main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'angular',
        releaseRules: [{ type: 'imp', release: 'minor' }],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'fix', section: 'Bug Fixes' },
            { type: 'feat', section: 'Features' },
            { type: 'imp', section: 'Improvements' },
          ],
        },
        writerOpts: {
          commitGroupsSort: (a, b) => {
            // top -> bottom: Features -> Improvements -> Bug Fixes
            const order = ['Bug Fixes', 'Improvements', 'Features']
            return order.indexOf(a.title) >= order.indexOf(b.title) ? -1 : 1
          },
        },
      },
    ],
    '@semantic-release/changelog',
    [
      '@semantic-release/exec',
      {
        // the plugin's folder name is its package name and its marketplace name. Staged here: @semantic-release/git
        // skips assets outside the plugin's folder, but commits whatever is staged.
        prepareCmd: 'node ../../scripts/set-plugin-version.mjs "$(node -p "require(\'./package.json\').name")" ${nextRelease.version} && git add ../../.claude-plugin/marketplace.json',
      },
    ],
    [
      '@semantic-release/github',
      {
        successComment: false,
        failComment: false,
        failTitle: false,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', '../../.claude-plugin/marketplace.json'],
        message: 'chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
}
