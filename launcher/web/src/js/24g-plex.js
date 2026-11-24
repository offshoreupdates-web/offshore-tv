  // Plex on Keep watching. The Plex app doesn't
  // tell Fire TV what it plays, so Settings › Home screen › Keep watching › Plex links the user's Plex account with Plex's own TV
  // sign-in (a code entered at plex.tv/link on a phone; the password never comes near the TV) and Plex.java reads
  // Continue watching from their servers. The page only ever gets titles, progress and small pictures (no token).
  var PLEX = { code: "", state: "", timer: 0, at: 0, sure: false, demo: 0 };
  function plexOn() { return app && app.plexLinked ? app.plexLinked() : !!load("plexDemo"); }
  function plexRefresh(force) {
    if (PREFS.kw === "off" || !plexOn() || (!force && Date.now() - PLEX.at < 5 * 60000)) return;
    PLEX.at = Date.now();
    if (app && app.plexRefresh) app.plexRefresh(); else plexDemoDeck();
  }
  function plexPoll() {                                    // while the code is on screen, ask Plex every 4 s if it's been entered
    clearTimeout(PLEX.timer);
    if (!custOpen || custMode !== "plex" || PLEX.state !== "waiting") return;
    PLEX.timer = setTimeout(function () {
      if (app && app.plexCheck) app.plexCheck();
      else if (++PLEX.demo >= 2) { save("plexDemo", 1); window.guestPlex("link", "linked"); }   // preview: "entered" after 8 s
      else plexPoll();
    }, 4000);
  }
  window.guestPlex = function (kind, d) {
    if (kind === "code") {
      PLEX.code = d && d.code ? d.code : ""; PLEX.state = PLEX.code ? "waiting" : "";
      if (!PLEX.code) toast("Couldn't reach Plex · check the internet and try again");
      plexPoll();
    } else if (kind === "link") {
      if (d === "linked") { PLEX.code = ""; PLEX.state = ""; custRow = custMode === "plex" ? 0 : custRow; toast("Plex linked · Continue watching is on your home screen"); plexRefresh(true); }
      else if (d === "expired") { PLEX.code = ""; PLEX.state = ""; toast("That code ran out · pick Link to get a new one"); }
      else plexPoll();
    } else if (kind === "deck") {
      if (!d) return;                                      // Plex or the server didn't answer: keep what we had
      save("plexDeck", d.slice(0, 8).map(function (m) {
        return { k: "plex", id: m.server + ":" + m.key, pkg: "com.plexapp.android", app: "Plex", server: m.server, key: m.key,
          n: m.title || "", sub: m.sub || "", pos: m.pos || 0, dur: m.dur || 0, t: m.t || Date.now(), art: m.art || "" };
      }));
      kwBuildSoon();
    }
    if (custOpen && custMode === "plex") renderCustom();
  };
  function plexItems() { return PREFS.kw !== "off" && plexOn() ? load("plexDeck") || [] : []; }

  // Settings › Home screen › Keep watching › Plex.
  function plexRows() {
    if (PLEX.code) return [{ label: "", act: true, id: "code" }];   // the code card (plexCard) stands in for the list
    if (plexOn()) {
      var n = (load("plexDeck") || []).length;
      return [
        { label: "Plex account", value: "Linked", none: true },
        { label: "Continue watching", value: n ? n + " on the home screen" : "Nothing in progress", none: true },
        { label: "Refresh now", value: "", act: true, id: "refresh" },
        { label: PLEX.sure ? "Press OK again to unlink" : "Unlink Plex", value: "", act: true, id: "unlink" },
        { label: "Unlinking forgets the account on this TV. To take the TV off your account too: plex.tv › Settings › Authorized devices.", none: true }
      ];
    }
    return [
      { label: "Link your Plex account", value: "›", act: true, id: "link" },
      { label: "Your Continue watching from Plex shows on Keep watching, with pictures and how far you got; OK plays it in Plex. You sign in on Plex's own site on your phone, so Offshore never sees your password.", none: true }
    ];
  }
  function plexCard() {
    var el = document.createElement("div"), c = PLEX.code.toUpperCase();
    el.className = "plexcard";
    el.innerHTML = '<div class="pk">On your phone or computer, go to</div><div class="pu">plex.tv/link</div><div class="pk">and enter</div><div class="pc"></div>' +
      '<div class="pw"><i></i>Waiting for you to sign in</div>';
    el.querySelector(".pc").textContent = c;
    return el;
  }
  function plexNav(action, rows) {
    var r = rows[custRow];
    if (!r || action !== "ok") return;
    if (r.id === "link" || r.id === "code") {
      PLEX.code = ""; PLEX.demo = 0;
      if (app && app.plexLink) app.plexLink(); else window.guestPlex("code", { code: "K7QX" });
    } else if (r.id === "refresh") { plexRefresh(true); toast("Asking Plex…"); }
    else if (r.id === "unlink") {
      if (!PLEX.sure) { PLEX.sure = true; return; }
      PLEX.sure = false;
      if (app && app.plexUnlink && !app.plexUnlink()) return;
      if (!app) save("plexDemo", 0);
      save("plexDeck", []); custRow = 0; kwBuild(); toast("Plex unlinked");
    }
  }
  function plexDemoDeck() {                                // the preview's stand-in for Plex's answer
    var pic = function (a, b) {
      var c = document.createElement("canvas"); c.width = 384; c.height = 216;
      var g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 384, 216); gr.addColorStop(0, a); gr.addColorStop(1, b);
      g.fillStyle = gr; g.fillRect(0, 0, 384, 216); return c.toDataURL("image/jpeg", .8);
    };
    window.guestPlex("deck", [
      { server: "demo0000", key: "101", title: "Harbor Lights", sub: "S1 · E3 · The Long Night", pos: 1300000, dur: 2700000, t: Date.now() - 3600000, art: pic("#3a6d8c", "#0d1b2a") },
      { server: "demo0000", key: "102", title: "Night Train", sub: "2024", pos: 4100000, dur: 6600000, t: Date.now() - 86400000, art: pic("#8c5a3a", "#1f0f08") }
    ]);
  }
  setInterval(function () { if (homeVisible && !ambient) plexRefresh(); }, 15 * 60000);
  setTimeout(plexRefresh, 4000);
