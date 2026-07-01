/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-deps',
      severity: 'error',
      comment: 'domain must not import anything outside domain',
      from: { path: '^src/domain/' },
      to: { path: '^src/(?!domain/)' },
    },
    {
      name: 'application-no-infra',
      severity: 'error',
      comment: 'application must not import infrastructure or interfaces',
      from: { path: '^src/application/' },
      to: { path: '^src/(infrastructure|interfaces)/' },
    },
    {
      name: 'application-no-external-infra',
      severity: 'error',
      comment: 'application must not import framework/infra packages',
      from: { path: '^src/(domain|application)/' },
      to: {
        path: 'node_modules',
        pathNot:
          'node_modules/@types',
      },
    },
    {
      name: 'interfaces-no-infra',
      severity: 'warn',
      comment: 'interfaces should not import concrete infrastructure (except via ports)',
      from: { path: '^src/interfaces/' },
      to: { path: '^src/infrastructure/' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.js'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
