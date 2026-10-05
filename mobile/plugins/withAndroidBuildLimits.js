const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function withAndroidBuildLimits(config) {
  return withAppBuildGradle(config, (result) => {
    if (result.modResults.language !== "groovy") {
      throw new Error("Android build limits require the generated Groovy Gradle project.");
    }
    const marker = "// MusikaLokal native compiler limits";
    if (!result.modResults.contents.includes(marker)) {
      result.modResults.contents += `
${marker}
android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_JOB_POOLS=musikalokal_compile=2", "-DCMAKE_JOB_POOL_COMPILE=musikalokal_compile"
            }
        }
    }
}
`;
    }
    return result;
  });
};
