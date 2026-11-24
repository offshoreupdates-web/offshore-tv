  // Home extras, part 2 (owner, 23 November 2026): Keep watching, your own cards and your own app pictures.
  //
  // Keep watching: a shelf over the app tiles with what you had on lately: the show or film you were watching in your
  // own apps (Plex, Fox One, Netflix…: whatever they tell Android is playing, with where you stopped; owner, 23 November
  // 2026), Live TV channels, radio stations and videos opened from Files (Settings › Home screen › Keep watching › Every app you open adds
  // every recently used app, or turns it off). Fire OS keeps apps' own "continue watching" lists to themselves, so a
  // card opens the app, which picks up from there. Newest first, up to 10, a month at most. ☰ or hold OK: Remove; it comes back if
  // you play it again. Your cards follow on the same shelf.
  var KW = { focus: false, idx: 0, items: [], win: 0 };
  function kwHist() { return load("kwHist") || []; }
  function kwKey(e) { return e.k + "|" + e.id; }
  function kwAdd(e) {                                      // something was played: to the front
    e.t = Date.now();
    var h = kwHist().filter(function (x) { return kwKey(x) !== kwKey(e); });
    h.unshift(e); save("kwHist", h.slice(0, 20));
    kwBuildSoon();
  }
  function kwRemove(e) {
    if (e.k === "card") return;
    var hide = load("kwHide") || {}; hide[kwKey(e)] = Date.now(); save("kwHide", hide);
    save("kwHist", kwHist().filter(function (x) { return kwKey(x) !== kwKey(e); }));
    kwBuild(); toast("Removed · it comes back when you play it again");
  }
  // ── From your apps ── Home.java's trackShows hands over the latest title per video app (guestWatch), once the home
  // screen is back. One card per app, newest first; one that says nothing (some live apps) is still noted when opened.
  window.guestWatch = function (r) {
    if (!r || !r.pkg || PREFS.kw === "off") return;
    var old = kwHist().filter(function (x) { return x.k === "show" && x.id === r.pkg; })[0] || {};
    var e = { k: "show", id: r.pkg, app: r.app || old.app || "", n: r.title || "", sub: r.sub || "", pos: r.pos || 0, dur: r.dur || 0, mid: r.mid || "",
      ch: r.ch || (r.title && r.title === old.n ? old.ch || "" : ""),
      art: r.art !== undefined ? r.art : (r.title && r.title === old.n ? old.art || "" : "") };
    if (!e.n && old.n && Date.now() - (old.t || 0) < 6 * 3600000) { e.n = old.n; e.sub = old.sub; e.art = old.art || ""; e.pos = old.pos; e.dur = old.dur; }
    kwAdd(e);
  };
  function kwOpened(pkg) {                                 // a video app opened from Offshore: noted, keeping what it played last
    if (PREFS.kw === "off" || !app || !app.videoApp || !app.videoApp(pkg)) return;
    var old = kwHist().filter(function (x) { return x.k === "show" && x.id === pkg; })[0];
    kwAdd(old || { k: "show", id: pkg, n: "", sub: "", pos: 0, dur: 0, art: "" });
  }
  function kwLeft(e) {                                     // "24 min left", "Finished", or "" (live, or not known)
    if (!e.dur || e.dur < 60000) return "";
    var left = Math.max(0, e.dur - e.pos);
    if (left < 60000 || e.pos / e.dur > .97) return T("Finished");
    var m = Math.round(left / 60000);
    return m < 60 ? m + " " + T("min left") : Math.floor(m / 60) + " h " + (m % 60) + " " + T("min left");
  }
  // Fox One's channels, drawn by Offshore (Home.findChannel says which one a show is on): [wordmark, name].
  var FOX_CH = { foxnews: ["FOX NEWS", "FOX News"], foxbusiness: ["FOX BUSINESS", "FOX Business"], fox: ["FOX", "FOX"], fs1: ["FS1", "FS1"],
    fs2: ["FS2", "FS2"], btn: ["BTN", "Big Ten Network"], foxweather: ["FOX WEATHER", "FOX Weather"], foxdeportes: ["FOX DEPORTES", "FOX Deportes"],
    foxnation: ["FOX NATION", "FOX Nation"], foxsoul: ["FOX SOUL", "FOX Soul"], livenow: ["LiveNOW", "LiveNOW from FOX"] };
  function kwChannel(e) { return e.ch && own(FOX_CH, e.ch) ? FOX_CH[e.ch] : null; }
  function kwAppName(e) { return e.app || appItem(e.pkg || e.id).name; }
  function kwItems() {
    if (PREFS.kw === "off") return [];
    var plex = typeof plexItems === "function" ? plexItems() : [];
    var hide = load("kwHide") || {}, now = Date.now(), list = kwHist().filter(function (x) {
      if (x.k === "show" && x.id === "com.plexapp.android" && plex.length) return false;   // Plex's own list says more
      return x.k !== "show" || !app || !app.pkgVersion || app.pkgVersion(x.id) !== "";      // an app taken off the TV: its card goes
    }).concat(plex);
    if (PREFS.kw === "all") {                               // recently opened apps too (the launches the tiles count)
      var u = usage();
      Object.keys(u).forEach(function (pkg) {
        if (/^offshore:/.test(pkg) || !APPS.some(function (a) { return a.id === pkg; })) return;
        if (list.some(function (x) { return (x.k === "show" || x.k === "plex") && (x.pkg || x.id) === pkg; })) return;      // its show's card stands for it
        var t = Math.max.apply(null, launches(u, pkg).concat([0]));
        if (t) list.push({ k: "app", id: pkg, t: t });
      });
    }
    return list.filter(function (e) { return now - e.t < MONTH && !(hide[kwKey(e)] >= e.t); })
      .sort(function (a, b) { return b.t - a.t; }).slice(0, 10);
  }
  function kwAgo(t) {
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 2) return "just now";
    if (m < 60) return m + " min ago";
    if (m < 24 * 60) return Math.round(m / 60) + " h ago";
    var d = Math.round(m / 1440); return d === 1 ? "yesterday" : d + " days ago";
  }

  // ── Your cards ── Countdowns ("Beach trip · 32 days"), notes and web links you make in Settings › Home screen ›
  // Your cards, after Keep watching on the shelf. A countdown that's passed steps away (or rolls to next year).
  function myCards() { return load("myCards") || []; }
  function cardDays(c) {                                   // days until a countdown's date, or -1 once it's passed
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var d = new Date(c.y || now.getFullYear(), c.m, c.d).getTime();
    if (c.yearly) { d = new Date(now.getFullYear(), c.m, c.d).getTime(); if (d < today) d = new Date(now.getFullYear() + 1, c.m, c.d).getTime(); }
    return d < today ? -1 : Math.round((d - today) / 86400000);
  }
  function cardShown(c) { return c.type !== "count" || cardDays(c) >= 0; }
  function cardHost(u) { var m = /^https?:\/\/([^\/:?#]+)/i.exec(u || ""); return m ? m[1].replace(/^www\./, "") : ""; }

  // ── The shelf ──
  var shelfEl = document.getElementById("shelf"), shelfRow = document.getElementById("shelfRow"), kwTimer = 0;
  function kwBuildSoon() { clearTimeout(kwTimer); kwTimer = setTimeout(kwBuild, 300); }
  function shelfOn() { return KW.items.length > 0; }
  // Over the app you're on (Settings › Home screen › Keep watching › Shows up, the default; owner, 24 November 2026: "only
  // show up when you're over that specific app"): the row holds what you had on in the highlighted app (Plex's shows
  // over Plex, channels over Live TV, stations over Radio, videos over Files); over an app with none, your cards. The
  // app name glides down when the app you're on has nothing on the row.
  function kwOwnerOf(e) { return e.k === "tv" ? LIVETV_ID : e.k === "radio" ? RADIO_ID : e.k === "file" ? "files" : e.pkg || e.id; }
  function kwOwnerNow() {
    if (KW.focus || wxFocus || typeof tileRows === "undefined" || row >= tileRows || !ROWS[row] || !ROWS[row][col]) return KW.owner;
    return ROWS[row][col].id;
  }
  function kwBuild() {
    KW.kw = kwItems();
    KW.cards = myCards().filter(cardShown).map(function (c) { return { k: "card", id: c.id, c: c }; });
    KW.owner = kwOwnerNow();
    kwFill();
    if (typeof fitSoon === "function") fitSoon();
    if (ROWS.length && ROWS[row] && ROWS[row][col]) render(); else kwPaint();   // the title over the shelf follows too
  }
  function kwFollow() {                                    // render() calls this: the highlighted app changed
    if (!KW.kw || PREFS.kwWhere === "row") return;
    var o = kwOwnerNow();
    if (o === KW.owner) return;
    KW.owner = o; KW.idx = 0; KW.win = 0;
    kwFill();
  }
  function kwFill() {
    var all = PREFS.kwWhere === "row", kw = KW.kw || [], cards = KW.cards || [];
    var mine = all ? kw : kw.filter(function (e) { return kwOwnerOf(e) === KW.owner; });
    KW.items = all ? kw.concat(cards) : mine.length ? mine : cards;
    KW.idx = Math.max(0, Math.min(KW.idx, KW.items.length - 1));
    if (!KW.items.length) KW.focus = false;
    // kw-any: something is on the shelf somewhere (the clock panel is sized to leave its room, so it never resizes as you
    // move). has-shelf: something is on it for this app, so the app name slides up over it; with nothing for the app
    // you're on, the row fades and the name slides back down (owner: "fixes itself when you're not over an app").
    document.body.classList.toggle("kw-any", kw.length + cards.length > 0);
    document.body.classList.toggle("has-shelf", KW.items.length > 0);
    shelfEl.classList.toggle("empty", !KW.items.length);
    shelfRow.innerHTML = "";
    KW.items.forEach(function (e, i) {
      var el = document.createElement("div"), sec = i === 0 ? (e.k === "card" ? "Your cards" : "Keep watching") : e.k === "card" && KW.items[i - 1].k !== "card" ? "Your cards" : "";
      el.className = "sh-card";
      if (sec) { var h = document.createElement("div"); h.className = "sh-sec"; h.textContent = T(sec); el.appendChild(h); }
      kwArt(el, e);
      shelfRow.appendChild(el);
    });
    shelfRow.style.transform = "translateX(0)";
    shelfRow.classList.remove("in"); void shelfRow.offsetWidth; shelfRow.classList.add("in");   // a soft fade as it changes
  }
  function kwArt(el, e) {                                  // each card's face; names come from playlists and stations: text only
    var face = document.createElement("div"), t = document.createElement("b"), s = document.createElement("small");
    face.className = "sh-face";
    if (e.k === "show" || e.k === "plex") {
      var pid = e.pkg || e.id, ai = appItem(pid), pr = e.dur > 60000 ? Math.min(1, e.pos / e.dur) : 0;
      var chn = kwChannel(e);
      if (chn && !e.art) {                                 // a Fox One channel: its wordmark, the show under it
        face.className = "sh-face sh-chan ch-" + e.ch;
        var wm = document.createElement("div"); wm.className = "ch-mark"; wm.textContent = chn[0]; face.appendChild(wm);
        var live = document.createElement("i"); live.className = "sh-live"; live.textContent = "LIVE"; face.appendChild(live);
        t.textContent = e.n || chn[1]; s.textContent = chn[1] + " · " + kwAppName(e);
        face.appendChild(t); face.appendChild(s);
        el.appendChild(face); return;
      }
      if (e.art) {
        face.className = "sh-face sh-show";
        var pic = new Image(); pic.alt = ""; pic.className = "sh-pic";
        pic.addEventListener("error", function () { pic.remove(); face.classList.add("noart"); });
        pic.src = e.art; face.appendChild(pic);
        var tag = document.createElement("i"); tag.className = "sh-app"; tag.textContent = kwAppName(e); face.appendChild(tag);
        t.textContent = e.n || kwAppName(e); s.textContent = e.sub || kwLeft(e);
      } else {                                             // no picture: the app's own tile, the title over it
        face.className = "sh-face tile sh-show-tile " + ai.cls;
        if (ai.art) face.innerHTML = ai.art; else { var sp0 = document.createElement("span"); sp0.textContent = ai.name; face.appendChild(sp0); }
        addBanner(face, tileArtOf(pid) || BANNERS[pid]);
        if (e.n) { var cap = document.createElement("div"); cap.className = "sh-cap"; cap.textContent = e.n; face.appendChild(cap); }
      }
      if (pr > 0 && pr < .97) { var bar = document.createElement("div"); bar.className = "sh-prog"; var fl = document.createElement("i"); fl.style.transform = "scaleX(" + pr.toFixed(3) + ")"; bar.appendChild(fl); face.appendChild(bar); }
      if (e.art) { face.appendChild(t); if (s.textContent) face.appendChild(s); }
      el.appendChild(face); return;
    }
    if (e.k === "app") {
      var it = appItem(e.id);
      face.className = "sh-face tile " + it.cls;
      if (it.art) face.innerHTML = it.art; else { var sp = document.createElement("span"); sp.textContent = it.name; face.appendChild(sp); }
      addBanner(face, tileArtOf(e.id) || BANNERS[e.id]);
      el.appendChild(face); return;
    }
    if (e.k === "tv") { face.classList.add("sh-tv"); face.innerHTML = '<i class="sh-live">LIVE</i>'; t.textContent = e.n; s.textContent = "Live TV"; }
    else if (e.k === "radio") {
      face.classList.add("sh-radio");
      var lg = document.createElement("div"); lg.className = "sh-logo"; lg.textContent = rdCall(e.s.n) || "📻";
      if (e.s.f) { var im = new Image(); im.alt = ""; im.addEventListener("load", function () { lg.textContent = ""; lg.appendChild(im); lg.classList.add("img"); }); im.src = e.s.f; }
      face.appendChild(lg); t.textContent = e.s.n; s.textContent = RD.now && RD.now.id === e.s.id ? "Playing now" : "Radio";
    }
    else if (e.k === "file") { face.classList.add("sh-file"); face.innerHTML = '<i class="sh-play"></i>'; t.textContent = e.n.replace(/\.[a-z0-9]{2,4}$/i, ""); s.textContent = e.audio ? "Music · Files" : "Video · Files"; }
    else if (e.k === "card") {
      var c = e.c;
      face.classList.add("sh-" + c.type);
      if (c.type === "count") {
        var n = cardDays(c), big = document.createElement("div");
        big.className = "sh-big"; big.textContent = n === 0 ? T("Today") : n === 1 ? T("Tomorrow") : n;
        if (n > 1) { var u = document.createElement("em"); u.textContent = T("days"); big.appendChild(u); }
        face.appendChild(big); t.textContent = c.title; s.textContent = "";
      }
      else if (c.type === "note") { t.textContent = c.title; s.textContent = c.text || ""; s.className = "sh-note"; }
      else { face.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'; t.textContent = c.title; s.textContent = cardHost(c.url); }
    }
    face.appendChild(t); if (s.textContent) face.appendChild(s);
    el.appendChild(face);
  }
  var SH_STEP = 292;                                       // the same 256 px + 36 px rhythm as the tiles
  function kwPaint() {
    var cards = shelfRow.children;
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle("focus", KW.focus && i === KW.idx);
    shelfEl.classList.toggle("active", KW.focus);
    var vis = TILE_VIS;
    if (KW.idx < KW.win) KW.win = KW.idx; else if (KW.idx > KW.win + vis - 1) KW.win = KW.idx - vis + 1;
    KW.win = Math.max(0, Math.min(KW.win, KW.items.length - vis));
    shelfRow.style.transform = "translateX(" + (-KW.win * SH_STEP) + "px)";
    for (var j = 0; j < cards.length; j++) cards[j].classList.toggle("far", j < KW.win || j >= KW.win + vis);
  }
  function kwHero(e) {                                     // the big title and line over the shelf
    if (!e) return { name: "", line: "" };
    if (e.k === "tv") return { name: e.n, line: "Live TV · watched " + kwAgo(e.t) + ". OK plays it in VLC." };
    if (e.k === "radio") return { name: e.s.n, line: (RD.now && RD.now.id === e.s.id ? "Playing now" : "Radio · " + kwAgo(e.t)) + (e.s.loc ? " · " + e.s.loc : "") + "." };
    if (e.k === "file") return { name: e.n, line: "From Files · opened " + kwAgo(e.t) + "." };
    if (e.k === "show" || e.k === "plex") {
      var an = kwAppName(e), left = kwLeft(e);
      if (!e.n) return { name: an, line: "Opened " + kwAgo(e.t) + ". OK picks up in " + an + "." };
      var cn = kwChannel(e);
      return { name: e.n, line: [e.sub, cn ? cn[1] : "", "In " + an, left, kwAgo(e.t)].filter(Boolean).join(" · ") + ". OK opens " + an + "." };
    }
    if (e.k === "app") { var it = appItem(e.id); return { name: it.name, line: "Opened " + kwAgo(e.t) + ". " + it.line }; }
    var c = e.c;
    if (c.type === "count") { var n = cardDays(c); return { name: c.title, line: n === 0 ? "It's today!" : n === 1 ? "Tomorrow." : n + " days to go" + (c.yearly ? ", every year." : ".") }; }
    if (c.type === "note") return { name: c.title, line: c.text || "" };
    return { name: c.title, line: cardHost(c.url) + " · OK opens it in the TV's browser." };
  }
  function kwNav(action) {
    var e = KW.items[KW.idx];
    if (action === "left" && KW.idx > 0) KW.idx--;
    else if (action === "right" && KW.idx < KW.items.length - 1) KW.idx++;
    else if (action === "down" || action === "back") KW.focus = false;
    else if (action === "up") { if (PREFS.homeClock !== "hide") { KW.focus = false; wxFocus = true; } }
    else if (action === "ok") { kwOpen(e); return; }
    else if ((action === "menu" || action === "hold") && e) { openDockCard("kw"); return; }
    else return;
    render();
  }
  function kwOpen(e) {
    if (!e) return;
    if (e.k === "tv") ltPlay({ l: e.l, p: e.p, n: e.n });
    else if (e.k === "radio") { rdPlay(e.s); toast("Playing " + e.s.n); kwBuildSoon(); }
    else if (e.k === "file") {
      if (!app || !app.filesOpen) { toast("Would open " + e.n); return; }
      var r = app.filesOpen(e.id);
      if (r === "ok") kwAdd(e); else toast(r === "noapp" ? "No app here plays it any more" : e.n + " isn't there any more");
    }
    else if (e.k === "plex") {
      if (!app || !app.plexOpen) { toast("Would play " + e.n + " in Plex"); return; }
      if (!app.plexOpen(e.server, e.key)) toast("Plex isn't on this TV");
    }
    else if (e.k === "show" && app && app.showOpen) {     // the app's own channel or player screen where it can
      recordLaunch(e.id); reorderPending = true;
      if (app.showOpen(e.id, e.mid || "")) kwOpened(e.id);
    }
    else if (e.k === "app" || e.k === "show") {
      recordLaunch(e.id); reorderPending = true;
      if (app && app.launch) app.launch(e.id); else { toast("Would open " + appItem(e.id).name); setTimeout(window.guestHidden, 1500); }
    }
    else if (e.k === "card" && e.c.type === "link") {
      var lr = app && app.openLink ? app.openLink(e.c.url) : "preview";
      if (lr === "preview") toast("Would open " + cardHost(e.c.url));
      else if (lr === "nobrowser") toast("No web browser on this TV · Silk Browser is free in the Appstore");
      else if (lr !== "ok") toast("That address can't be opened");
    }
    else if (e.k === "card") { openCustom(true); dockEntry = true; cardEdit(e.c); renderCustom(); }   // a note or countdown: edit it
  }
  // The card under hold OK / ☰ (12-dock-and-music's card, kind "kw").
  function kwCardButtons() {
    var e = KW.items[KW.idx];
    if (!e) return [];
    if (e.k === "card") return [[["kwopen", "", e.c.type === "link" ? "Open" : "Edit"], ["kwcards", "", "Your cards"], ["close", "", "Cancel"]]];
    return [[["kwopen", "", e.k === "tv" || e.k === "radio" || e.k === "file" || e.k === "plex" ? "Play" : "Open"], ["kwremove", "", "Remove"], ["close", "", "Cancel"]]];
  }
  setInterval(function () { if (homeVisible && !ambient) kwBuild(); }, 30 * 60000);   // "2 h ago" and countdowns move on
  kwBuild();

  // ── Your own app pictures ── Hold OK on a tile › Change picture opens Files to pick a photo on the TV (one sent from a
  // phone with Share lands in Received). Kept as the file's place on this TV (tileArt), not copied.
  function tileArtOf(id) { var a = load("tileArt") || {}; return a[id] || ""; }
  function tileArtPick(it) {
    FM.pick = { id: it.id, name: it.name };
    openFiles();
    toast("Pick a picture for " + it.name + " · photos you Share from a phone are in Received");
  }
  function tileArtSet(id, path) {
    var a = load("tileArt") || {};
    if (path) a[id] = path; else delete a[id];
    save("tileArt", a);
    layoutTiles(); render(); kwBuild();
  }

  // ── Settings › Home screen › Your cards ──
  var CARD = null;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function cardEdit(c) {
    var now = new Date();
    CARD = c ? JSON.parse(JSON.stringify(c)) : null;
    custMode = "cardedit"; custRow = 0;
  }
  function cardNew(type) {
    var now = new Date(), soon = new Date(now.getTime() + 30 * 86400000);
    CARD = { id: "c" + Date.now().toString(36), type: type, title: "", text: "", url: "https://", y: soon.getFullYear(), m: soon.getMonth(), d: soon.getDate(), yearly: false, isNew: true };
    custMode = "cardedit"; custRow = 0;
  }
  function cardSummary(c) {
    if (c.type === "count") { var n = cardDays(c); return n < 0 ? "Passed" : n === 0 ? "Today" : n + " day" + (n === 1 ? "" : "s"); }
    if (c.type === "note") return "Note";
    return cardHost(c.url) || "Web link";
  }
  function cardRows() {
    if (custMode === "cards") {
      var rows = myCards().map(function (c) { return { label: c.title, value: cardSummary(c) + "  ›", act: true, card: c.id }; });
      rows.push({ label: "Add a countdown", value: "›", act: true, id: "new:count" });
      rows.push({ label: "Add a note", value: "›", act: true, id: "new:note" });
      rows.push({ label: "Add a web link", value: "›", act: true, id: "new:link" });
      rows.push({ label: "Cards show on the home screen after Keep watching: the days to a trip or a birthday, a note for the family, a page you open often.", act: true, none: true });
      return rows;
    }
    var c = CARD;
    if (!c) return [{ label: "Nothing to edit", act: true, none: true }];
    var r = [{ label: "Title", value: (c.title || "Type a title") + "  ›", act: true, id: "title" }];
    if (c.type === "count") {
      r.push({ label: "Month", value: T(MONTHS[c.m]), act: true, adj: true, id: "month" });
      r.push({ label: "Day", value: String(c.d), act: true, adj: true, id: "day" });
      if (!c.yearly) r.push({ label: "Year", value: String(c.y), act: true, adj: true, id: "year" });
      r.push({ label: "Every year", value: c.yearly ? "Yes, like a birthday" : "No, once", act: true, adj: true, id: "yearly" });
    }
    if (c.type === "note") r.push({ label: "Text", value: (c.text ? c.text.slice(0, 30) + (c.text.length > 30 ? "…" : "") : "Type the note") + "  ›", act: true, id: "text" });
    if (c.type === "link") r.push({ label: "Address", value: (cardHost(c.url) || "Type the address") + "  ›", act: true, id: "url" });
    r.push({ label: c.isNew ? "Add card" : "Save card", value: "", act: true, id: "save" });
    if (!c.isNew) r.push({ label: c.sure ? "Press OK again to remove it" : "Remove card", value: "", act: true, id: "del" });
    return r;
  }
  function cardNav(action, rows) {
    var r = rows[custRow], step = action === "left" ? -1 : 1;
    if (!r) return;
    if (custMode === "cards") {
      if (action !== "ok" && action !== "right") return;
      if (r.card) cardEdit(myCards().filter(function (x) { return x.id === r.card; })[0]);
      else if (r.id && r.id.indexOf("new:") === 0) cardNew(r.id.slice(4));
      return;
    }
    var c = CARD;
    if (!c) return;
    var dim = function () { return new Date(c.yearly ? 2024 : c.y, c.m + 1, 0).getDate(); };   // 2024: Feb 29 allowed for yearly
    if (r.id === "title" && action === "ok") { kbField = "cardtitle"; kbText = c.title; kbIdx = 0; kbShift = !c.title; custMode = "search"; }
    else if (r.id === "text" && action === "ok") { kbField = "cardtext"; kbText = c.text; kbIdx = 0; kbShift = !c.text; custMode = "search"; }
    else if (r.id === "url" && action === "ok") { kbField = "cardurl"; kbText = c.url || "https://"; kbIdx = 0; kbShift = false; custMode = "search"; }
    else if (r.id === "month" && action !== "ok") { c.m = (c.m + step + 12) % 12; c.d = Math.min(c.d, dim()); }
    else if (r.id === "day" && action !== "ok") { var n = dim(); c.d = ((c.d - 1 + step + n) % n) + 1; }
    else if (r.id === "year" && action !== "ok") { var y0 = new Date().getFullYear(); c.y = Math.max(y0, Math.min(y0 + 20, c.y + step)); c.d = Math.min(c.d, dim()); }
    else if (r.id === "yearly" && action !== "ok") c.yearly = !c.yearly;
    else if (r.id === "save" && action === "ok") {
      if (!c.title.trim()) { toast("Give the card a title first"); custRow = 0; return; }
      if (c.type === "link" && !cardHost(c.url)) { toast("Type the page's address first"); return; }
      if (c.type === "count" && cardDays(c) < 0) { toast("That date has passed · pick a day ahead, or Every year"); return; }
      var keep = { id: c.id, type: c.type, title: c.title.trim().slice(0, 40) };
      if (c.type === "count") { keep.m = c.m; keep.d = c.d; keep.yearly = !!c.yearly; if (!c.yearly) keep.y = c.y; }
      if (c.type === "note") keep.text = (c.text || "").trim().slice(0, 120);
      if (c.type === "link") keep.url = c.url.trim();
      var list = myCards(), at = list.map(function (x) { return x.id; }).indexOf(c.id);
      if (at >= 0) list[at] = keep; else list.push(keep);
      save("myCards", list.slice(0, 12)); kwBuild();
      toast(c.isNew ? "Added to your home screen" : "Saved"); CARD = null; custMode = "cards"; custRow = 0;
      if (dockEntry) closeCustom();
    }
    else if (r.id === "del" && action === "ok" && !c.sure) c.sure = true;   // removing asks twice
    else if (r.id === "del" && action === "ok") {
      save("myCards", myCards().filter(function (x) { return x.id !== c.id; })); kwBuild();
      toast("Card removed"); CARD = null; custMode = "cards"; custRow = 0;
      if (dockEntry) closeCustom();
    }
  }
  // The keyboard's ✓ for a card's title, note or address (from 23-customize's keyboard).
  function cardTyped(field, text) {
    if (!CARD) return;
    if (field === "cardtitle") CARD.title = text.trim().slice(0, 40);
    else if (field === "cardtext") CARD.text = text.trim().slice(0, 120);
    else if (field === "cardurl") {
      var u = text.trim();
      if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
      if (u && !cardHost(u)) toast("That doesn't look like a web address");
      CARD.url = u;
    }
    custMode = "cardedit"; custRow = field === "cardtitle" ? 1 : 0;
  }

  // Preview on a computer: ?kw=demo puts two apps' shows on the shelf.
  if (!app && /[?&]kw=demo/.test(location.search)) setTimeout(function () {
    var c = document.createElement("canvas"); c.width = 384; c.height = 216;
    var g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 384, 216);
    gr.addColorStop(0, "#d9774a"); gr.addColorStop(.55, "#6b2f5f"); gr.addColorStop(1, "#1b1636");
    g.fillStyle = gr; g.fillRect(0, 0, 384, 216);
    g.fillStyle = "rgba(255,220,170,.9)"; g.beginPath(); g.arc(270, 92, 34, 0, 7); g.fill();
    g.fillStyle = "#120f22"; g.fillRect(0, 150, 384, 66);
    window.guestWatch({ pkg: "com.fox.foxone", app: "Fox One", title: "Hannity", sub: "", pos: 0, dur: 0, art: "", ch: "foxnews" });
    window.guestWatch({ pkg: "com.plexapp.android", app: "Plex", title: "The Long Road Home", sub: "Season 2 · Episode 4", pos: 1500000, dur: 3300000, art: c.toDataURL("image/jpeg", .8) });
  }, 400);
