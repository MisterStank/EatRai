module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // must be last
    plugins: ["react-native-reanimated/plugin"],
  };
};
