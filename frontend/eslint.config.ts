import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const LAYER_FORBIDDEN_PATTERNS: string[] = [
  'three',
  'three/*',
  '**/adapters/**',
  '**/infrastructure/**',
];

export default tseslint.config(
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions', 'methods'] }],
      'no-console': 'error',
    },
  },
  {
    files: ['apps/*/src/domain/**/*.ts', 'apps/*/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: LAYER_FORBIDDEN_PATTERNS.map((pattern) => ({
            group: [pattern],
            message: 'domain/ and application/ must not depend on rendering or outer layers.',
          })),
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'DOM not allowed in domain/application.' },
        { name: 'window', message: 'DOM not allowed in domain/application.' },
      ],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.ts', 'pnpm-lock.yaml', '**/mock/**'],
  },
);
