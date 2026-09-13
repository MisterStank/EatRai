const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// @vercel/analytics ships only a package.json "exports" map (no "main"),
// which Metro's resolver ignores unless this is turned on.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
