const { resolve } = require('node:path');

const project = resolve(process.cwd(), 'tsconfig.json');

module.exports = {
  root: true,
  extends: [
    require.resolve('@timobechtel/style/eslint/core.cjs'),
    require.resolve('@timobechtel/style/eslint/react.cjs'),
  ],
  parserOptions: {
    tsconfigRootDir: process.cwd(),
    projectService: {
      allowDefaultProject: ['.eslintrc.cjs'],
    },
  },
  settings: {
    'import/resolver': {
      typescript: {
        project,
      },
    },
  },
  rules: {
    'import/order': 'off',
    'no-console': [
      'error',
      { allow: ['log', 'warn', 'error', 'clear', 'info', 'table'] },
    ],
    '@typescript-eslint/no-extraneous-class': 'off',
    '@typescript-eslint/restrict-template-expressions': [
      'error',
      {
        allowNumber: true,
        allowBoolean: false,
        allowNullish: false,
        allowAny: false,
        allowNever: false,
        allowArray: false,
      },
    ],
    '@typescript-eslint/require-await': 'off',
  },
};
