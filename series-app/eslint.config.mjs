export default [{
  files: ['site/release-engine.js','site/app.js','site/cinema.js','site/minimal.js'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'script' },
  rules: {
    'no-unreachable': 'error',
    'no-duplicate-case': 'error',
    'no-unsafe-finally': 'error',
    'no-unused-labels': 'error',
    'no-constant-condition': ['error', {checkLoops:false}],
    'no-undef': 'off', // Browser scripts intentionally share globals in ordered script tags.
    'no-unused-vars': 'off' // Legacy globals are also referenced by other ordered scripts.
  }
}];
