import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Lint rules, chosen to catch mistakes rather than to enforce taste.
 *
 * Formatting is Prettier's job and is switched off here entirely — a linter
 * arguing with a formatter is a well-known way to waste a contributor's
 * afternoon. What is left is type-aware correctness: floating promises, unsafe
 * narrowing, unused code, and the hot-loop rules that matter for a simulation.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-playground/**',
      'node_modules/**',
      'visual/.results/**',
      'visual/__screenshots__/**',
      'coverage/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The simulation reads and writes typed arrays by index in tight loops,
      // where TypeScript's `noUncheckedIndexedAccess` forces a `!` on every
      // access. Those are deliberate, not sloppy.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // A dropped promise in an animation callback fails silently, which is the
      // worst way for it to fail.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // `as` is load-bearing at the GL and DOM boundaries, but it should be a
      // decision rather than a reflex.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },

  {
    files: ['src/react/**/*.tsx', 'src/react/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    // Tests reach into internals on purpose: stub backends, private fields, and
    // deliberately malformed input that would never typecheck as real usage.
    files: ['test/**/*.ts', 'visual/**/*.ts', 'scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-console': 'off',
    },
  },

  {
    // Config files and build scripts sit outside the tsconfig project, so
    // type-aware rules have nothing to work from. Lint them syntactically.
    files: ['**/*.mjs', '**/*.js', '*.config.ts', 'playground/vite.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: false, project: false },
    },
    rules: {
      'no-console': 'off',
    },
  },

  prettier,
);
