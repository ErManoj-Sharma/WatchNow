const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    files: ['src/app/player.tsx'],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
]);
