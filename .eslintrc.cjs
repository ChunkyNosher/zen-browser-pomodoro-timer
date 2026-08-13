module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['eslint:recommended'],
  plugins: ['no-unsanitized'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-unsanitized/method': 'error',
    'no-unsanitized/property': 'error',
    'no-unused-vars': 'warn',
    'no-console': 'off',
  },
  globals: {
    Services: 'readonly',
    ChromeUtils: 'readonly',
    Components: 'readonly',
    Notification: 'readonly',
    crypto: 'readonly',
    gBrowser: 'readonly',
    Ci: 'readonly',
  },
  overrides: [
    {
      files: ['*.uc.mjs'],
      parserOptions: {
        sourceType: 'module',
      },
    },
    {
      files: ['src/**/*.js'],
      parserOptions: {
        sourceType: 'module',
      },
    },
    {
      files: ['tests/**/*.js'],
      parserOptions: {
        sourceType: 'module',
      },
      env: {
        node: true,
      },
    },
  ],
};
