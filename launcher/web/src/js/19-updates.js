  // ---- Updates (Settings > Updates & about) -----------------------------------------------------------------------
  // Official sources and stable versions only: Offshore from its GitHub releases ("latest" never includes betas or
  // pre-releases; Android also refuses an update signed with another key), Kodi's final releases from kodi.tv's own
  // server (no alpha / beta / rc / nightly), Appstore apps and Fire OS by Amazon. Checks run on the user's schedule
  // (how often, and from what time of day); an update found becomes a notice. Installing stays the user's step.
  var UPDATE_REPO = "", updTimer = 0;
  function cmpVer(a, b) {                                   // 2.26 < 2.26.1 < 2.27
    var x = String(a).replace(/^v/, "").split("."), y = String(b).replace(/^v/, "").split(".");
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  // What's new: the notes for recent versions, newest first. Shown once after an update (a quiet notice with the
  // highlights) and in full under Settings > Updates & about > What's new. Written for the person on the couch.
  var CHANGELOG = [
    ["0.19", "November 2026", ["Backgrounds from NASA, The Met, the Art Institute of Chicago and the Library of Congress, alongside Wikimedia Commons",
                              "Search for photos across all five sources, and search for live videos on Wikimedia Commons and NASA",
                              "Live backgrounds play again",
                              "Sound output shows what your TV or sound system really gets: stereo, or the surround format when surround is on",
                              "Keep watching now includes YouTube and Amazon's other video apps",
                              "The app name sits in the right place when there's no Keep watching row, and weather alerts sit under the clock",
                              "Offshore is open source under the GNU GPL, with every library and source credited in About"]],
    ["0.18", "November 2026", ["Security: a full review of the app. Text from radio station lists is handled more strictly, the home screen refuses any outside script, and the radio relay keeps away from your home network",
                              "Privacy: the settings backup no longer includes what you watched or listened to",
                              "Settings › Home screen › Keep watching: Keep watching, Plex and Fox One show names together in one place"]],
    ["0.17", "November 2026", ["Radio: free radio stations, with the ones near you first (with their frequency and town), your state, News & talk, Sports, Country and more, and search. Add favorites with ☰ and see what's on in the bottom bar",
                              "Backgrounds: keep one photo on screen, like one live video. Open a photo set in Settings › Appearance › Backgrounds › Photos and pick “Take turns” or any single photo, shown behind the list as you move",
                              "Radio: a Holiday section with Christmas music stations, at the top of Radio through the season. Stations that list an older link now find their secure one, and the one that works is remembered",
                              "Appearance: new looks for the glass (Frosted, Clear, Smoky or Solid), rounder or crisper app tiles, bright or dimmed tiles, how the highlight moves (lift, gentle lift or glow), and Reduced motion",
                              "Weather on the background: light rain, snow or fog drifts over the photo while it's really happening outside. Settings › Appearance turns it off",
                              "Big clock: a large, thin clock straight on the photo, like a lock screen. Settings › Home screen › Clock style",
                              "Full screen Now playing: the album cover big with the song, or the radio station, filling the screen. From the music card, or by itself after a minute of music",
                              "Keep watching: a row over your apps with what you had on lately: the show you were watching in Plex, Fox One and your other apps (with how far you got), plus Live TV channels, radio stations and videos. OK opens the app; hold OK to remove one. It shows what belongs to the app you're on (your Plex shows over Plex), or everything in one row if you like (Settings › Home screen › Keep watching)",
                              "Plex: link your Plex account in Settings › Home screen › Keep watching › Plex (a code you enter at plex.tv/link, so Offshore never sees your password) and your Plex Continue watching shows on Keep watching",
                              "Fox One show names (Settings › Home screen › Keep watching, off at first): Fox One doesn't say what it plays, so Offshore can read the show's name off its screen for the Keep watching card, and shows the channel (FOX News, FS1…) when it can tell for sure",
                              "Appearance and Home screen settings now show each change on the home as you make it, with the list beside it",
                              "Your cards: countdowns (a trip, a birthday), notes and web links on the home screen. Settings › Home screen › Your cards",
                              "Your own app pictures: hold OK on a tile › Change picture, and pick any photo on the TV (send one from your phone with Share)",
                              "Radio plays stations that only stream without encryption too",
                              "Lighter home for slower TVs: no blur or effects. Automatic turns it on only on a TV that's short of memory or draws the home slowly"]],
    ["0.16", "November 2026", ["Live TV: add your own playlist (M3U) from your phone and browse your channels in a guide, like a cable box. Channels play in VLC; Offshore includes no channels",
                              "Live TV works like cable: your channels are sorted into Local, News, Sports, Entertainment, Movies, Cartoons & Kids, Music and more, with cable-style channel numbers",
                              "A guide grid: what's on now and for the next two hours on every channel, from your service's own guide",
                              "Local: your channels from TV stations near you (from the FCC's list of local stations)",
                              "Your country only, from the TV's location; Settings › Live TV › International channels adds the rest",
                              "☰ on a channel adds it to Favorites, moves it, or hides a channel or a whole category",
                              "Files and Live TV are calmer: the home screen steps away behind them",
                              "Updating is simpler: Settings › Updates & about now starts with Offshore itself. It says whether you're up to date, and when an update is ready, OK installs it",
                              "One setting for automatic checks (every day, week or month, or only when you ask); apps, Fire OS and Kodi have their own page",
                              "UV index early in the day: until the EPA publishes its hourly forecast, Offshore shows the day's peak (UV peak)",
                              "Small fixes: the sound line on Now playing showed Â· instead of ·, symbols in the 0.11 notes, and wording in sound messages"]],
    ["0.15", "November 2026", ["Tidy up Fire TV (Settings › Fire TV): choose the Amazon extras you don't use, like shopping, promotions, tutorials and viewing recognition, and the one-time computer step switches them off. Nothing is uninstalled, and each can be switched back on",
                              "Switch off Amazon's own screensaver, the one with ads, right from Tidy up Fire TV",
                              "The Music button on the bottom bar is an icon like the others; its name shows when you highlight it"]],
    ["0.14", "November 2026", ["The Home button stays connected: if Fire TV ever switches it off (after an update or a restart), Offshore switches it back on by itself",
                              "If the Home button isn't connected yet, Offshore now says so and explains the one-time fix, instead of Home quietly opening Amazon's screen",
                              "Live backgrounds loop smoothly: a clip now starts over with no blink, instead of reloading every few seconds",
                              "Keep one live background: in Backgrounds › Live video, open a set and pick a clip to keep it on screen, or keep the whole set changing every minute",
                              "Backgrounds plays the highlighted set as soon as a list opens"]],
    ["0.13", "November 2026",["Update check: if this arrived through Install now, updating from the site works"]],
    ["0.12", "November 2026", ["Updates from offshoreupdates-web.github.io/offshore: Offshore tells you when a new version is out, and Install now downloads it, checks it's the real Offshore and opens Fire TV's install prompt"]],
    ["0.11", "November 2026", ["Arrange your apps like on Fire TV: press ☰ on the remote on a tile, then ◀ ▶ to move it and ▲ to pin it to the front",
      "Your location follows the TV: found automatically when you set up (or type a ZIP code), and checked again at start and every few hours, so the weather moves with a Fire TV Stick you travel with",
      "Runs on the Fire TV Stick 4K Max (Fire OS 8) as well as the Fire TV Cube",
      "Clear all notifications sits at the top of the notifications list",
      "Uninstall apps keeps you in the list after Fire TV's prompt, ready for the next one",
      "The background photo shows straight away after an update"]],
    ["0.10", "November 2026", ["Files, on the bottom bar: what's using the TV's space (apps, photos, videos, music, other files, system), and the TV's folders, USB drives, files from phones and your network folder, with each file's kind, size, date and time",
      "Manage files: open, rename, copy, move and delete (always asked first). Photos open full screen; videos, music and documents open in an app that can play them, like VLC or Kodi",
      "Network folder in Files: browse your NAS or computer (SMB or NFS) and copy files between it and the TV",
      "Uninstall apps in Settings > Task manager: every app you installed with its size and when it was last used, least used first. A removed app's tile goes at once"]],
    ["0.9", "November 2026", ["Every photo set now follows the time of day: sunsets around sunrise and sunset, daytime photos by day, night shots at night (Backgrounds > Photos > Match the time of day)",
      "A TV's own beach or town can lead the photo list: list hand-picked Commons photos under \"homePhotos\" in its tv.json"]],
    ["0.8", "November 2026", ["Customize is now called Settings: every folder and setting in A to Z order, and the sheet holds still as you move",
      "Amazon's own Fire Settings and Fire TV Home moved into Settings > Fire TV, so the apps sit lower and the photo gets more room",
      "Serious alerts over any app: life-threatening weather, AMBER Alerts, evacuations and other emergencies, larger, with a sound; a movie pauses so it can be heard, and OK closes the alert and carries on",
      "Choose where notifications pop up, and the sound for serious alerts",
      "Many more photo backgrounds, every set checked by eye: sunsets, islands, autumn, flower fields, northern lights, starry skies, world landmarks, Christmas markets, fireworks, cherry blossoms, cars, sailing, stadiums, ski slopes and more",
      "Cybersecurity news adds actively exploited CVEs (CISA) and new data breaches (Have I Been Pwned)",
      "Plex, Netflix and other apps get the TV to themselves: Offshore pauses its own work while they're on screen",
      "App tiles stay solid and crisp; the layout chooser no longer covers your apps"]],
    ["0.7", "November 2026", ["A welcome setup and tour for new installs, with Make it yours: teams, news, backgrounds, layouts, fonts, sounds and more",
      "Live backgrounds: hand-checked 1080p video of beaches, reefs, national parks, cities, places around the world, cozy scenes and holidays, streamed with no storage",
      "Holidays & seasons: a live background that follows Christmas, New Year's, Valentine's, St. Patrick's, Easter, Mother's and Father's Day, the 4th of July, Halloween, Thanksgiving and the seasons",
      "Home screen layouts to pick from, and auto-fit so nothing ever overlaps",
      "Fonts and colours: four lettering styles, eight accent colours, tinted glass and a coloured highlight",
      "Speed test from open test servers (M-Lab, or Cloudflare)",
      "Weather you can trust: high and low, what's coming next, and amber when it's old or offline; alerts with what to do, full screen when life-threatening",
      "Notifications drop down from the top; tidier menus with section headings"]],
    ["0.6", "November 2026", ["A tidier bottom bar: even spacing, matching text on both sides",
      "Open a music app lists only music apps, including new ones you install",
      "Now playing shows where the sound is going and at what rate (HDMI, soundbar or Bluetooth, and kHz)",
      "Share with a code: the code now shows on the Share card before anyone sends, and pops up over other apps too",
      "Screen mirroring starts from Offshore: press Mirror, then Start mirroring, and pick the TV on your phone or laptop",
      "Security review: developer access, closing apps and the webhook now need a real press of OK on the remote, the network features are harder to flood, and outside text can never run as code"]],
    ["0.5", "November 2026", ["Notifications you can open: Notifications & System > Notifications lists them, and OK reads one in full",
      "Update notices open to the full release notes",
      "A cleaner Now playing card: centred, a larger cover, round controls with a bigger play button",
      "Now playing appears within half a minute of music access being turned on",
      "About Offshore: why it exists, and that it's free and open source for everyone",
      "Faster and lighter: trimmed news feeds, a small download pool, spread-out start-up, many fixes"]],
    ["0.4", "November 2026", ["Calendar: Google, iCloud, Outlook and more added from your phone, events on the TV, US holidays",
      "Settings back themselves up and come back after a reinstall", "Permissions & setup shows what's on; tools\\setup_tv.ps1 turns it all on"]],
    ["0.3", "November 2026", ["Sleep sounds, news by topic, air quality and a task manager"]],
    ["0.2", "November 2026", ["The smart-mirror screensaver with a layout you design, the week in the clock panel, home screen layout options"]],
    ["0.1", "November 2026", ["First public version"]]
  ];
  function releaseNotes(body) {                      // GitHub release text -> a few plain lines
    return String(body || "").split(/\r?\n/).map(function (l) { return l.replace(/^\s*(#+|[-*•]|\d+\.)\s*/, "").replace(/[*_`]/g, "").trim(); })
      .filter(function (l) { return l && l.length > 3; }).slice(0, 8);
  }
  function whatsNewCheck() {                         // after an update: a quiet notice with the highlights, once
    var v = myVersion(), seen = load("seenVersion");
    if (!app || v === "preview" || seen === v) return;
    save("seenVersion", v);
    if (!seen) return;                               // first start: nothing "new" to tell
    var notes = (CHANGELOG.filter(function (c) { return c[0] === v; })[0] || CHANGELOG[0])[2];
    guestNotice({ title: "What's new in Offshore " + v, message: notes[0] + (notes.length > 1 ? " · and more" : ""), details: notes,
                  action: "whatsnew", level: "info", source: "Updates" });
  }
  setTimeout(whatsNewCheck, 20000);
  var OS_NAME = null, SOUND_OUT = null;
  function updState() { return load("updstate") || {}; }
  function myVersion() { return app && app.pkgVersion ? app.pkgVersion("app.offshore") : "preview"; }
  // Offshore's update site (Updater.java): latest.json says the newest version, its notes, the APK and its fingerprint.
  function updateSite() { return app && app.updateSite ? app.updateSite() : ""; }
  var feedWait = null;
  window.guestUpdateFeed = function (j) { if (feedWait) { var f = feedWait; feedWait = null; f(j); } };
  function checkUpdates(manual) {
    var st = updState(), jobs = [];
    st.last = Date.now();
    console.info("updates: checking (" + (manual ? "asked" : "scheduled") + "), site " + (updateSite() || "none") + ", this is " + myVersion());
    if (updateSite()) jobs.push(new Promise(function (done) {
      feedWait = function (j) {
        var v = String(j.version || "");
        st.guest = j.error || !v ? { error: true } : { latest: v, newer: cmpVer(v, myVersion()) > 0, notes: (j.notes || []).map(String).slice(0, 8),
                                                     apk: String(j.apk || ""), sha256: String(j.sha256 || "") };
        done();
      };
      app.updateCheck();
      setTimeout(function () { if (feedWait) { feedWait = null; st.guest = { error: true }; done(); } }, 40000);
    }));
    else if (UPDATE_REPO) jobs.push(getJson("https://api.github.com/repos/" + UPDATE_REPO + "/releases/latest").then(function (j) {
      var v = String(j.tag_name || "").replace(/^v/, "");
      st.guest = { latest: v, newer: !j.prerelease && !j.draft && cmpVer(v, myVersion()) > 0, notes: releaseNotes(j.body) };
    }).catch(function () { st.guest = { error: true }; }));
    var kodi = app && app.pkgVersion ? app.pkgVersion("org.xbmc.kodi") : "";
    if (kodi) jobs.push(getText("https://mirrors.kodi.tv/releases/android/arm/").then(function (html) {
      var best = "", re = /kodi-(\d+(?:\.\d+)+)-([A-Za-z]+)-armeabi-v7a\.apk"/g, m;   // final releases only: "kodi-21.3-Omega-…"
      while ((m = re.exec(html))) if (!best || cmpVer(m[1], best) > 0) best = m[1];
      st.kodi = { installed: kodi, latest: best, newer: !!best && cmpVer(best, kodi.split(/[ -]/)[0]) > 0 };
    }).catch(function () { st.kodi = { installed: kodi, error: true }; }));
    return Promise.all(jobs).then(function () {
      var old = updState();
      save("updstate", st);
      console.info("updates: " + (st.guest ? (st.guest.error ? "couldn't check" : "newest " + st.guest.latest + (st.guest.newer ? " (newer)" : " (not newer)")) : "no source"));
      if (st.guest && st.guest.newer && (manual || !(old.guest && old.guest.latest === st.guest.latest)))
        guestNotice({ title: "Offshore " + st.guest.latest + " is available", message: (st.guest.notes && st.guest.notes[0] ? st.guest.notes[0] + " · " : "") + "Open to read what's new",
                      details: (st.guest.notes || []).concat([st.guest.apk ? "Install it from Settings › Updates & about › Offshore, or What's new" : "Install it from Settings › Updates & about"]), action: "whatsnew", level: "info", source: "Updates" });
      if (st.kodi && st.kodi.newer && (manual || !(old.kodi && old.kodi.latest === st.kodi.latest)))
        guestNotice({ title: "Kodi " + st.kodi.latest + " is out", message: "Official stable release from kodi.tv", level: "info", source: "Updates" });
      if (manual) toast(st.guest && st.guest.newer || st.kodi && st.kodi.newer ? "Updates found: see the notice" : "Everything is up to date");
      if (custOpen) renderCustom();
    });
  }
  // Install now (What's new): the app downloads the APK from the update site, checks its fingerprint, that it's this app
  // with this key and newer, then Fire TV asks to install it. A person presses Install there; settings are kept.
  var updBusy = "";
  function installUpdate() {
    var g = updState().guest;
    if (!g || !g.newer || !g.apk) return;
    if (updBusy) { toast("Already downloading"); return; }
    if (!app || !app.updateInstall) { toast("Would install Offshore " + g.latest); return; }
    if (!app.updateInstall(g.apk, g.sha256)) { toast("Press OK on the remote to install"); return; }
    updBusy = "Downloading…"; renderCustom();
  }
  window.guestUpdateProgress = function (done, total) {
    updBusy = total > 0 ? "Downloading " + Math.min(99, Math.round(100 * done / total)) + "%" : "Downloading " + bytes(done);
    if (custOpen) renderCustom();
  };
  window.guestUpdateDone = function (r) {
    updBusy = "";
    toast(r === "ok" ? "Checked and ready: press Install on the next screen" : "Update not installed: " + r);
    if (custOpen) renderCustom();
  };
  // Every 30 minutes: is a check due (how often), and is it past the chosen hour today?
  function updatesDue() {
    if (PREFS.updMode === "off" || !app) return;
    var st = updState(), days = { daily: 1, weekly: 7, monthly: 30 }[PREFS.updFreq] || 7, now = new Date();
    if (st.last && Date.now() - st.last < days * 86400000 - 3600000) return;
    if (now.getHours() < (+PREFS.updHour || 0) && st.last) return;                       // wait for the chosen hour
    checkUpdates(false);
  }
  setTimeout(updatesDue, 60000);
  updTimer = setInterval(updatesDue, 30 * 60000);
  // Updates & about > Offshore: one row that says where things stand and does the next thing on OK.
  var UPD_AUTO = [["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"], ["off", "Only when I ask"]];
  function updAutoNow() { return PREFS.updMode === "off" ? "off" : PREFS.updFreq || "weekly"; }
  function updOffshoreState() {                    // "ready" (an update can be installed), "checking", "error", "ok", "none"
    var st = updState(), g = st.guest;
    if (updBusy) return "busy";
    if (updChecking) return "checking";
    if (!updateSite() && !UPDATE_REPO) return "none";
    if (!g) return "unchecked";
    if (g.error) return "error";
    return g.newer ? (g.apk ? "ready" : "out") : "ok";
  }
  var updChecking = false;
  function updCheckNow() {
    if (updChecking) return;
    updChecking = true; if (custOpen) renderCustom();
    checkUpdates(true).then(function () { updChecking = false; if (custOpen) renderCustom(); }, function () { updChecking = false; if (custOpen) renderCustom(); });
  }
  function updateValue(key) {
    var st = updState();
    if (key === "updOffshore") {
      var s = updOffshoreState(), v = myVersion(), g = st.guest || {};
      if (s === "busy") return updBusy;
      if (s === "checking") return "Checking…";
      if (s === "ready") return g.latest + " is ready · Install now  ›";
      if (s === "out") return g.latest + " is out";
      if (s === "none") return "Version " + v;
      return "Version " + v + (s === "ok" ? " · up to date" : s === "error" ? " · couldn't check" : "") + " · Check now  ›";
    }
    if (key === "updAuto") return UPD_AUTO.filter(function (o) { return o[0] === updAutoNow(); })[0][1];
    if (key === "verGuest") {
      var v = myVersion();
      if (!UPDATE_REPO && !updateSite()) return "Version " + v + " · updated from your computer";
      return "Version " + v + (st.guest ? st.guest.error ? " · couldn't check" : st.guest.newer ? " · " + st.guest.latest + " available" : " · up to date" : "");
    }
    if (key === "verKodi") {
      var k = app && app.pkgVersion ? app.pkgVersion("org.xbmc.kodi") : "";
      if (!k) return "Not installed";
      return "Version " + k.split(/[ -]/)[0] + (st.kodi ? st.kodi.error ? " · couldn't check" : st.kodi.newer ? " · " + st.kodi.latest + " out" : " · latest stable" : "");
    }
    if (key === "updNow") return (st.last ? "Checked " + dayText(st.last, { month: "short", day: "numeric" }) + " " + hm(st.last) : "Not checked yet") + "  ›";
    if (key === "verApps") return "Amazon Appstore  ›";
    if (key === "verFire") {                         // read once: Fire OS doesn't change while the app runs
      if (OS_NAME == null) { OS_NAME = ""; try { OS_NAME = JSON.parse(app.systemInfo()).os || ""; } catch (e) {} }
      return (OS_NAME || "Fire OS") + "  ›";
    }
    return "";
  }

