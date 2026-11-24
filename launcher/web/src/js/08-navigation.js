  // Down goes to the button under the focused tile's on-screen position (never onto the status box; that is reached by
  // pressing right); Up returns to the tile you came from.
  function move(dir) {
    var last = els.length - 1;
    if (dir === "left" && col > 0) wantCol = --col;
    else if (dir === "right" && col < els[row].length - 1) wantCol = ++col;
    else if (dir === "down" && row < last) {
      if (row === 0 && tileRows) { tileCol = col; col = Math.min(col - winStart, lastBigPill); } else col = Math.min(wantCol, lastBigPill);
      row++;
    } else if (dir === "up" && row > 0) { row--; col = row === 0 && tileRows ? tileCol : Math.min(wantCol, els[row].length - 1); }
    else if (dir === "up" && row === 0 && shelfOn()) KW.focus = true;                     // up from the apps: Keep watching
    else if (dir === "up" && row === 0 && PREFS.homeClock !== "hide") wxFocus = true;   // or the weather glass
    else return;
    render();
  }

  var toastEl = document.getElementById("toast"), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }
  window.guestToast = toast;   // the Android app reports results of Close Kodi / Clear Cache here

  function open() {
    var it = ROWS[row][col];
    if (it.id === "system") { openSystem(); return; }
    if (it.id === "files") { openFiles(); return; }
    if (it.id === LIVETV_ID) { recordLaunch(it.id); reorderPending = true; openLiveTv(); return; }
    if (it.id === RADIO_ID) { recordLaunch(it.id); reorderPending = true; openRadio(); return; }
    if (/^(music|bt|share|mirror|sleep)$/.test(it.id)) { openDock(it.id); return; }
    if (row < tileRows) { recordLaunch(it.id); reorderPending = true; }
    if (window.Offshore && window.Offshore.launch) {                               // Android app
      window.Offshore.launch(it.id);
      if (typeof kwOpened === "function") kwOpened(it.id);
    } else {                                                                         // computer preview
      toast(it.done ? "Would do: " + it.done : "Would open " + it.name);
      setTimeout(window.guestHidden, 1500);
    }
  }

  // New order (after a launch) is applied only while the home screen is out of sight, so tiles never jump while
  // someone is looking. The Android app calls this when an app covers the home screen. Focus stays on the same app.
  var reorderPending = false;
  // An app was installed or removed (the app tells us): tiles are rebuilt by reloading the page, but never while someone
  // is looking at it; then on the next app launch.
  var appsDirty = false;
  var fireScreenAt = 0;                          // when Task manager last opened Fire TV's uninstall prompt or app page
  window.guestAppsChanged = function () {
    if (custOpen && custMode === "uninstall") {    // removed from Uninstall apps: its tile goes now, the list refreshes, a full rebuild when Settings closes
      reloadOnClose = true; UNINST = null;
      if (app) { APPS = APPS.filter(function (a) { return app.installed(a.id); }); layoutTiles(); row = 0; col = 0; render(); }
      var n = custRows().length; if (custRow >= n) custRow = Math.max(1, n - 1);
      renderCustom(); return;
    }
    if (homeVisible && !document.hidden) appsDirty = true; else location.reload();
  };
  window.guestHidden = function () {
    homeVisible = false; document.body.classList.add("away"); npfClose();
    if (RD.now && RD.mode === "page") { rdStop(); }   // Radio is the home screen's: it stops when an app opens (the page's player can't step aside for it)
    vidEl.pause();                               // a live background never plays behind an app
    if (nativeOn) { nativeOff(); liveResume = true; }   // the 4K player lets go of the decoder; back on return
    bgs[1 - front].style.backgroundImage = "";   // the faded-out photo: its decoded copy goes back to the app (the shown one stays)
    if (SLEEP.on) sleepStop(true);               // an app opened: its sound, not ours
    if (appsDirty) { appsDirty = false; setTimeout(function () { location.reload(); }, 1500); return; }
    pauseIdle();
    if (sysOpen) closeSystem();
    if (weekOpen) closeWeek();
    if (dockCard) closeDockCard();
    // Fire TV's own uninstall prompt or app page, opened from Task manager: Settings stays where it was, so you come
    // back to the same list (owner: no starting over after each uninstall).
    var ownScreen = custOpen && (custMode === "uninstall" || custMode === "tasks") && Date.now() - fireScreenAt < 15000;
    if (custOpen && !ownScreen) {       // left for an app mid-edit: unsaved changes are dropped
      if (custDirty) { PREFS = JSON.parse(JSON.stringify(custSnapshot)); applyPrefs(null); custDirty = false; }
      closeCustom();
    }                        // an app is up: no ambient mode while someone watches; full home screen on return
    if (!reorderPending) return;
    reorderPending = false;
    var focusId = row < tileRows ? ROWS[row][col].id : null;
    layoutTiles();
    for (var r = 0; focusId && r < tileRows; r++) {
      for (var c = 0; c < ROWS[r].length; c++) if (ROWS[r][c].id === focusId) { row = r; col = wantCol = c; }
    }
    render();
  };

  // Called by the Android app with the D-pad (and usable from the keyboard in the preview).
  // UI sounds (Settings > UI sounds): a soft tick when focus moves, two gentle notes for OK, falling notes for Back.
  // On the TV the app plays its own sound files; the computer preview synthesizes something similar.
  var actx = null;
  function sfx(name) {
    if (PREFS.sounds === "off") return;
    if (app && app.sound) { app.sound(name); return; }
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var notes = name === "move" ? [[2900, 0, .012, .05]] : name === "select" ? [[880, 0, .09, .08], [1318.5, .055, .11, .08]] : [[1318.5, 0, .07, .06], [880, .05, .08, .06]];
      notes.forEach(function (n) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + n[1];
        o.frequency.value = n[0]; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(n[3], t + .005);
        g.gain.exponentialRampToValueAtTime(.0001, t + n[2] * 5); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + n[2] * 5 + .05);
      });
    } catch (e) {}
  }
  function navState() { return [SU.step, SU.g, SU.i, SU.tour, SU.tf, SU.zip, row, col, wxFocus, weekOpen, dockCard, dcRow, dcCol, !!shareReq, shareFocus, viewerIdx, viewerList.length, sysOpen, sysRow, sysFocus, custOpen, custRow, custMode, padIdx, kbIdx, kbText, FM.open, FM.side, FM.pi, FM.li, FM.sort, FM.path, FM.pop ? FM.pop.f + ":" + FM.pop.idx + ":" + FM.pop.text : "", LT.open, LT.side, LT.gi, LT.ci, LT.pop ? LT.pop.f : -1, RD.open, RD.side, RD.gi, RD.ci, RD.pop ? RD.pop.f : -1, MV ? MV.list.join() + MV.pins.join() : ""].join(","); }

  window.guestNav = function (action) {
    npfTouch();
    if (NPF.open) { wake(); npfNav(action); return; }   // full-screen Now playing takes the keys while it's up (a key still restarts the screensaver's wait)
    if (ambient) { wake(); return; }    // the first press only wakes the screen
    var before = navState(), panelOpen = sysOpen || custOpen || FM.open || LT.open || RD.open;
    navInner(action);
    if (action === "ok") sfx("select");
    else if (action === "back") { if (panelOpen) sfx("back"); }
    else if (navState() !== before) sfx("move");        // no tick at the end of a row
  };
  function navInner(action) {
    wake();
    if (shareNav(action)) return;      // a phone asking to send, or received photos, come first
    if (SU.open && !SU.away) { if (action !== "hold" && action !== "menu") suNav(action); return; }   // first-run setup and tour
    if (MV) { moveNav(action); return; }               // arranging tiles (☰)
    if (LT.open) { liveTvNav(action); return; }        // Live TV: ☰ or hold OK on a channel opens its options
    if (RD.open) { radioNav(action); return; }         // Radio: ☰ or hold OK on a station: Favorites
    if (KW.focus && !FM.open && !dockCard && !custOpen && !sysOpen && !weekOpen) { kwNav(action); return; }   // the Keep watching shelf
    if (action === "menu") {                           // ☰: move the focused tile; on a file, its options
      if (FM.open) filesNav("hold");
      else if (!custOpen && !sysOpen && !dockCard && !weekOpen && !wxFocus && row < tileRows) moveStart(ROWS[row][col]);
      return;
    }
    if (action === "hold") {           // OK held on a tile: its menu
      if (FM.open) { filesNav("hold"); return; }       // or on a file: its options
      if (!custOpen && !sysOpen && !dockCard && !weekOpen && !wxFocus && !FM.open && row < tileRows) openTileMenu(ROWS[row][col]);
      return;
    }
    if (FM.open) { filesNav(action); return; }
    if (dockCard) { dockNav(action); return; }
    if (custOpen) { custNav(action); return; }
    if (weekOpen) { if (action === "ok" || action === "back") closeWeek(); return; }
    if (wxFocus) {
      if (action === "ok") openWeek();
      else if (action === "down" || action === "back") { wxFocus = false; if (action === "down" && shelfOn()) KW.focus = true; render(); }
      return;
    }
    if (sysOpen) {
      var maint = maintItems(), last = sysRow === 0 ? 2 : maint.length - 1;
      if (action === "back") closeSystem();
      else if (action === "left" || action === "right") { sysFocus = Math.max(0, Math.min(last, sysFocus + (action === "left" ? -1 : 1))); renderSysButtons(); }
      else if (action === "up" || action === "down") { sysRow = action === "up" ? 0 : 1; sysFocus = Math.min(sysFocus, sysRow === 0 ? 2 : maint.length - 1); renderSysButtons(); }
      else if (action === "ok" && sysRow === 1) runMaint(maint[sysFocus]);
      else if (action === "ok") { if (sysFocus === 0) openInbox(); else if (sysFocus === 1) cyclePause(); else { closeSystem(); openCustom(); } }
      return;
    }
    if (action === "back") return;      // already home: Back does nothing
    if (action === "ok") open(); else move(action);
  };

  // Ambient mode: after 15 idle minutes the controls fade out and a large clock, the date and the
  // weather remain. The Fire TV screensaver and sleep timer still apply as set in Fire TV settings.
  var idleTimer = 0, ambient = false;
  function idleMs() { return (+new URLSearchParams(location.search).get("ambient") || PREFS.ambient) * 1000; }   // ?ambient=10: preview after 10 s
  function wake() {
    pauseIdle();
    if (!idleMs()) return;              // Settings > Ambient mode: Off
    idleTimer = setTimeout(function () { if (NPF && NPF.open) npfClose(); ambient = true;   // music playing or not, the screensaver comes at its time
       renderCal(); feedsStart(); document.body.classList.add("ambient"); fitSaverSoon(); }, idleMs());
  }

  // The idle clock only runs while the home screen is on screen; the Android app stops it when an app opens
  // (guestHidden) and restarts it when the home screen shows again (guestShown).
  function pauseIdle() {
    clearTimeout(idleTimer);
    if (ambient) { ambient = false; feedsStop(); document.body.classList.remove("ambient"); }
  }
  // While an app is on screen the app freezes this page's timers (Home.java); every 5 minutes it wakes it briefly for
  // this, so weather warnings still reach whoever is watching.
  window.guestAlertsTick = function () { alerts(); };
  window.guestShown = function () {
    if (syncApply()) { location.reload(); return; }   // new settings from the main TV: start again with them
    homeVisible = true; document.body.classList.remove("away"); wake(); kwBuildSoon(); if (typeof plexRefresh === "function") plexRefresh(); liveSync(); everyCatchUp(); if (fitLater) { fitLater = false; fitSoon(); }
    if (!shown && !forced) nextPhoto();               // no photo yet (started out of sight): one now, not at the next turn
    if (LOC && LOC.how === "auto" && Date.now() - locCheckedAt > 3 * 3600000) autoLocation(true);   // moved since?
  };
  var fitLater = false;
  var homeVisible = true;               // notices only count down while someone can see them

  document.addEventListener("keydown", function (e) {
    var map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Enter: "ok", " ": "ok", Escape: "back", Backspace: "back", h: "hold" };   // h = hold OK (the remote's long press) in the preview
    if (map[e.key]) { e.preventDefault(); window.guestNav(map[e.key]); }
  });

