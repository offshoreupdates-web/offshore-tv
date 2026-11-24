  // Settings is a short list of folders (owner: "organized, easy to use"), each holding a few settings; Restore defaults
  // and Save settings stay at the bottom of the first list.
  var GROUPS = [
    { id: "look", label: "Appearance", keys: ["theme", "font", "accent", "glass", "tint", "focusStyle", "focusFx", "tileShape", "tileDim", "motion", "lite", "wxFx", "npFull", "bg", "speed"] },
    { id: "saver", label: "Screensaver", keys: ["ambient", "ssStyle", "ssLayout", "ssSize", "ssCal", "ssNews", "ssNewsPick", "ssStocks", "ssCrypto"] },
    { id: "info", label: "Home screen", keys: ["homeLayout", "g:kw", "cards", "homeClock", "homeClockStyle", "homeClockSize", "homeWeek", "homeAir", "beach", "homeInfo", "homeInfoSize", "homeHero", "homeBar", "homeHint", "edges", "tileAuto", "tileOrder", "hiddenTiles"] },
    // Keep watching and the apps that feed it, together in one folder inside Home screen (owner: "fix the UI in the
    // settings where the Plex and Fox ones settings are"). In use order, not A to Z.
    { id: "kw", label: "Keep watching", parent: "info", keys: ["kw", "kwWhere", "plex", "foxRead"], fixed: true },
    { id: "sport", label: "Sports", keys: ["sports", "leagues", "teams"] },
    { id: "notif", label: "Notifications", keys: ["alertsOn", "alertSound", "gameNotices", "notifPos", "updNotices", "pauseN", "webhook"] },
    { id: "media", label: "Music & sound", keys: ["sleep", "music", "artLookup", "sounds", "notifySound", "soundFind", "soundMine", "soundOut"] },
    { id: "share", label: "Devices & sharing", keys: ["bluetooth", "share", "mirror"] },
    { id: "net", label: "Network & storage", keys: ["filesOpen", "netSettings", "speedTest", "nasFolder", "storage"] },
    { id: "tv", label: "This TV", keys: ["room", "location", "lang", "tz", "units", "clock"] },
    { id: "fire", label: "Fire TV", keys: ["fireHome", "fireSettings", "tidy"], fixed: true },   // owner: Home first, not A to Z
    { id: "cal", label: "Calendar", link: "cal", keys: [] },
    { id: "livetv", label: "Live TV", link: "livetv", keys: [] },
    { id: "tasks", label: "Task manager", link: "tasks", keys: [] },
    { id: "sec", label: "Security & privacy", keys: ["perms", "custPin", "adb"] },
    { id: "upd", label: "Updates & about", keys: ["updOffshore", "updAuto", "whatsnew", "updother", "about", "setupReplay", "reset"], fixed: true }
  ];
  var nasReturn = "bg", delReturn = "bg";                 // where Back goes from the network folder / delete lists
  var picSet = "";                                        // the photo set whose photos Backgrounds › Photos › a set shows
  var clipSet = "";                                       // the live set whose clips Backgrounds › Live video › a set shows
  function rowOf(key) { return PREF_ROWS.filter(function (r) { return r.key === key; })[0]; }
  // Folders A to Z, and the settings in each folder A to Z (owner), sorted here so new ones always land in order.
  // Related rows are named to sit together ("Check for updates", "Check how often", "Check now", "Check time").
  (function () {
    var lab = function (k) { var r = k.indexOf("g:") === 0 ? GROUPS.filter(function (g) { return "g:" + g.id === k; })[0] : rowOf(k); return (r ? r.label : k).toLowerCase(); };
    GROUPS.sort(function (a, b) { return a.label.toLowerCase() < b.label.toLowerCase() ? -1 : 1; });
    GROUPS.forEach(function (g) { if (!g.fixed) g.keys.sort(function (a, b) { return lab(a) < lab(b) ? -1 : lab(a) > lab(b) ? 1 : 0; }); });
  })();
  function groupOf(key) { return GROUPS.filter(function (g) { return g.keys && g.keys.indexOf(key) >= 0; })[0]; }
  function viewRows() {                                    // the PREF_ROWS (or folders) the current list shows
    if (custMode.indexOf("g:") === 0) {
      var g = GROUPS.filter(function (x) { return "g:" + x.id === custMode; })[0];
      return g.keys.map(function (k) { return k.indexOf("g:") === 0 ? folderRow(k) : rowOf(k); });
    }
    return GROUPS.filter(function (g) { return !g.parent; }).map(function (g) { return { key: "g:" + g.id, label: g.label, group: g }; }).concat([rowOf("save")]);
  }
  function folderRow(k) { var g = GROUPS.filter(function (x) { return "g:" + x.id === k; })[0]; return { key: k, label: g.label, group: g }; }
  function groupValue(g) {                                 // a hint of what's inside each folder
    if (g.id === "look") return bgName(PREFS.bg);
    if (g.id === "cal") { var nc = calList().length; return (nc ? nc + " calendar" + (nc > 1 ? "s" : "") : "Holidays") + (myEvents().length ? " · " + myEvents().length + " on this TV" : ""); }
    if (g.id === "tasks") return TASK && TASK.info.memTotal ? gb(TASK.info.memFree) + " memory free" : "Performance and apps";
    if (g.id === "saver") return !+PREFS.ambient ? "Off" : "After " + Math.round(PREFS.ambient / 60) + " min" + (PREFS.ssCal !== "off" ? " · week" : "");
    if (g.id === "info") return (PREFS.homeClock === "hide" ? "No clock panel" : PREFS.homeClock === "left" ? "Clock on the left" : "Clock on the right") + (PREFS.beach === "hide" ? "" : " · beach");
    if (g.id === "kw") return PREFS.kw === "off" ? "Off" : [PREFS.kwWhere === "row" ? "One row" : "Over each app"].concat(plexOn() ? ["Plex linked"] : [], PREFS.foxRead === "on" ? ["Fox One names"] : []).join(" · ");
    if (g.id === "sport") return PREFS.sports === "off" ? "Off" : myTeams().length ? myTeams().length + " favorite team" + (myTeams().length > 1 ? "s" : "") : "Scores on";
    if (g.id === "tv") return room();
    if (g.id === "fire") return "Amazon's own settings and home";
    if (g.id === "livetv") return liveTvSummary();
    if (g.id === "share") return (PREFS.share === "off" ? "Receiving off" : "Receiving on") + (MUSIC.bt ? " · " + MUSIC.bt : "");
    if (g.id === "notif") return isPaused() ? "Paused" : PREFS.alertsOn === "off" ? "Weather alerts off" : "On";
    if (g.id === "media") return MUSIC.title && MUSIC.playing ? "Playing: " + MUSIC.title : MUSIC.allowed ? "Controls on" : "Remote and phone control";
    if (g.id === "net") { var nh = nasInfo(); return (NET.type === "ethernet" ? "Ethernet" : NET.online ? "Wi-Fi" : "Offline") + (nh.host ? " · NAS" : ""); }
    if (g.id === "upd") { var us = updState(); return us.guest && us.guest.newer || us.kodi && us.kodi.newer ? "Update available" : "Version " + myVersion(); }
    if (g.id === "sec") { var a = adbState(); return (PREFS.custPin ? "PIN on" : "PIN off") + (a ? " · developer access " + (a.on ? "on" : "off") : ""); }
    return "";
  }
  function adbState() { try { return app && app.adbGet ? JSON.parse(app.adbGet()) : null; } catch (e) { return null; } }
  function liveValue(key) {
    if (/^(upd|ver)/.test(key)) return updateValue(key);
    if (key === "pauseN") return isPaused() ? pauseLabel() : "Off";
    if (key === "soundFind") return "Search  ›";
    if (key === "soundMine") { var sc = Object.keys(soundCredits()).length; return (sc ? sc + (sc === 1 ? " sound" : " sounds") : "None") + "  ›"; }
    if (key === "mirror") return "Start  ›";
    if (key === "filesOpen") return "Open  ›";
    if (key === "setupReplay") return "Start  ›";
    if (key === "fireSettings" || key === "fireHome") return "Open  ›";
    if (key === "custPin") return PREFS.custPin ? "On" : "Off";
    if (!app) return "On the TV";
    if (key === "music") return MUSIC.allowed ? "Ready · Music at the bottom of the home screen" : "Needs a one-time permission";
    if (key === "bluetooth") return (MUSIC.bt ? MUSIC.bt + " · " : "") + "Devices  ›";
    if (key === "adb") { var a = adbState() || {}; return (a.on ? "On" : "Off") + (a.canChange ? "" : " · needs a one-time permission"); }
    if (key === "webhook") return app.webhookGet && app.webhookGet() ? "On · port 7979" : "Off";
    if (key === "soundOut") {                        // asked at most every 30 s, not on every key press
      if (!SOUND_OUT || Date.now() - SOUND_OUT.t > 30000) { var so = "—"; try { so = JSON.parse(app.systemInfo()).sound || "—"; } catch (e) { } SOUND_OUT = { t: Date.now(), v: so }; }
      return SOUND_OUT.v;
    }
    if (key === "netSettings") return (NET.type === "ethernet" ? "Ethernet" : NET.online ? "Wi-Fi" : "Offline") + "  ›";
    if (key === "hiddenTiles") { var hn = hiddenTiles().length; return (hn ? hn + (hn === 1 ? " tile" : " tiles") : "None") + "  ›"; }
    if (key === "nasFolder") { var ni2 = nasInfo(); return ni2.host ? (ni2.type || "smb").toUpperCase() + " · " + (nasState || ni2.host) + "  ›" : "Set up  ›"; }
    return "";
  }
  function liveNav(key, action) {
    if (key === "updNow" && action === "ok") { toast("Checking official sources…"); checkUpdates(true); return; }
    if (key === "updOffshore" && action === "ok") {          // install what's ready, else check now
      var us = updOffshoreState();
      if (us === "ready") installUpdate(); else if (us === "busy" || us === "checking") toast(updBusy || "Checking…");
      else if (us === "none") toast("This TV's Offshore has no update site set");
      else updCheckNow();
      return;
    }
    if (key === "updAuto" && (action === "left" || action === "right" || action === "ok")) {   // one row for the whole schedule
      var ui = UPD_AUTO.map(function (o) { return o[0]; }).indexOf(updAutoNow()), nx = UPD_AUTO[(ui + (action === "left" ? UPD_AUTO.length - 1 : 1)) % UPD_AUTO.length][0];
      if (nx === "off") PREFS.updMode = "off"; else { PREFS.updMode = "notify"; PREFS.updFreq = nx; }
      applyPrefs("updMode"); renderCustom(); return;
    }
    if ((key === "fireSettings" || key === "fireHome") && action === "ok") {   // Amazon's screens; Home comes back here
      var fid = key === "fireSettings" ? "settings" : "firetv";
      if (!app) { toast("Would open " + rowOf(key).label); return; }
      closeCustom(); app.launch(fid); return;
    }
    if (key === "pauseN" && (action === "ok" || action === "right")) { cyclePause(); return; }
    if (key === "soundFind" && action === "ok") { kbField = "sound"; kbText = ""; kbIdx = 0; kbShift = false; custMode = "search"; return; }
    if (key === "soundMine" && action === "ok") { custMode = "sndslots"; custRow = 0; return; }
    if (key === "mirror" && action === "ok") { closeCustom(); openDockCard("mirror"); return; }
    if (key === "filesOpen" && action === "ok") { closeCustom(); openFiles(); return; }
    if (key === "setupReplay" && action === "ok") { closeCustom(); suOpen(); return; }
    if (key === "custPin" && action === "ok") {
      if (PREFS.custPin) { PREFS.custPin = ""; applyPrefs("custPin"); toast("Settings PIN off · Save settings to keep it"); }
      else { custMode = "pinset"; padIdx = 0; padZip = ""; }
      return;
    }
    if (key === "nasFolder" && action === "ok") { if (nasReady()) { nasReturn = "g:net"; nasOpen(); } else toast("Network folders work on the TV"); return; }
    if (key === "netSettings" && action === "ok") { if (!app) { toast("This works on the TV"); return; } enterDevices("wifi"); return; }
    if (key === "hiddenTiles" && action === "ok") { custMode = "hidden"; custRow = 0; return; }
    if (key === "soundOut") { toast("Change sound output in Fire Settings > Display & Sounds"); return; }
    if (!app) { toast("This works on the TV"); return; }
    if ((key === "verApps" || key === "verFire") && action === "ok") {
      if (custDirty) { toast("Save settings first"); return; }
      closeCustom(); app.launch(key === "verApps" ? "appstore" : "fireupdates"); return;
    }
    if (key === "verGuest") { toast(UPDATE_REPO ? "Updates come from this app's official releases on GitHub (stable only)" : "This TV's Offshore is updated from your computer"); return; }
    if (key === "verKodi") { toast("Kodi's official stable releases (kodi.tv); install with the computer tool"); return; }
    if (key === "music") toast(MUSIC.allowed ? "Use Music at the bottom of the home screen" : "Music controls need a one-time permission (see the setup notes)");
    else if (key === "bluetooth" && action === "ok") enterDevices("bt");
    else if (key === "adb") {
      var a = adbState() || {};
      if (!a.canChange) { toast("This switch needs a one-time permission (see the setup notes)"); return; }
      if (app.adbSet(!a.on)) toast(a.on ? "Developer access off · turn it on here before using setup tools on a computer" : "Developer access on");
      else if (!a.on) toast("Press OK on the remote to turn developer access on");   // the app only allows it after a real OK press
    }
    else if (key === "webhook") {
      var on = !app.webhookGet();
      app.webhookSet(on);
      toast(on ? "Webhook on: smart home systems on your network can send notices (with the token)" : "Webhook off · port closed");
    }
  }
  function storageInfo() { try { return app && app.storageInfo ? JSON.parse(app.storageInfo()) : null; } catch (e) { return null; } }
  function storageRows() {
    var ni = nasInfo(), s = storageInfo();
    var rows = [
      { label: "Save new files to", value: ni.store ? "Network folder (NAS)" : "This TV", id: "where" },
      { label: "Network folder (NAS)", act: true, id: "nas", value: !nasReady() ? "On the TV" : ni.host ? (ni.type || "smb").toUpperCase() + " · " + (nasState || ni.host) + "  ›" : "Set up  ›" }];
    if (s) {
      rows.push({ label: "Free space on this TV", value: mb(s.free) + " of " + mb(s.total), act: true, none: true });
      rows.push({ label: "Downloaded photos", value: mb(s.photos) + "  ›", act: true, id: "photos" });
      rows.push({ label: "Received files", value: mb(s.received) + (s.received ? " · OK deletes" : ""), act: true, id: "recv" });
    }
    rows.push({ label: "New files: downloaded backgrounds and files received from phones", act: true, none: true });
    return rows;
  }
  function storageNav(action, rows) {
    var r = rows[custRow];
    if (!r) return;
    if (r.id === "where" && (action === "ok" || action === "left" || action === "right")) {
      var ni = nasInfo();
      if (!ni.host || ni.type === "nfs") { toast(ni.type === "nfs" ? "Saving needs an SMB folder (NFS is read-only here)" : "Set up the network folder first"); return; }
      ni.store = !ni.store;
      app.nasSet(JSON.stringify(ni));
      toast(ni.store ? "New files go to the network folder" : "New files stay on this TV");
    }
    else if (action !== "ok") return;
    else if (r.id === "nas") { if (nasReady()) { nasReturn = "storage"; nasOpen(); } else toast("Network folders work on the TV"); }
    else if (r.id === "photos") { delReturn = "storage"; custMode = "bgdelete"; custRow = 0; }
    else if (r.id === "recv") { deleteReceived(); }
  }
  // Settings > Calendar: calendars added from a phone (◀ removes), events typed in on the TV, holidays.
  var CAL_TIMES = [-1];                              // -1 = all day, then every 15 minutes from 6:00 to 23:45
  for (var cm = 6 * 60; cm < 24 * 60; cm += 15) CAL_TIMES.push(cm);
  function calRows() {
    var rows = [{ label: "Add a calendar from your phone", value: "›", act: true, id: "phone" }];
    calList().forEach(function (c) {
      var n = EVENTS.filter(function (e) { return e.cal === c.name && e.end > Date.now(); }).length;
      rows.push({ label: c.name, value: (c.ok === false ? "Couldn't load · " : n + " coming up · ") + "◀ removes", act: true, cal: c.id });
    });
    rows.push({ label: "Add an event on the TV", value: "›", act: true, id: "new" });
    myEvents().forEach(function (e) {
      rows.push({ label: e.title, value: evWhen({ t: e.t, allDay: e.allDay }, true) + ({ week: " · weekly", year: " · yearly", day: " · daily" }[e.repeat] || "") + " · ◀ removes", act: true, ev: e.id });
    });
    rows.push({ label: "Holidays", value: (PREFS.calHolidays === "off" ? "Off" : "US holidays"), act: true, adj: true, id: "hol" });
    rows.push({ label: "Next event in the clock panel", value: (PREFS.homeNext === "hide" ? "Hide" : "Show"), act: true, adj: true, id: "next" });
    if (calList().length) rows.push({ label: "Refresh calendars now", value: "›", act: true, id: "refresh" });
    rows.push({ label: "Works with Google, Apple iCloud, Outlook, Proton, Yahoo, Fastmail and school or team calendars shared as an iCal link. Change events in your calendar app; the TV shows them.", act: true, none: true });
    return rows;
  }
  function calPhoneRows() {
    if (!CALPHONE || !CALPHONE.url) return [{ label: app ? "Couldn't find this TV's address. Check that it's on Wi-Fi or Ethernet." : "Adding from a phone works on the TV", act: true, none: true }];
    return [{ label: "On your phone or computer (same Wi-Fi), open:", act: true, none: true },
            { label: CALPHONE.url.replace(/^http:\/\//, ""), value: "", act: true, id: "addr" },
            { label: "Code", value: CALPHONE.code, act: true, id: "code" },
            { label: "Paste your calendar's iCal (ICS) link there and enter the code. The page explains where Google, iCloud and Outlook keep the link.", act: true, none: true },
            { label: "This stays open for 10 minutes, or until a calendar is added. Back closes it.", act: true, none: true }];
  }
  function calNewRows() {
    var e = NEWEV, d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + e.day);
    var tm = CAL_TIMES[e.time], dayName = e.day === 0 ? T("Today") : e.day === 1 ? T("Tomorrow") : dayText(d.getTime(), { weekday: "short", month: "short", day: "numeric" });
    var timeName = tm < 0 ? T("All day") : hm(new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(tm / 60), tm % 60).getTime());
    return [{ label: "Title", value: e.title ? e.title + "  ›" : "Type a title  ›", act: true, id: "title" },
            { label: "Day", value: dayName, act: true, adj: true, id: "day" },
            { label: "Time", value: timeName, act: true, adj: true, id: "time" },
            { label: "Repeats", value: { none: "Never", week: "Every week", year: "Every year", day: "Every day" }[e.repeat], act: true, adj: true, id: "rep" },
            { label: "Save event", value: "", act: true, id: "save" }];
  }
  function calNav(action, rows) {
    var r = rows[custRow], step = action === "left" ? -1 : 1;
    if (!r) return;
    if (custMode === "cal") {
      if (r.id === "phone" && action === "ok") {
        try { CALPHONE = app && app.calPhoneStart ? JSON.parse(app.calPhoneStart()) : null; } catch (e) { CALPHONE = null; }
        custMode = "calphone"; custRow = 1;
      }
      else if (r.cal && action === "left") {
        var c = calList().filter(function (x) { return x.id === r.cal; })[0];
        save("calendars", calList().filter(function (x) { return x.id !== r.cal; }));
        calRemote = calRemote.filter(function (e) { return !c || e.cal !== c.name; }); save("calcache", { t: Date.now(), remote: calRemote });
        calRebuild(calRemote); toast("Removed " + (c ? c.name : "the calendar"));
      }
      else if (r.cal && action === "ok") { toast("Refreshing…"); loadCalendars(); }
      else if (r.id === "new" && action === "ok") { NEWEV = { title: "", day: 0, time: 0, repeat: "none" }; custMode = "calnew"; custRow = 0; }
      else if (r.ev && action === "left") { save("myevents", myEvents().filter(function (x) { return x.id !== r.ev; })); calRebuild(calRemote); toast("Event removed"); }
      else if (r.id === "hol" && action !== "ok") { PREFS.calHolidays = PREFS.calHolidays === "off" ? "us" : "off"; liveSave("calHolidays"); calRebuild(calRemote); }
      else if (r.id === "next" && action !== "ok") { PREFS.homeNext = PREFS.homeNext === "hide" ? "show" : "hide"; liveSave("homeNext"); renderNextUp(); }
      else if (r.id === "refresh" && action === "ok") { toast("Refreshing…"); loadCalendars(); }
    } else if (custMode === "calnew") {
      var e = NEWEV;
      if (r.id === "title" && action === "ok") { kbField = "evtitle"; kbText = e.title; kbIdx = 0; kbShift = !e.title; custMode = "search"; }
      else if (r.id === "day" && action !== "ok") e.day = Math.max(0, Math.min(365, e.day + step));
      else if (r.id === "time" && action !== "ok") e.time = (e.time + step + CAL_TIMES.length) % CAL_TIMES.length;
      else if (r.id === "rep" && action !== "ok") { var reps = ["none", "week", "year", "day"]; e.repeat = reps[(reps.indexOf(e.repeat) + step + reps.length) % reps.length]; }
      else if (r.id === "save" && action === "ok") {
        if (!e.title.trim()) { toast("Give the event a title first"); custRow = 0; return; }
        var d = new Date(); d.setDate(d.getDate() + e.day); var tm = CAL_TIMES[e.time];
        var t = tm < 0 ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(tm / 60), tm % 60).getTime();
        save("myevents", myEvents().concat([{ id: "e" + Date.now().toString(36), title: e.title.trim().slice(0, 60), t: t, allDay: tm < 0, repeat: e.repeat }]));
        calRebuild(calRemote); toast("Saved “" + e.title.trim() + "”"); NEWEV = null; custMode = "cal"; custRow = 0;
      }
    }
  }

  // Settings > Security & privacy > Permissions & setup: which optional permissions are on. Fire OS lets nothing on
  // the TV grant these (its settings pages for them are placeholders, and apps can't reach its developer connection),
  // so they're switched on once from a computer: tools\setup_tv.ps1 does all four and checks them.
  var SETUP = [["home", "Home button opens Offshore"], ["music", "Music controls"], ["usage", "Task manager app list"], ["secure", "Developer access switch"]];
  function permState() { try { return app && app.permStatus ? JSON.parse(app.permStatus()) : {}; } catch (e) { return {}; } }
  function setupRows() {
    if (!app || !app.permStatus) return [{ label: "Permissions show on the TV", act: true, none: true }];
    var ps = permState(), off = SETUP.filter(function (x) { return !ps[x[0]]; }).length;
    var rows = SETUP.map(function (x) { return { label: x[1], value: ps[x[0]] ? "On  ✓" : "Off", act: true, id: "perm" }; });
    rows.push({ label: off ? "To turn these on, run tools\\setup_tv.ps1 on a computer on the same Wi-Fi, with ADB debugging on (Fire Settings > My Fire TV > Developer options). It takes a few seconds."
                           : "Everything is on.", act: true, none: true });
    return rows;
  }

  // Settings > Fire TV > Tidy up Fire TV: the Amazon extras in debloat.json that are on this TV, to switch off or back on.
  // Fire OS lets no app switch other apps off, so the TV keeps the owner's choice (app.tidySave -> tidy.json) and
  // tools\setup_tv.ps1, the same one-time computer step as the Home button, applies it (pm disable-user / enable,
  // nothing uninstalled, only catalog packages). Amazon's ad screensaver is a setting the app can change itself once
  // set up. The preview reads debloat.json and makes up states.
  var TIDY = null, TIDY_SAVER = null;
  function tidyFetch() {
    if (app && app.tidyStatus) {
      try { TIDY = JSON.parse(app.tidyStatus()); } catch (e) { TIDY = { groups: [], items: [] }; }
      TIDY.t = Date.now();
      try { TIDY_SAVER = JSON.parse(app.amazonSaverGet()); } catch (e) { TIDY_SAVER = null; }
      return;
    }
    TIDY = { groups: [], items: [], loading: true }; TIDY_SAVER = { on: true, canChange: true };
    fetch("debloat.json").then(function (r) { return r.json(); }).then(function (c) {
      TIDY = { groups: c.groups, items: c.items.map(function (it, i) { var x = JSON.parse(JSON.stringify(it)); x.on = i % 3 !== 0; return x; }) };
      if (custOpen && custMode === "tidy") renderCustom();
    }, function () { TIDY = { groups: [], items: [] }; });
  }
  function tidyChoice() {                               // {off: [...], on: [...]}: only what the owner changed
    var c = (TIDY && TIDY.choice) || load("tidy") || {};
    return { off: (c.off || []).slice(), on: (c.on || []).slice() };
  }
  function tidyTarget(it, ch) { return ch.off.indexOf(it.pkg) >= 0 ? false : ch.on.indexOf(it.pkg) >= 0 ? true : it.on; }
  function tidyPending(ch) { return (TIDY ? TIDY.items : []).filter(function (it) { return tidyTarget(it, ch) !== it.on; }).length; }
  function tidySave(ch) {
    if (TIDY) TIDY.choice = ch;
    save("tidy", ch);
    if (app && app.tidySave && !app.tidySave(JSON.stringify(ch))) toast("Couldn't save the choice on this TV");
  }
  function tidySummary() {
    if (!app) return "On the TV";
    if (!TIDY || TIDY.loading) tidyFetch();
    var ch = tidyChoice(), off = TIDY.items.filter(function (it) { return !it.on; }).length, p = tidyPending(ch);
    return p ? p + (p === 1 ? " change" : " changes") + " to apply" : off ? off + " switched off" : "Nothing switched off";
  }
  function tidyRows() {
    if (!TIDY || (app && Date.now() - TIDY.t > 5000)) tidyFetch();   // what the computer step changed since
    var ch = tidyChoice(), rows = [{ label: "Switch off the Amazon extras you don't use. Nothing is uninstalled, and you can switch each one back on here.", act: true, none: true }];
    if (TIDY.loading) return rows.concat([{ label: "Looking at this TV…", act: true, none: true }]);
    if (!TIDY.items.length) return rows.concat([{ label: "None of the extras Offshore knows about are on this TV.", act: true, none: true }]);
    var sugg = TIDY.items.filter(function (it) { return it.suggest && it.on && tidyTarget(it, ch); }).length;
    if (sugg) rows.push({ label: "Use the suggested choice", value: sugg + (sugg === 1 ? " extra" : " extras") + "  ›", act: true, id: "tidysugg",
                          note: "Ticks the extras most people never miss: shopping, promotions, tutorials and viewing recognition." });
    (TIDY.groups || []).forEach(function (g) {
      var its = TIDY.items.filter(function (it) { return it.group === g.id; });
      if (!its.length) return;
      rows.push({ label: g.label, act: true, head: true, none: true });
      its.forEach(function (it) {
        var want = tidyTarget(it, ch);
        rows.push({ label: it.name, act: true, id: "tidyit", pkg: it.pkg, note: it.what,
                    value: want === it.on ? (it.on ? "On" : "Off  ✓") : want ? "Back on after setup" : "Off after setup" });
      });
    });
    if (TIDY_SAVER) {
      rows.push({ label: "Screensaver", act: true, head: true, none: true });
      rows.push({ label: "Amazon's screensaver", act: true, id: "amzsaver", value: TIDY_SAVER.on ? "On" : "Off  ✓",
                  note: "Amazon's own screensaver shows ads. Offshore's screensaver works either way." + (TIDY_SAVER.canChange ? "" : " Switching it needs the one-time setup (Permissions & setup).") });
    }
    var p = tidyPending(ch);
    rows.push({ label: p ? p + (p === 1 ? " change waits" : " changes wait") + " for the computer step: run tools\\setup_tv.ps1 on a computer on the same Wi-Fi (the same one-time step as the Home button). Run it again whenever you change these."
                         : "Everything here is as you chose.", act: true, none: true });
    return rows;
  }
  function tidyNav(action, rows) {
    var r = rows[custRow];
    if (!r || action !== "ok") return;
    var ch = tidyChoice();
    if (r.id === "tidyit") {
      var it = TIDY.items.filter(function (x) { return x.pkg === r.pkg; })[0], want = !tidyTarget(it, ch);
      ch.off = ch.off.filter(function (p) { return p !== it.pkg; }); ch.on = ch.on.filter(function (p) { return p !== it.pkg; });
      if (want !== it.on) ch[want ? "on" : "off"].push(it.pkg);          // a change from how it is now
      tidySave(ch);
      toast(want === it.on ? it.name + ": no change" : it.name + (want ? " will be switched back on" : " will be switched off") + " by the computer step");
    } else if (r.id === "tidysugg") {
      TIDY.items.forEach(function (it) { if (it.suggest && it.on && ch.off.indexOf(it.pkg) < 0) { ch.on = ch.on.filter(function (p) { return p !== it.pkg; }); ch.off.push(it.pkg); } });
      tidySave(ch); toast("Suggested extras ticked. Run tools\\setup_tv.ps1 on a computer to switch them off");
    } else if (r.id === "amzsaver") {
      if (!TIDY_SAVER.canChange) { toast("Needs the one-time setup first: Permissions & setup"); return; }
      var nowOn = !TIDY_SAVER.on;
      if (app && app.amazonSaverSet && !app.amazonSaverSet(nowOn)) { toast("Couldn't change Amazon's screensaver"); return; }
      TIDY_SAVER.on = nowOn; toast(nowOn ? "Amazon's screensaver is on" : "Amazon's screensaver is off");
    }
  }

  // Updates & about > Apps, Fire OS & Kodi updates: what isn't Offshore's own update, and when checks run.
  function updOtherRows() {
    var hr = rowOf("updHour").opts.filter(function (o) { return +o[0] === +PREFS.updHour; })[0];
    var rows = [{ label: "Apps (Netflix, Spotify and the rest)", value: updateValue("verApps"), act: true, key: "verApps", note: HELP.verApps },
                { label: "Fire TV software", value: updateValue("verFire"), act: true, key: "verFire", note: HELP.verFire }];
    if (app && app.pkgVersion && app.pkgVersion("org.xbmc.kodi")) rows.push({ label: "Kodi", value: updateValue("verKodi"), act: true, key: "verKodi", note: HELP.verKodi });
    rows.push({ label: "Time for automatic checks", value: hr ? hr[1] : "3 AM", adj: true, id: "hour", note: HELP.updHour });
    return rows;
  }

  // Settings > Task manager: how the TV is doing (memory, storage, temperature, uptime, this app's own share), then the
  // apps used today, newest first. OK closes an app's background work (Android's own "kill background processes", the
  // same thing it does when memory runs low), ▶ opens Fire TV's page for it (Force stop, Clear cache). "Close background
  // apps" does them all except the app playing music. Refreshes every 3 s while open.
  // The system is asked once when the screen opens and then every 3 s (taskWatch), never on a key press: reading
  // memory and a day of app usage is slow on the TV.
  var taskTimer = 0, TASK = null;
  function taskFetch() {
    var info = {}, list = { allowed: false, apps: [] };
    try { info = app && app.systemInfo ? JSON.parse(app.systemInfo()) : {}; } catch (e) { }
    try { list = app && app.taskApps ? JSON.parse(app.taskApps()) : list; } catch (e) { }
    TASK = { info: info, list: list };
  }
  function taskRows() {
    if (!TASK) taskFetch();
    var info = TASK.info, list = TASK.list;
    var rows = [], meter = function (used, total) {
      var n = Math.round(used / total * 10);
      return new Array(n + 1).join("▮") + new Array(11 - n).join("▯");
    };
    if (info.memTotal) rows.push({ label: "Memory", value: gb(info.memFree) + " free of " + gb(info.memTotal) + "   " + meter(info.memTotal - info.memFree, info.memTotal) + (info.lowMem ? "  · low" : ""), act: true, id: "stat" });
    if (info.storageTotal) rows.push({ label: "Storage", value: gb(info.storageFree) + " free of " + gb(info.storageTotal) + "   " + meter(info.storageTotal - info.storageFree, info.storageTotal), act: true, id: "stat" });
    if (info.tempC) rows.push({ label: "Temperature", value: info.tempC + "°C" + (info.tempC >= 75 ? "  · hot, give it air" : info.tempC >= 60 ? "  · warm" : "  · normal"), act: true, id: "stat" });
    if (info.uptime) { var h = Math.floor(info.uptime / 3600000); rows.push({ label: "On for", value: (h >= 24 ? Math.floor(h / 24) + " d " : "") + (h % 24) + " h", act: true, id: "stat" }); }
    if (info.selfMem) rows.push({ label: "Offshore uses", value: Math.round(info.selfMem / 1048576) + " MB", act: true, id: "stat" });
    if (!app) rows.push({ label: "Performance and apps show on the TV", act: true, none: true });
    rows.push({ label: "Close background apps", value: "›", act: true, id: "closeAll" });
    rows.push({ label: "Uninstall apps", value: "›", act: true, id: "uninst" });
    rows.push({ label: "Used today  ·  OK closes  ·  ▶ app info", act: true, none: true });
    if (!list.allowed && app) rows.push({ label: "The list of apps used today needs one permission: see Security & privacy > Permissions & setup", act: true, none: true });
    else if (!list.apps.length) rows.push({ label: "No other apps used today", act: true, none: true });
    list.apps.forEach(function (a) {
      var m = Math.max(1, Math.round((Date.now() - a.last) / 60000)), fg = Math.round(a.fg / 60000);
      rows.push({ label: a.label, value: (m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago") + "  ·  " + (fg >= 60 ? Math.floor(fg / 60) + " h " + (fg % 60) + " min" : Math.max(1, fg) + " min") + " today",
                  act: true, pkg: a.pkg, playing: a.pkg === MUSIC.pkg && MUSIC.playing });
    });
    return rows;
  }
  function taskNav(action, rows) {
    var r = rows[custRow];
    if (r && r.id === "uninst" && action === "ok") { UNINST = null; custMode = "uninstall"; custRow = 1; return; }
    if (!r || !app) return;
    if (r.id === "closeAll" && action === "ok") {
      var n = 0;
      rows.forEach(function (x) { if (x.pkg && !x.playing && app.closeApp(x.pkg)) n++; });
      toast(n ? "Closed " + n + " background app" + (n > 1 ? "s" : "") + (MUSIC.playing ? " · music keeps playing" : "") : "Nothing to close");
      setTimeout(function () { taskFetch(); if (custOpen && custMode === "tasks") renderCustom(); }, 800);   // show the memory freed
    } else if (r.pkg && action === "ok") {
      if (r.playing) { toast(r.label + " is playing music · ▶ for app info to force stop"); return; }
      toast(app.closeApp(r.pkg) ? "Closed " + r.label + " in the background" : "Couldn't close " + r.label);
    } else if (r.pkg && action === "right") {
      fireScreenAt = Date.now();
      if (!app.appInfo(r.pkg)) toast("Couldn't open app info");
    }
  }
  // Task manager > Uninstall apps: the apps the owner installed (Fire OS's own can't be removed), least used first, with
  // their size. OK asks Fire TV to remove one (its own confirmation screen); ▶ opens its Fire TV page. Asked once when
  // the page opens and again when an app is removed (guestAppsChanged), never on a key press.
  var UNINST = null;
  function uninstRows() {
    if (!UNINST) { try { UNINST = app && app.removableApps ? JSON.parse(app.removableApps()) : { apps: [] }; } catch (e) { UNINST = { apps: [] }; } }
    var apps = UNINST.apps || [], total = apps.reduce(function (s, a) { return s + a.size; }, 0);
    var mb = function (b) { return b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1048576)) + " MB"; };
    var ago = function (t) {
      var d = Math.floor((Date.now() - t) / 86400000);
      return d < 1 ? "used today" : d < 2 ? "used yesterday" : d < 14 ? "used " + d + " days ago" : d < 60 ? "used " + Math.round(d / 7) + " weeks ago" : "used " + Math.round(d / 30) + " months ago";
    };
    var rows = [{ label: apps.length ? apps.length + " app" + (apps.length > 1 ? "s" : "") + " you installed  ·  " + mb(total) + "  ·  least used first" : "", act: true, none: true }];
    if (!app) rows[0].label = "Your installed apps show on the TV";
    else if (!apps.length) rows[0].label = "No apps to remove: everything here came with Fire TV";
    if (app && apps.length && !UNINST.allowed) rows.push({ label: "When each was last used needs one permission: see Security & privacy > Permissions & setup", act: true, none: true });
    apps.forEach(function (a) {
      rows.push({ label: a.label, value: mb(a.size) + "  ·  " + (a.last ? ago(a.last) : UNINST.allowed ? "not used lately" : "installed " + new Date(a.installed).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })),
                  act: true, pkg: a.pkg });
    });
    return rows;
  }
  function uninstNav(action, rows) {
    var r = rows[custRow];
    if (!r || !r.pkg || !app) return;
    fireScreenAt = Date.now();                       // Settings stays open behind Fire TV's prompt (guestHidden)
    if (action === "ok") { if (!app.uninstall(r.pkg)) toast(r.label + " is part of Fire TV and can't be removed"); }
    else if (action === "right" && !app.appInfo(r.pkg)) toast("Couldn't open app info");
  }
  function taskWatch() {                           // keep the numbers live while the Task manager is open
    var on = custOpen && custMode === "tasks";
    if (on && !taskTimer) { TASK = null; taskTimer = setInterval(function () { if (custOpen && custMode === "tasks") { taskFetch(); renderCustom(); } }, 3000); }
    else if (!on && taskTimer) { clearInterval(taskTimer); taskTimer = 0; }
  }

  // Settings > Screensaver > Layout: a ready-made layout to start from, text size, then every item with its place
  // (◀ ▶ moves it between corners, centre and off; OK moves it up within its corner), and Reset. The screensaver shows
  // behind the list while you work (renderCustom adds "laying").
  function layoutRows() {
    var name = function (list, v) { return (list.filter(function (x) { return x[0] === v; })[0] || [v, v])[1]; };
    return [{ label: "Start from", value: layoutName(), act: true, adj: true, id: "preset" },
            { label: "Text size", value: PREFS.ssSize === "large" ? "Large" : "Comfortable", act: true, id: "size" },
            { label: "◀ ▶ moves an item  ·  OK for its size, order and fine position", act: true, none: true }]
      .concat(orderOf().map(function (id) {
        var t = modTune(id), extra = (t.size !== 1 ? "  ·  " + name(SIZES, t.size) : "") + (t.dx || t.dy ? "  ·  nudged" : "");
        return { label: name(MODULES, id), value: name(PLACES, placeOf(id)) + extra + "  ›", act: true, mod: id };
      }))
      .concat([{ label: "Reset layout", value: "", act: true, id: "reset" }]);
  }
  // Settings > Home screen > Layout: ready-made home screens. The Settings list steps away and a slim chooser runs
  // along the bottom, so each one is tried on the real home screen (◀ ▶), kept (OK) or undone (Back). Auto-fit
  // (fitHome) keeps every one tidy whatever the TV's content.
  var HL_KEYS = ["homeClock", "homeInfo", "homeClockSize", "homeInfoSize", "homeWeek", "homeAir", "beach", "homeHero", "homeBar", "homeHint", "edges"];
  var HL_BASE = { homeClock: "show", homeInfo: "left", homeClockSize: 1, homeInfoSize: 1, homeWeek: "show", homeAir: "show", beach: "show",
                  homeHero: "show", homeBar: "auto", homeHint: "show", edges: "normal" };
  var HOME_LAYOUTS = [
    ["classic", "Classic", "Clock and weather top right, beach and scores top left, every label showing.", {}],
    ["mirrored", "Mirrored", "The same, flipped: clock and weather on the left, beach and scores on the right.", { homeClock: "left", homeInfo: "right" }],
    ["game", "Game day", "Live scores for your leagues and teams across the top, next to the clock.", { sports: "on", beach: "hide", homeHint: "hide" }],
    ["clean", "Clean", "Just the clock and your apps. No beach row, no help line, icons-only bar.", { beach: "hide", homeAir: "hide", homeHint: "hide", homeBar: "icons" }],
    ["big", "Big & clear", "Larger clock and conditions, easy to read from across the room.", { homeClockSize: 1.15, homeInfoSize: 1.15, homeWeek: "hide", homeHint: "hide" }],
    ["apps", "Apps only", "Nothing but your apps and the bottom bar, over the photo.", { homeClock: "hide", beach: "hide", homeHint: "hide", homeBar: "icons" }],
    ["cinema", "Cinema", "Extra margin at the edges for TVs that crop the picture, labels kept small.", { edges: "wide", homeWeek: "hide", homeHint: "hide" }]
  ];
  // Extra settings a preset may switch on (Game day turns sports on); other presets leave them as they are.
  var HL_EXTRA = ["sports"];
  function hlApply() { HL_KEYS.concat(HL_EXTRA).forEach(function (k) { applyPrefs(k); }); }   // each setting's own redraw
  function hlValues(i) { return Object.assign({}, HL_BASE, HOME_LAYOUTS[i][3]); }
  function homeLayoutName() {
    for (var i = HOME_LAYOUTS.length - 1; i >= 0; i--) {                 // the most specific match first (Game day over Classic)
      var v = hlValues(i);
      if (HL_KEYS.concat(Object.keys(HOME_LAYOUTS[i][3])).every(function (k) {
        return String(PREFS[k] == null ? HL_BASE[k] : PREFS[k]) === String(v[k]); })) return HOME_LAYOUTS[i][1];
    }
    return "Custom";
  }
  var HP = { idx: 0, snap: null };
  function homePickShow() {
    var on = custOpen && custMode === "homeLayout", was = document.body.classList.contains("homepick");
    if (on && !was) {
      HP.snap = {}; HL_KEYS.concat(HL_EXTRA).forEach(function (k) { HP.snap[k] = PREFS[k]; });
      var n = HOME_LAYOUTS.map(function (l) { return l[1]; }).indexOf(homeLayoutName());
      HP.idx = n < 0 ? 0 : n;
      document.body.classList.add("homepick");
      homePickDraw();
    } else if (!on && was) { document.body.classList.remove("homepick"); render(); }
  }
  function homePickDraw() {
    var row = document.getElementById("hpRow"); row.innerHTML = "";
    HOME_LAYOUTS.forEach(function (l, i) {
      var c = document.createElement("div"); c.className = "hp-chip" + (i === HP.idx ? " focus" : ""); c.textContent = l[1]; row.appendChild(c);
    });
    render();                                             // the layout's name and line, above the apps
  }
  function homePickNav(action) {
    if (action === "left" || action === "right") {
      HP.idx = (HP.idx + (action === "left" ? HOME_LAYOUTS.length - 1 : 1)) % HOME_LAYOUTS.length;
      var v = hlValues(HP.idx); Object.keys(v).forEach(function (k) { PREFS[k] = v[k]; });
      HL_EXTRA.forEach(function (k) { if (!(k in HOME_LAYOUTS[HP.idx][3])) PREFS[k] = HP.snap[k]; });   // Game day's sports go back
      hlApply();
      homePickDraw();
      return;
    }
    if (action === "ok") toast("Layout: " + HOME_LAYOUTS[HP.idx][1] + (SU.away ? "" : " · Save settings to keep it"));
    else if (action === "back") { HL_KEYS.concat(HL_EXTRA).forEach(function (k) { PREFS[k] = HP.snap[k]; }); hlApply(); }
    else return;
    if (SU.away && SU.awayMode === "homeLayout") { suReturn(); return; }   // opened from setup: straight back there
    custMode = "g:info"; custRow = 0;
    renderCustom();
  }
  // One item's page (OK on it in Layout): place, size, order and a nudge in 20-pixel steps, kept inside the screen.
  var SIZES = [[0.8, "Small"], [1, "Medium"], [1.2, "Large"], [1.45, "Extra large"]], ssItem = "";
  function modTune(id) { var t = (PREFS.ssMod || {})[id] || {}; return { size: t.size || 1, dx: t.dx || 0, dy: t.dy || 0 }; }
  function setTune(id, t) { PREFS.ssMod = Object.assign({}, PREFS.ssMod || {}); PREFS.ssMod[id] = t; applyPrefs("ssMod"); }
  function itemRows() {
    var id = ssItem, t = modTune(id), name = function (list, v) { return (list.filter(function (x) { return x[0] === v; })[0] || [v, v])[1]; };
    var px = function (v, neg, pos) { return v ? Math.abs(v) + " px " + (v < 0 ? neg : pos) : "None"; };
    return [{ label: "Place", value: name(PLACES, placeOf(id)), act: true, adj: true, id: "place" },
            { label: "Size", value: name(SIZES, t.size), act: true, adj: true, id: "isize" },
            { label: "Move up in its corner", value: "", act: true, id: "up" },
            { label: "Move down in its corner", value: "", act: true, id: "down" },
            { label: "Nudge left or right", value: px(t.dx, "left", "right"), act: true, adj: true, id: "dx" },
            { label: "Nudge up or down", value: px(t.dy, "up", "down"), act: true, adj: true, id: "dy" },
            { label: "Reset this item", value: "", act: true, id: "ireset" }];
  }
  function moveInCorner(id, dir) {
    var place = Object.assign({}, LAYOUTS[0][2], PREFS.ssPlace || {}), order = orderOf(), me = order.indexOf(id);
    for (var j = me + dir; j >= 0 && j < order.length; j += dir) if (place[order[j]] === place[id]) break;
    if (j < 0 || j >= order.length) { toast(dir < 0 ? "Already first in its corner" : "Already last in its corner"); return; }
    order.splice(me, 1); order.splice(j, 0, id);
    PREFS.ssOrder = order; applyPrefs("ssOrder");
  }
  function itemNav(action, rows) {
    var r = rows[custRow], id = ssItem, t = modTune(id), step = action === "left" ? -1 : 1;
    if (!r) return;
    if (r.id === "place" && action !== "ok") {
      var place = Object.assign({}, LAYOUTS[0][2], PREFS.ssPlace || {}), i = PLACES.map(function (p) { return p[0]; }).indexOf(place[id]);
      place[id] = PLACES[(i + step + PLACES.length) % PLACES.length][0]; PREFS.ssPlace = place; applyPrefs("ssPlace");
    } else if (r.id === "isize" && action !== "ok") {
      var s = SIZES.map(function (x) { return x[0]; }).indexOf(t.size);
      t.size = SIZES[Math.max(0, Math.min(SIZES.length - 1, s + step))][0]; setTune(id, t);
    } else if ((r.id === "dx" || r.id === "dy") && action !== "ok") {
      t[r.id] = Math.max(-240, Math.min(240, t[r.id] + step * 20)); setTune(id, t);
    } else if (action === "ok" && (r.id === "up" || r.id === "down")) moveInCorner(id, r.id === "up" ? -1 : 1);
    else if (action === "ok" && r.id === "ireset") { setTune(id, { size: 1, dx: 0, dy: 0 }); toast("Item reset"); }
  }
  function layoutNav(action, rows) {
    var r = rows[custRow];
    if (!r) return;
    if (r.id === "preset") {
      var at = LAYOUTS.map(function (l) { return l[1]; }).indexOf(layoutName());
      useLayout(action === "left" ? (at < 0 ? 0 : at - 1) : at + 1);
    } else if (r.id === "size") {
      PREFS.ssSize = PREFS.ssSize === "large" ? "normal" : "large"; applyPrefs("ssSize");
    } else if (r.id === "reset" && action === "ok") {
      PREFS.ssSize = "normal"; useLayout(0); toast("Layout reset · Save settings to keep it");
    } else if (r.mod) {
      var place = Object.assign({}, LAYOUTS[0][2], PREFS.ssPlace || {}), order = orderOf();
      if (action === "left" || action === "right") {
        var i = PLACES.map(function (p) { return p[0]; }).indexOf(place[r.mod]);
        place[r.mod] = PLACES[(i + (action === "left" ? PLACES.length - 1 : 1)) % PLACES.length][0];
        PREFS.ssPlace = place; applyPrefs("ssPlace");
      } else if (action === "ok") { ssItem = r.mod; custMode = "ssItem"; custRow = 0; }   // the item's own page
    }
  }
  function layoutPreview() {                        // the screensaver behind the list while the layout is edited
    var on = custOpen && (custMode === "ssLayout" || custMode === "ssItem"), was = document.body.classList.contains("laying");
    if (on && !was) { document.body.classList.add("laying", "ambient"); calKey = ""; renderCal(); feedsStart(); fitSaverSoon(); }
    else if (!on && was) { document.body.classList.remove("laying"); if (!ambient) { document.body.classList.remove("ambient"); feedsStop(); } }
  }

  // Settings > Screensaver > News topics & sources: each topic row turns all its sources on or off; the sources under
  // it switch one at a time.
  function newsRows() {
    var on = newsOn(), rows = [];
    NEWS_TOPICS.forEach(function (t) {
      var src = NEWS_SRC.filter(function (s) { return s[1] === t[0]; }), n = src.filter(function (s) { return on.indexOf(s[0]) >= 0; }).length;
      rows.push({ label: t[1], value: n === src.length ? "All on" : n ? n + " of " + src.length + " on" : "Off", act: true, topic: t[0] });
      src.forEach(function (s) { rows.push({ label: "      " + s[2], value: on.indexOf(s[0]) >= 0 ? "On" : "Off", act: true, src: s[0] }); });
    });
    rows.push({ label: "Official sources are the agencies' own feeds. Local news follows this TV's location.", act: true, none: true });
    return rows;
  }
  function newsNav(action, rows) {
    var r = rows[custRow], on = newsOn().slice();
    if (!r || action !== "ok") return;
    if (r.topic) {
      var ids = NEWS_SRC.filter(function (s) { return s[1] === r.topic; }).map(function (s) { return s[0]; });
      var all = ids.every(function (id) { return on.indexOf(id) >= 0; });
      on = on.filter(function (id) { return ids.indexOf(id) < 0; }).concat(all ? [] : ids);
    } else if (r.src) {
      var at = on.indexOf(r.src);
      if (at >= 0) on.splice(at, 1); else on.push(r.src);
    }
    PREFS.newsSrc = on; newsAt = 0; applyPrefs("newsSrc");
  }

  // Settings > Screensaver > Stocks / Crypto: popular picks plus any symbol typed in (stocks), OK turns each on or off.
  function pickRows(mode) {
    var stocks = mode === "ssStocks", list = stocks ? STOCKS : CRYPTO, chosen = (stocks ? PREFS.stocks : PREFS.crypto) || [];
    var extra = chosen.filter(function (s) { return !list.some(function (x) { return x[0] === s; }); }).map(function (s) { return [s, s.split(":")[0]]; });
    var rows = list.concat(extra).map(function (x) { return { label: x[1] + (x[1] !== x[0].split(":")[0] ? "  ·  " + x[0].split(":")[0] : ""), value: chosen.indexOf(x[0]) >= 0 ? "On" : "Off", act: true, sym: x[0] }; });
    if (stocks) rows.push({ label: "Add a symbol…", value: "›", act: true, id: "type" });
    rows.push({ label: stocks ? "From Nasdaq · S&P 500 and the Dow through the SPY and DIA funds" : "Prices from Coinbase · change over 24 hours", act: true, none: true });
    return rows;
  }
  function roomRows() {
    var presets = rowOf("room").opts, cur = room();
    var rows = presets.map(function (o) { return { label: o[1], value: cur === o[0] ? "✓" : "", act: true, room: o[0] }; });
    if (!presets.some(function (o) { return o[0] === cur; })) rows.unshift({ label: cur, value: "✓", act: true, room: cur });
    rows.push({ label: "Type a name…", value: "›", act: true, id: "type" });
    rows.push({ label: "This TV appears as “" + cur + " TV” in Bluetooth and LocalSend", act: true, none: true });
    return rows;
  }
  function custRows() {                 // [{label, value, act, star}]
    if (custMode === "room") return roomRows();
    if (custMode === "bt") return btRows();
    if (custMode === "btdev") return btDevRows();
    if (custMode === "wifi") return wifiRows();
    if (custMode === "hidden") return hiddenRows();
    if (custMode === "sndres") return sndResRows();
    if (custMode === "snddo") return sndDoRows();
    if (custMode === "sndslots") return sndSlotRows();
    if (custMode === "storage") return storageRows();
    if (custMode === "confirm") return [{ label: "Save changes", act: true, id: "save" }, { label: "Discard changes", act: true, id: "discard" }];
    if (custMode === "location") {
      var rows = [{ label: "Enter ZIP code", value: "›", act: true, id: "zip" }, { label: "Use automatic location", value: "Estimated", act: true, id: "auto" }];
      if (TVDEF) rows.push({ label: "Use this TV's setting", value: "From setup", act: true, id: "tv" });
      rows.push({ label: "Now: " + linkValue("location"), act: true, none: true });
      rows.push({ label: "Weather: National Weather Service · NOAA · EPA", act: true, none: true });
      return rows;
    }
    // Backgrounds: a short top page (what's on now, then Photos › and Live video ›), each list on its own page.
    if (custMode === "bg") {
      var nowPin = PREFS.bg.indexOf("vid:") === 0 ? pinnedClip(liveTopic()) : -1;
      var nowName = PREFS.bg.indexOf("vid:") === 0 ? "Live video · " + ((vidCatOf(PREFS.bg.slice(4)) || {}).name || "") +
                      (nowPin >= 0 ? " · " + clipName(vidList(liveTopic())[nowPin], nowPin) : "")
                  : (PREFS.bg === "nas" ? "Network folder photos" : PREFS.bg.indexOf("cat:") === 0 ? "Photos · " + ((catOf(PREFS.bg.slice(4)) || {}).name || "")
                  : "Photos · " + linkValue("bg")) + (pinnedPhoto(PREFS.bg) >= 0 ? " · " + photoName(photoList(PREFS.bg)[pinnedPhoto(PREFS.bg)], pinnedPhoto(PREFS.bg)) : "");
      return [{ label: "Now showing", act: true, head: true, none: true },
              { label: nowName, act: true, none: true },
              { label: "Photos", value: "Beach sets, topics, your own  ›", act: true, id: "tophotos", icon: "look" },
              { label: "Live video", value: VID_TOPICS.filter(function (c) { return c.files || c.src; }).length + " ambience sets, " + (LIVE_4K || !app ? "1080p and 4K" : "1080p") + "  ›", act: true, id: "tolive", icon: "media" },
              { label: "Free to use, credits shown: Wikimedia Commons, NASA, The Met, the Art Institute of Chicago and the Library of Congress", act: true, none: true }];
    }
    if (custMode === "bglive") {
      var lrows = [];
      var lastGroup = "", gi = function (c) { var i = VID_GROUPS.indexOf(c.group); return i < 0 ? 99 : i; };
      vidCats().slice().sort(function (a, b) { return gi(a) - gi(b); }).forEach(function (c) {
        var tid = c.auto ? seasonalTopic() : c.id, n = vidList(tid), j = vidJobs[tid], on = PREFS.bg === "vid:" + c.id;
        if ((c.group || "Your videos") !== lastGroup) { lastGroup = c.group || "Your videos"; lrows.push({ label: lastGroup, act: true, head: true, none: true }); }
        // OK on a set opens its clips (the whole set, or one clip kept); Holidays & seasons picks today's set itself.
        lrows.push({ label: c.name, act: true, bg: "vid:" + c.id, vcat: c,
                     value: (on ? "✓  " : "") + (c.auto ? "Now: " + vidCatOf(tid).name : j ? "Getting videos " + j.done + " of " + (j.total || VID_PER)
                            : (on && pinnedClip(c.id) >= 0 ? "One clip" : n ? n.length + (n.length === 1 ? " clip" : " clips") : "Stream") + "  ›") });
      });
      lrows.push({ label: "Search for videos…", value: "Wikimedia and NASA  ›", act: true, id: "vidsearch" });
      lrows.push({ label: "Playback", act: true, head: true, none: true });
      var vq = PREFS.vidQuality || "auto";
      if (LIVE_4K || !app) lrows.push({ label: "Video quality", act: true, id: "vidq",
                   value: (vq === "4k" ? "4K when a clip has it" : vq === "1080" ? "1080p" : "Auto") + (nativeOn && nativeRes ? " · playing " + nativeRes : "") });
      lrows.push({ label: "Live videos", act: true, id: "vidkeep", value: PREFS.vidKeep === "keep" ? "Keep on the TV" : "Stream (no storage)" });
      if (vidCats().some(function (c) { return vidList(c.id) && c.id !== "shared"; })) lrows.push({ label: "Forget live videos", value: "›", act: true, id: "viddelete" });
      return lrows;
    }
    // One live set's page: the whole set (a new clip every minute or so), or one clip kept on screen, looping.
    if (custMode === "bgclips") {
      var cc = vidCatOf(clipSet), cl = vidList(clipSet), cj = vidJobs[clipSet], cpin = pinnedClip(clipSet), con = PREFS.bg === "vid:" + clipSet;
      if (!cc) return [{ label: "This set is no longer here", act: true, none: true }];
      var crows = [{ label: "All clips, a new one every " + liveEveryText(), value: con && cpin < 0 ? "✓" : "", act: true, bg: "vid:" + cc.id, vcat: cc, clip: null }];
      if (cl) {
        crows.push({ label: "Or keep one clip, looping", act: true, head: true, none: true });
        cl.forEach(function (v, i) { crows.push({ label: clipName(v, i), value: con && cpin === i ? "✓" : "", act: true, bg: "vid:" + cc.id, vcat: cc, clip: i }); });
      }
      if (cj) crows.push({ label: "Getting the clips… " + cj.done + " of " + (cj.total || VID_PER), act: true, none: true });
      else if (!cl) crows.push({ label: "Finding the clips…", act: true, none: true });
      crows.push({ label: "Videos from " + (cc.src === "nasa" ? "NASA" : cc.src === "mix" ? "Wikimedia Commons and NASA" : "Wikimedia Commons") + " · the credit shows at the bottom of the screen", act: true, none: true });
      return crows;
    }
    // One photo set's page: take turns through it (as before), or keep one photo on screen.
    if (custMode === "bgpics") {
      var pk = picSet.indexOf("cat:") === 0 ? catOf(picSet.slice(4)) : null, pl = picSet.indexOf("cat:") === 0 ? catPhotos(picSet.slice(4)) : SETS[picSet] ? photoList(picSet) : null;
      var pon = PREFS.bg === picSet, ppin = pinnedPhoto(picSet);
      var prows = [{ label: "Take turns, a new photo every " + photoEveryText(), value: pon && ppin < 0 ? "✓" : "", act: true, bg: picSet, pic: null, cat: pk }];
      if (pl) {
        prows.push({ label: "Or keep one photo", act: true, head: true, none: true });
        pl.forEach(function (ph, i) { prows.push({ label: photoName(ph, i), value: pon && ppin === i ? "✓" : "", act: true, bg: picSet, pic: i, cat: pk }); });
      }
      var pj = pk && bgJobs[pk.id];
      if (pj) prows.push({ label: "Downloading… " + pj.done + " of " + (pj.total || BG_PER), act: true, none: true });
      else if (!pl) prows.push({ label: "Finding the photos…", act: true, none: true });
      return prows;
    }
    if (custMode === "bgphotos") {
      var rows = [{ label: "Beach photos", act: true, head: true, none: true }].concat(PREF_ROWS.filter(function (r) { return r.key === "bg"; })[0].opts.map(function (o) {
        // OK on a set opens its own page: take turns, or keep one photo. Follow time of day is picked straight away.
        var on1 = PREFS.bg === o[0];
        return { label: o[1], act: true, bg: o[0], sets: o[0] !== "time",
                 value: o[0] === "time" ? (on1 ? "✓" : "") : (on1 ? "✓  " : "") + (on1 && pinnedPhoto(o[0]) >= 0 ? "One photo" : photoList(o[0]).length + " photos") + "  ›" };
      }));
      var lastG = "", gix = function (c) { var i = BG_GROUPS.indexOf(c.group); return i < 0 ? BG_GROUPS.length : i; };
      allCats().slice().sort(function (a, b) { return gix(a) - gix(b); }).forEach(function (c) {   // grouped, like Live video
        var g = c.group || "Your searches";
        if (g !== lastG) { lastG = g; rows.push({ label: g, act: true, head: true, none: true }); }
        var n = catPhotos(c.id), j = bgJobs[c.id], on = PREFS.bg === "cat:" + c.id;
        rows.push({ label: c.name, act: true, bg: "cat:" + c.id, cat: c, sets: true,
                    value: (on ? "✓  " : "") + (j ? "Downloading " + j.done + " of " + (j.total || BG_PER) : n ? (on && pinnedPhoto("cat:" + c.id) >= 0 ? "One photo" : n.length + " photos") + "  ›" : "Download") });
      });
      var ni = nasInfo();
      rows.push({ label: "Options", act: true, head: true, none: true });
      rows.push({ label: "Match the time of day", act: true, adj: true, id: "bgmatch",
                  value: PREFS.bgMatch === "off" ? "Off" : "On · sunsets at sunset, night at night" });
      rows.push({ label: "Your own", act: true, head: true, none: true });
      rows.push({ label: "Network folder (NAS)", act: true, id: "nas",
                  value: !nasReady() ? "On the TV" : (PREFS.bg === "nas" ? "✓  " : "") + (ni.host ? (ni.type || "smb").toUpperCase() + " · " + (nasState || ni.host) : "Set up  ›") });
      rows.push({ label: "Search for photos…", value: "All free sources  ›", act: true, id: "search" });
      if (allCats().some(function (c) { return catPhotos(c.id); })) rows.push({ label: "Delete downloaded photos", value: "›", act: true, id: "bgdelete" });
      return rows;
    }
    if (custMode === "nas") return nasRows();
    if (custMode === "speed") return speedRows();
    if (custMode === "viddelete") {
      var vd = vidCats().filter(function (c) { return vidList(c.id) && c.id !== "shared"; }).map(function (c) {
        var s = load("vidset:" + c.id) || {};
        return { label: c.name, value: vidList(c.id).length + " videos" + (s.kept ? " on the TV" : " (streamed)"), act: true, vdel: c.id };
      });
      return vd.length ? vd : [{ label: "Nothing to forget", act: true, none: true }];
    }
    if (custMode === "bgdelete") {
      var d = allCats().filter(function (c) { return catPhotos(c.id); }).map(function (c) {
        return { label: c.name, value: catPhotos(c.id).length + " photos", act: true, del: c.id };
      });
      return d.length ? d : [{ label: "Nothing downloaded", act: true, none: true }];
    }
    if (custMode === "ssStocks" || custMode === "ssCrypto") return pickRows(custMode);
    if (custMode === "ssLayout") return layoutRows();
    if (custMode === "tasks") return taskRows();
    if (custMode === "uninstall") return uninstRows();
    if (custMode === "ssItem") return itemRows();
    if (custMode === "ssNewsPick") return newsRows();
    if (custMode === "sleep") return sleepRows();
    if (custMode === "perms") return setupRows();
    if (custMode === "tidy") return tidyRows();
    if (custMode === "updother") return updOtherRows();
    if (custMode === "livetv") return liveTvRows();
    if (custMode === "livedel") return liveTvDelRows();
    if (custMode === "livehidden") return liveTvHiddenRows();
    if (custMode === "livephone") return livePhoneRows();
    if (custMode === "cal") return calRows();
    if (custMode === "cards" || custMode === "cardedit") return cardRows();
    if (custMode === "plex") return plexRows();
    if (custMode === "inbox") return inboxRows();
    if (custMode === "notice") return noteRows();
    if (custMode === "about") {                      // why Offshore exists, in plain words (headings move, the text follows)
      var ab = [], sec = function (title, lines) { ab.push({ label: title, value: "", act: true, id: "sec" }); lines.forEach(function (l) { ab.push({ label: l, act: true, none: true }); }); };
      sec("Why Offshore", ["Your Fire TV came with a home screen built to sell to you: sponsored rows, autoplaying trailers and “recommended” picks between you and your own apps.",
                           "Offshore replaces it with a calm screen that's yours. Like an offshore wind that flattens the surf, it clears the noise so the screen is quiet again."]);
      sec("Your TV, your choice", ["Nothing is removed or broken. The Amazon home stays installed underneath; turn Offshore off and the TV is exactly as it was.",
                                   "Every part of the screen can be moved, resized or switched off, and nothing on it is selling you anything."]);
      sec("Private by design", ["No account, no ads, no analytics, no data sold. Your settings stay on this TV.",
                                "Weather, news and the rest come from official and well-known sources, each named on screen, and each can be turned off."]);
      sec("Made for the community", ["Offshore is free and open source. Anyone can read the code, see exactly what it does, suggest a change or make their own version.",
                                     UPDATE_REPO ? "The code, updates and a place for ideas and fixes: github.com/" + UPDATE_REPO : "It's shared so people can take back their own TVs. Ideas and fixes are always welcome."]);
      sec("Open-source projects inside Offshore", ["smbj, asn-one and MBassador: SMB network folders (Apache 2.0, MIT)",
                                                   "nfs-client, Netty, Apache Commons Lang and SLF4J: NFS network folders (Apache 2.0, MIT)",
                                                   "Bouncy Castle: encryption for network folders and sharing from phones (MIT-style)",
                                                   "The LocalSend protocol: receiving photos and files from phones",
                                                   "Works with VLC (VideoLAN) for Live TV streams",
                                                   "Offshore is free software under the GNU GPL, version 3. Each library's licence ships inside the app (licenses/THIRD-PARTY-NOTICES.txt) and in the code on GitHub."]);
      sec("Free photos and videos", ["Wikimedia Commons, NASA, The Met, the Art Institute of Chicago and the Library of Congress. Each photo and video names its author and licence on screen."]);
      sec("Thank you", ["Built on the work of many: public weather and science agencies, newsrooms, Wikimedia's photographers and open-source projects. Each is credited where its information appears."]);
      ab.push({ label: "Offshore " + (myVersion() === "preview" ? CHANGELOG[0][0] : myVersion()), act: true, none: true });
      return ab;
    }
    if (custMode === "whatsnew") {                   // an update waiting (its own notes), then this version and the ones before
      var st = updState(), wn = [];
      if (st.guest && st.guest.newer) {
        wn.push({ label: "Available now: Offshore " + st.guest.latest, value: updBusy ? updBusy : st.guest.apk ? "Install now  ›" : "", act: true, id: "avail" });
        (st.guest.notes || []).forEach(function (n) { wn.push({ label: "•  " + n, act: true, none: true }); });
      }
      CHANGELOG.forEach(function (c, i) {
        wn.push({ label: (i === 0 && !(st.guest && st.guest.newer) ? "This version · " : "") + c[0] + " · " + c[1], value: "", act: true, id: "ver" });
        c[2].forEach(function (n) { wn.push({ label: "•  " + n, act: true, none: true }); });
      });
      return wn;
    }
    if (custMode === "calphone") return calPhoneRows();
    if (custMode === "calnew") return calNewRows();
    if (custMode === "sleepres") return sleepResRows();
    if (custMode === "leagues") return LEAGUES.map(function (l) { return { label: l.name, value: (PREFS.leagues.indexOf(l.id) >= 0 ? "On" : "Off") + "  ·  " + SRC_NAME[l.src] }; });
    if (custMode === "teams") {
      var rows = [];
      LEAGUES.forEach(function (l) {
        if (PREFS.leagues.indexOf(l.id) < 0 || l.event) return;   // events (UFC) have no teams to pick
        if (!TEAMS[l.id]) { rows.push({ label: (l.short || l.name) + " · loading teams…", act: true, none: true }); return; }
        TEAMS[l.id].forEach(function (t) {
          var id = l.id + ":" + t.id;
          rows.push({ label: t.name, value: l.short || l.name, star: PREFS.teams.indexOf(id) >= 0, team: id });
        });
      });
      return rows.length ? rows : [{ label: "Turn on a league first", act: true, none: true }];
    }
    return viewRows().map(function (r) {
      if (r.group) return { label: T(r.label), value: groupValue(r.group) + "  ›", link: true, icon: r.group.id, help: r.group.id };
      if (r.live) return { label: T(r.label), value: liveValue(r.key), act: !r.adj, adj: !!r.adj, help: r.key, icon: r.icon };
      return { label: T(r.label), act: !!r.action, value: r.action ? "" : r.link ? linkValue(r.key) + "  ›" : r.opts[prefValue(r)][1], link: !!r.link,
               save: r.key === "save", help: r.key };
    });
  }
  function renderCustom() {
    homePickShow();
    if (custMode === "homeLayout") return;           // the chooser along the bottom replaces the list
    layoutPreview();
    taskWatch();
    if (/^bg(photos|live|clips|pics)?$/.test(custMode) && !previewing) { previewing = true; document.body.classList.add("previewing"); previewBg(custRows()[custRow]); }
    else if (!/^bg(photos|live|clips|pics)?$/.test(custMode)) endPreview();
    var rows = custRows(), box = document.getElementById("crows"), VIS = custMode === "main" ? 10 : 8;   // main: all folders + Save
    if (rows[custRow] && rows[custRow].none) {                // headings and notes are never focused
      var nx = rows.map(function (r) { return !r.none; }).indexOf(true, custRow);
      if (nx < 0) nx = rows.map(function (r) { return !r.none; }).lastIndexOf(true);
      if (nx >= 0) custRow = nx;
    }
    box.classList.toggle("main", custMode === "main");
    custRow = Math.min(custRow, rows.length - 1);
    custLive(rows[custRow]);
    var start = Math.max(0, Math.min(custRow - 3, rows.length - VIS));
    var grp = custMode.indexOf("g:") === 0 ? GROUPS.filter(function (x) { return "g:" + x.id === custMode; })[0] : null;
    var title = grp ? grp.label : custMode === "search" && kbField ? (kbField === "room" ? "Room name" : kbField === "wifipass" ? wifiTarget : kbField === "sound" ? "Find sounds online" : kbField === "radio" ? "Search radio stations" : kbField === "cardtitle" ? "Card title" : kbField === "cardtext" ? "Note" : kbField === "cardurl" ? "Web address" : kbField === "vidq" ? "Search live videos" : "Network folder")
              : custMode === "snddo" && sndSel ? sndSel.title
              : custMode === "bgclips" ? (vidCatOf(clipSet) || {}).name || "Live video"
              : custMode === "bgpics" ? (picSet.indexOf("cat:") === 0 ? (catOf(picSet.slice(4)) || {}).name : (PREF_ROWS.filter(function (r) { return r.key === "bg"; })[0].opts.filter(function (o) { return o[0] === picSet; })[0] || [0, "Photos"])[1]) || "Photos"
              : custMode === "btdev" && btSel ? btSel.name : CUST_TITLE[custMode];
    document.querySelector("#cust h2").textContent = T(title) + ((custMode === "main" || grp) && custDirty ? "  ·  " + T("unsaved changes") : "");
    // The footer: what the highlighted setting does, then the remote's keys in smaller type.
    var foot = document.querySelector("#cust .foot"), cur = rows[Math.min(custRow, rows.length - 1)] || {};
    foot.innerHTML = '<div class="fh"></div><div class="fk"></div>';
    var lists = custMode === "main" || grp;                // explanations belong to settings lists, not pads and keyboards
    foot.firstChild.textContent = lists && cur.help && HELP[cur.help] ? T(HELP[cur.help]) : cur.note ? T(cur.note) : "";   // a row may explain itself
    foot.lastChild.textContent = grp ? "▲ ▼ choose · ◀ ▶ change · Back" : CUST_FOOT[custMode];
    box.innerHTML = "";
    if (custMode === "speed") { box.appendChild(speedCard()); return; }   // its own card, not a list
    if (custMode === "plex" && PLEX.code) { box.appendChild(plexCard()); plexPoll(); return; }   // the sign-in code, big
    if (custMode === "zip" || custMode === "pinset" || custMode === "pinask") {   // number pad
      var disp = document.createElement("div");
      disp.className = "zipdisp";
      disp.textContent = custMode === "zip" ? (padZip + "_____").slice(0, 5).split("").join(" ")
                                            : (padZip.replace(/./g, "•") + "____").slice(0, 4).split("").join(" ");   // a PIN never shows
      box.appendChild(disp);
      var grid = document.createElement("div");
      grid.className = "zipgrid";
      PAD.forEach(function (k, i) {
        var b = document.createElement("div");
        b.className = "zipkey glass" + (i === padIdx ? " focus" : "");
        b.textContent = k;
        grid.appendChild(b);
      });
      box.appendChild(grid);
      return;
    }
    if (custMode === "search") {                       // keyboard
      var kd = document.createElement("div"), secret = kbField === "pass" || kbField === "wifipass";
      kd.className = "kbdisp" + (kbText ? "" : " empty");
      kd.textContent = kbText ? (secret ? kbText.replace(/.(?=.)/g, "•") : kbText) + "▏" : (KB_HINT[kbField] || KB_HINT.search);
      box.appendChild(kd);
      var kg = document.createElement("div");
      kg.className = "zipgrid kbgrid";
      KB.forEach(function (k, i) {
        var b = document.createElement("div");
        b.className = "zipkey glass" + (i === kbIdx ? " focus" : "") + (k === "⇧" && kbShift ? " on" : "");
        b.textContent = kbShift && k.length === 1 && /[a-z]/.test(k) ? k.toUpperCase() : k;
        kg.appendChild(b);
      });
      box.appendChild(kg);
      return;
    }
    // More above or below: the list fades out at that edge (no "more" rows taking space).
    box.classList.toggle("fade-top", start > 0);
    box.classList.toggle("fade-bot", start + VIS < rows.length);
    rows.slice(start, start + VIS).forEach(function (r, k) {
      var row = document.createElement("div"), l = document.createElement("span"), v = document.createElement("span");
      // adj: a value that ◀ ▶ changes, drawn with the same ‹ › as any setting; head: a section heading
      row.className = "crow" + ((r.act && !r.adj) || r.link || r.team ? " act" : "") + (r.save ? " save" : "") + (r.head ? " head" : r.none ? " info" : "") + (start + k === custRow && !r.none ? " focus" : "");
      if (r.star !== undefined) { var s = document.createElement("span"); s.className = "star"; s.textContent = r.star ? "★" : "☆"; l.appendChild(s); }
      if (r.icon && GICON[r.icon]) {                   // folder icon (our own markup)
        var ic = document.createElement("i"); ic.className = "cico"; ic.style.background = GICON[r.icon][0];
        ic.innerHTML = '<svg viewBox="0 0 24 24">' + GICON[r.icon][1] + "</svg>"; l.appendChild(ic);
      }
      l.appendChild(document.createTextNode(r.label));
      v.className = "val";
      v.textContent = r.value || "";
      row.appendChild(l); row.appendChild(v); box.appendChild(row);
    });
  }
  // Appearance and Home screen change the home as you go (applyPrefs), so there the panel steps to the right and the
  // dimming goes: the home stays in view beside the list (owner: "see the changes they are making, not just the
  // options"). On the weather row, a shower of rain shows what Weather on the background looks like on a dry day.
  function custLive(cur) {
    var live = custOpen && (custMode === "g:look" || custMode === "g:info" || custMode === "g:kw");
    document.body.classList.toggle("cust-live", live);
    document.body.classList.toggle("cust-look", live && custMode === "g:look");
    // The clock and forecast sit top right: on their rows the panel crosses to the left so they're in view.
    document.body.classList.toggle("cust-left", live && !!cur && /^(homeClock|homeWeek|homeAir)/.test(cur.help || ""));
    // An app tile shows the highlight while you're here, so Highlight, Highlight motion, App tile corners and glass
    // changes can be seen on one (the home's own focus may be on the status box).
    var lit = document.querySelector(".tile.live-pick");
    if (live) {
      var t = lit || document.querySelector(".tile.focus:not(.sh-face)") || document.querySelector(".tile:not(.sh-face)");
      if (t && !t.classList.contains("focus")) {
        [].forEach.call(document.querySelectorAll(".focus"), function (x) { if (!x.closest("#cust")) x.classList.remove("focus"); });
        t.classList.add("focus", "live-pick");
      }
    } else if (!live && lit) {
      lit.classList.remove("live-pick", "focus");
      render();                                           // the home's own focus back
    }
    var want = live && cur && cur.help === "wxFx" && PREFS.wxFx === "on" ? "rain" : "";
    if (typeof FX !== "undefined" && FX && FX.preview !== want) { FX.preview = want; weatherFx(); }
  }
  function openCustom(skipPin) {
    custOpen = true;
    dockEntry = false;
    custRow = 0;
    custMode = "main";
    custSnapshot = JSON.parse(JSON.stringify(PREFS));   // Discard puts this back
    custDirty = false;
    if (!skipPin && (load("prefs") || {}).custPin) { custMode = "pinask"; padIdx = 0; padZip = ""; }   // Security & privacy > Settings PIN
    renderCustom();
    document.getElementById("cust").classList.add("open");
    document.getElementById("sysdim").classList.add("open");
  }
  function closeCustom() {
    custOpen = false;
    if (CALPHONE && app && app.calPhoneStop) { app.calPhoneStop(); CALPHONE = null; }   // the phone link never outlives its screen
    if (app && app.devicesIdle) app.devicesIdle();          // stop listening for Bluetooth and Wi-Fi scans
    homePickShow();
    layoutPreview();
    taskWatch();
    endPreview();
    custLive(null);
    if (reloadOnClose) { reloadOnClose = false; setTimeout(function () { location.reload(); }, 400); }   // the tile list changed
    document.getElementById("cust").classList.remove("open");
    document.getElementById("sysdim").classList.remove("open");
  }
  var reloadOnClose = false;
  function savePrefs() { if (custSnapshot && custSnapshot.tileAuto !== PREFS.tileAuto) reloadOnClose = true; save("prefs", PREFS); custSnapshot = JSON.parse(JSON.stringify(PREFS)); custDirty = false; toast(T("Settings saved")); }
  function backTo(key) {                               // back from a sub-list to the folder that holds its setting
    if (key === "sleepres") { custMode = "sleep"; custRow = 0; return; }
    if (key === "calphone" || key === "calnew") { if (key === "calphone" && app && app.calPhoneStop) app.calPhoneStop(); CALPHONE = null; custMode = "cal"; custRow = 0; return; }
    if (key === "cardedit") { CARD = null; if (dockEntry) { closeCustom(); return; } custMode = "cards"; custRow = 0; return; }
    if (key === "cal") { custMode = "main"; custRow = Math.max(0, viewRows().map(function (r) { return r.key; }).indexOf("g:cal")); return; }
    if (key === "ssItem") { custMode = "ssLayout"; custRow = Math.max(0, 3 + orderOf().indexOf(ssItem)); return; }
    if (key === "livephone" || key === "livedel" || key === "livehidden") { if (key === "livephone" && app && app.liveTvPhoneStop) app.liveTvPhoneStop(); LTPHONE = null; custMode = "livetv"; custRow = 0; return; }
    if (key === "livetv") { custMode = "main"; custRow = Math.max(0, viewRows().map(function (r) { return r.key; }).indexOf("g:livetv")); return; }
    if (key === "tasks") { custMode = "main"; custRow = Math.max(0, viewRows().map(function (r) { return r.key; }).indexOf("g:tasks")); return; }
    var g = groupOf(key);
    if (g) { custMode = "g:" + g.id; custRow = Math.max(0, g.keys.indexOf(key)); }
    else { custMode = "main"; custRow = Math.max(0, viewRows().map(function (r) { return r.key; }).indexOf(key)); }
  }
  function custNav(action) {
    if (custMode === "homeLayout") { homePickNav(action); return; }                         // undoes, then back to setup if from there
    if (SU.away && action === "back" && custMode === SU.awayMode) { suReturn(); return; }   // back to the setup screen
    var rows = custRows();
    if (custMode === "zip" || custMode === "pinset" || custMode === "pinask") {   // number pad: 3 columns
      var plen = custMode === "zip" ? 5 : 4;
      if (action === "back") {
        if (custMode === "pinask") { closeCustom(); return; }
        if (custMode === "pinset") backTo("custPin"); else { custMode = "location"; custRow = 0; }
      }
      else if (action === "left" && padIdx % 3) padIdx--;
      else if (action === "right" && padIdx % 3 < 2) padIdx++;
      else if (action === "up" && padIdx > 2) padIdx -= 3;
      else if (action === "down" && padIdx < 9) padIdx += 3;
      else if (action === "ok") {
        var key = PAD[padIdx];
        if (key === "⌫") padZip = padZip.slice(0, -1);
        else if (key === "✓" && custMode === "pinset") {
          if (padZip.length !== 4) toast("Enter 4 digits");
          else { PREFS.custPin = padZip; applyPrefs("custPin"); toast("PIN set · Save settings to keep it"); backTo("custPin"); }
        }
        else if (key === "✓" && custMode === "pinask") toast("Enter the 4-digit PIN");
        else if (key === "✓") {
          if (padZip.length !== 5) toast("Enter all 5 digits");
          else { var z = padZip; useZip(z).then(function (loc) { if (loc && custOpen) { backTo("location"); renderCustom(); } }); }
        } else if (padZip.length < plen) {
          padZip += key;
          if (custMode === "pinask" && padZip.length === 4) {            // checks itself at the 4th digit
            if (padZip === String((load("prefs") || {}).custPin || "")) { custMode = "main"; custRow = 0; }
            else { toast("That PIN isn't right"); padZip = ""; }
          }
        }
      }
      renderCustom();
      return;
    }
    if (custMode === "search") {                       // keyboard: 10 columns
      var max = kbField ? 120 : 30;
      if (action === "back") {
        if (kbField === "radio") { kbField = ""; kbShift = false; radioSearchDone(""); return; }   // back to Radio
        if (kbField === "room") { custMode = "room"; custRow = 0; }
        else if (kbField === "sym") { custMode = "ssStocks"; custRow = 0; }
        else if (kbField === "sleep") { custMode = "sleep"; custRow = 0; }
        else if (kbField === "evtitle") { custMode = "calnew"; custRow = 0; }
        else if (/^card/.test(kbField)) { custMode = "cardedit"; custRow = 0; }
        else if (kbField === "wifipass") { custMode = "wifi"; custRow = 0; }
        else if (kbField === "sound") { backTo("soundFind"); }
        else if (kbField === "vidq") { custMode = "bglive"; custRow = Math.max(0, custRows().map(function (r) { return r.id; }).indexOf("vidsearch")); }
        else if (kbField) { custMode = "nas"; custRow = nasRowIndex(kbField); }
        else { custMode = "bgphotos"; custRow = Math.max(0, custRows().map(function (r) { return r.id; }).indexOf("search")); }
        kbField = "";
      }
      else if (action === "left" && kbIdx % 10) kbIdx--;
      else if (action === "right" && kbIdx % 10 < 9 && kbIdx < KB.length - 1) kbIdx++;
      else if (action === "up" && kbIdx > 9) kbIdx -= 10;
      else if (action === "down") kbIdx = Math.min(KB.length - 1, kbIdx + 10);
      else if (action === "ok") {
        var k = KB[kbIdx];
        if (k === "⌫") kbText = kbText.slice(0, -1);
        else if (k === "⇧") kbShift = !kbShift;
        else if (k === "␣") { if (kbText && (kbField === "pass" || kbText.slice(-1) !== " ") && kbText.length < max) kbText += " "; }
        else if (k === "✓" && kbField === "sound") {     // search free sounds
          var sq = kbText.trim();
          if (sq.length < 2) toast("Type a word first");
          else { SOUND_RES = []; soundSearch(sq); custMode = "sndres"; custRow = 0; kbField = ""; kbShift = false; }
        }
        else if (k === "✓" && kbField === "wifipass") {  // join the network with this password (handed to Android, not kept)
          var jr = app.wifiJoin(wifiTarget, kbText);
          if (jr === "short") toast("Wi-Fi passwords are at least 8 characters");
          else { toast(jr === "ok" ? "Joining " + wifiTarget + "…" : "Couldn't join " + wifiTarget); kbText = ""; custMode = "wifi"; custRow = 0; kbField = ""; kbShift = false; }
        }
        else if (k === "✓" && /^card/.test(kbField)) { var cf = kbField; kbField = ""; kbShift = false; cardTyped(cf, kbText); }
        else if (k === "✓" && kbField === "evtitle") { NEWEV.title = kbText.trim().slice(0, 60); custMode = "calnew"; custRow = 1; kbField = ""; kbShift = false; }
        else if (k === "✓" && kbField === "radio") {   // Radio › Search: every station in the world, by name
          var rq = kbText.trim(); kbField = ""; kbShift = false;
          radioSearchDone(rq); return;
        }
        else if (k === "✓" && kbField === "sleep") {    // search longer free sounds to fall asleep to
          var sq2 = kbText.trim();
          if (sq2.length < 2) toast("Type a word first, like rain or ocean");
          else { sleepSearch(sq2); custMode = "sleepres"; custRow = 0; kbField = ""; kbShift = false; }
        }
        else if (k === "✓" && kbField === "sym") {      // a stock or fund symbol: checked with Nasdaq before it's added
          var sy = kbText.trim().toUpperCase().replace(/[^A-Z.\-]/g, "").slice(0, 8);
          if (!sy) toast("Type a symbol, like AAPL");
          else {
            toast("Checking " + sy + "…");
            var tryCls = function (cls) {
              return getJson("https://api.nasdaq.com/api/quote/" + sy + "/info?assetclass=" + cls).then(function (j) {
                if (!j || !j.data || !j.data.primaryData) throw new Error("none");
                return cls;
              });
            };
            tryCls("stocks").catch(function () { return tryCls("etf"); }).then(function (cls) {
              var id = cls === "stocks" ? sy : sy + ":" + cls;
              PREFS.stocks = (PREFS.stocks || []).filter(function (s) { return s !== id; }).concat([id]);
              mktAt = 0; applyPrefs("stocks"); toast("Added " + sy);
              if (custOpen) { custMode = "ssStocks"; custRow = 0; kbField = ""; renderCustom(); }
            }, function () { toast("Nasdaq doesn't know " + sy); });
          }
        }
        else if (k === "✓" && kbField === "room") {     // a room name of your own
          var nm = kbText.trim().slice(0, 30);
          if (nm) { PREFS.room = nm; applyPrefs("room"); }
          custMode = "room"; custRow = 0; kbField = ""; kbShift = false;
        }
        else if (k === "✓" && kbField === "vidq") {     // a live video search of your own: Commons and NASA
          var vq = kbText.trim();
          if (vq.length < 2) toast("Type a word first");
          else {
            var vc = { id: "uv" + Date.now().toString(36), name: vq.charAt(0).toUpperCase() + vq.slice(1), q: vq, src: "mix", group: "Your searches" };
            save("vidcats", myVidCats().concat([vc]));
            downloadVid(vc);
            toast("Finding videos of “" + vc.name + "”…");
            custMode = "bglive"; kbField = ""; kbShift = false;
            custRow = Math.max(0, custRows().map(function (r) { return r.bg; }).indexOf("vid:" + vc.id));
          }
        }
        else if (k === "✓" && kbField) {                // a network folder field: back to its list
          NASF[kbField] = kbField === "pass" ? kbText : kbText.trim();
          if (kbField === "pass") NASF.clearPass = false;
          custMode = "nas"; custRow = nasRowIndex(kbField); kbField = ""; kbShift = false;
        }
        else if (k === "✓") {
          var q = kbText.trim();
          if (q.length < 2) toast("Type a word first");
          else {
            var cat = { id: "u" + Date.now().toString(36), name: q.charAt(0).toUpperCase() + q.slice(1), q: q, src: "all" };   // every free source
            save("bgcats", myCats().concat([cat]));
            PREFS.bg = "cat:" + cat.id;
            downloadCat(cat);
            applyPrefs("bg");
            toast("Finding photos of “" + cat.name + "”…");
            custMode = "bgphotos";
            custRow = custRows().map(function (r) { return r.bg; }).indexOf(PREFS.bg);
          }
        } else if (kbText.length < max) kbText += kbShift && /[a-z]/.test(k) ? k.toUpperCase() : k;
      }
      renderCustom();
      return;
    }
    if (action === "back") {
      if (custMode === "bgphotos" || custMode === "bglive") {                    // back to the Backgrounds top page
        var fromBg = custMode; custMode = "bg";
        custRow = Math.max(0, custRows().map(function (r) { return r.id; }).indexOf(fromBg === "bgphotos" ? "tophotos" : "tolive"));
        renderCustom(); return;
      }
      if (custMode === "bgpics") {                                               // back to the list of photo sets, on this one
        custMode = "bgphotos";
        custRow = Math.max(0, custRows().map(function (r) { return r.bg; }).indexOf(picSet));
        previewBg(custRows()[custRow]); renderCustom(); return;
      }
      if (custMode === "bgclips") {                                              // back to the list of live sets, on this one
        custMode = "bglive";
        custRow = Math.max(0, custRows().map(function (r) { return r.vcat ? r.vcat.id : ""; }).indexOf(clipSet));
        previewBg(custRows()[custRow]); renderCustom(); return;
      }
      if (custMode === "viddelete") { custMode = "bglive"; custRow = Math.max(0, custRows().map(function (r) { return r.id; }).indexOf("viddelete")); renderCustom(); return; }
      if (custMode === "bgdelete" || custMode === "nas") {
        var from = custMode; custMode = from === "nas" ? nasReturn : delReturn;
        custRow = Math.max(0, custRows().map(function (r) { return r.id; }).indexOf(from === "nas" ? "nas" : custMode === "storage" ? "photos" : "bgdelete"));
        renderCustom(); return;
      }
      if (custMode === "storage") { backTo("storage"); renderCustom(); return; }   // back to Network & storage
      if (custMode === "btdev") { custMode = "bt"; custRow = 0; renderCustom(); return; }
      if (custMode === "bt") { if (dockEntry) { closeCustom(); return; } backTo("bluetooth"); renderCustom(); return; }
      if (custMode === "sleep" && dockEntry) { closeCustom(); return; }            // opened from the Sleep card: Back closes
      if (custMode === "cards" && dockEntry) { closeCustom(); return; }            // opened from the shelf: Back closes
      if (custMode === "inbox") { closeCustom(); return; }                         // the notification list: Back closes
      if (custMode === "notice") { custMode = "inbox"; custRow = Math.max(0, noteSel) + 1; renderCustom(); return; }   // + 1: Clear all leads
      if ((custMode === "whatsnew" || custMode === "perms") && dockEntry) { custMode = "notice"; custRow = 0; renderCustom(); return; }   // back to the notice it came from
      if (custMode === "wifi") { backTo("netSettings"); renderCustom(); return; }
      if (custMode === "hidden") { backTo("hiddenTiles"); renderCustom(); return; }
      if (custMode === "uninstall") { custMode = "tasks"; custRow = Math.max(0, custRows().map(function (r) { return r.id; }).indexOf("uninst")); renderCustom(); return; }
      if (custMode === "snddo") { custMode = "sndres"; custRow = 0; renderCustom(); return; }
      if (custMode === "sndres") { backTo("soundFind"); renderCustom(); return; }
      if (custMode === "sndslots") { backTo("soundMine"); renderCustom(); return; }
      if (custMode.indexOf("g:") === 0) {
        var gid = custMode.slice(2), gp = GROUPS.filter(function (g) { return g.id === gid; })[0];
        if (gp && gp.parent) { custMode = "g:" + gp.parent; custRow = Math.max(0, viewRows().map(function (r) { return r.key; }).indexOf("g:" + gid)); renderCustom(); return; }
        custMode = "main"; custRow = Math.max(0, viewRows().map(function (r) { return r.key; }).indexOf("g:" + gid));
        renderCustom(); return;
      }
      if (custMode === "main") {
        if (custDirty) { custMode = "confirm"; custRow = 0; renderCustom(); return; }
        closeCustom(); return;
      }
      if (custMode === "confirm") { custMode = "main"; custRow = viewRows().length - 1; renderCustom(); return; }
      backTo(custMode);
    } else if (action === "up" || action === "down") {
      var step = action === "up" ? -1 : 1, to = custRow + step;
      while (rows[to] && rows[to].none) to += step;         // skip headings and notes
      if (rows[to]) custRow = to;
      if (/^bg(photos|live|clips|pics)?$/.test(custMode)) previewBg(rows[custRow]);
    }
    else if (custMode === "confirm") {
      if (action === "ok") {
        if (rows[custRow].id === "save") savePrefs();
        else { PREFS = JSON.parse(JSON.stringify(custSnapshot)); applyPrefs(null); custDirty = false; toast("Changes discarded"); }
        closeCustom();
        return;
      }
    } else if (custMode === "location") {
      var r0 = rows[custRow];
      if (action === "ok" && r0.id === "zip") { custMode = "zip"; padIdx = 0; padZip = ""; }
      else if (action === "ok" && r0.id === "auto") { try { localStorage.removeItem("loc"); } catch (e) {} toast("Finding your location…"); autoLocation(); backTo("location"); }
      else if (action === "ok" && r0.id === "tv") {
        try { localStorage.removeItem("loc"); } catch (e) {}
        setLocation(TVDEF.lat, TVDEF.lon, null, "tv").then(function (loc) { toast("Location: " + loc.name); if (custOpen) renderCustom(); });
        backTo("location");
      }
    } else if (custMode === "bg" || custMode === "bgphotos" || custMode === "bglive" || custMode === "bgclips" || custMode === "bgpics") {
      var rb = rows[custRow];
      if (action === "ok" || action === "right") {
        if (rb.id === "tophotos" || rb.id === "tolive") {           // the two lists, each on its own page
          custMode = rb.id === "tophotos" ? "bgphotos" : "bglive";
          var cur = custRows().map(function (r) { return r.bg; }).indexOf(PREFS.bg);
          custRow = Math.max(0, cur);
          previewBg(custRows()[custRow]);                           // the highlighted one shows at once, not only after a move
        }
        else if (custMode === "bglive" && rb.vcat && !rb.vcat.auto) {   // a live set: its own page (whole set, or one clip)
          if (!rb.vcat.local && !vidList(rb.vcat.id) && !vidJobs[rb.vcat.id]) downloadVid(rb.vcat);
          clipSet = rb.vcat.id; custMode = "bgclips";
          var crs = custRows(), inUse = crs.map(function (r) { return r.value; }).indexOf("✓");
          custRow = inUse >= 0 ? inUse : 0;
          previewBg(crs[custRow]);
        }
        else if (custMode === "bgphotos" && rb.sets) {               // a photo set: its own page (take turns, or one photo)
          if (rb.cat && !rb.cat.local && !catPhotos(rb.cat.id) && !bgJobs[rb.cat.id]) { downloadCat(rb.cat); toast("Downloading " + rb.cat.name + " photos…"); }
          picSet = rb.bg; custMode = "bgpics";
          var prs = custRows(), pUse = prs.map(function (r) { return r.value; }).indexOf("✓");
          custRow = pUse >= 0 ? pUse : 0;
          previewBg(prs[custRow]);
        }
        else if (custMode === "bgpics" && rb.bg) {
          var plist = rb.bg.indexOf("cat:") === 0 ? catPhotos(rb.bg.slice(4)) : photoList(rb.bg);
          PREFS.bg = rb.bg;
          PREFS.bgPhoto = rb.pic != null && plist && plist[rb.pic] ? photoKey(rb.bg, plist[rb.pic]) : "";
          applyPrefs("bg");
          toast(PREFS.bgPhoto ? "This photo stays on" : "A new photo every " + photoEveryText());
        }
        else if (rb.id === "search") { custMode = "search"; kbIdx = 0; kbText = ""; kbField = ""; kbShift = false; }
        else if (rb.id === "vidsearch") { custMode = "search"; kbIdx = 0; kbText = ""; kbField = "vidq"; kbShift = false; }
        else if (rb.id === "nas") {
          var nh = nasInfo();
          if (!nasReady()) toast("Network folders work on the TV");
          else if (nh.host && NASLIST.length) { PREFS.bg = "nas"; applyPrefs("bg"); }    // set up: use its photos
          else { nasReturn = "bgphotos"; nasOpen(); }
        }
        else if (rb.id === "bgdelete") { delReturn = "bgphotos"; custMode = "bgdelete"; custRow = 0; }
        else if (rb.id === "viddelete") { delReturn = "bglive"; custMode = "viddelete"; custRow = 0; }
        else if (rb.id === "vidq") {
          var qs = ["auto", "4k", "1080"], qi = qs.indexOf(PREFS.vidQuality || "auto");
          PREFS.vidQuality = qs[(qi + (action === "left" ? 2 : 1)) % 3]; applyPrefs("vidQuality");
          toast(PREFS.vidQuality === "4k" ? "4K whenever a clip has a 4K original (about 1 in 5 do)" : PREFS.vidQuality === "1080" ? "Live backgrounds in 1080p" : "4K when the TV and the connection can take it");
          if (liveSet) { var keep = liveSet; liveStop(); PREFS.bg.indexOf("vid:") === 0 && liveSync(); }   // switch quality now
        }
        else if (rb.id === "bgmatch") {
          PREFS.bgMatch = PREFS.bgMatch === "off" ? "on" : "off"; applyPrefs("bg");
          toast(PREFS.bgMatch === "off" ? "Photo sets show all their photos, any time" : "Photo sets show sunsets at sunset, day at day, night at night");
        }
        else if (rb.id === "vidkeep") {
          PREFS.vidKeep = PREFS.vidKeep === "keep" ? "stream" : "keep"; applyPrefs("vidKeep");
          toast(PREFS.vidKeep === "keep" ? "New live videos will be kept on the TV" : "New live videos will stream, using no storage");
        }
        else if (rb.vcat) {
          var vcat = rb.vcat.auto ? vidCatOf(seasonalTopic()) : rb.vcat;
          if (!vcat.local && !vidList(vcat.id) && !vidJobs[vcat.id]) { downloadVid(vcat); toast("Finding " + vcat.name + " videos…"); }
          var picked = rb.clip != null && vidList(vcat.id) ? vidList(vcat.id)[rb.clip] : null;
          PREFS.bg = rb.bg;
          PREFS.vidClip = picked ? vcat.id + "|" + clipKey(picked, rb.clip) : "";   // one clip kept, or the whole set
          applyPrefs("bg");
          if (custMode === "bgclips") toast(picked ? "This clip stays on, looping" : "The whole set, a new clip every " + liveEveryText());
        }
        else if (rb.bg) {
          if (rb.cat && !rb.cat.local && !catPhotos(rb.cat.id) && !bgJobs[rb.cat.id]) { downloadCat(rb.cat); toast("Downloading " + rb.cat.name + " photos…"); }
          PREFS.bg = rb.bg;
          applyPrefs("bg");
        }
      }
    } else if (custMode === "nas") {
      nasNav(action, rows);
    } else if (custMode === "storage") {
      storageNav(action, rows);
    } else if (custMode === "bt" || custMode === "btdev" || custMode === "wifi") {
      devicesNav(action, rows);
    } else if (custMode === "sndres" || custMode === "snddo" || custMode === "sndslots") {
      soundNav(action, rows);
    } else if (custMode === "hidden") {
      var hr = rows[custRow];
      if (action === "ok" && hr.pkg) { save("hiddenTiles", hiddenTiles().filter(function (p) { return p !== hr.pkg; })); reloadOnClose = true; toast("It'll be back when you close Settings"); }
    } else if (custMode === "ssLayout") {
      layoutNav(action, rows);
    } else if (custMode === "tasks") {
      taskNav(action, rows);
    } else if (custMode === "uninstall") {
      uninstNav(action, rows);
    } else if (custMode === "ssItem") {
      itemNav(action, rows);
    } else if (custMode === "ssNewsPick") {
      newsNav(action, rows);
    } else if (custMode === "sleep" || custMode === "sleepres") {
      sleepNav(action, rows);
    } else if (custMode === "inbox" || custMode === "notice") {
      inboxNav(action, rows);
    } else if (custMode === "cal" || custMode === "calphone" || custMode === "calnew") {
      calNav(action, rows);
    } else if (custMode === "cards" || custMode === "cardedit") {
      cardNav(action, rows);
    } else if (custMode === "plex") {
      plexNav(action, rows);
    } else if (custMode === "whatsnew") {
      if (action === "ok" && rows[custRow] && rows[custRow].id === "avail") installUpdate();
    } else if (custMode === "perms") {
      if (action === "ok") toast("Turned on from a computer: tools\\setup_tv.ps1");
    } else if (custMode === "tidy") {
      tidyNav(action, rows);
    } else if (custMode === "livetv" || custMode === "livedel" || custMode === "livehidden") {
      liveTvSettingsNav(action, rows);
    } else if (custMode === "updother") {
      var uo = rows[custRow];
      if (!uo) return;
      if (uo.id === "hour" && (action === "left" || action === "right" || action === "ok")) {
        var hs = rowOf("updHour").opts, hi = hs.map(function (o) { return +o[0]; }).indexOf(+PREFS.updHour);
        PREFS.updHour = hs[(Math.max(0, hi) + (action === "left" ? hs.length - 1 : 1)) % hs.length][0]; applyPrefs("updHour");
      } else if (action === "ok" && uo.key) liveNav(uo.key, "ok");
    } else if (custMode === "ssStocks" || custMode === "ssCrypto") {
      var pk = rows[custRow], arrKey = custMode === "ssStocks" ? "stocks" : "crypto";
      if (action === "ok" && pk.sym) {
        PREFS[arrKey] = (PREFS[arrKey] || []).slice();
        var pat = PREFS[arrKey].indexOf(pk.sym);
        if (pat >= 0) PREFS[arrKey].splice(pat, 1); else PREFS[arrKey].push(pk.sym);
        mktAt = 0; applyPrefs(arrKey);
      }
      else if (action === "ok" && pk.id === "type") { kbField = "sym"; kbText = ""; kbIdx = 0; kbShift = true; custMode = "search"; }
    } else if (custMode === "room") {
      var rr = rows[custRow];
      if (action === "ok" && rr.room) { PREFS.room = rr.room; applyPrefs("room"); }
      else if (action === "ok" && rr.id === "type") { kbField = "room"; kbText = room(); kbIdx = 0; kbShift = false; custMode = "search"; }
    } else if (custMode === "speed") {
      if (action === "ok" && rows[custRow] && rows[custRow].id === "run") runSpeed();
    } else if (custMode === "viddelete") {
      var rv = rows[custRow];
      if (action === "ok" && rv.vdel) { var vn = vidCatOf(rv.vdel).name; deleteVid(rv.vdel); toast("Forgot " + vn + " videos"); }
    } else if (custMode === "bgdelete") {
      var rd = rows[custRow];
      if (action === "ok" && rd.del) { var dn = catOf(rd.del).name; deleteCat(rd.del); toast("Deleted " + dn + " photos"); }
    } else if (custMode === "leagues") {
      var lg = LEAGUES[custRow].id, at = PREFS.leagues.indexOf(lg);
      if (at >= 0) PREFS.leagues.splice(at, 1); else PREFS.leagues.push(lg);
      favNextAt = 0;
      applyPrefs("leagues");
    } else if (custMode === "teams") {
      var r = rows[custRow];
      if (r.team && action === "ok") {
        var i = PREFS.teams.indexOf(r.team);
        if (i >= 0) PREFS.teams.splice(i, 1); else PREFS.teams.push(r.team);
        favNextAt = 0;                                   // look up the new team's schedule
        applyPrefs("teams");
      }
    } else {
      var pr = viewRows()[custRow];
      if (pr.group) { if (action !== "left") { custMode = pr.group.link || "g:" + pr.group.id; custRow = 0; } }
      else if (pr.live) liveNav(pr.key, action);
      else if (pr.key === "save") { if (action === "ok") savePrefs(); }
      else if (pr.key === "delrecv") { if (action === "ok") { deleteReceived(); } }
      else if (pr.action) { if (action === "ok") { PREFS = JSON.parse(JSON.stringify(PREF_DEFAULTS)); applyPrefs(null); custDirty = true; toast("Defaults restored · Save settings to keep them"); } }
      else if (pr.link) { if (action !== "left") { custMode = pr.link; custRow = 0; if (pr.link === "teams") loadTeams(); } }
      else {
        var v = prefValue(pr), n = pr.opts.length;
        v = action === "left" ? (v + n - 1) % n : (v + 1) % n;   // ◀ back, ▶ or OK forward
        PREFS[pr.key] = pr.opts[v][0];
        applyPrefs(pr.key);
      }
    }
    if (custOpen) renderCustom();
  }
  function applyTheme() {
    var mode = PREFS.theme === "auto" ? (period() === "day" ? "light" : "dark") : PREFS.theme;
    document.body.classList.toggle("light", mode === "light");
    // Settings › Appearance: font (the TV's own built-in fonts, so nothing to download), accent colour, glass tint
    // and the focus highlight. Auto-fit (fitHome) re-measures afterwards, since fonts change widths.
    var b = document.body.classList, a = own(ACCENTS, PREFS.accent) || ACCENTS.blue;
    ["light", "condensed", "serif"].forEach(function (f) { b.toggle("font-" + f, PREFS.font === f); });
    document.documentElement.style.setProperty("--accent", a[0]);
    document.documentElement.style.setProperty("--accent-rgb", a[1]);
    b.toggle("tint-accent", PREFS.tint === "accent");
    b.toggle("focus-accent", PREFS.focusStyle === "accent");
    ["clear", "smoky", "solid"].forEach(function (g) { b.toggle("glass-" + g, PREFS.glass === g); });
    ["soft", "crisp"].forEach(function (t) { b.toggle("tiles-" + t, PREFS.tileShape === t); });
    b.toggle("tiles-bright", PREFS.tileDim === "bright");
    ["gentle", "glow"].forEach(function (f) { b.toggle("fx-" + f, PREFS.focusFx === f); });
    b.toggle("calm", PREFS.motion === "reduced");
    b.toggle("clock-big", PREFS.homeClockStyle === "big");
    liteApply();                                          // also redraws the weather on the background
    ["tl", "tr", "bl", "bc", "br"].forEach(function (p) { b.toggle("npos-" + p, PREFS.notifPos === p); });   // Notifications > Pop-up position
    if (app && app.notifPos && PREFS.notifPos !== applyTheme.pos) { applyTheme.pos = PREFS.notifPos; app.notifPos(PREFS.notifPos || "tc"); }   // cards over apps too
    if (app && app.alertSound && PREFS.alertSound !== applyTheme.snd) { applyTheme.snd = PREFS.alertSound; app.alertSound(PREFS.alertSound || "tone", false); }
  }
  var ACCENTS = { blue: ["#0a84ff", "10,132,255"], teal: ["#30b0c7", "48,176,199"], green: ["#30d158", "48,209,88"], orange: ["#ff9f0a", "255,159,10"],
                  pink: ["#ff375f", "255,55,95"], purple: ["#bf5af2", "191,90,242"], gold: ["#e6b422", "230,180,34"], red: ["#ff453a", "255,69,58"] };
  // Applied at once so the change can be seen; kept only after Save settings (savePrefs).
  function applyPrefs(key) {
    if (key !== null) custDirty = true;
    applyTheme();
    document.body.classList.toggle("hide-beach", PREFS.beach === "hide");
    if (key === null || key === "speed") startPhotos();
    if (key === "alertSound" && app && app.alertSound) app.alertSound(PREFS.alertSound, true);   // hear the choice
    if (key === "notifPos") {                                // a sample in the new spot (shown even while paused)
      bannerQ = []; clearTimeout(bannerTimer); document.getElementById("nBanner").classList.remove("on"); bannerOn = false;
      setTimeout(function () { bannerQ.push({ title: "Notifications appear here", message: "Like this one, then they slide away.", level: "info", source: "Offshore", at: Date.now() }); nextBanner(); }, 350);
    }
    if (key === null || key === "bg") { shownSet = ""; nextPhoto(); liveSync(); }
    if (key === null || key === "clock" || key === "lang" || key === "tz") { renderClock(); renderBeach(); renderAlert(); renderStatus(); renderScores(); }
    if (key === null || key === "lang") {
      translateStatic();
      [].forEach.call(document.querySelectorAll("#pills .pill span"), function (s, i) { if (PILLS[i]) s.textContent = T(PILLS[i].name); });
      var wc = load("weather"); if (wc) showWeather(wc);
      render();
    }
    if (key === null || key === "units") { renderBeach(); weather(); }
    if ((key === null || key === "foxRead") && app && app.screenTitles && !app.screenTitles(PREFS.foxRead === "on")) {
      PREFS.foxRead = "off";                                // turning it on needs a real OK press
      if (key === "foxRead") toast("Press OK on the remote to turn this on");
    }
    if ((key === "kw" || key === "kwWhere") && typeof KW !== "undefined" && KW) kwBuild();             // Keep watching: on, off or with every app, at once
    if (key === null || key === "ambient") wake();
    saverClasses();
    if (key === null || key === "ssCal" || key === "units" || key === "lang") { calKey = ""; if (ambient) renderCal(); }
    if (key === null || key === "homeWeek" || key === "units" || key === "lang") { weekKey = ""; renderWeekPanel(); }
    if (key === "ssNews" || key === "newsSrc") newsAt = 0;
    if (key === null || key === "ssOutdoor" || key === "lang") renderOutdoor();
    if (ambient && /^(ss|stocks|crypto|newsSrc)/.test(key || "")) feedsStart();
    if (key === null || key === "sports" || key === "leagues" || key === "teams") scores();
    if (key === "beach") applyTop();
    if (key === null || key === "share" || key === "room") shareSync();
    if (key === null || key === "alertsOn") alerts();
    if (key === null || key === "sounds" || key === "notifySound") soundSync(key);
    if (key === "tileOrder") { layoutTiles(); render(); }
    if (key === "tileAuto") toast("New app tiles: changes after you save and close Settings");
  }

  setInterval(function () {                                 // timed pause ends by itself; keep the time left current
    if (pauseUntil > 0 && !isPaused()) setPause(0);
    else if (sysOpen && pauseUntil > 0) renderSysButtons();
  }, 30000);
  function closeSystem() {
    sysOpen = false;
    document.getElementById("sys").classList.remove("open");
    document.getElementById("sysdim").classList.remove("open");
  }

