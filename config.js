/* js/config.js
 * Global settings. Edit values here, nothing else needs to change.
 */
window.VR = window.VR || {};

window.VR_CONFIG = {
  appName: 'Viper Rush',
  version: '1.0.0',

  // Firebase web config = REAL Google + Facebook login and cloud saving.
  // Set it to null to go back to demo login (works offline, for testing the screens).
  // Example: { apiKey:'...', authDomain:'...', projectId:'...', appId:'...' }
  firebase: {
    apiKey: "AIzaSyBJ4q2pw4rjStapy9fqQ_HgXLZaglYfgnc",
    authDomain: "viper-rush.firebaseapp.com",
    projectId: "viper-rush",
    storageBucket: "viper-rush.firebasestorage.app",
    messagingSenderId: "1045833149627",
    appId: "1:1045833149627:web:5fba1de8cf32e87c21cd9e"
  },
  // Player data: one document per player in this collection.
  cloudCollection: 'viperrush_users',

  squadSize: 5,        // players in one squad (you + 4 friends)
  loadingSeconds: 2.6, // fake loading time (replace with real asset loading later)

  // Address of your game server, for example 'wss://viper-rush-server.onrender.com'. Leave '' to play offline with bots.
  serverUrl: '',

  game: {
    worldSize: 48000,      // arena is worldSize x worldSize (HUGE map with 5 zones). Change it here to make the map smaller/bigger
    maxPlayers: 50,        // players in one match (you + friends + bots fill the rest)
    matchSeconds: 1200,    // VIPER ROYALE = one match is 20 minutes
    zoneStart: 150,        // red wall starts closing after this many seconds
    zoneEnd: 1080,         // red wall reaches its smallest size here
    zoneMinSize: 2400,     // smallest safe area (square side)
    goldenEvery: 50,       // seconds between golden orbs
    hpMax: 100,            // HP of every snake
    autoReviveSeconds: 180,// die in the first 3 minutes = revived automatically (once)
    startMass: 12,
    speed: 210,
    boostSpeed: 380
  }
};
