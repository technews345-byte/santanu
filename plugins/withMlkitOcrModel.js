const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Asks Google Play services to download the on-device text recognition model
 * when Spendly is installed, so the first receipt scan doesn't have to wait
 * for it (or fail while offline).
 */
module.exports = function withMlkitOcrModel(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.google.mlkit.vision.DEPENDENCIES', 'ocr');
    return cfg;
  });
};
