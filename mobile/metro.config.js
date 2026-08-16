const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    const withoutAlias = moduleName.slice(2);
    const candidates = [
      path.resolve(projectRoot, withoutAlias),
      path.resolve(projectRoot, `${withoutAlias}.ts`),
      path.resolve(projectRoot, `${withoutAlias}.tsx`),
      path.resolve(projectRoot, `${withoutAlias}.js`),
      path.resolve(projectRoot, `${withoutAlias}.jsx`),
      path.resolve(projectRoot, withoutAlias, 'index.ts'),
      path.resolve(projectRoot, withoutAlias, 'index.tsx'),
    ];
    const filePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (filePath) {
      return { type: 'sourceFile', filePath };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
