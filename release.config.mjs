export default {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          'npm version ${nextRelease.version} --no-git-tag-version && bun run build:all',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'dist/fleet-darwin-arm64',
            name: 'fleet-darwin-arm64',
            label: 'macOS ARM64',
          },
          {
            path: 'dist/fleet-darwin-x64',
            name: 'fleet-darwin-x64',
            label: 'macOS Intel x64',
          },
          {
            path: 'dist/fleet-linux-x64',
            name: 'fleet-linux-x64',
            label: 'Linux x64',
          },
          {
            path: 'dist/fleet-windows-x64.exe',
            name: 'fleet-windows-x64.exe',
            label: 'Windows x64',
          },
        ],
      },
    ],
  ],
};
