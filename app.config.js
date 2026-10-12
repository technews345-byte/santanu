// Fills in values that must not be committed. Expo loads app.json first and
// passes it here as `config`; set FIREBASE_API_KEY in the environment (a
// GitHub Actions secret in CI) before building. Without it the key stays empty
// and the app runs on-device only, exactly as with no Firebase config.
module.exports = ({ config }) => {
  const firebase = config.extra?.firebase ?? {};
  return {
    ...config,
    extra: {
      ...config.extra,
      firebase: { ...firebase, apiKey: process.env.FIREBASE_API_KEY || firebase.apiKey || '' },
    },
  };
};
