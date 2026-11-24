  // ---- Pause notifications (do not disturb) ----------------------------------------------------------------
  // OK on the button steps through: 1 hour, 3 hours, until turned back on, off. While paused nothing pops up over
  // what's playing (the app is told too); notices are still kept quietly on the home screen. Life-threatening
  // weather warnings still come through. Kept across restarts (localStorage + the app's own copy).
  var PAUSE_STEPS = [3600000, 3 * 3600000, -1, 0];        // -1 = until turned back on, 0 = off
  var pauseUntil = (function () { var p = +load("pause"); return p === -1 || p > Date.now() ? p : 0; })();
  function isPaused() { return pauseUntil === -1 || pauseUntil > Date.now(); }
  function pauseLabel() {
    if (pauseUntil === -1) return "Until you turn it on";
    if (!isPaused()) return "Off";
    var m = Math.ceil((pauseUntil - Date.now()) / 60000);
    return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60 ? (m % 60) + " min " : "") + "left" : m + " min left";
  }
  function setPause(until) {
    pauseUntil = until;
    save("pause", until);
    if (app && app.setNotifyPause) app.setNotifyPause(String(until));
    renderStatus();
    if (sysOpen) renderSysButtons();
  }
  function cyclePause() {
    var step;
    if (!isPaused()) step = PAUSE_STEPS[0];
    else if (pauseUntil === -1) step = 0;
    else step = (pauseUntil - Date.now() > 3600000 + 60000) ? -1 : PAUSE_STEPS[1];   // 1 h -> 3 h -> until on
    setPause(step > 0 ? Date.now() + step : step);
    toast(step === 0 ? "Notifications on" : "Notifications paused · " + pauseLabel().replace(" left", ""));
  }
