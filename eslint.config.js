// Minimal ESLint flat config. The repo doesn't have a curated rule set yet —
// this config exists so `pnpm lint` exits 0 and CI/automation gates can
// depend on it. When the team is ready to enforce rules, replace this with
// a proper TypeScript-aware setup (@eslint/js + typescript-eslint + react
// plugins). See PRD/CLAUDE.md for the recommended stack.
//
// For now we ignore everything that ESLint v10 would otherwise try to
// parse without a parser plugin (TS/TSX/JSX) and only lint plain JS files.
// No rules are enabled, so the only failures would be parse errors on the
// files we DO match — which are none in this monorepo today.
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.vite/**',
      '**/coverage/**',
      '**/*.ts',
      '**/*.tsx',
      '**/*.jsx',
      '**/.planning/**',
      '**/.agent/**',
      '**/.agents/**',
      '**/.claude/**',
      'pnpm-lock.yaml',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {},
  },
];
