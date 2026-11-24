  // Android passes real app banners when available: { "com.plexapp.android": "data:image/png;base64,...", ... }
  window.setBanners = function (banners) {
    BANNERS = banners;                   // kept for when the tiles are re-ordered
    for (var r = 0; r < tileRows; r++) ROWS[r].forEach(function (it, i) { addBanner(els[r][i], tileArtOf(it.id) || banners[it.id]); });   // your own picture first
    if (typeof kwBuildSoon === "function") kwBuildSoon();                                          // app cards on the shelf get theirs
  };

  function hm(t, secs) {
    var o = { hour: "numeric", minute: "2-digit", hour12: String(PREFS.clock).indexOf("24") !== 0 };
    if (secs) o.second = "2-digit";
    return new Date(t).toLocaleTimeString(locale(), tzOpts(o));
  }
  function dayText(t, o) { return new Date(t).toLocaleDateString(locale(), tzOpts(o)); }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} if (BACKUP_SKIP && !BACKUP_SKIP.test(k)) backupSoon(); }
  // Settings backup: everything the page keeps (settings, calendars, events, sound choices, tile order) goes to a file in
  // the app's folder (Home.Bridge.backupWrite), a few seconds after any change. A fresh install with that file back in
  // place restores it all by itself (boot). Caches that refill on their own are left out.
  // What you watched and listened to (Keep watching, Plex, recent stations) stays out too: the file sits where other
  // apps with storage access can read it, and those lists fill again by themselves.
  var BACKUP_SKIP = /^(weather|week|calcache|scores|teaminfo|alertseen|alertsKept|notices|noticelog|st:|teams|loc:|updstate|restoredAt|livetv|kwHist|plexDeck|plexDemo|radioRecent|radioWorks|radioNear|radioFcc|speedtest)/, backupTimer = 0;
  function backupSoon() { clearTimeout(backupTimer); backupTimer = setTimeout(backupNow, 5000); }
  function backupNow() {
    if (!app || !app.backupWrite) return;
    var keys = {};
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (!BACKUP_SKIP.test(k)) keys[k] = localStorage.getItem(k); }
    app.backupWrite(JSON.stringify({ v: 1, t: Date.now(), keys: keys }));
  }
  function backupRestore() {                         // fresh install: nothing saved yet, but a backup file is there
    if (!app || !app.backupRead || localStorage.getItem("prefs") || localStorage.getItem("restoredAt")) return false;
    try {
      var b = JSON.parse(app.backupRead() || "null");
      if (!b || !b.keys || !Object.keys(b.keys).length) return false;       // a TV on default settings still has photos, calendars…
      Object.keys(b.keys).forEach(function (k) {                          // only what a backup can hold: no caches, valid JSON
        var v = b.keys[k];
        if (typeof v !== "string" || BACKUP_SKIP.test(k) || !/^[\w:.-]{1,64}$/.test(k)) return;
        try { JSON.parse(v); } catch (e) { return; }
        localStorage.setItem(k, v);
      });
      localStorage.setItem("restoredAt", JSON.stringify(Date.now()));     // once: never loops
      return true;
    } catch (e) { return false; }
  }
  // Following a main TV: tools\sync_tvs.ps1 copies the main TV's backup to the other TVs as
  // sync.json. A newer one than last applied replaces this TV's settings, except what belongs to this TV: its room
  // name, launch counts, and downloaded photo and video sets (their files are only on the TV that downloaded them).
  // Checked at start and whenever the home screen comes back; applying reloads the page.
  var SYNC_KEEP = /^(usage|bgcats|syncedAt)$|^(bgset|vidset):/;
  function syncApply() {
    if (!app || !app.syncRead) return false;
    try {
      var s = JSON.parse(app.syncRead() || "null");
      if (!s || !s.keys || !s.t || s.t <= (load("syncedAt") || 0)) return false;
      var room = (load("prefs") || {}).room;
      Object.keys(s.keys).forEach(function (k) {
        var v = s.keys[k];
        if (typeof v !== "string" || BACKUP_SKIP.test(k) || SYNC_KEEP.test(k) || !/^[\w:.-]{1,64}$/.test(k)) return;
        try { JSON.parse(v); } catch (e) { return; }
        localStorage.setItem(k, v);
      });
      var p = load("prefs") || {};                     // this TV's room: sync_tvs.ps1 names it, else its own choice, else tv.json's
      if (typeof s.room === "string" && s.room) p.room = s.room.slice(0, 30); else if (room !== undefined) p.room = room; else delete p.room;
      localStorage.setItem("prefs", JSON.stringify(p));
      localStorage.setItem("syncedAt", JSON.stringify(s.t));
      console.info("settings synced from the living room (" + new Date(s.t).toLocaleString() + ")");
      return true;
    } catch (e) { return false; }
  }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  // Security helpers: values from outside (calendars, notices, storage) never become markup, styles or lookups by name.
  function safeColor(c) { return /^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : "#0a84ff"; }
  function own(map, k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : undefined; }
  function safeImg(u) { return /^(https:|data:image\/|content:|file:)/i.test(String(u)) ? String(u) : ""; }

  // Clock: updates once a minute, on the minute (also the ambient clock and the time-based beach items). With seconds
  // (Settings > Clock) only the two clock texts also change every second.
  var timeEl = document.getElementById("time"), dateEl = document.getElementById("date"), secTimer = 0;
  function clockTime(d) {
    var secs = /s$/.test(PREFS.clock);
    timeEl.textContent = hm(d, secs);
    document.getElementById("mTime").textContent = hm(d, secs).replace(/\s?[AP]M$/, "");
  }
  function renderClock() {
    var d = new Date(), date = dayText(d, { weekday: "long", month: "long", day: "numeric" });
    clockTime(d);
    dateEl.textContent = date;
    document.getElementById("mDate").textContent = date;
    clearInterval(secTimer);
    if (/s$/.test(PREFS.clock)) secTimer = setInterval(function () { if (!document.hidden && homeVisible) clockTime(new Date()); }, 1000);
  }
  function tick() {
    var d = new Date();
    renderClock();
    renderBeach();
    renderAlert();
    renderScores();
    if (ambient) renderCal();           // these two only redraw when the hour or the day changes
    renderWeekPanel();
    renderNextUp();                     // "Now" / "Next" move on with the clock
    applyTheme();                       // Automatic appearance follows sunrise and sunset
    setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
  }

