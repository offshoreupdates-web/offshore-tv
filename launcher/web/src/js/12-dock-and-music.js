  // ---- Dock (bottom middle): Music, Bluetooth, Share, Mirror ---------------------------------------------------
  // Stops on the bottom row between the buttons and the status box. Music shows what's playing in any app (the app
  // reports it, see Home.watchMusic) and opens a Now Playing card; Bluetooth opens Fire TV's pairing screen; Share is
  // LocalSend receiving; Mirror explains Fire TV's mirroring (Amazon doesn't let other apps open it directly).
  var DICON = {
    full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    bt: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10-5 4V3l5 4L7 17"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    mirror: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="15" height="10" rx="1.5"/><rect x="15" y="9" width="6.5" height="11" rx="1.5"/><path d="M6 18h6"/></svg>',
    files: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M6 5v14M19 5L9 12l10 7z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M18 5v14M5 5l10 7-10 7z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 4v16M17 4v16"/></svg>',
    sleep: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    back15: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 3.5v5h5"/><text x="12.4" y="15.4" font-size="7.4" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg>',
    fwd15: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5"/><path d="M20 3.5v5h-5"/><text x="11.6" y="15.4" font-size="7.4" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg>',
    voldown: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 12h4"/></svg>',
    volup: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 12h4M19 10v4"/></svg>'
  };
  var DOCK = [
    { id: "music", el: "dMusic", name: "Music", line: "What's playing in any app, with play, pause and skip.", small: true },
    { id: "bt", el: "dBt", name: "Bluetooth", line: "Pair headphones, speakers and game controllers.", small: true },
    { id: "share", el: "dShare", name: "Share from your phone", line: "Send photos and files from a phone or computer with the free LocalSend app.", small: true },
    { id: "files", el: "dFiles", name: "Files", line: "What's on the TV and USB drives, and what's using the space.", small: true },
    { id: "mirror", el: "dMirror", name: "Screen mirroring", line: "Show your phone or laptop screen on the TV.", small: true },
    { id: "sleep", el: "dSleep", name: "Sleep timer", line: "Turn the TV off later, or now.", small: true }
  ];
  var MUSIC = { allowed: false, bt: "" }, dockCard = null, dcRow = 0, dcCol = 0, dcButtons = [], npTimer = 0, musicApps = null;
  // The Now playing card under the clock, and a line in ambient mode. Text from the music app: never markup.
  var miniTimer = 0;
  // Now playing lives in the dock: the Music chip shows the artwork, title over artist and a hairline progress
  // line; the other chips shrink to their icons (names come back on focus), so the dock never changes size. The ambient
  // clock shows the song too. Text from the music app: never markup.
  function renderNowPlaying() {
    var m = MUSIC, show = !!(m.title && m.playing);
    var onAir = !show && typeof RD !== "undefined" && RD && RD.now && RD.status !== "buffering";   // the radio, when no music app is playing
    document.getElementById("mMusic").textContent = show ? "♪  " + m.title + (m.artist ? " · " + m.artist : "") : onAir ? "📻  " + RD.now.n + (RD.now.loc ? " · " + RD.now.loc : "") : "";
    clearInterval(miniTimer);
    var mini = document.querySelector("#dMusic .dm s");
    if (!show || !mini) return;
    var step = function () {                            // a step every 10 s, no running animation (the GPU rests)
      if (!(m.duration > 0)) { mini.parentNode.style.display = "none"; return; }
      mini.style.transform = "scaleX(" + Math.min(1, musicPos() / m.duration) + ")";
    };
    mini.style.transition = "none";
    step();
    miniTimer = setInterval(function () { if (homeVisible && !document.hidden) step(); }, 10000);
  }  // Album covers from Apple's music catalogue (iTunes Search API, free, no account), looked up by title and artist and used
  // only when the artist matches, so a wrong cover is never shown; otherwise the music app's own artwork. Once per song.
  // Settings > Sharing & devices > Album covers (it sends the song's title and artist to Apple).
  var ART = {};
  function musicArt() { return MUSIC.netArt || MUSIC.art || ""; }
  function lookupArt(m) {
    if (!m.title || PREFS.artLookup === "off") return;
    var key = (m.artist || "") + "|" + m.title;
    if (key in ART) { if (ART[key]) m.netArt = ART[key]; return; }
    ART[key] = "";
    var clean = function (s) {                              // "Song (Remastered 2011)" / "Song - Live" -> "Song"
      return s.replace(/\s*[\(\[][^\)\]]*(remaster|live|version|edit|feat|mono|stereo|deluxe|mix)[^\)\]]*[\)\]]/ig, "")
              .replace(/\s+-\s+.*(remaster|live|version|edit|mix).*$/i, "").trim();
    };
    var title = clean(m.title).toLowerCase(), artist = (m.artist || "").split(/,|&| feat/i)[0].trim().toLowerCase();
    if (!artist) return;                                     // without an artist the match isn't trustworthy
    getJson("https://itunes.apple.com/search?media=music&entity=song&limit=8&term=" + encodeURIComponent(artist + " " + title)).then(function (j) {
      var hits = (j.results || []).filter(function (r) {
        return (r.artistName || "").toLowerCase().indexOf(artist) >= 0 && (r.trackName || "").toLowerCase().indexOf(title) === 0;
      });
      var album = (m.album || "").toLowerCase();             // the same edition as the app plays (deluxe covers differ)
      var hit = (album && hits.filter(function (r) { return (r.collectionName || "").toLowerCase() === album; })[0]) ||
                (album && hits.filter(function (r) { return (r.collectionName || "").toLowerCase().indexOf(album) === 0; })[0]) || hits[0];
      var url = hit && hit.artworkUrl100 ? hit.artworkUrl100.replace(/\/\d+x\d+bb\./, "/300x300bb.") : "";
      ART[key] = url;
      if (url && MUSIC.title === m.title && MUSIC.artist === m.artist) { MUSIC.netArt = url; renderDock(); if (dockCard === "music") openDockCard("music", true); }
    }).catch(function () { delete ART[key]; });
  }
  window.guestMusic = function (m) {
    m.got = Date.now();                                            // for moving the progress bar between updates
    if (!("art" in m)) m.art = MUSIC.art;                          // the app only sends the cover when it changes
    if (MUSIC.title === m.title && MUSIC.artist === m.artist) m.netArt = MUSIC.netArt;
    lookupArt(m);
    MUSIC = m; renderDock();
    if (dockCard === "music") openDockCard("music", true);
  };
  function dchip(id, cls, html) {                          // like chip(), keeping the dock's own classes and focus
    var c = document.getElementById(id);
    c.className = "chip dchip " + cls + (c.classList.contains("focus") ? " focus" : "");
    c.innerHTML = html;
  }
  function renderDock() {
    var playing = MUSIC.title && MUSIC.playing;
    var well = function (k) { return '<i class="well">' + DICON[k] + "</i>"; };
    var onAir = !playing && typeof RD !== "undefined" && RD.now;   // Offshore's own Radio, when no music app is playing
    document.getElementById("dock").classList.toggle("playing", !!(playing || onAir));
    if (typeof liveVolSync === "function") liveVolSync();         // a live video's sound goes quiet under music
    if (onAir) {
      dchip("dMusic", "green playnow", '<i class="well">' + DICON.music + '</i><span class="dm"><b></b><em></em></span>');
      document.querySelector("#dMusic b").textContent = RD.now.n;
      document.querySelector("#dMusic em").textContent = RD.status === "buffering" ? "Radio · tuning in…" : "Radio" + (RD.now.loc ? " · " + RD.now.loc : "");
    } else if (playing) {                                         // artwork, title over artist, hairline progress
      dchip("dMusic", "green playnow", '<i class="well' + (musicArt() ? ' cover"><img alt="">' : '">' + DICON.music) + '</i><span class="dm"><b></b><em></em><u><s></s></u></span>');
      if (musicArt()) document.querySelector("#dMusic img").src = musicArt();
      document.querySelector("#dMusic b").textContent = MUSIC.title;
      document.querySelector("#dMusic em").textContent = MUSIC.artist || MUSIC.app || "";
    } else {
      dchip("dMusic", MUSIC.title ? "on" : "", well("music") + "<span></span>");
      document.querySelector("#dMusic span").textContent = MUSIC.title ? MUSIC.title : T("Music");
    }
    dchip("dBt", MUSIC.bt ? "blue" : "", well("bt") + "<span></span>");
    document.querySelector("#dBt span").textContent = MUSIC.bt ? MUSIC.bt : "Bluetooth";
    dchip("dShare", PREFS.share !== "off" ? "blue" : "", well("share") + "<span>" + T("Share") + "</span>");
    dchip("dFiles", "", well("files") + "<span>" + T("Files") + "</span>");
    dchip("dMirror", "", well("mirror") + "<span>" + T("Mirror") + "</span>");
    renderSleepChip();
    DOCK[0].line = MUSIC.title ? (MUSIC.playing ? "Playing: " : "Paused: ") + MUSIC.title + (MUSIC.artist ? " · " + MUSIC.artist : "") + (MUSIC.app ? " in " + MUSIC.app : "")
                               : "What's playing in any app, with full controls.";
    DOCK[1].line = MUSIC.bt ? "Connected to " + MUSIC.bt + ". Pair or remove devices." : "Pair headphones, speakers and game controllers.";
    DOCK[2].line = PREFS.share === "off" ? "Send photos and files from a phone or computer with the free LocalSend app. Off right now."
                                         : "On: open LocalSend on your phone and send to “" + room() + " TV”.";
    renderNowPlaying();                                     // the progress line and the ambient line
    fitBar();
    if (els.length && !wxFocus) render();
    if (NPF && NPF.open) npfRender();                           // the full-screen player follows the song and the station
  }
  // The bar must fit any language and screen: if the status zone would run past the bar's end, the controls show icons
  // only (their names come back on focus).
  function fitBar() {
    var dock = document.getElementById("dock"), bar = document.getElementById("bar"), st = document.getElementById("status");
    dock.classList.remove("compact");
    if (PREFS.homeBar === "icons") { dock.classList.add("compact"); return; }   // Settings > Home screen > Bottom bar
    if (st.offsetLeft + st.offsetWidth > bar.clientWidth - 6 || dock.offsetLeft + dock.offsetWidth > st.offsetLeft - 12) dock.classList.add("compact");
  }  function openDock(id) {
    if (id === "bt") { openCustom(true); dockEntry = true; enterDevices("bt"); renderCustom(); return; }
    openDockCard(id === "music" ? "music" : id);
  }
  // Where the song is now: the app's last report, moved on by the time since (at its playback speed).
  function musicPos() {
    var m = MUSIC;
    if (m.position == null) return 0;
    var p = m.position + (m.playing ? (Date.now() - m.got + (m.now - m.at)) * (m.speed || 1) : 0);
    return Math.max(0, m.duration > 0 ? Math.min(p, m.duration) : p);
  }
  function clock(ms) { var s = Math.floor(ms / 1000), m = Math.floor(s / 60); return m + ":" + ("0" + (s % 60)).slice(-2); }
  function renderProgress() {
    var bar = document.getElementById("npBar"); if (!bar) return;
    var d = MUSIC.duration || 0, p = musicPos();
    bar.style.transform = "scaleX(" + (d > 0 ? p / d : 0) + ")";
    document.getElementById("npPos").textContent = clock(p);
    document.getElementById("npDur").textContent = d > 0 ? clock(d) : "";
  }
  var CAN = { seek: 256, prev: 16, next: 32 };          // PlaybackState action bits
  function openDockCard(kind, refresh) {
    var body = document.getElementById("dcBody"), title = "", foot = "OK select · Back to close", html = "";
    dcButtons = [];
    clearInterval(npTimer);
    if (kind === "music" && RD.now && !(MUSIC.title && MUSIC.playing)) {   // Radio is playing
      title = "Radio";
      html = '<div class="dc-body"><b id="dcRadio"></b><br><span id="dcRadioSub"></span></div>';
      dcButtons = [[["radiostop", DICON.pause, "Stop"], ["radioopen", DICON.music, "Stations"], ["npfull", DICON.full, "Full screen"], ["bt", DICON.bt, MUSIC.bt ? MUSIC.bt : "Bluetooth"]]];
      if (!refresh) { dcRow = 0; dcCol = 0; }
    } else if (kind === "music") {
      title = "Now playing";
      if (!app && q.get("music") !== "demo") html = '<div class="dc-body">Music controls work on the TV.</div>';   // preview: ?music=demo
      else if (!MUSIC.allowed) {                                    // no permission: the remote and the phone app still control it
        if (!musicApps) try { musicApps = JSON.parse(app && app.musicApps ? app.musicApps() : "[]"); } catch (e) { musicApps = []; }
        html = '<div class="dc-body">Control music with the <b>⏯ ⏪ ⏩</b> buttons on the remote, or from the music app on your phone (Spotify shows this TV as “' +
          esc(room()) + ' TV”).' + (musicApps.length ? " Open a music app:" : "") + "</div>";
        if (musicApps.length) dcButtons.push(musicApps.slice(0, 4).map(function (a) { return ["open:" + a.pkg, DICON.music, a.name]; }));
        foot = "To show the song and controls here, turn on Music controls: Settings > Security & privacy > Permissions & setup";
      }
      else if (!MUSIC.title) {
        if (!musicApps) try { musicApps = JSON.parse(app && app.musicApps ? app.musicApps() : "[]"); } catch (e) { musicApps = []; }
        html = '<div class="dc-body">' + (musicApps.length ? "Nothing is playing. Open a music app:" : "Nothing is playing. Start music in any app and control it here.") + "</div>";
        if (musicApps.length) dcButtons.push(musicApps.slice(0, 4).map(function (a) { return ["open:" + a.pkg, DICON.music, a.name]; }));
      } else {
        var acts = MUSIC.actions || 0, canSeek = (acts & CAN.seek) && MUSIC.duration > 0;
        html = '<div class="np">' + (musicArt() ? '<img id="npArt" alt="">' : "") +
          '<div class="npx"><div class="nt" id="npT"></div><div class="na" id="npA"></div><div class="ns" id="npS"></div><div class="ns nq" id="npQ"></div>' +
          (MUSIC.duration > 0 ? '<div class="npprog"><div class="track"><div class="fill" id="npBar"></div></div><div class="times"><span id="npPos"></span><span id="npDur"></span></div></div>' : "") +
          "</div></div>";
        var row1 = [];
        if (!acts || acts & CAN.prev) row1.push(["previous", DICON.prev, "Previous"]);
        if (canSeek) row1.push(["back15", DICON.back15, "15 s"]);
        row1.push([MUSIC.playing ? "pause" : "play", MUSIC.playing ? DICON.pause : DICON.play, MUSIC.playing ? "Pause" : "Play"]);
        if (canSeek) row1.push(["fwd15", DICON.fwd15, "15 s"]);
        if (!acts || acts & CAN.next) row1.push(["next", DICON.next, "Next"]);
        dcButtons.push(row1);
        var row2 = (MUSIC.custom || []).map(function (c) { return ["custom:" + c.id, "", c.name]; });   // the app's own: Shuffle, Like…
        if (MUSIC.volumeMax) { row2.push(["voldown", DICON.voldown, ""]); row2.push(["volup", DICON.volup, ""]); }
        row2.push(["bt", DICON.bt, MUSIC.bt ? MUSIC.bt : "Bluetooth"]);
        if (PREFS.npFull !== "off") row2.unshift(["npfull", DICON.full, "Full screen"]);
        dcButtons.push(row2);
        if (!refresh) { dcRow = 0; dcCol = row1.map(function (b) { return b[0]; }).indexOf(MUSIC.playing ? "pause" : "play"); }
        foot = "◀ ▶ ▲ ▼ choose · OK select · Back to close";
      }
      if (!MUSIC.title) dcButtons.unshift([["radioopen", DICON.music, "Radio"]]);   // Offshore's own radio, always one press away
      if (!dcButtons.length || !MUSIC.title) dcButtons.push([["bt", DICON.bt, MUSIC.bt ? MUSIC.bt : "Bluetooth"]]);
    } else if (kind === "share") {
      title = "Share from your phone";
      var on = PREFS.share !== "off";
      html = '<div class="dc-body">Send photos, videos and files from any phone or computer with <b>LocalSend</b> (free on the App Store, Google Play, Mac and Windows). ' +
        (on ? 'Open it and choose <b id="dcRoom"></b>. You accept each transfer here first.' : "Turn it on, then open LocalSend on your phone.") + "</div>";
      if (PREFS.share === "pin") {                                    // the code is on screen before anyone sends
        var pin = sharePinNow();
        html += '<div class="dc-code"><span>Your LocalSend code</span><div class="sa-code">' + esc(pin.slice(0, 3) + " " + pin.slice(3)) + "</div></div>";
      }
      dcButtons = [[["share", DICON.share, on ? "Turn off" : "Turn on"], ["pin", "", PREFS.share === "pin" ? "Code: on" : "Code: off"], ["recv", "", "Delete received files"]]];
      foot = "Only people on your home network can send · encrypted · OK select · Back";
    } else if (kind === "tile") {
      title = tileSel.name;
      html = '<div class="dc-body"></div>';
      dcButtons = [[["tileopen", "", "Open"], ["tilemove", "", "Move"], ["tilehide", "", "Hide tile"], ["tileremove", "", "Remove app"]],
                   [["tileart", "", "Change picture"]].concat(tileArtOf(tileSel.id) ? [["tileartreset", "", "Original picture"]] : [])];
      foot = "☰ on the remote moves a tile too · Remove asks Fire TV to confirm · Back to close";
    } else if (kind === "kw") {                                    // a card on the Keep watching shelf (24f)
      var kh = kwHero(KW.items[KW.idx]);
      title = kh.name;
      html = '<div class="dc-body"></div>';
      dcButtons = kwCardButtons();
      foot = "Back to close";
    } else if (kind === "sleep") {
      title = "Sleep timer";
      var left = sleepLeft();
      html = '<div class="dc-body"></div>';
      dcButtons = [[15, 30, 60, 90, 120].map(function (m) { return ["sl:" + m, "", m + " min"]; }),
                   [["slnow", DICON.sleep, "Sleep now"]].concat(left ? [["slcancel", "", "Turn timer off"]] : []),
                   [["ssnd", DICON.music, SLEEP.on ? "Stop " + sleepName(PREFS.sleepSound || "brown") : "Play " + sleepName(PREFS.sleepSound || "brown")], ["ssndpick", "", "Sleep sounds…"]]];
      foot = "The timer works while you watch, in any app · Back to close";
    } else if (kind === "mirror") {
      title = "Screen mirroring";
      html = '<div class="dc-body">Press <b>Start mirroring</b>, then on your device:<ol>' +
        "<li><b>Android phone:</b> open Quick Settings, tap <b>Smart View</b>, <b>Cast</b> or <b>Screen cast</b>, and pick this TV.</li>" +
        "<li><b>Windows laptop:</b> press <b>Windows + K</b> and pick this TV.</li>" +
        "<li><b>iPhone or iPad:</b> Fire TV doesn't have AirPlay built in. A receiver app from the Appstore, such as AirScreen, adds it. Or send photos with Share.</li></ol></div>";
      dcButtons = [[["mirstart", DICON.mirror, "Start mirroring"], ["close", "", "Not now"]]];
      foot = "Press Back on the remote to stop mirroring";
    }
    if (!refresh && kind !== "music") { dcRow = 0; dcCol = 0; }
    if (dockCard !== kind && kind === "music" && !MUSIC.title) { dcRow = 0; dcCol = 0; }
    dockCard = kind;
    dcRow = Math.min(dcRow, dcButtons.length - 1);
    dcCol = Math.max(0, Math.min(dcCol, dcButtons[dcRow].length - 1));
    document.getElementById("dcTitle").textContent = title;
    document.getElementById("dcard").classList.toggle("music", kind === "music" && html.indexOf('<div class="np">') === 0);   // only the playing layout
    body.innerHTML = html;
    if (document.getElementById("dcRadio")) {             // a station's name comes from the directory: text, never markup
      document.getElementById("dcRadio").textContent = RD.now.n;
      document.getElementById("dcRadioSub").textContent = (RD.status === "buffering" ? "Tuning in… · " : "") + [RD.now.loc || RD.now.st || "", RD.now.t].filter(Boolean).join(" · ");
    }
    if (kind === "music" && document.getElementById("npT")) {   // text from the music app: never markup
      document.getElementById("npT").textContent = MUSIC.title;
      document.getElementById("npA").textContent = MUSIC.artist || "";
      document.getElementById("npS").textContent = (MUSIC.app ? "In " + MUSIC.app : "") +
        (MUSIC.volumeMax ? " · Volume " + Math.round(100 * MUSIC.volume / MUSIC.volumeMax) + "%" : "");
      document.getElementById("npQ").textContent = MUSIC.out ? "Sound · " + MUSIC.out : "";   // the TV's output (apps don't share stream quality)
      if (musicArt()) document.getElementById("npArt").src = musicArt();
      renderProgress();
      if (MUSIC.playing && MUSIC.duration > 0) npTimer = setInterval(renderProgress, 1000);
    }
    if (kind === "share" && document.getElementById("dcRoom")) document.getElementById("dcRoom").textContent = room() + " TV";
    if (kind === "sleep") body.firstChild.textContent = sleepLeft() ? "The TV turns off in " + Math.ceil(sleepLeft() / 60000) + " min. Pick a new time, or turn the timer off." : "Turn the TV off after a while, even while you watch, or now.";
    if (kind === "tile") body.firstChild.textContent = tileSel.line || "";
    if (kind === "kw") body.firstChild.textContent = kwHero(KW.items[KW.idx]).line;
    var actsEl = document.getElementById("dcActs");
    actsEl.innerHTML = "";
    dcButtons.forEach(function (row, r) {
      var rowEl = document.createElement("div");
      rowEl.className = "acts";
      row.forEach(function (b, c) {
        var el = document.createElement("div");
        el.className = "sbtn glass" + (r === dcRow && c === dcCol ? " focus" : "") + (b[2] ? "" : " icon") + (b[0] === "play" || b[0] === "pause" ? " play" : "");
        el.innerHTML = b[1] + "<span></span>";                    // our icon, then the label as text (names come from apps)
        el.lastChild.textContent = b[2];
        rowEl.appendChild(el);
      });
      actsEl.appendChild(rowEl);
    });
    document.getElementById("dcFoot").textContent = foot;
    document.getElementById("dcard").classList.add("open");
    document.getElementById("sysdim").classList.add("open");
  }
  var tileSel = null, dockEntry = false;
  function openTileMenu(it) { if (!it || !it.id) return; tileSel = it; openDockCard("tile"); }
  function sleepLeft() { return app && app.sleepLeft ? app.sleepLeft() : 0; }
  function renderSleepChip() {
    var l = sleepLeft(), c = document.getElementById("dSleep");
    if (!c) return;
    dchip("dSleep", l ? "blue" : "", '<i class="well">' + DICON.sleep + "</i><span></span>");
    c.lastChild.textContent = l ? Math.ceil(l / 60000) + " min" : T("Sleep");
  }
  setInterval(renderSleepChip, 30000);
  window.guestSleepDone = function () { renderSleepChip(); };
  // App, Fire OS and security patch updates (from the app): a quiet notice, info level, so never over a movie.
  window.guestUpdated = function (n) { if (PREFS.updNotices !== "off") guestNotice(n); };
  function closeDockCard() {
    dockCard = null;
    clearInterval(npTimer);
    document.getElementById("dcard").classList.remove("open");
    document.getElementById("sysdim").classList.remove("open");
  }
  function dockNav(action) {
    if (action === "back") { closeDockCard(); return; }
    if (action === "left" || action === "right") { dcCol = Math.max(0, Math.min(dcButtons[dcRow].length - 1, dcCol + (action === "left" ? -1 : 1))); openDockCard(dockCard, true); return; }
    if (action === "up" || action === "down") {
      var to = Math.max(0, Math.min(dcButtons.length - 1, dcRow + (action === "up" ? -1 : 1)));
      if (to !== dcRow) { dcCol = Math.round(dcCol * (dcButtons[to].length - 1) / Math.max(1, dcButtons[dcRow].length - 1)); dcRow = to; openDockCard(dockCard, true); }
      return;
    }
    if (action !== "ok" || !dcButtons[dcRow] || !dcButtons[dcRow][dcCol]) return;
    var id = dcButtons[dcRow][dcCol][0];
    if (/^(play|pause|next|previous|back15|fwd15|volup|voldown)$/.test(id) || id.indexOf("custom:") === 0) { if (app) app.musicCmd(id); }
    else if (id.indexOf("open:") === 0) { closeDockCard(); if (app && app.openMusicApp) app.openMusicApp(id.slice(5)); }
    else if (id === "bt") { closeDockCard(); openDock("bt"); }
    else if (id === "radiostop") { rdStop(); closeDockCard(); toast("Radio off"); }
    else if (id === "radioopen") { closeDockCard(); openRadio(); }
    else if (id === "npfull") { closeDockCard(); npfOpen(); }
    else if (id === "tileopen") { closeDockCard(); open(); }
    else if (id === "tileart") { closeDockCard(); tileArtPick(tileSel); }
    else if (id === "tileartreset") { closeDockCard(); tileArtSet(tileSel.id, ""); toast(tileSel.name + ": its own picture again"); }
    else if (id === "kwopen") { closeDockCard(); kwOpen(KW.items[KW.idx]); }
    else if (id === "kwremove") { closeDockCard(); kwRemove(KW.items[KW.idx]); render(); }
    else if (id === "kwcards") { closeDockCard(); openCustom(true); dockEntry = true; custMode = "cards"; custRow = 0; renderCustom(); }
    else if (id === "tilemove") { closeDockCard(); moveStart(tileSel); }
    else if (id === "tilehide") {
      var hp = tileSel.id; save("hiddenTiles", hiddenTiles().concat([hp]));
      closeDockCard(); APPS = APPS.filter(function (a) { return a.id !== hp; }); layoutTiles(); row = 0; col = 0; render();
      toast("Hidden · Settings > Home screen > Hidden tiles brings it back");
    }
    else if (id === "tileremove") {
      if (!app || !app.uninstall(tileSel.id)) toast(tileSel.name + " is part of Fire TV and can't be removed");
      else closeDockCard();                                           // Android asks to confirm; the tiles refresh after
    }
    else if (/^sl:\d+$/.test(id)) { var mins = +id.slice(3); if (app) app.sleepIn(mins); closeDockCard(); renderSleepChip(); toast("The TV turns off in " + mins + " minutes"); }
    else if (id === "slcancel") { if (app) app.sleepIn(0); closeDockCard(); renderSleepChip(); toast("Sleep timer off"); }
    else if (id === "slnow") { closeDockCard(); if (!app || !app.sleepNow()) toast("Use the remote's power button to turn the TV off"); }
    else if (id === "ssnd") { if (SLEEP.on) { sleepStop(true); toast("Sleep sound off"); } else { sleepStart(); toast("Playing " + sleepName(PREFS.sleepSound || "brown")); } openDockCard("sleep", true); }
    else if (id === "ssndpick") { closeDockCard(); openCustom(true); dockEntry = true; custMode = "sleep"; custRow = 0; renderCustom(); }
    else if (id === "mirstart") { closeDockCard(); if (app) app.launch("mirroring"); else toast("Would open Fire TV's mirroring screen"); }
    else if (id === "close") closeDockCard();
    else if (id === "share" || id === "pin") {                       // saved straight away (not part of Settings's Save)
      PREFS.share = id === "share" ? (PREFS.share === "off" ? "on" : "off") : (PREFS.share === "pin" ? "on" : "pin");
      var saved = load("prefs") || {}; saved.share = PREFS.share; save("prefs", saved);
      shareSync(); renderDock(); openDockCard("share", true);
      toast(PREFS.share === "off" ? "Receiving off" : PREFS.share === "pin" ? "Receiving on · senders type a code shown here" : "Receiving on");
    }
    else if (id === "recv") { deleteReceived(); }
  }
  setTimeout(function () { renderDock(); if (app && app.musicState) app.musicState(); }, 1500);
  // Music access granted while the app is running (tools\setup_tv.ps1): until it's allowed, ask again every 30 s; once
  // allowed, Android sends every change by itself.
  setInterval(function () { if (app && app.musicState && !MUSIC.allowed && homeVisible) app.musicState(); }, 30000);

