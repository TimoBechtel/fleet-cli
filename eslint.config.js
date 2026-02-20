import styleCore from '@timobechtel/style/eslint/core.js';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { createNodeResolver } from 'eslint-plugin-import-x';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  ...styleCore,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: dirname,
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'release.config.mjs'],
        },
      },
    },
    settings: {
      'import-x/core-modules': ['bun', 'bun:test'],
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: path.resolve(dirname, 'tsconfig.json'),
        }),
        createNodeResolver(),
      ],
    },
    rules: {
      'import-x/order': 'off',
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
  },
]);
