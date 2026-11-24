  // ---- Settings sheet ---------------------------------------------------------------------------------------
  // Three lists share the sheet: the main settings, Leagues (on/off each), Favorite teams (OK stars a team).
  // 8 rows show at a time; the list scrolls with the focus.
  var custOpen = false, custRow = 0, custMode = "main", custSnapshot = null, custDirty = false, padIdx = 0, padZip = "", kbIdx = 0, kbText = "";
  var CUST_TITLE = { plex: "Plex", cards: "Your cards", cardedit: "Card", main: "Settings", livetv: "Live TV", livedel: "Remove a playlist", livehidden: "Hidden in Live TV", livephone: "Add your channels from your phone", tidy: "Tidy up Fire TV", updother: "Apps, Fire OS & Kodi updates", inbox: "Notifications", notice: "Notification", about: "About Offshore", whatsnew: "What's new", cal: "Calendar", calphone: "Add a calendar from your phone", calnew: "New event", perms: "Permissions & setup", sleep: "Sleep sounds", sleepres: "Free sounds to sleep to", ssNewsPick: "News topics & sources", tasks: "Task manager", ssItem: "Screensaver item", ssLayout: "Screensaver layout", ssStocks: "Stocks", ssCrypto: "Crypto", leagues: "Leagues", teams: "Favorite teams", location: "Location", zip: "Enter ZIP code",
                     confirm: "Save your changes?", bg: "Backgrounds", search: "Search for photos", bgdelete: "Delete downloaded photos",
                     nas: "Network folder", bgphotos: "Photos", bglive: "Live video", room: "Room", storage: "Storage & downloads", speed: "Speed test", viddelete: "Forget live videos", pinset: "Choose a 4-digit PIN",
                     pinask: "Enter the settings PIN", bt: "Bluetooth", wifi: "Wi-Fi", hidden: "Hidden tiles", uninstall: "Uninstall apps", sndres: "Free sounds",
                     sndslots: "Your sounds" };
  var CUST_FOOT = { plex: "▲ ▼ choose · OK · Back", cards: "▲ ▼ choose · OK opens · Back", cardedit: "▲ ▼ choose · ◀ ▶ change · OK select · Back leaves it as it was", main: "▲ ▼ choose · ◀ ▶ change · Save settings keeps your changes", livetv: "▲ ▼ choose · OK · Back", livedel: "▲ ▼ choose · OK removes · Back", livehidden: "▲ ▼ choose · OK shows it again · Back", livephone: "Back closes the phone link", tidy: "▲ ▼ choose · OK switches it · Back", updother: "▲ ▼ choose · OK opens · ◀ ▶ change · Back", leagues: "▲ ▼ choose · OK turns on or off · Back",
                    ssStocks: "▲ ▼ choose · OK turns on or off · Back", ssLayout: "▲ ▼ choose · ◀ ▶ moves · OK moves up · Back", tasks: "▲ ▼ choose · OK closes · ▶ app info · Back", perms: "Back to close", whatsnew: "▲ ▼ scroll · OK on Available now installs it · Back", about: "▲ ▼ scroll · Back",
                    inbox: "▲ ▼ choose · OK opens · Back to close", notice: "▲ ▼ choose · OK select · Back to the list", cal: "▲ ▼ choose · OK select · ◀ removes · Back", calphone: "Back closes the phone link",
                    calnew: "▲ ▼ choose · ◀ ▶ change · OK select · Back", sleep: "▲ ▼ choose · OK plays · ◀ ▶ change · Back", sleepres: "▲ ▼ choose · OK uses it · ▶ plays it now · Back", ssNewsPick: "▲ ▼ choose · OK turns on or off (a topic: all its sources) · Back", ssItem: "▲ ▼ choose · ◀ ▶ change · OK moves · Back to the layout", ssCrypto: "▲ ▼ choose · OK turns on or off · Back",
                    teams: "▲ ▼ choose · OK adds or removes ★ · Back", location: "▲ ▼ choose · OK select · Back",
                    zip: "Arrows choose · OK presses · Back", confirm: "▲ ▼ choose · OK select",
                    bg: "▲ ▼ choose · OK opens · Back", bgphotos: "▲ ▼ shows each set behind this list · OK opens a set: take turns, or one photo · Back",
                    bglive: "▲ ▼ plays each one behind this list · OK opens a set: all its clips, or one · Back",
                    bgclips: "▲ ▼ plays each one behind this list · OK uses it · Back",
                    bgpics: "▲ ▼ shows each one behind this list · OK uses it · Back",
                    search: "Arrows choose · OK types · ✓ done · Back", bgdelete: "▲ ▼ choose · OK deletes · Back",
                    nas: "▲ ▼ choose · OK edits · ◀ ▶ change · Back", room: "▲ ▼ choose · OK select · Back",
                    storage: "▲ ▼ choose · OK select · ◀ ▶ change · Back", speed: "OK runs the test · Back", viddelete: "OK forgets one · Back", pinset: "Arrows choose · OK presses · ✓ saves · Back",
                    pinask: "Arrows choose · OK presses · Back closes", bt: "▲ ▼ choose · OK select · Back", btdev: "▲ ▼ choose · OK select · Back",
                    wifi: "▲ ▼ choose · OK joins · Back", hidden: "▲ ▼ choose · OK shows the tile again · Back", uninstall: "▲ ▼ choose · OK uninstalls · ▶ app info · Back",
                    sndres: "▲ ▼ choose · ▶ hear it · OK for options · Back", snddo: "▲ ▼ choose · OK select · Back", sndslots: "▲ ▼ choose · OK removes · Back" };
  var PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"];
  // On-screen keyboard (photo search, network folder fields): letters, digits, the symbols addresses and passwords use,
  // then Shift, space, delete, done. 10 keys a row.
  var KB = "abcdefghijklmnopqrstuvwxyz0123456789".split("").concat([".", "-", "_", "/", "@", ":", "!", "#", "$", "%", "⇧", "␣", "⌫", "✓"]);
  var kbShift = false, kbField = "";     // kbField: "" = photo search, else the network folder field being typed
  function prefValue(r) {
    var v = r.key === "units" ? units() : r.key === "room" ? room() : PREFS[r.key];
    for (var i = 0; i < r.opts.length; i++) if (String(r.opts[i][0]) === String(v)) return i;
    return 0;
  }
  function linkValue(key) {
    if (key === "homeLayout") return homeLayoutName() + (FIT.shrunk.length ? " · fitted" : "");
    if (key === "speedTest") { var st = load("speedtest"); return SPD.running ? "Testing…" : st ? Math.round(st.down) + " Mbps · " + ago2(st.t) : "Not run yet"; }
    if (key === "location") {
      if (!LOC) return "Finding…";
      if (LOC.unsupported) return "Not supported here yet";
      return LOC.name + (LOC.how === "auto" ? " (estimated)" : LOC.how === "zip" ? " · " + LOC.zip : "");
    }
    if (key === "ssLayout") return layoutName();
    if (key === "storage") return nasInfo().host ? "This TV and your NAS" : "On this TV";
    if (key === "about") return "Free and open source";
    if (key === "plex") return plexOn() ? "Linked" : "Not linked";
    if (key === "cards") { var nc = myCards().length; return nc ? nc + " card" + (nc > 1 ? "s" : "") : "None yet"; }
    if (key === "whatsnew") { var su = updState(); return su.guest && su.guest.newer ? su.guest.latest + " available" : "Version " + (myVersion() === "preview" ? CHANGELOG[0][0] : myVersion()); }
    if (key === "tidy") return tidySummary();
    if (key === "updother") return "Amazon Appstore, Fire OS";
    if (key === "perms") { var ps = permState(); var nOn = SETUP.filter(function (x) { return ps[x[0]]; }).length; return app ? nOn + " of " + SETUP.length + " on" : "On the TV"; }
    if (key === "sleep") return (SLEEP.on ? "Playing: " : "") + sleepName(PREFS.sleepSound || "brown");
    if (key === "ssNewsPick") {
      var onT = NEWS_TOPICS.filter(function (t) { return NEWS_SRC.some(function (s) { return s[1] === t[0] && newsOn().indexOf(s[0]) >= 0; }); }).map(function (t) { return t[2] || t[1]; });
      return onT.length ? onT.join(", ") : "None";
    }
    if (key === "ssStocks" || key === "ssCrypto") {
      var picks = (key === "ssStocks" ? PREFS.stocks : PREFS.crypto) || [];
      return picks.length ? picks.slice(0, 3).map(function (s) { return s.split(":")[0]; }).join(", ") + (picks.length > 3 ? " +" + (picks.length - 3) : "") : "Off";
    }
    if (key === "leagues") {
      var names = LEAGUES.filter(function (l) { return PREFS.leagues.indexOf(l.id) >= 0; }).map(function (l) { return l.short || l.name; });
      return names.length ? names.slice(0, 3).join(", ") + (names.length > 3 ? " +" + (names.length - 3) : "") : "None";
    }
    if (key === "bg") return bgName(PREFS.bg);
    if (key === "room") return room();
    return PREFS.teams.length ? PREFS.teams.length + (PREFS.teams.length === 1 ? " team" : " teams") : "None";
  }
