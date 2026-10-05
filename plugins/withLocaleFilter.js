const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Keeps only the languages Spendly speaks in the APK.
 *
 * The libraries Spendly uses (Google Play services, AdMob, AndroidX…) ship
 * their own text in 80+ languages, and all of it lands in the APK's resource
 * table. Spendly itself is in English (with Hinglish reminders), so only
 * English and Hindi are kept; on a phone set to another language the few
 * system dialogs those libraries show appear in English.
 */
module.exports = function withLocaleFilter(config, { locales = ['en', 'hi'] } = {}) {
  return withAppBuildGradle(config, (cfg) => {
    const marker = '// spendly: locale filter';
    if (!cfg.modResults.contents.includes(marker)) {
      const list = locales.map((l) => `"${l}"`).join(', ');
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /defaultConfig\s*\{/,
        (m) => `${m}\n        ${marker}\n        resourceConfigurations += [${list}]`
      );
    }
    return cfg;
  });
};
