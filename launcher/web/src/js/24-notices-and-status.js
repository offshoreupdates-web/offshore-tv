  // ---- Notices: VPN changes and alerts from smart home systems, ntfy, scripts (see Alerts.java) ----------
  // info: home screen for 20 s of viewing; important: 60 s; urgent: 60 s here, and the app also shows it over a movie.
  // Notices that arrive while an app is open wait until the home screen is back.
  var LEVELS = { info: { color: "#0a84ff", life: 20 }, important: { color: "#ff9f0a", life: 60 }, urgent: { color: "#ff453a", life: 60 } };
  var NICON = {
    info: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
    important: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
    urgent: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>',
    vpn: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
  };
  var NOTICES = [];
  // Every notice also goes into the notification history (the last 30, kept on the TV), which Notifications in the
  // Notifications & System panel opens: a list, then each one in full with its details and any shortcut.
  var NOTE_LOG = load("noticelog") || [];
  function logNotice(n) {
    NOTE_LOG.unshift({ title: n.title || "", message: n.message || "", source: n.source || "", level: n.level, at: n.at,
                       details: n.details || null, action: n.action || null, read: false });
    NOTE_LOG = NOTE_LOG.slice(0, 30);
    save("noticelog", NOTE_LOG);
  }
  function unreadNotes() { return NOTE_LOG.filter(function (n) { return !n.read; }).length; }
  window.guestNotice = function (n) {
    n.level = own(LEVELS, n.level) ? n.level : "info";
    if (n.icon != null && !own(NICON, n.icon)) n.icon = null;
    if (n.image) n.image = safeImg(n.image);
    n.at = Date.now();
    n.seen = 0;
    logNotice(n);
    NOTICES.push(n);
    if (NOTICES.length > 3) NOTICES.shift();
    renderStatus();
    showBanner(n);
    // The notification sound: never for quiet notices (updates, setup tips) or while paused; over an app only for urgent ones.
    if (app && app.playNotify && n.source !== "Updates" && !n.quiet && !isPaused() && (homeVisible || n.level === "urgent")) app.playNotify();
  };
  setInterval(function () {                                 // count viewing time; drop expired notices
    if (!homeVisible || !NOTICES.length) return;
    var changed = false;
    NOTICES = NOTICES.filter(function (n) { n.seen++; if (n.seen > LEVELS[n.level].life) { changed = true; return false; } return true; });
    if (changed) renderStatus();
  }, 1000);

  // Network state from the app (Android's network + Wi-Fi signal): { type: wifi|ethernet|none, online, bars 0-4, vpn }.
  var NET = { type: "wifi", online: true, bars: 4, vpn: false };
  window.guestNet = function (s, initial) {
    var vpnWas = NET.vpn, wasOnline = NET.online;
    NET = s;
    renderStatus();
    if (s.online !== wasOnline) { renderFresh(); renderAlert(); if (s.online) { weather(); alerts(); } }   // back online: fresh data now
    if (initial || s.vpn === vpnWas) return;
    guestNotice(s.vpn ? { title: "VPN connected", message: "Your internet traffic now goes through the VPN.", level: "info", icon: "vpn", source: "Network" }
                      : { title: "VPN disconnected", message: "The VPN is off. Your connection is no longer protected by it.", level: "important", icon: "vpn", source: "Network" });
  };
  var UNLOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 7.6-1.8"/></svg>';   // VPN off
  var SICON = {
    eth: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="11" rx="2"/><path d="M8 17v3h8v-3M8 10v3M12 10v3M16 10v3"/></svg>',
    off: '<svg viewBox="0 0 24 24"><path d="M2.5 8.5a14 14 0 0 1 19 0M5.5 12a9.5 9.5 0 0 1 13 0M9 15.5a4.5 4.5 0 0 1 6 0M12 19h.01M3 3l18 18"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>'
  };
  function wifiIcon(bars) {                                 // four arcs, lit by signal strength
    var arcs = ["M12 19h.01", "M9 15.5a4.5 4.5 0 0 1 6 0", "M5.5 12a9.5 9.5 0 0 1 13 0", "M2.5 8.5a14 14 0 0 1 19 0"];
    return '<svg viewBox="0 0 24 24">' + arcs.map(function (d, i) {
      return '<path d="' + d + '" opacity="' + (i <= Math.max(1, bars) - 1 || i === 0 ? 1 : .3) + '"/>';
    }).join("") + "</svg>";
  }
  function chip(id, cls, html) { var c = document.getElementById(id); c.className = "chip " + cls; c.innerHTML = html; }
  function renderStatus() {
    if (!NET.online || NET.type === "none") chip("cNet", "red", SICON.off + T("Offline"));
    else if (NET.type === "ethernet") chip("cNet", "green", SICON.eth + "Ethernet");   // connected: green, like VPN on
    else chip("cNet", "green", wifiIcon(NET.bars) + "Wi-Fi");
    chip("cVpn", NET.vpn ? "green" : "", (NET.vpn ? NICON.vpn : UNLOCK) + T(NET.vpn ? "VPN on" : "VPN off"));
    if (isPaused()) chip("cBell", "purple", MOON + T("Paused") + (NOTICES.length ? ' <span class="n">' + NOTICES.length + "</span>" : ""));
    else chip("cBell", NOTICES.length ? "on" : "", SICON.bell + (NOTICES.length ? '<span class="n">' + NOTICES.length + "</span>" + T("new") : T("No alerts")));
    fitBar();                                               // the labels' width depends on the language
    var list = document.getElementById("notices");
    list.innerHTML = "";
    NOTICES.slice(-2).reverse().forEach(function (n) { list.appendChild(noticeRow(n)); });   // newest first, at most two
  }
  // One notice as a row (icon, picture, title and message as text, time): the status card and the drop-down banner.
  function noticeRow(n) {
      var row = document.createElement("div"), dot = document.createElement("div"), tx = document.createElement("div"), tm = document.createElement("div");
      row.className = "nr";
      dot.className = "dot";
      dot.style.background = n.icon === "vpn" && n.level === "info" ? "#30d158" : LEVELS[n.level].color;
      dot.innerHTML = own(NICON, n.icon) || own(NICON, n.level) || "";
      row.appendChild(dot);
      if (safeImg(n.image)) { var img = document.createElement("img"); img.src = safeImg(n.image); img.alt = ""; row.appendChild(img); }
      tx.className = "tx";
      [["t", n.title || n.message], ["m", n.title ? (n.message || n.source) : n.source]].forEach(function (p) {
        if (!p[1]) return; var d = document.createElement("div"); d.className = p[0]; d.textContent = p[1]; tx.appendChild(d);
      });
      row.appendChild(tx);
      tm.className = "tm";
      tm.textContent = hm(n.at).replace(/\s?[AP]M$/, "");
      row.appendChild(tm);
      return row;
  }
  // New notifications drop down from the top centre, like a phone's banner, and slide back up after a few seconds
  // (longer for important ones). While notifications are paused only urgent ones show. Older ones: the bell, then
  // Notifications in the Notifications & System panel.
  var bannerQ = [], bannerTimer = 0, bannerOn = false;
  function showBanner(n) {
    if (isPaused() && n.level !== "urgent") return;
    if (n.source === "Updates" && n.level === "info") return;          // quiet update notes stay in the bell
    bannerQ.push(n);
    if (!bannerOn) nextBanner();
  }
  function nextBanner() {
    var b = document.getElementById("nBanner"), n = bannerQ.shift();
    if (!n) { bannerOn = false; return; }
    bannerOn = true;
    b.innerHTML = ""; b.appendChild(noticeRow(n));
    b.classList.toggle("urgent", n.level === "urgent");
    void b.offsetWidth;
    b.classList.add("on");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () {
      b.classList.remove("on");
      setTimeout(nextBanner, 600);                                     // after it has slid away
    }, n.level === "urgent" ? 12000 : n.level === "important" ? 8000 : 5500);
  }

  // ---- First-run setup and tour ---------------------------------------------------------------------------------
  // A new install (no saved settings, no backup) opens a few calm screens: welcome, room, location, temperature,
  // screensaver look, then a short tour that spotlights the real home screen. Every screen can be skipped, Back goes
  // one screen back, and the choices are saved at the end like Settings's Save. ?setup=1 shows it in the preview.
  var SU = { open: false, step: 0, g: 0, i: 0, zip: "", tour: -1, tf: 1, busy: false };
  var SU_LOGO = '<svg class="su-logo" viewBox="0 0 120 120"><defs>' +
    '<linearGradient id="suSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232c45"/><stop offset=".5" stop-color="#6d5468"/><stop offset=".62" stop-color="#e9906a"/></linearGradient>' +
    '<linearGradient id="suSunG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd58a"/><stop offset="1" stop-color="#ff9d5c"/></linearGradient>' +
    '<clipPath id="suTile"><rect width="120" height="120" rx="28"/></clipPath><clipPath id="suSkyClip"><rect width="120" height="72"/></clipPath></defs>' +
    '<g clip-path="url(#suTile)"><rect width="120" height="120" fill="url(#suSky)"/>' +
    '<g clip-path="url(#suSkyClip)"><circle class="su-sun" cx="60" cy="72" r="27" fill="url(#suSunG)"/></g>' +
    '<rect y="72" width="120" height="48" fill="#15313a"/><path d="M47 72h26l12 48H35z" fill="#ffb37a" opacity=".2"/>' +
    '<path d="M33 84h54M41 96h38M46 108h28" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/></g></svg>';
  var SU_PIN = '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  var SU_LOOKS = { mirror: "Clock, weather, your week, markets and the news", minimal: "Just the time and weather",
                   sports: "Live scores and your teams up front, with the news", markets: "Stocks and crypto prices, the week and the news",
                   outdoors: "Beach and water conditions, walk-or-run weather and the week", family: "Your calendar, the week and a greeting" };
  // "Pick a background": photos or a live video, shown for real behind the panel as the focus moves. Videos stream
  // (no storage); the first look at a topic finds its clips, which takes a moment.
  var SU_BGS = [["time", "Beach photos", "Photos that follow the time of day"], ["vid:waves", "Beach waves", "Live video in 1080p"],
                ["vid:tropical", "Tropical islands", "Live video, filmed from above"], ["vid:fire", "Cozy fireplace", "Live video in 1080p"],
                ["vid:weather", "Today's weather", "Rain, snow, storms or sun, as the forecast changes"],
                ["vid:seasonal", "Holidays & seasons", "Changes by itself for each US holiday and season"]];
  function suTryBg(v) {
    if (PREFS.bg === v) return;
    PREFS.bg = v;
    var vc = v.indexOf("vid:") === 0 ? vidCatOf(liveTopic(v)) : null;
    // Only the streamed clips while people look around (no downloads for every card passed); the set's YouTube clips
    // follow once setup is done, if it's the one chosen (liveSync).
    if (vc && !vidList(vc.id) && !vidJobs[vc.id]) downloadVid(vc, true);   // plays by itself once the clips are found
    applyPrefs("bg");
  }
  // "Make it yours": the features people should know about, each opening its real Settings page (Back returns here).
  var SU_DISCOVER = [
    ["g:sport", "Favorite teams", "Scores and schedules for any sport or league", "sport"],
    ["ssNewsPick", "Your news", "Local, world, tech and more, from sources you pick", "notif"],
    ["ssStocks", "Stocks & crypto", "The prices your screensaver keeps an eye on", "tasks"],
    ["bg", "Backgrounds", "Photos or live video: beaches, wildlife, weather, cities, holidays", "look"],
    ["homeLayout", "Home layout", "Ready-made home screens, tried live, always tidy", "info"],
    ["g:look", "Fonts & colors", "Lettering, accent color, tinted glass, light or dark", "tv"],
    ["sleep", "Sleep sounds", "Rain, ocean or fan, with a timer and a dim screen", "saver"],
    ["g:media", "Music & sounds", "Now playing from any app, plus clicks and chimes", "media"],
    ["g:share", "Share from your phone", "Photos and videos with the free LocalSend app", "share"],
    ["cal", "Calendar", "Google, iCloud or Outlook, added from your phone", "cal"],
    ["g:notif", "Notifications", "Weather alerts, game scores, and where they pop up", "notif"],
    ["speed", "Speed test", "How fast this TV's internet is, and if 4K fits", "net"]
  ];
  // Each card's status line, so what's been set up shows a tick when people come back from it.
  function suDiscStatus(mode) {
    var n;
    if (mode === "g:sport") { n = (PREFS.teams || []).length; return n ? [true, n + (n === 1 ? " team" : " teams")] : PREFS.sports === "on" ? [true, "Scores on"] : [false, "Not set up"]; }
    if (mode === "ssNewsPick") { n = newsOn().length; return [n > 0, n ? n + " sources" : "Off"]; }
    if (mode === "ssStocks") { n = (PREFS.stocks || []).length + (PREFS.crypto || []).length; return [n > 0, n ? n + " tracked" : "None yet"]; }
    if (mode === "bg") return [true, PREFS.bg.indexOf("vid:") === 0 ? "Live: " + ((vidCatOf(PREFS.bg.slice(4)) || {}).name || "video") : linkValue("bg")];
    if (mode === "sleep") return [!!PREFS.sleepSound, PREFS.sleepSound ? sleepName(PREFS.sleepSound) : "Not chosen"];
    if (mode === "g:media") return [MUSIC.allowed, MUSIC.allowed ? "Music ready" : "Sounds on"];
    if (mode === "g:share") return [PREFS.share !== "off", PREFS.share === "off" ? "Off" : "On"];
    if (mode === "cal") { n = calList().length; return [n > 0, n ? n + (n === 1 ? " calendar" : " calendars") : "Holidays only"]; }
    if (mode === "g:look") {
      var fn = { system: "Modern", light: "Light", condensed: "Condensed", serif: "Classic serif" }[PREFS.font] || "Modern";
      return [true, fn + " · " + ((PREFS.accent || "blue").charAt(0).toUpperCase() + (PREFS.accent || "blue").slice(1))];
    }
    if (mode === "homeLayout") return [true, homeLayoutName()];
    if (mode === "g:notif") return [PREFS.alertsOn !== "off", PREFS.alertsOn !== "off" ? "Weather alerts on" : "Alerts off"];
    if (mode === "tidy") { var ts = app ? tidySummary() : ""; return [!!app && !/^Nothing/.test(ts), ts || "On the TV"]; }
    if (mode === "speed") { var sp = load("speedtest"); return [!!sp, sp ? Math.round(sp.down) + " Mbps" : "Not run yet"]; }
    return [false, ""];
  }
  function suSteps() {                                  // each: title, text, choices [[label, small, value]], cols, buttons
    var rooms = PREF_ROWS.filter(function (r) { return r.key === "room"; })[0].opts.slice(0, 6);
    return [
      { id: "hello", dots: false, html: SU_LOGO + '<div class="su-eyebrow">Welcome to</div><h1>Offshore</h1>' +
          "<p>Your TV, without the ads. Your apps first, the things you care about at a glance.</p>" +
          '<p class="su-note">Setting up takes about two minutes. You can skip anything and change it later.</p>',
        buttons: [["Get started", "next"], ["Skip setup", "finish", "quiet"]] },
      { id: "room", title: "Where is this TV?", text: "Phones and headphones will see it by this name.",
        choices: rooms.map(function (o) { return [o[1], "", o[0]]; }), cols: 3, picked: room(),
        pick: function (v) { PREFS.room = v; applyPrefs("room"); } },
      { id: "loc", title: "Where are you?", text: "Only used on this TV, for your local weather, air quality, sunrise and news.", loc: true },
      { id: "units", title: "Temperature", text: "How should we show the weather?",
        choices: [["°F", "Fahrenheit", "fahrenheit"], ["°C", "Celsius", "celsius"]], cols: 2, big: true, picked: units(),
        pick: function (v) { PREFS.units = v; applyPrefs("units"); } },
      { id: "look", title: "Pick a screensaver", text: "When the TV sits idle, Offshore turns into a calm smart mirror over your photos. You can fine-tune every part later.",
        choices: LAYOUTS.map(function (l, n) { return [l[1], SU_LOOKS[l[0]] || "", n]; }), cols: 6,
        picked: LAYOUTS.map(function (l) { return l[1]; }).indexOf(layoutName()),
        pick: function (v) { suTryLook(v); } },
      { id: "bgpick", title: "Pick a background", text: "",
        choices: SU_BGS.map(function (b) { return [b[1], b[2], b[0]]; }), cols: SU_BGS.length, picked: PREFS.bg,   // one row on screen
        pick: function (v) { suTryBg(v); } },
      { id: "discover", title: "Make it yours", disc: true,
        text: "Set up your favorites now or later. Press the middle button to open one, and ↩ to come back here.",
        choices: SU_DISCOVER.map(function (d) { return [d[1], d[2], d[0], "", d[3]]; }), cols: 4 },
      { id: "tour", title: "Here's your new home", text: "A quick look around. It takes about thirty seconds.",
        buttons: [["Show me", "tour"], ["Skip the tour", "next", "quiet"]] },
      { id: "where", html: "<h1>Your Offshore settings</h1><p>Everything about Offshore lives in <b>Settings</b>: the layout, weather, news, teams, the screensaver and more.</p>" +
          '<div class="sw"><div class="sw-bar"><i>Music</i><i>Bluetooth</i><i>Share</i><i>Mirror</i><i>Sleep</i><b class="sw-st">Wi-Fi · VPN · Alerts</b></div>' +
          '<div class="sw-steps"><span>Highlight the <b>Wi-Fi box</b> at the bottom right</span><em>›</em><span>Press <b>OK</b></span><em>›</em><span>Choose <b>Settings</b></span></div></div>' +
          '<p class="su-note">Amazon\'s own <b>Fire Settings</b> and <b>Fire TV Home</b> are in there too, under <b>Fire TV</b>.</p>',
        buttons: [["Got it", "next"]] },
      { id: "extras", title: "Unlock the extras",                 // drawn by suExtrasHtml when shown
        buttons: suExtrasOn() ? [["Continue", "next"], ["Tidy up Fire TV", "tidy", "quiet"]] : [["Do this later", "next"], ["Tidy up Fire TV", "tidy", "quiet"]] },
      { id: "done", dots: false, html: '<svg class="su-check" viewBox="0 0 160 160"><circle cx="80" cy="80" r="70"/><path d="M50 82l20 20 40-42"/></svg>' +
          "<h1>You're all set</h1><p>Enjoy Offshore. Everything you chose here can be changed any time in Settings, from the Wi-Fi box at the bottom right.</p>" +
          (suExtrasOn() ? "" : '<p class="su-note">When you\'re ready for the extras: Settings › Security &amp; privacy › Permissions &amp; setup.</p>'),
        buttons: [["Start using Offshore", "finish"]] }
    ];
  }
  // Unlock the extras: the four optional permissions with live ticks. Fire OS lets only a computer turn them on (see
  // setupRows), so this explains the two steps and shows the TV's address; it re-checks every 3 s while open.
  var SU_EXTRAS = [["home", "Home button", "Press Home and you're back in Offshore"], ["music", "Music controls", "Play, pause and skip any app"],
                   ["usage", "Task manager", "See which apps are running"], ["secure", "Developer access switch", "Turn it on and off from Settings"]];
  function suPerms() { return app ? permState() : {}; }
  function suExtrasOn() { var p = suPerms(); return !!app && SU_EXTRAS.every(function (x) { return p[x[0]]; }); }
  function suIp() {                                     // asked once per setup (systemInfo is slow on the TV)
    if (!app) return "192.168.1.20";
    if (SU.ip == null) { try { SU.ip = JSON.parse(app.systemInfo()).ip || ""; } catch (e) { SU.ip = ""; } }
    return SU.ip;
  }
  function suExtrasHtml() {
    var p = suPerms(), on = suExtrasOn(), ip = suIp();
    var list = '<div class="su-list">' + SU_EXTRAS.map(function (x) {
      return '<div class="su-item' + (p[x[0]] ? " on" : "") + '"><i>' + (p[x[0]] ? "✓" : "") + "</i><div><b>" + x[1] + "</b><small>" + x[2] + "</small></div></div>";
    }).join("") + "</div>";
    if (on) return "<h1>Unlock the extras</h1><p>Everything is already switched on. Nice.</p>" + list;
    return "<h1>Unlock the extras</h1><p><b>Optional.</b> Offshore works fine without these. Fire TV only lets a computer switch them on, " +
      "so this is a one-time job for whoever is comfortable with one. You can do it any time.</p>" + list +
      '<div class="su-how"><div><em>1</em><span>On this TV: Fire TV <b>Settings › My Fire TV › Developer options › ADB debugging</b>: On.</span></div>' +
      "<div><em>2</em><span>On a computer on the same Wi-Fi, in Offshore's download folder, run:<br><code>" + esc(setupCmd(ip)) + "</code><br>" +
      "<small>Mac or Linux: <code>" + esc(setupCmd(ip, true)) + "</code></small></span></div></div>" +
      '<p class="su-note">The ticks turn green by themselves. The same step can switch off Amazon extras you don\'t use: pick them first with <b>Tidy up Fire TV</b>.</p>';
  }
  // The Home button not connected yet (tools\setup_tv.ps1 never run on this TV): Home goes to Amazon's screen and
  // nothing on the TV says why. A quiet notice explains the one-time fix, at most once a week and three times in all
  // (Permissions & setup always shows the state). Once set up, the app keeps it on by itself (GuestService.ensureOn).
  // Preview: ?homebtn=off shows it.
  function homeBtnNote() {
    var demo = new URLSearchParams(location.search).get("homebtn") === "off";
    if (!demo && (!app || !app.permStatus || SU.open || suNeeded() || permState().home)) return;
    var st = load("homeBtnNote") || { n: 0, at: 0 };
    if (!demo && (st.n >= 3 || Date.now() - st.at < 7 * 86400000)) return;
    save("homeBtnNote", { n: st.n + 1, at: Date.now() });
    guestNotice({ title: "The Home button isn't connected yet", message: "Home opens Amazon's screen for now. Open to see the one-time fix.",
      details: ["Fire TV only lets a computer switch the Home button on, and only once.",
                "On this TV: Fire TV Settings › My Fire TV › Developer options › ADB debugging: On.",
                "On a computer on the same Wi-Fi, in the folder of Offshore's download: " + setupCmd(suIp()),
                "After that, Home always brings you back to Offshore, even after updates."],
      level: "info", source: "Setup", action: "perms", quiet: true });
  }
  function suNeeded() {
    if (q.get("setup") === "1") return true;
    return !localStorage.getItem("prefs") && !localStorage.getItem("setupDone") && !localStorage.getItem("restoredAt");
  }
  function suOpen() {
    SU.open = true; SU.step = 0; SU.tour = -1; SU.ip = null;
    pauseIdle();
    document.getElementById("setup").classList.add("open");
    suRender();
  }
  // The groups a screen can focus: its choices (a grid), then its buttons. Choice screens get Continue + Skip.
  function suGroups(s) {
    var g = [];
    if (s.id === "zip") g.push("123456789⌫0✓".split("").map(function (k) { return [k, "", k, "key"]; }));
    else if (s.loc) g.push(LOC && LOC.name && !LOC.unsupported ? [["That's right", "", "keep"], ["Enter a ZIP code", "", "zip"]] : [["Enter a ZIP code", "", "zip"]]);
    else if (s.choices) g.push(s.choices);
    g.push(s.buttons || (s.id === "zip" ? [["Cancel", "back", "quiet"]] : s.loc ? [["Skip for now", "next", "quiet"]]
                                                                         : [["Continue", "next"], ["Skip setup", "finish", "quiet"]]));
    return g;
  }
  function suCur() { var all = suSteps(); return SU.step === "zip" ? { id: "zip", title: "Your ZIP code", text: "We use it only to find your local forecast and news.", cols: 3 } : all[SU.step]; }
  function suRender(keepFocus) {
    var s = suCur(), card = document.getElementById("suCard"), groups = suGroups(s);
    if (!keepFocus) { SU.g = 0; SU.i = 0; if (s.choices && s.picked != null) { var pi = s.choices.map(function (c) { return c[2]; }).indexOf(s.picked); if (pi >= 0) SU.i = pi; } }
    var text = s.id === "look" && SU.g === 0 && s.choices[SU.i] ? s.choices[SU.i][1] + ". You can fine-tune every part later." : s.text;
    if (s.id === "bgpick") text = (SU.g === 0 && s.choices[SU.i] ? s.choices[SU.i][1] + ". " : "") + "More photos and videos any time in Settings › Appearance › Backgrounds.";
    var html = s.id === "extras" ? suExtrasHtml() : s.html || "<h1>" + s.title + "</h1><p>" + text + "</p>";
    if (s.loc) html += LOC && LOC.name && !LOC.unsupported ? '<div class="su-place">' + SU_PIN + esc(LOC.name) + "</div>"
                                                           : '<div class="su-place" style="opacity:.55">' + SU_PIN + "Finding you…</div>";
    if (s.id === "zip") html += '<div class="zipdisp">' + (SU.zip + "_____").slice(0, 5).split("").join(" ") + "</div>";
    groups.forEach(function (grp, gi) {
      var isBtns = gi === groups.length - 1;
      if (isBtns) { html += '<div class="su-acts">'; }
      else {
        var cols = s.id === "zip" ? 3 : Math.min(s.cols || grp.length, grp.length);
        html += s.id === "zip" ? '<div class="zipgrid">' : '<div class="su-choices' + (s.loc ? " mid" : "") + (s.disc ? " discs" : "") + '" style="grid-template-columns:repeat(' + cols + ',auto)">';
      }
      grp.forEach(function (c, ci) {
        var f = SU.tour < 0 && SU.g === gi && SU.i === ci ? " focus" : "";
        if (isBtns) html += '<div class="su-btn' + (c[2] ? " " + c[2] : "") + f + '">' + c[0] + "</div>";
        else if (c[3] === "key") html += '<div class="zipkey' + f + '">' + c[0] + "</div>";
        else if (s.disc) {
          var st = suDiscStatus(c[2]);
          html += '<div class="su-choice disc' + f + '"><i class="su-ico" style="background:' + GICON[c[4]][0] + '"><svg viewBox="0 0 24 24">' +
            GICON[c[4]][1] + "</svg></i><div class=\"su-dt\"><b>" + c[0] + "</b><small>" + c[1] + "</small>" +
            '<span class="su-st' + (st[0] ? " on" : "") + '">' + (st[0] ? "✓ " : "") + esc(st[1]) + "</span></div><em>›</em></div>";
        }
        else html += '<div class="su-choice' + (s.big ? " big" : "") + (s.picked === c[2] ? " picked" : "") + f + '"><b>' + c[0] + "</b>" + (c[1] ? "<small>" + c[1] + "</small>" : "") + "</div>";
      });
      html += "</div>";
    });
    if (keepFocus) {                                    // only the focus moved: keep the entrance, swap the markup
      card.innerHTML = html; card.classList.add("in"); suDots(); return;
    }
    card.classList.remove("in"); card.classList.add("out");
    setTimeout(function () {
      card.innerHTML = html; card.classList.remove("out");
      void card.offsetWidth;                            // restart the entrance
      card.classList.add("in");
    }, card.innerHTML ? 260 : 0);
    suDots();
    if (s.loc && !(LOC && LOC.name)) setTimeout(function () { if (SU.open && suCur().loc && LOC && LOC.name) suRender(); }, 1500);
    if (s.id === "extras") suWatchPerms(JSON.stringify(suPerms()));
    suLive(SU.open && SU.tour < 0 && (s.id === "look" || s.id === "bgpick"), s.id === "look");
  }
  function suWatchPerms(was) {                          // live ticks while "Unlock the extras" is open
    clearTimeout(SU.permTimer);
    SU.permTimer = setTimeout(function () {
      if (!SU.open || suCur().id !== "extras") return;
      var now = JSON.stringify(suPerms());
      if (now !== was) { SU.g = 0; SU.i = 0; suRender(true); if (suExtrasOn()) toast("All set: the extras are on"); }
      suWatchPerms(now);
    }, 3000);
  }
  // "Pick a screensaver" shows the real screensaver behind a slim panel, switching live as the focus moves, so people
  // see what Offshore can show (scores, news, stocks and crypto, the week, the beach). Sports fan turns sports on only
  // while it's the one chosen.
  function suLive(on, saver) {                          // saver: the screensaver behind; otherwise the home screen
    var el = document.getElementById("setup"), was = el.classList.contains("su-live"), wasSaver = document.body.classList.contains("laying");
    saver = !!(on && saver);
    if (on === was && saver === wasSaver) return;
    el.classList.toggle("su-live", on);
    document.body.classList.toggle("su-preview", on);                    // bottom corners lift above the panel
    fitSaverSoon();
    if (saver && !wasSaver) {
      SU.sportsWas = PREFS.sports;
      document.body.classList.add("laying", "ambient"); calKey = ""; renderCal(); feedsStart(); fitSaverSoon();
    } else if (!saver && wasSaver) {
      document.body.classList.remove("laying");
      if (!ambient) { document.body.classList.remove("ambient"); feedsStop(); }
    }
  }
  function suTryLook(i) {
    var l = LAYOUTS[i]; if (!l) return;
    useLayout(i);
    var sports = l[0] === "sports" ? "on" : SU.sportsWas;
    if (PREFS.sports !== sports) { PREFS.sports = sports; applyPrefs("sports"); }
    calKey = ""; renderCal(); feedsStart(); fitSaverSoon();
  }
  function suDots() {
    var all = suSteps(), s = suCur(), box = document.getElementById("suDots"), html = "";
    if (s.dots !== false) all.forEach(function (st, n) { if (st.dots !== false) html += '<i class="' + (n === SU.step || (SU.step === "zip" && st.loc) ? "on" : "") + '"></i>'; });
    box.innerHTML = html;
  }
  function suMove(action) {
    var s = suCur(), groups = suGroups(s), grp = groups[SU.g], last = SU.g === groups.length - 1;
    var cols = last ? grp.length : s.id === "zip" ? 3 : Math.min(s.cols || grp.length, grp.length);
    if (action === "left" && SU.i % cols > 0) SU.i--;
    else if (action === "right" && SU.i % cols < cols - 1 && SU.i < grp.length - 1) SU.i++;
    else if (action === "down") { if (!last && SU.i + cols < grp.length) SU.i += cols; else if (!last) { SU.g++; SU.i = 0; } }
    else if (action === "up") { if (!last && SU.i - cols >= 0) SU.i -= cols; else if (last && groups.length > 1) { SU.g--; SU.i = Math.min(SU.i, groups[SU.g].length - 1); } }
    else return false;
    if (s.id === "look" && SU.g === 0) suTryLook(grp[SU.i][2]);          // the screensaver behind follows the focus
    if (s.id === "bgpick" && SU.g === 0) suTryBg(grp[SU.i][2]);          // and the background, on its step
    suRender(true);
    return true;
  }
  function suGo(step) { SU.step = step; suRender(); }
  function suNext() { var all = suSteps(), n = all.map(function (s) { return s.id; }).indexOf(suCur().id === "zip" ? "loc" : suCur().id); suGo(Math.min(n + 1, all.length - 1)); }
  function suNav(action) {
    pauseIdle();
    if (SU.tour >= 0) { tourNav(action); return; }
    if (SU.busy) return;
    var s = suCur();
    if (action === "back") {
      if (SU.step === "zip") { SU.zip = ""; suGo(suSteps().map(function (x) { return x.id; }).indexOf("loc")); }
      else if (SU.step > 0) suGo(SU.step - 1);
      return;
    }
    if (action !== "ok") { suMove(action); return; }
    var groups = suGroups(s), c = groups[SU.g][SU.i], isBtn = SU.g === groups.length - 1;
    if (isBtn) {
      if (c[1] === "back") suNav("back");
      else if (c[1] === "next") suNext();
      else if (c[1] === "finish") suFinish();
      else if (c[1] === "tour") tourStart();
      else if (c[1] === "tidy") suAway("tidy");             // pick the Amazon extras to switch off; the same computer step applies them
      return;
    }
    if (s.id === "zip") {
      if (c[0] === "⌫") SU.zip = SU.zip.slice(0, -1);
      else if (c[0] === "✓") {
        if (SU.zip.length !== 5) { toast("Enter all 5 digits"); return; }
        SU.busy = true; toast("Finding " + SU.zip + "…");
        useZip(SU.zip).then(function (loc) { SU.busy = false; if (loc && !loc.unsupported) suNext(); },
                            function () { SU.busy = false; toast("Couldn't look that up. Try again."); });
        return;
      } else if (SU.zip.length < 5) SU.zip += c[0];
      suRender(true);
      return;
    }
    if (s.loc) { if (c[2] === "zip") { SU.zip = ""; suGo("zip"); } else suNext(); return; }
    if (s.disc) { suAway(c[2]); return; }
    s.pick(c[2]);                                       // a choice: mark it, then move on after a beat
    s.picked = c[2];
    suRender(true);
    SU.busy = true;
    setTimeout(function () { SU.busy = false; suNext(); }, 420);
  }
  // Out to a Settings page and back: setup steps aside (its place is kept), Settings opens on that page, and Back from
  // that page returns here. Choices made there are kept and saved with the rest at the end.
  function suAway(mode) {
    SU.away = true; SU.awayMode = mode;
    document.getElementById("setup").classList.add("touring");
    openCustom(true);
    custMode = mode; custRow = 0;
    if (mode === "g:sport" && typeof loadTeams === "function") loadTeams();
    renderCustom();
  }
  function suReturn() {
    SU.away = false;
    closeCustom();
    document.getElementById("setup").classList.remove("touring");
    suRender(true);
  }
  function suFinish() {
    tourEnd(true);
    suLive(false);
    save("prefs", PREFS); custDirty = false;
    try { localStorage.setItem("setupDone", JSON.stringify(Date.now())); } catch (e) {}
    SU.open = false;
    liveSync();                                         // a live set chosen in setup now gets its YouTube clips too
    var el = document.getElementById("setup"), card = document.getElementById("suCard");
    card.classList.remove("in"); card.classList.add("out");
    setTimeout(function () { el.classList.remove("open", "touring"); card.innerHTML = ""; card.classList.remove("out"); }, 300);
    row = 0; col = 0; render();
    wake();
  }
  // The tour: each stop is a part of the home screen; the ring glides to it and the card sits above or below.
  var TOUR = [
    ["#tiles", "Your apps", "Every app you have, the ones you use most first. Press OK to open one. Hold OK for options like hiding a tile."],
    ["#ui .clock", "Time, weather and your week", "Your local forecast, air quality and calendar. Select it for the full seven days."],
    ["#dock", "Quick controls", "What's playing, Bluetooth, sending photos from your phone, screen mirroring and a sleep timer."],
    ["#status", "Notifications and Settings", "Wi-Fi, VPN and alerts at a glance. Select it for your notifications and Settings, where everything in Offshore changes. Amazon's Fire Settings and Fire TV Home are under Settings › Fire TV."]
  ];
  function stageBox(el) {                               // layout position inside the 1920x1080 stage (zoom-safe)
    var x = 0, y = 0, n = el;
    while (n && n.id !== "stage") { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function tourStart() { SU.tour = 0; SU.tf = 1; document.getElementById("setup").classList.add("touring"); tourShow(); }
  function tourShow() {
    var t = TOUR[SU.tour], el = document.querySelector(t[0]), ring = document.getElementById("tourRing"), tip = document.getElementById("tourTip");
    if (!el || !el.offsetWidth) { if (SU.tour < TOUR.length - 1) { SU.tour++; tourShow(); } else tourEnd(); return; }
    var b = stageBox(el), pad = 18;
    ring.style.left = (b.x - pad) + "px"; ring.style.top = (b.y - pad) + "px";
    ring.style.width = (b.w + pad * 2) + "px"; ring.style.height = (b.h + pad * 2) + "px";
    ring.classList.add("on");
    document.getElementById("ttN").textContent = (SU.tour + 1) + " of " + TOUR.length;
    document.getElementById("ttH").textContent = t[1];
    document.getElementById("ttP").textContent = t[2];
    var last = SU.tour === TOUR.length - 1;
    document.getElementById("ttActs").innerHTML = '<div class="su-btn quiet' + (SU.tf === 0 ? " focus" : "") + '">Skip tour</div>' +
      '<div class="su-btn' + (SU.tf === 1 ? " focus" : "") + '">' + (last ? "Done" : "Next") + "</div>";
    tip.classList.add("on");
    var tw = 640, th = tip.offsetHeight || 300;
    var left = Math.max(60, Math.min(1920 - tw - 60, b.x + b.w / 2 - tw / 2));
    var top = b.y + b.h + pad + 30 + th < 1040 ? b.y + b.h + pad + 30 : Math.max(40, b.y - pad - 30 - th);
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  function tourNav(action) {
    if (action === "left" || action === "right") { SU.tf = action === "left" ? 0 : 1; tourShow(); return; }
    if (action === "back") { if (SU.tour > 0) { SU.tour--; tourShow(); } else tourEnd(); return; }
    if (action !== "ok") return;
    if (SU.tf === 0 || SU.tour === TOUR.length - 1) tourEnd();
    else { SU.tour++; tourShow(); }
  }
  function tourEnd(quiet) {
    SU.tour = -1;
    document.getElementById("tourRing").classList.remove("on");
    document.getElementById("tourTip").classList.remove("on");
    if (quiet) return;
    document.getElementById("setup").classList.remove("touring");
    suGo(suSteps().map(function (s) { return s.id; }).indexOf("where"));
  }

