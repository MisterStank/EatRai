const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const vercelAnalyticsReactPath = path.join(
  path.dirname(require.resolve("@vercel/analytics/package.json")),
  "dist/react/index.js",
);

// @vercel/analytics ships only a package.json "exports" map (no "main"),
// which Metro's resolver ignores by default. Turning on
// unstable_enablePackageExports globally also changes resolution for every
// other dependency (e.g. zustand then resolves to an ESM build that uses
// import.meta, which crashes Metro's non-ESM bundle at runtime) — so instead
// we resolve just this one subpath straight to its CJS file.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@vercel/analytics/react") {
    return { type: "sourceFile", filePath: vercelAnalyticsReactPath };
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
