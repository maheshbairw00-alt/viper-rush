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
    worldSize: 6400,       // arena is worldSize x worldSize (big map with 5 zones)
    botCount: 36,          // enemy bots (offline mode)
    matchSeconds: 1200,    // VIPER ROYALE = one match is 20 minutes
    zoneStart: 150,        // red wall starts closing after this many seconds
    zoneEnd: 1080,         // red wall reaches its smallest size here
    zoneMinSize: 900,      // smallest safe area (square side)
    goldenEvery: 50,       // seconds between golden orbs
    hpMax: 100,            // HP of every snake
    autoReviveSeconds: 180,// die in the first 3 minutes = revived automatically (once)
    startMass: 12,
    speed: 210,
    boostSpeed: 380
  }
};
