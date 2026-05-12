const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('mjs');

const previousEnhanceMiddleware = config.server?.enhanceMiddleware;

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const baseMiddleware = previousEnhanceMiddleware
      ? previousEnhanceMiddleware(middleware, server)
      : middleware;

    return (req, res, next) => {
      if (req.url?.includes(".bundle")) {
        req.headers.accept = String(req.headers.accept || "")
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value && value !== "multipart/mixed")
          .join(", ") || "*/*";
      }

      return baseMiddleware(req, res, next);
    };
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
