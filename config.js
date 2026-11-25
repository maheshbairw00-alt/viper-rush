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
    worldSize: 6400,   // arena is worldSize x worldSize (big map with 5 zones)
    botCount: 28,      // enemy bots (offline mode)
    matchSeconds: 360, // one match = 6 minutes
    zoneStart: 45,     // red wall starts closing after this many seconds
    zoneEnd: 300,      // red wall reaches its smallest size here
    zoneMinSize: 900,  // smallest safe area (square side)
    startMass: 12,
    speed: 210,
    boostSpeed: 380
  }
};
