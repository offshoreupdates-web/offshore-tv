  // ---- Radio ------------------------------------------------------------------------------------------------------
  // Internet radio from Radio Browser (radio-browser.info): a free, open, community directory of stations' own public
  // streams. No key and no account; Offshore only lists what's there and plays the station's own stream.
  // Owner: "smart, based off the user's current location it gives you what's local, and you can favorite stations".
  //   Near you   FM and AM stations the FCC licenses near this TV, matched by call sign (when the FCC answers), plus
  //              stations the directory itself places within 100 km, nearest first.
  //   <State>    the rest of this state's stations, most listened first.
  //   Browse     News & talk, Sports, Country... across the US (the TV's location is US-only, like the weather).
  //   Favorites  and Recently played: whole station records kept on this TV, so they open at once and still work
  //              if the directory is down.
  // Plays in Android's own player (Home.radioPlay), which takes audio focus like a music app. https only (the app
  // doesn't allow plain http), so an http link is tried over https first; a station with no secure stream says so.
  // Nothing loads until Radio is opened; lists are kept for the session (Near you for a week, or until the TV moves).
  var RADIO_ID = "offshore:radio";
  CATALOG[RADIO_ID] = { name: "Radio", line: "Local stations near you and radio from anywhere, with your favorites.", cls: "b-radio", art: "<span><i></i>Radio</span>" };
  var RB = "https://all.api.radio-browser.info/json/";
  var RD = { open: false, side: "groups", gi: 0, ci: 0, items: [], pop: null, now: null, status: "", lists: {}, busy: {}, q: "" };
  var RD_KINDS = [
    { id: "news", name: "News & talk", icon: "📰", tag: "news" }, { id: "npr", name: "Public radio", icon: "🎙", tag: "npr" },
    { id: "sports", name: "Sports", icon: "🏈", tag: "sports" }, { id: "pop", name: "Pop & hits", icon: "🎤", tag: "top 40" },
    { id: "rock", name: "Rock", icon: "🎸", tag: "rock" }, { id: "classicrock", name: "Classic rock", icon: "📀", tag: "classic rock" },
    { id: "country", name: "Country", icon: "🤠", tag: "country" }, { id: "hiphop", name: "Hip hop & R&B", icon: "🎧", tag: "hip hop" },
    { id: "oldies", name: "Oldies", icon: "📻", tag: "oldies" }, { id: "jazz", name: "Jazz", icon: "🎷", tag: "jazz" },
    { id: "classical", name: "Classical", icon: "🎻", tag: "classical" }, { id: "christian", name: "Christian", icon: "✝", tag: "christian" },
    { id: "latin", name: "Latin", icon: "💃", tag: "latin" }
  ];
  // Holiday: holiday music stations. The directory's tags are loose ("christmas music" is on
  // country stations that play some at Christmas), so a station is kept when its name says it (Christmas, Xmas, Holiday,
  // Santa, Noel, Navidad, Halloween); several tags and a name search are merged. In season (1 Nov to 6 Jan, and October
  // for Halloween) it sits at the top of Radio, after Near you; the rest of the year it's last in Browse.
  var RD_HOLIDAY = { id: "holiday", name: "Holiday", icon: "🎄", tags: ["christmas", "christmas music", "holiday", "xmas"], names: ["christmas", "holiday"],
    fit: /christmas|x-?mas|holiday|santa|no[eë]l|navidad|yule|winter ?wonder|halloween/i };
  function rdSeason() {
    var d = new Date(), m = d.getMonth(), day = d.getDate();
    return m === 9 ? "halloween" : m === 10 || m === 11 || (m === 0 && day <= 6) ? "christmas" : "";
  }
  // (NOAA Weather Radio: the directory has few streams, mostly far away; one near this TV shows in Near you)
  var US_STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
    DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
    KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
    SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico" };

  function rdHere() {                                     // { lat, lon, state: "Pennsylvania", city } or null (no US location yet)
    var L = typeof LOC !== "undefined" ? LOC : null;
    if (!L || L.unsupported || L.lat == null) return null;
    var m = String(L.name || "").match(/^(.*?),\s*([A-Z]{2})$/);
    return { lat: L.lat, lon: L.lon, state: m && US_STATES[m[2]] ? US_STATES[m[2]] : "", city: m ? m[1] : L.name || "" };
  }
  function rdGet(path) {                                  // the directory answers pages directly (it allows any origin)
    var ctl = window.AbortController ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 12000);
    return fetch(RB + path, ctl ? { signal: ctl.signal } : {}).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function rdTidy(n) { return String(n || "").replace(/\s+/g, " ").replace(/^[\s\-_|.]+|[\s\-_|.]+$/g, "").slice(0, 60) || "Station"; }
  function rdSt(s) {                                      // a directory record -> what Offshore keeps
    return { id: s.stationuuid, n: rdTidy(s.name), u: s.url_resolved || s.url, f: /^https:\/\//.test(s.favicon || "") ? s.favicon : "",
             t: String(s.tags || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 3).join(", "),
             st: String(s.state || "").replace(/\s*\(.*\)$/, ""), la: s.geo_lat, lo: s.geo_long, br: s.bitrate || 0 };
  }
  function rdClean(list) {                                // one row per station: no duplicates by id or by name
    var seen = {};
    return list.filter(function (s) {
      var k = s.n.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!s.u || seen[s.id] || seen["n" + k]) return false;
      seen[s.id] = seen["n" + k] = 1; return true;
    });
  }
  function rdCall(name) {                                 // a US call sign in a station's name ("WXPN 88.5" -> "WXPN"), or ""
    var m = (" " + String(name).toUpperCase() + " ").match(/[^A-Z0-9]([KW][A-Z]{2,3})(?:-?(?:FM|AM|LP|HD\d?|DB))?[^A-Z0-9]/);
    return m ? m[1] : "";
  }

  // Favorites and recently played: whole records, newest first for recent.
  function rdFavs() { return load("radioFav") || []; }
  function rdIsFav(s) { return rdFavs().some(function (x) { return x.id === s.id; }); }
  function rdRecent() { return load("radioRecent") || []; }

  // The FCC's FM and AM stations within about 100 km (call sign -> "88.5 FM · Philadelphia"), kept a month. The FCC
  // sometimes refuses apps; then Near you uses the directory's own locations only.
  function rdFcc(h) {
    var d = load("radioFcc");
    if (d && km(d.lat, d.lon, h.lat, h.lon) < 30 && Date.now() - d.t < (d.ok ? 30 : 1) * 86400000) return Promise.resolve(d.calls);
    var dms = function (v) { v = Math.abs(v); var g = Math.floor(v), m = Math.floor((v - g) * 60), sx = Math.round(((v - g) * 60 - m) * 60); return [g, m, Math.min(59, sx)]; };
    var a = dms(h.lat), o = dms(h.lon);
    var tail = "&dist=100&dlat2=" + a[0] + "&mlat2=" + a[1] + "&slat2=" + a[2] + "&NS=" + (h.lat < 0 ? "S" : "N") +
               "&dlon2=" + o[0] + "&mlon2=" + o[1] + "&slon2=" + o[2] + "&EW=" + (h.lon < 0 ? "W" : "E") + "&size=9";
    var parse = function (t, band, calls) {
      String(t || "").split("\n").forEach(function (line) {
        var f = line.split("|"); if (f.length < 12) return;
        var call = f[1].trim().toUpperCase().replace(/-(FM|AM|LP|FX)\d*$/, ""), fr = parseFloat(f[2]), city = f[10].trim();
        if (!/^[KW][A-Z]{2,3}$/.test(call) || !fr || calls[call]) return;
        calls[call] = (band === "FM" ? fr.toFixed(1) : Math.round(fr)) + " " + band + (city ? " · " + city.toLowerCase().replace(/\b[a-z]/g, function (x) { return x.toUpperCase(); }) : "");
      });
    };
    var calls = {};
    return Promise.all([
      getText("https://transition.fcc.gov/fcc-bin/fmq?list=4&serv=FM&status=L" + tail).then(function (t) { parse(t, "FM", calls); }, function () {}),
      getText("https://transition.fcc.gov/fcc-bin/amq?list=4&serv=AM&status=L" + tail).then(function (t) { parse(t, "AM", calls); }, function () {})
    ]).then(function () {
      var ok = Object.keys(calls).length > 0;
      save("radioFcc", { lat: h.lat, lon: h.lon, t: Date.now(), ok: ok, calls: calls });
      return calls;
    });
  }

  // Near you and this state, built together (one state list, one nearby list, the FCC's call signs).
  function rdLoadLocal() {
    var h = rdHere();
    if (!h) { RD.lists.near = RD.lists.state = []; return; }
    var c = load("radioNear");
    if (c && km(c.lat, c.lon, h.lat, h.lon) < 30 && Date.now() - c.t < 7 * 86400000) { RD.lists.near = c.near; RD.lists.state = c.state; return; }
    if (RD.busy.near) return;
    RD.busy.near = RD.busy.state = true;
    var q = "&hidebroken=true&order=clickcount&reverse=true";
    Promise.all([
      h.state ? rdGet("stations/search?countrycode=US&state=" + encodeURIComponent(h.state) + q + "&limit=300").catch(function () { return null; }) : Promise.resolve([]),
      rdGet("stations/search?geo_lat=" + h.lat.toFixed(3) + "&geo_long=" + h.lon.toFixed(3) + "&geo_distance=100000" + q + "&limit=150").catch(function () { return null; }),
      rdFcc(h).catch(function () { return {}; })
    ]).then(function (r) {
      if (!r[0] && !r[1]) { RD.fail = true; return; }    // the directory didn't answer: try again next time Radio opens
      var calls = r[2] || {}, all = rdClean((r[0] || []).concat(r[1] || []).map(rdSt)), near = [], rest = [];
      all.forEach(function (s) {
        var call = rdCall(s.n), d = s.la != null && s.lo != null ? km(h.lat, h.lon, s.la, s.lo) : null;
        if (call && calls[call]) { s.call = call; s.loc = calls[call]; near.push(s); }
        else if (d != null && d <= 100) { s.km = d; near.push(s); }
        else if (!h.state || s.st.indexOf(h.state) === 0) rest.push(s);
      });
          // Licensed stations first (most listened first, as the directory sorted them), then the rest by distance.
      near.sort(function (a, b) { return (a.call ? 0 : 1) - (b.call ? 0 : 1) || (a.call ? 0 : (a.km || 0) - (b.km || 0)); });
      RD.lists.near = near; RD.lists.state = rest;
      if (near.length || rest.length) save("radioNear", { lat: h.lat, lon: h.lon, t: Date.now(), near: near, state: rest });
    }).then(function () { RD.busy.near = RD.busy.state = false; rdRefresh(); }, function () { RD.busy.near = RD.busy.state = false; rdRefresh(); });
  }
  function rdLoadHoliday(k) {
    RD.busy[k.id] = true;
    var hw = rdSeason() === "halloween", q = "hidebroken=true&order=clickcount&reverse=true&limit=100";
    var asks = k.tags.concat(hw ? ["halloween"] : []).map(function (t) { return rdGet("stations/search?countrycode=US&tag=" + encodeURIComponent(t) + "&" + q); })
      .concat(k.names.concat(hw ? ["halloween"] : []).map(function (n) { return rdGet("stations/search?name=" + encodeURIComponent(n) + "&" + q); }));
    Promise.all(asks.map(function (p) { return p.then(null, function () { return null; }); })).then(function (res) {
      if (res.every(function (r) { return !r; })) { RD.lists[k.id] = null; RD.fail = true; return; }
      var all = [], seen = {};
      res.forEach(function (r) { (r || []).forEach(function (x) { if (!seen[x.stationuuid]) { seen[x.stationuuid] = 1; all.push(x); } }); });
      all.sort(function (a, b) { return (b.clickcount || 0) - (a.clickcount || 0); });
      var list = rdClean(all.map(rdSt)).filter(function (x) { return k.fit.test(x.n); });
      if (hw) list = list.filter(function (x) { return /halloween/i.test(x.n); }).concat(list.filter(function (x) { return !/halloween/i.test(x.n); }));
      RD.lists[k.id] = list.slice(0, 120);
    }).then(function () { RD.busy[k.id] = false; rdRefresh(); });
  }
  function rdLoadKind(k) {
    if (RD.lists[k.id] || RD.busy[k.id]) return;
    if (k.tags) { rdLoadHoliday(k); return; }
    RD.busy[k.id] = true;
    rdGet("stations/search?countrycode=US&tag=" + encodeURIComponent(k.tag) + "&hidebroken=true&order=clickcount&reverse=true&limit=80").then(function (j) {
      var list = rdClean(j.map(rdSt)), h = rdHere();
      if (h && h.state) {                          // your state's stations first, each part still most listened first
        var mine = list.filter(function (x) { return x.st.indexOf(h.state) === 0; });
        list = mine.concat(list.filter(function (x) { return x.st.indexOf(h.state) !== 0; }));
      }
      RD.lists[k.id] = list;
    }, function () { RD.lists[k.id] = null; RD.fail = true; }).then(function () { RD.busy[k.id] = false; rdRefresh(); });
  }
  function rdSearch(q) {
    RD.q = q; RD.lists.search = null; RD.busy.search = true;
    rdGet("stations/search?name=" + encodeURIComponent(q) + "&hidebroken=true&order=clickcount&reverse=true&limit=60").then(function (j) {
      RD.lists.search = rdClean(j.map(rdSt));            // search reaches every country
    }, function () { RD.lists.search = []; RD.fail = true; }).then(function () { RD.busy.search = false; rdRefresh(); });
  }

  function rdBuild() {
    var h = rdHere(), items = [
      { id: "fav", name: "Favorites", icon: "★", list: rdFavs() },
      { id: "recent", name: "Recently played", icon: "🕘", list: rdRecent() },
      { head: h ? h.city || "Near you" : "Near you" },
      { id: "near", name: "Near you", icon: "📍", list: RD.lists.near || [], loading: !RD.lists.near },
      { id: "state", name: h && h.state ? "All of " + h.state : "Your state", icon: "🗺", list: RD.lists.state || [], loading: !RD.lists.state }
    ];
    var hk = RD_HOLIDAY, hItem = { id: "k:" + hk.id, kind: hk, name: hk.name, icon: rdSeason() === "halloween" ? "🎃" : hk.icon, list: RD.lists[hk.id] || [], loading: !RD.lists[hk.id] };
    if (rdSeason()) items.push({ head: "This season" }, hItem);
    items.push({ head: "Browse" });
    (rdSeason() ? RD_KINDS : RD_KINDS.concat([hk])).forEach(function (k) { items.push({ id: "k:" + k.id, kind: k, name: k.name, icon: k.icon, list: RD.lists[k.id] || [], loading: !RD.lists[k.id] }); });
    items.push({ head: "Find" });
    items.push({ id: "search", name: RD.q ? "“" + RD.q + "”" : "Search…", icon: "🔍", list: RD.lists.search || [], loading: !!RD.busy.search, find: true });
    RD.items = items;
  }
  function rdItem() { return RD.items[RD.gi] || { list: [] }; }
  function rdRefresh() { if (RD.open) { var keep = rdItem().id; rdBuild(); var gi = RD.items.map(function (x) { return x.id; }).indexOf(keep); if (gi >= 0) RD.gi = gi; renderRadio(); } renderDock(); }
  function rdWant(g) {                                    // load what the highlighted group needs
    if (!g) return;
    if (g.id === "near" || g.id === "state") rdLoadLocal();
    else if (g.kind) rdLoadKind(g.kind);
  }

  function openRadio() {
    if (custOpen) closeCustom();
    RD.fail = false;
    rdLoadLocal();
    rdBuild();
    RD.open = true; RD.side = "groups"; RD.ci = 0; RD.pop = null;
    var start = RD.items.map(function (x) { return x.id; }).indexOf(rdFavs().length ? "fav" : "near");   // Favorites if any, else Near you
    RD.gi = start < 0 ? 0 : start;
    rdWant(rdItem());
    document.getElementById("radio").classList.add("open");
    document.body.classList.add("bigpanel");
    document.getElementById("sysdim").classList.add("open");
    renderRadio();
  }
  function closeRadio() {
    RD.open = false; RD.pop = null;
    document.getElementById("radio").classList.remove("open", "popping");
    if (!FM.open && !LT.open) document.body.classList.remove("bigpanel");
    document.getElementById("rdPop").classList.remove("open");
    if (!sysOpen && !custOpen && !weekOpen && !dockCard && !FM.open && !LT.open) document.getElementById("sysdim").classList.remove("open");
  }

  var RD_VIS = 8;
  function rdLogo(s) {                                    // the station's own logo over its monogram (a logo that won't load just goes)
    var call = rdCall(s.n), w = s.n.replace(/[^A-Za-z\s]/g, " ").trim().split(/\s+/).filter(Boolean);
    var m = ltMono(s.n).replace(/>[^<]*<\/i>$/, ">" + esc(call || ((w[0] || "?").charAt(0) + (w[1] ? w[1].charAt(0) : (w[0] || "").charAt(1) || "")).toUpperCase()) + "</i>");
    if (call) m = m.replace('class="fm-ico lt-mono"', 'class="fm-ico lt-mono rd-call"');
    return s.f ? m.replace(/<\/i>$/, '<img alt="" src="' + esc(s.f) + '"></i>').replace('class="fm-ico lt-mono"', 'class="fm-ico lt-mono rd-logo"') : m;
  }
  function rdWhere(s) {                                   // the right-hand detail: frequency and city, distance, or state
    if (s.loc) return s.loc;
    if (s.km != null && s.km < 1e9) return Math.max(1, Math.round(s.km * 0.621)) + " mi away";
    return s.st || (s.br ? s.br + " kbps" : "");
  }
  function rdPlaying(s) { return RD.now && s && RD.now.id === s.id; }
  function renderRadio() {
    var its = RD.items, gStart = ltWindow(its.length, RD.gi, 12), favN = rdFavs().length;
    document.getElementById("rdSum").innerHTML = RD.now ? '<span class="rd-eq' + (RD.status === "playing" ? " on" : "") + '"><i></i><i></i><i></i></span> ' +
      esc(RD.now.n) + (RD.status === "buffering" ? " · tuning in…" : "") : (favN ? "<b>" + favN + "</b> favorite" + (favN === 1 ? "" : "s") : "Radio");
    // The groups use the places column's own row (".fm-pl"), whose icon holder suits an emoji.
    document.getElementById("rdGroups").innerHTML = its.slice(gStart, gStart + 12).map(function (g, k) {
      var i = gStart + k;
      if (g.head) return '<div class="lt-h">' + esc(g.head) + "</div>";
      var f = RD.side === "groups" && i === RD.gi;
      var n = g.list.length ? String(g.list.length) : g.loading && (RD.busy[g.id === "near" || g.id === "state" ? "near" : g.kind ? g.kind.id : g.id]) ? "…" : "";
      return '<div class="fm-pl' + (f ? " focus" : i === RD.gi ? " on" : "") + '"><span class="lt-gi">' + esc(g.icon) + '</span><div class="tx"><div class="t">' + esc(g.name) +
        "</div><small>" + esc(n) + "</small></div></div>";
    }).join("");
    var g = rdItem(), list = g.list, cStart = ltWindow(list.length, RD.ci, RD_VIS);
    document.getElementById("rdPath").innerHTML = '<span class="lt-hn">' + esc(g.icon + "  " + g.name) + "</span>";
    var loadingNow = g.id === "near" || g.id === "state" ? RD.busy.near : g.kind ? RD.busy[g.kind.id] : g.find ? RD.busy.search : false;
    var empty = loadingNow ? "Finding stations…"
      : g.id === "fav" ? "No favorites yet. Highlight a station and press ☰ (or hold OK) to add it here."
      : g.id === "recent" ? "Stations you play show up here."
      : g.find ? "Press OK to search every station in the world by name, like “WXPN” or “jazz”."
      : (g.id === "near" || g.id === "state") && !rdHere() ? "Set your location first: Settings › Location."
      : RD.fail ? "Couldn't reach the station directory. Check the internet connection and try again." : "No stations here.";
    var lEl = document.getElementById("rdList"), focus = null;
    lEl.innerHTML = list.length ? list.slice(cStart, cStart + RD_VIS).map(function (s, k) {
      var i = cStart + k, on = RD.side === "list" && i === RD.ci;
      if (on) focus = s;
      return '<div class="fm-row rd-row' + (on ? " focus" : "") + (rdPlaying(s) ? " playing" : "") + '">' + rdLogo(s) +
        '<span class="rd-n"><span class="fm-n">' + esc(s.n) + (g.id !== "fav" && rdIsFav(s) ? ' <em class="lt-star">★</em>' : "") + "</span>" +
        (s.t ? '<span class="fm-k">' + esc(s.t) + "</span>" : "") + "</span>" +
        '<span class="fm-s">' + esc(rdWhere(s)) + "</span>" +
        '<span class="rd-st">' + (rdPlaying(s) ? '<span class="rd-eq' + (RD.status === "playing" ? " on" : "") + '"><i></i><i></i><i></i></span>' : "") + "</span></div>";
    }).join("") : '<div class="fm-empty">' + esc(empty) + "</div>";
    lEl.classList.toggle("fade-top", cStart > 0);
    lEl.classList.toggle("fade-bot", cStart + RD_VIS < list.length);
    Array.prototype.forEach.call(lEl.querySelectorAll(".rd-logo img"), function (im) {   // no inline handlers (the page's rules)
      im.addEventListener("error", function () { im.remove(); });
      im.addEventListener("load", function () { if (im.naturalWidth < 16) im.remove(); else im.parentNode.classList.add("has"); });
    });
    var info = document.getElementById("rdInfo");
    if (focus) info.innerHTML = "<b>" + esc(focus.n) + '</b><span class="lt-time">' + esc([focus.loc || "", focus.t, focus.br ? focus.br + " kbps" : ""].filter(Boolean).join(" · ")) + "</span>";
    else if (g.id === "near") info.innerHTML = '<span class="lt-time">FM and AM stations within about 60 miles of ' + esc((rdHere() || {}).city || "you") + ", most listened first. Your location is in Settings › Location.</span>";
    else info.innerHTML = '<span class="lt-time">Free radio from stations\' own streams, listed by Radio Browser (radio-browser.info). ☰ on a station adds it to Favorites.</span>';
    document.getElementById("rdFoot").textContent = RD.pop ? "▲ ▼ choose · OK select · Back to cancel" :
      RD.side === "list" ? "▲ ▼ stations · OK " + (focus && rdPlaying(focus) ? "stops" : "plays") + " · ☰ favorite · Back" : "▲ ▼ choose · OK or ▶ the stations · Back closes" + (RD.now ? " (the radio keeps playing)" : "");
    var box = document.getElementById("rdPop");
    document.getElementById("radio").classList.toggle("popping", !!RD.pop);
    box.classList.toggle("open", !!RD.pop);
    if (RD.pop) box.innerHTML = "<h3>" + esc(RD.pop.title) + "</h3>" + (RD.pop.sub ? "<p>" + esc(RD.pop.sub) + "</p>" : "") + '<div class="btns">' +
      RD.pop.btns.map(function (b, i) { return '<div class="sbtn glass' + (i === RD.pop.f ? " focus" : "") + '">' + esc(b[1]) + "</div>"; }).join("") + "</div>";
  }
  function rdMenu(s) {
    var g = rdItem(), fav = rdIsFav(s), btns = [[rdPlaying(s) ? "stop" : "play", rdPlaying(s) ? "Stop" : "▶  Play"], ["fav", fav ? "Remove from Favorites" : "★  Add to Favorites"]];
    if (g.id === "fav") { var at = rdFavs().map(function (x) { return x.id; }).indexOf(s.id); if (at > 0) btns.push(["up", "Move up"]); if (at < rdFavs().length - 1) btns.push(["down", "Move down"]); }
    if (g.id === "recent") btns.push(["forget", "Remove from Recently played"]);
    btns.push(["cancel", "Cancel"]);
    RD.pop = { title: s.n, sub: [s.loc || "", s.t].filter(Boolean).join(" · "), btns: btns, f: 0, s: s };
  }
  function rdDo(what, s) {
    var favs = rdFavs(), at = favs.map(function (x) { return x.id; }).indexOf(s.id);
    if (what === "fav") {
      if (at >= 0) { favs.splice(at, 1); toast("Removed from Favorites"); }
      else { favs.push(rdKeep(s)); toast("★ " + s.n + " is in Favorites"); }
      save("radioFav", favs);
    } else if (what === "up" || what === "down") {
      var j = at + (what === "up" ? -1 : 1);
      if (at >= 0 && j >= 0 && j < favs.length) { var t = favs[at]; favs[at] = favs[j]; favs[j] = t; save("radioFav", favs); RD.ci = j; }
    } else if (what === "forget") save("radioRecent", rdRecent().filter(function (x) { return x.id !== s.id; }));
    else if (what === "play") rdPlay(s);
    else if (what === "stop") rdStop();
    var keep = rdItem().id; rdBuild();
    RD.gi = Math.max(0, RD.items.map(function (x) { return x.id; }).indexOf(keep));
    var n = rdItem().list.length; if (!n) RD.side = "groups"; RD.ci = Math.min(RD.ci, Math.max(0, n - 1));
  }
  function rdKeep(s) { return { id: s.id, n: s.n, u: s.u, f: s.f, t: s.t, st: s.st, loc: s.loc, br: s.br }; }   // what a favorite or recent keeps

  // Playing. The app plays https only; an http link is tried over https (most streaming hosts offer both), then over
  // https without its port: hosts like streamtheworld.com list "http://n.live.streamtheworld.com:3690/X" but answer
  // https on the usual port. Measured 23 November 2026 on 31 http-only Pennsylvania stations: 19 play over https as
  // listed, 2 more without the port, 10 not at all. Those last ones play unencrypted through the app's relay: "relay:http://…" is tried last, and only for a station whose own link is http. The
  // address that worked is remembered (radioWorks) and tried first.
  function rdLinks(s) {
    var u = String(s.u || ""), a = u.replace(/^http:\/\//i, "https://"), b = a.replace(/^(https:\/\/[^\/:?#]+):\d+/i, "$1"), w = (load("radioWorks") || {})[s.id];
    var r = /^http:\/\//i.test(u) ? "relay:" + u : "";
    return [w, a, b, r].filter(function (x, i, l) { return x && (/^https:\/\//i.test(x) || (r && x === r)) && l.indexOf(x) === i; });
  }
  function rdAddr(link) {                                 // what a player opens: a relayed station gets its local address
    if (link.indexOf("relay:") !== 0) return link;
    if (!app) return link.slice(6);                       // the computer preview plays http directly
    return app.radioRelay ? app.radioRelay(link.slice(6)) : "";
  }
  function rdPlay(s) {
    var links = rdLinks(s);
    if (!links.length) { toast("That station's link can't be played"); return; }
    RD.now = rdKeep(s); RD.status = "buffering"; RD.links = links; RD.li = 0; RD.tried = links[0];
    save("radioRecent", [rdKeep(s)].concat(rdRecent().filter(function (x) { return x.id !== s.id; })).slice(0, 15));
    kwAdd({ k: "radio", id: s.id, s: rdKeep(s) });       // Keep watching (24f)
    // The page's own player first: on Fire OS 7 Android's player gave up on endless AAC streams at once ("caching
    // reached eos", seen on the living room Cube with amperwave.net stations) and never said so. Android's player is
    // the second try (some HLS streams), and 15 s without sound on either ends it with a message, never stuck.
    rdHalt();
    RD.mode = "page";
    if (!RD.audio) {
      RD.audio = new Audio();
      RD.audio.addEventListener("playing", function () { if (RD.mode === "page") rdEvent("playing"); });
      RD.audio.addEventListener("waiting", function () { if (RD.mode === "page") rdEvent("buffering"); });
      RD.audio.addEventListener("error", function () { if (RD.mode === "page" && RD.audio.getAttribute("src")) rdFallback(); });
    }
    rdPage(links[0]);
    rdRefresh();
  }
  function rdPage(link) {
    RD.tried = link;
    var url = rdAddr(link);
    if (!url) { rdTune(); setTimeout(rdFallback, 0); return; }   // an older app without the relay: on to the next way
    RD.audio.src = url; RD.audio.play().catch(function () {}); rdTune();
  }
  function rdTune() {                                     // 15 s to start making sound (8 s while another address is left), then the next way, then a message
    clearTimeout(RD.tuneT);
    var more = RD.mode === "page" && RD.links && RD.li < RD.links.length - 1;
    RD.tuneT = setTimeout(function () { if (RD.now && RD.status !== "playing") rdFallback(); }, more ? 8000 : 15000);
  }
  function rdFallback() {
    if (!RD.now) return;
    if (RD.mode === "page" && RD.li < RD.links.length - 1) { rdPage(RD.links[++RD.li]); return; }   // the next address
    if (RD.mode === "page" && app && app.radioPlay) {
      RD.tried = RD.links[0];
      if (RD.audio) { RD.audio.pause(); RD.audio.removeAttribute("src"); try { RD.audio.load(); } catch (e) {} }
      RD.mode = "native";
      var nat = rdAddr(RD.tried);
      if (nat && app.radioPlay(nat)) { rdTune(); return; }
    }
    rdEvent("error");
  }
  function rdHalt() {                                     // both players quiet
    clearTimeout(RD.tuneT);
    if (RD.audio) { RD.audio.pause(); RD.audio.removeAttribute("src"); try { RD.audio.load(); } catch (e) {} }
    if (app && app.radioPlay && app.radioNow && app.radioNow()) app.radioPlay("");
    if (app && app.radioRelay) app.radioRelay("");
  }
  function rdStop() {
    rdHalt();
    RD.now = null; RD.status = ""; RD.mode = "";
    rdRefresh(); kwBuildSoon();
  }
  // Android's player reports here; it's heard only while it is the one playing (a "stopped" from switching it off
  // arrives late and mustn't end the page's player).
  window.guestRadio = function (ev) { if (RD.mode === "native") rdEvent(ev); };
  function rdEvent(ev) {
    if (!RD.now) return;
    if (ev === "playing") {
      clearTimeout(RD.tuneT);
      if (RD.tried && RD.tried !== String(RD.now.u || "")) { var w = (load("radioWorks") || {}); if (w[RD.now.id] !== RD.tried) { w[RD.now.id] = RD.tried; save("radioWorks", w); } }
    }
    if (ev === "error" || ev === "stopped") { clearTimeout(RD.tuneT); rdHalt(); }
    if (ev === "error") { var n = RD.now.n; RD.now = null; RD.status = ""; toast(n + " isn't answering right now"); }
    else if (ev === "stopped") { RD.now = null; RD.status = ""; }
    else RD.status = ev;
    rdRefresh();
  }
  // A page that reloaded (new tiles, an update) picks up the station that's still playing.
  (function () {
    var u = app && app.radioNow ? app.radioNow() : "";
    if (u) { var s = rdRecent()[0]; if (s && String(s.u).replace(/^http:/i, "https:") === u) { RD.now = s; RD.status = "playing"; RD.mode = "native"; RD.tried = u; } else app.radioPlay(""); }
  })();

  function radioNav(action) {
    if (RD.pop) {
      var p = RD.pop;
      if (action === "back") RD.pop = null;
      else if (action === "up") p.f = Math.max(0, p.f - 1);
      else if (action === "down") p.f = Math.min(p.btns.length - 1, p.f + 1);
      else if (action === "ok") { var b = p.btns[p.f][0]; RD.pop = null; if (b !== "cancel") rdDo(b, p.s); }
      renderRadio(); return;
    }
    var g = rdItem(), step = function (d) { var i = RD.gi + d; while (RD.items[i] && RD.items[i].head) i += d; if (RD.items[i]) { RD.gi = i; RD.ci = 0; rdWant(RD.items[i]); } };
    if (action === "back") { if (RD.side === "list") RD.side = "groups"; else { closeRadio(); return; } }
    else if (action === "menu" || action === "hold") { if (RD.side === "list" && g.list[RD.ci]) rdMenu(g.list[RD.ci]); }
    else if (RD.side === "groups") {
      if (action === "up") step(-1);
      else if (action === "down") step(1);
      else if (g.find && action === "ok") { closeRadio(); openCustom(true); kbField = "radio"; kbText = RD.q || ""; kbIdx = 0; kbShift = false; custMode = "search"; renderCustom(); return; }
      else if ((action === "right" || action === "ok") && g.list.length) { RD.side = "list"; RD.ci = Math.max(0, g.list.map(function (s) { return s.id; }).indexOf(RD.now ? RD.now.id : "")); }
    } else {
      if (action === "up" && RD.ci > 0) RD.ci--;
      else if (action === "down" && RD.ci < g.list.length - 1) RD.ci++;
      else if (action === "left") RD.side = "groups";
      else if (action === "ok" && g.list[RD.ci]) { if (rdPlaying(g.list[RD.ci])) rdStop(); else rdPlay(g.list[RD.ci]); }
    }
    renderRadio();
  }
  // Settings' keyboard hands a search back here (23-customize, kbField "radio").
  function radioSearchDone(q) {
    closeCustom();
    openRadio();
    var gi = RD.items.map(function (x) { return x.id; }).indexOf("search");
    if (q) rdSearch(q);
    rdBuild(); RD.gi = gi; RD.side = "groups"; renderRadio();
  }
