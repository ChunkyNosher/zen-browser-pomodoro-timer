module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['eslint:recommended'],
  plugins: ['mozilla', 'no-unsanitized'],
  parserOptions: {
    ecmaVersion: 2021,
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
  },
};
