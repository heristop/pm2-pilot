export default {
  paths: ['features/**/*.feature'],
  import: ['features/step-definitions/**/*.steps.ts', 'features/support/**/*.ts'],
  format: [
    '@cucumber/pretty-formatter',
    ['html', 'cucumber-report.html']
  ],
  formatOptions: {
    snippetInterface: 'async-await'
  },
  publishQuiet: true,
  parallel: 1, // Run scenarios sequentially for conversation flow
  retry: 0
};