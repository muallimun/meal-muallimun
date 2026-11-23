import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: [
      'src/store/useAppStore.tsx',
      'src/utils/waqfTextUtils.tsx',
      'src/components/PageBookmarksDrawer.tsx',
      'src/components/QuestionReportModal.tsx',
      'src/features/games/StagePromptBanner.tsx',
      'src/features/study/SyncedArabicText.tsx',
      'src/features/study/TajweedRulePopover.tsx',
      'src/features/study/TajweedText.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
