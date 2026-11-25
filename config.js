/* js/config.js
 * Global settings. Edit values here, nothing else needs to change.
 */
window.VR = window.VR || {};

window.VR_CONFIG = {
  appName: 'Viper Rush',
  version: '1.0.0',

  // Paste your Firebase web config here to turn on REAL Google + Facebook login.
  // Leave as null to use demo login (works offline, for testing the screens).
  // Example: { apiKey:'...', authDomain:'...', projectId:'...', appId:'...' }
  firebase: null,

  squadSize: 5,        // players in one squad (you + 4 friends)
  loadingSeconds: 2.6, // fake loading time (replace with real asset loading later)

  game: {
    worldSize: 3600,   // arena is worldSize x worldSize
    botCount: 14,      // enemy bots (offline mode)
    startMass: 12,
    speed: 210,
    boostSpeed: 380
  }
};
