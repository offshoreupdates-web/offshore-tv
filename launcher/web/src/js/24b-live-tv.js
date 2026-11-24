  // ---- Live TV: the owner's own channels, like a cable box (LiveTv.java) -------------------------------------------
  // Owner's rules (November 2026): only playlists the owner adds themselves (from their phone, after confirming they
  // have the right to watch them); Offshore includes, finds and suggests no channels or providers; player only (VLC
  // plays, nothing is recorded, downloaded or shared). Links and stream addresses stay in the app's private storage:
  // this page only gets channel names and groups, and plays a channel by playlist and position.
  // Light (owner: premium, fast, no bloat): nothing runs until Live TV opens; the panel reuses the Files layout and
  // draws only the rows on screen; channels get a monogram instead of downloading logos from the playlist's servers.
  // Preview: ?livetv=demo (made-up channel names, nothing plays).
  // The guide: Favorites, Recent and All channels, then Countries and Categories worked out from the playlist. The owner
  // organizes it from a channel's options (☰ or hold OK): favorite (and reorder favorites), hide a channel, a category
  // or a country; Settings > Live TV > Hidden brings them back. All of that is kept on this TV by channel name (never
  // a link), under livetv* keys, which backups skip like the playlists themselves.
  var LT = { open: false, side: "groups", gi: 0, ci: 0, ch: [], items: [], st: null, pop: null }, LTPHONE = null;
  var ltDemoOn = new URLSearchParams(location.search).get("livetv") === "demo";
  function ltState() {
    if (app && app.liveTvState) { try { return JSON.parse(app.liveTvState()); } catch (e) { return { lists: [] }; } }
    return ltDemoOn ? { lists: [{ id: "demo", name: "My channels", count: 30, at: Date.now() - 3600000, error: "" }], vlc: true } : { lists: [] };
  }
  function liveTvOn() { var s = ltState(); return !!(s.lists && s.lists.length); }
  function ltRaw() {                                     // [[name, group, listId, position, country], ...]
    if (app && app.liveTvChannels) { try { return JSON.parse(app.liveTvChannels()); } catch (e) { return []; } }
    if (!ltDemoOn) return [];
    var demo = [["US | News", "US"], ["US | Sports", ""], ["UK: News", ""], ["UK: Movies", ""], ["|FR| Films", ""], ["Kids", "CA"]], out = [];
    for (var i = 0; i < 30; i++) { var d = demo[i % 6]; out.push([d[0].replace(/^\W*\w+\W+/, "") + " " + (Math.floor(i / 6) + 1), d[0], "demo", i, d[1]]); }
    ["9NEWS KUSA", "Denver7 (KMGH-TV)", "FOX31 KDVR", "CBS Colorado KCNC", "New York 1 News", "KRDO 13 Colorado Springs"].forEach(function (n, k) { out.push([n, "US | Locals", "demo", 30 + k, ""]); });
    ["CNN", "Fox News Channel", "NBC News NOW", "MSNBC"].forEach(function (n, k) { out.push([n, "US | News", "demo", 36 + k, ""]); });
    ["ESPN", "ESPN2", "HBO", "Cinemax", "Disney Channel", "Nickelodeon", "Cartoon Network", "HGTV", "Food Network", "Discovery Channel", "History",
     "MTV", "Univision", "Telemundo", "QVC", "TBS", "USA Network", "BBC One", "Sky Sports Main Event", "TSN 1"].forEach(function (n, k) { out.push([n, "Entertainment", "demo", 40 + k, ""]); });
    return out;
  }
  // Countries: the playlist's tvg-country, else a prefix on the group or name ("US | Sports", "UK: News", "|FR| Films").
  var LT_ALIAS = { UK: "GB", USA: "US", UAE: "AE", KSA: "SA", GER: "DE", GRE: "GR", SUI: "CH", NED: "NL", POR: "PT", ESP: "ES", ITA: "IT", FRA: "FR",
                   CAN: "CA", AUS: "AU", MEX: "MX", BRA: "BR", ARG: "AR", IND: "IN", PAK: "PK", TUR: "TR", POL: "PL", SWE: "SE", NOR: "NO", DEN: "DK", IRL: "IE" };
  var LT_NAMES = { US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia", IE: "Ireland", NZ: "New Zealand", FR: "France", DE: "Germany",
                   ES: "Spain", IT: "Italy", PT: "Portugal", NL: "Netherlands", BE: "Belgium", CH: "Switzerland", AT: "Austria", SE: "Sweden", NO: "Norway",
                   DK: "Denmark", FI: "Finland", PL: "Poland", GR: "Greece", TR: "Turkey", MX: "Mexico", BR: "Brazil", AR: "Argentina", IN: "India",
                   PK: "Pakistan", AE: "United Arab Emirates", SA: "Saudi Arabia", JP: "Japan", KR: "South Korea", PH: "Philippines", ZA: "South Africa" };
  var ltRegion = null; try { ltRegion = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { ltRegion = null; }
  function ltCode(x) {
    x = String(x || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (own(LT_ALIAS, x)) x = LT_ALIAS[x];
    if (!/^[A-Z]{2}$/.test(x)) return "";
    if (own(LT_NAMES, x)) return x;
    var nm = ""; try { nm = ltRegion ? ltRegion.of(x) : ""; } catch (e) { nm = ""; }
    return nm && nm !== x ? x : "";
  }
  function ltCountryName(c) { if (own(LT_NAMES, c)) return LT_NAMES[c]; try { return ltRegion ? ltRegion.of(c) : c; } catch (e) { return c; } }
  function ltFlag(c) { return c ? String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65) : ""; }
  var LT_PREFIX = /^\s*(?:\[|\|)?\s*([A-Za-z]{2,3})\s*(?:\]|\||:|-|–|»)\s*(.*)$/;
  function ltSplit(group, name, tvg) {                   // -> { c: "US", g: "Sports" }
    var c = ltCode(String(tvg || "").split(/[;,]/)[0]), g = String(group || "").trim(), m = LT_PREFIX.exec(g);
    if (m && ltCode(m[1])) { if (!c) c = ltCode(m[1]); g = m[2].trim(); }
    if (!c) { var mn = LT_PREFIX.exec(String(name || "")); if (mn && ltCode(mn[1])) c = ltCode(mn[1]); }
    return { c: c, g: g || "Other" };
  }
  function ltKey(c) { return c.l + "|" + c.n; }
  // News (owner: "if there are US news stations, show them when the US location is set"): the owner's own channels from
  // the national US news networks, matched by name. Nothing is added: only channels already in the playlist.
  var LT_US_NEWS = /\b(cnn|hln|fox news|fox business|fox weather|livenow|msnbc|ms now|cnbc|bloomberg|newsnation|newsmax|abc news|cbs news|nbc news|c-?span|weather channel|scripps news|court tv|cheddar|newsy|reuters|pbs news)\b/i;
  function ltIsUsNews(c) { return (!c.c || c.c === "US") && LT_US_NEWS.test(c.n); }
  // Your country only (owner: "I'm in the US, show me US only"): the guide keeps channels from the TV's own country, and
  // ones with no country marked; channels marked as other countries step away, and so does the Countries section.
  // Settings > Live TV > Countries switches to every country. The country comes from the TV's location (Offshore's
  // location is US-only for now), else the TV's language setting.
  function ltHome() {
    var L = typeof LOC !== "undefined" ? LOC : null;
    if (L && L.lat != null && L.lat > 17 && L.lat < 72 && L.lon < -64 && L.lon > -180) return "US";
    var m = /[-_]([A-Za-z]{2})$/.exec(navigator.language || ""); return m ? ltCode(m[1]) : "";
  }
  function ltAllCountries() { return load("livetvRegion") === "all"; }
  function ltPrefs() {
    var h = load("livetvHide") || {};
    return { fav: load("livetvFav") || [], hide: { ch: h.ch || [], cat: h.cat || [], cty: h.cty || [] } };
  }
  function ltSavePrefs(p) { save("livetvFav", p.fav); save("livetvHide", p.hide); }
  function ltRecent() { return load("livetvRecent") || []; }      // ["listId|name", ...], newest first
  // Local (owner): the owner's own channels from TV stations near this TV. The FCC's official list of full-power stations
  // within 120 km (call signs like KUSA and their cities; 120, not 80, so a TV between two markets gets both) is
  // fetched once a month or when the TV moves, kept as livetvLocal (stations only, no channels), and matched against
  // channel names: a call sign ("KMGH", "KMGH-TV"), or a station's city ("Denver", but not "York" inside "New York"). US only (the FCC licenses US stations). No channels are
  // added or suggested: Local only gathers ones already in the owner's playlist.
  function ltLocalData() {
    var d = load("livetvLocal"), L = typeof LOC !== "undefined" ? LOC : null;
    if (!L || L.lat == null || L.lat < 17 || L.lat > 72 || L.lon > -64 || L.lon < -180) return null;   // US and territories only
    var moved = d && km(d.lat, d.lon, L.lat, L.lon) > 30, old = d && Date.now() - d.t > 30 * 86400000;
    if ((!d || moved || old) && !ltLocalBusy) ltLocalFetch(L.lat, L.lon);
    return d && !moved ? d : null;
  }
  var ltLocalBusy = false;
  function ltLocalFetch(lat, lon) {
    var dms = function (v) { v = Math.abs(v); var d = Math.floor(v), m = Math.floor((v - d) * 60), sx = Math.round(((v - d) * 60 - m) * 60); return [d, m, Math.min(59, sx)]; };
    var a = dms(lat), o = dms(lon);
    var url = "https://transition.fcc.gov/fcc-bin/tvq?list=4&serv=DT&type=3&dist=120&dlat2=" + a[0] + "&mlat2=" + a[1] + "&slat2=" + a[2] + "&NS=" + (lat < 0 ? "S" : "N") +
              "&dlon2=" + o[0] + "&mlon2=" + o[1] + "&slon2=" + o[2] + "&EW=" + (lon < 0 ? "W" : "E") + "&size=9";
    ltLocalBusy = true;
    getText(url).then(function (t) {
      var st = {};
      String(t || "").split("\n").forEach(function (line) {
        var f = line.split("|"); if (f.length < 13) return;
        var call = f[1].trim().toUpperCase().replace(/-(TV|DT|CD|LD|LP|CA)\d*$/, ""), city = f[10].trim();
        if (!/^[KW][A-Z]{2,3}$/.test(call) || !city) return;
        st[call] = city.toLowerCase().replace(/\b[a-z]/g, function (x) { return x.toUpperCase(); });
      });
      save("livetvLocal", { lat: lat, lon: lon, t: Date.now(), st: st });
      ltLocalBusy = false;
      if (LT.open) { var keep = (LT.items[LT.gi] || {}).id; ltBuild(); var gi = LT.items.map(function (x) { return x.id; }).indexOf(keep); LT.gi = gi >= 0 ? gi : LT.gi; renderLiveTv(); }
    }, function () { ltLocalBusy = false; });
  }
  function ltLocalMatch(c, d) {                          // the station a channel belongs to, or ""
    if (c.c && c.c !== "US") return "";
    var text = " " + c.n + " " + c.g + " ", up = text.toUpperCase(), low = text.toLowerCase();
    for (var call in d.st) if (own(d.st, call) && new RegExp("[^A-Z0-9]" + call + "(-?(TV|DT|HD|\\d+))?[^A-Z]").test(up)) return d.st[call];
    var cities = {}; for (var k in d.st) if (own(d.st, k)) cities[d.st[k]] = 1;
    for (var city in cities) {
      var i = low.indexOf(" " + city.toLowerCase());
      while (i >= 0) {
        var end = low.charAt(i + city.length + 1), before = low.slice(Math.max(0, i - 4), i);
        if (!/[a-z]/.test(end) && before !== " new" && before !== "west" && before !== "east") return city;
        i = low.indexOf(" " + city.toLowerCase(), i + 1);
      }
    }
    return "";
  }
  var LT_GCATS = {};                                      // listId -> {position: the guide's main programme category}
  function ltGuideCats(l) {
    if (!LT_GCATS[l]) { var got = {}; if (app && app.liveTvCategories) { try { got = JSON.parse(app.liveTvCategories(l)); } catch (e) { got = {}; } } LT_GCATS[l] = got; }
    return LT_GCATS[l];
  }
  function ltBuild() {                                    // the lineup and the left column, from the playlist and the owner's choices
    var P = ltPrefs(), home = ltHome(), ld = ltLocalData();
    var all = ltRaw().map(function (r) {
      var sp = ltSplit(r[1], r[0], r[4]), c = { n: r[0], g: sp.g, c: sp.c, l: r[2], p: r[3] };
      if (!c.c) c.c = ltForeign(c);                       // BBC One, TSN, Rai ...: not from here, even unmarked
      c.local = ld && (!c.c || c.c === "US") ? ltLocalMatch(c, ld) : "";
      c.k = ltCategorize(c, ltDemoOn && !app ? ltDemoCat(c) : ltGuideCats(c.l)[c.p]);
      return c;
    });
    var by = {}; all.forEach(function (c) { by[ltKey(c)] = c; });
    var shown = all.filter(function (c) { return P.hide.ch.indexOf(ltKey(c)) < 0 && P.hide.cat.indexOf(ltCatOf(c.k).name) < 0 && P.hide.cty.indexOf(c.c) < 0; });
    LT.only = "";
    if (home && !ltAllCountries()) {                     // your country only, unless International channels is on
      // A playlist that marks countries on most channels: unmarked ones stay only when they're plainly from here.
      var marked = all.filter(function (c) { return c.c; }).length / Math.max(1, all.length);
      var mine = shown.filter(function (c) { return c.c ? c.c === home : marked < 0.5 || (home === "US" && ltLooksUs(c)); });
      if (mine.length) { LT.only = mine.length < shown.length ? home : ""; shown = mine; }   // nothing from here: everything
    }
    // Cable numbers: Local from 2, then a block per category, A to Z inside it.
    var groups = {}, biggest = 0, lineup = [];
    LT_CATS.forEach(function (k) { groups[k.id] = []; });
    shown.forEach(function (c) { groups[c.k].push(c); });
    LT_CATS.forEach(function (k) { groups[k.id].sort(function (a, b) { return a.n.toLowerCase() < b.n.toLowerCase() ? -1 : 1; }); biggest = Math.max(biggest, groups[k.id].length); });
    var block = biggest <= 98 ? 100 : biggest <= 998 ? 1000 : 10000;
    all.forEach(function (c) { c.num = 0; });
    LT_CATS.forEach(function (k, i) { groups[k.id].forEach(function (c, j) { c.num = (i === 0 ? 2 : i * block) + j; lineup.push(c); }); });
    // Favorites and Recent keep what the owner picked (even from a hidden category), not a hidden channel.
    var pick = function (keys) { return keys.filter(function (k) { return P.hide.ch.indexOf(k) < 0; }).map(function (k) { return by[k]; }).filter(Boolean); };
    var items = [{ id: "fav", name: "Favorites", icon: "★", list: pick(P.fav) },
                 { id: "recent", name: "Recent", icon: "↺", list: pick(ltRecent()) },
                 { id: "all", name: "All channels", icon: "≡", list: lineup }, { head: "Categories" }];
    LT_CATS.forEach(function (k) { if (groups[k.id].length) items.push({ id: "k:" + k.id, name: k.name, icon: k.icon, list: groups[k.id], kat: k.id }); });
    if (!LT.only) {                                       // International channels on: countries too
      var cty = {};
      shown.forEach(function (c) { if (c.c) (cty[c.c] = cty[c.c] || []).push(c); });
      var ck = Object.keys(cty).sort(function (a, b) { return cty[b].length - cty[a].length; });
      if (ck.length > 1) { items.push({ head: "Countries" }); ck.forEach(function (k) { items.push({ id: "c:" + k, name: ltCountryName(k), icon: ltFlag(k), list: cty[k], cty: k }); }); }
    }
    LT.ch = all; LT.items = items; LT.fav = P.fav;
  }
  function ltDemoCat(c) {                                 // preview: made-up guide categories for a few demo channels
    return /^Kids/.test(c.n) ? "children" : /^Films|^Movies/.test(c.n) ? "movie" : "";
  }
  function ltItem() { return LT.items[LT.gi] || { list: [] }; }
  // The programme guide: what's on now and next, asked of the app only for the channels on screen (LiveTv.guide reads
  // the owner's provider's XMLTV, kept for 12 hours ahead). Cached here per channel until the next show starts.
  var LT_GUIDE = {};                                      // "listId|position" -> [[start min, stop min, title, desc], ...]
  function ltShows(c) {
    var k = c.l + "|" + c.p, have = LT_GUIDE[k], now = Date.now() / 60000;
    if (!have) return null;                               // not asked yet
    var left = have.filter(function (x) { return x[1] > now; });
    return have.length === 0 || left.length >= Math.min(2, have.length) ? left : null;   // running low: ask again
  }
  function ltFetchGuide(list) {                           // ask once for the rows about to be drawn
    var need = {};
    list.forEach(function (c) { if (!ltShows(c)) (need[c.l] = need[c.l] || []).push(c.p); });
    Object.keys(need).forEach(function (l) {
      var got = {};
      if (app && app.liveTvGuide) { try { got = JSON.parse(app.liveTvGuide(l, need[l].join(","))); } catch (e) { got = {}; } }
      else if (ltDemoOn) need[l].forEach(function (p) { got[p] = ltDemoShows(p); });
      need[l].forEach(function (p) { LT_GUIDE[l + "|" + p] = got[p] || []; });
    });
  }
  function ltDemoShows(p) {                               // preview: made-up listings on the half hour
    var t = ["Morning Report", "Live Desk", "The Big Game", "Classic Movie", "Cartoon Hour", "World Tonight", "Weather Watch", "Evening News"];
    var now = Math.floor(Date.now() / 60000), s = now - (now % 30) - (p % 3) * 15, out = [];
    for (var i = 0; i < 3; i++) { var len = (p % 2 ? 60 : 30); out.push([s, s + len, t[(p + i) % t.length], i ? "" : "A calm look at what matters today, with guests and the latest from around the country."]); s += len; }
    return out;
  }
  function ltWhen(m) { return hm(m * 60000); }
  function openLiveTv() {
    if (custOpen) closeCustom();
    LT.st = ltState();
    if (!LT.st.lists || !LT.st.lists.length) { openCustom(); custMode = "livetv"; custRow = 0; renderCustom(); return; }
    ltBuild();
    LT.open = true; LT.side = "groups"; LT.ci = 0; LT.pop = null;
    LT.gi = LT.items[0].list.length ? 0 : 2;             // Favorites if there are any, else the whole lineup, like cable
    LT.ti = 0; LT.ft = 0;
    LT.st.lists.forEach(function (l) {                  // a day old: read it again quietly, for next time
      if (app && app.liveTvRefresh && Date.now() - (l.at || 0) > 86400000) app.liveTvRefresh(l.id);
      else if (app && app.liveTvGuideRefresh && l.guide && Date.now() - (l.guideAt || 0) > 6 * 3600000) app.liveTvGuideRefresh(l.id);
    });
    document.getElementById("livetv").classList.add("open");
    document.body.classList.add("bigpanel");
    document.getElementById("sysdim").classList.add("open");
    renderLiveTv();
  }
  function closeLiveTv() {
    LT.open = false; LT.ch = []; LT.items = []; LT.pop = null;
    document.getElementById("livetv").classList.remove("open", "popping");
    if (!FM.open) document.body.classList.remove("bigpanel");
    document.getElementById("ltPop").classList.remove("open");
    if (!sysOpen && !custOpen && !weekOpen && !dockCard && !FM.open) document.getElementById("sysdim").classList.remove("open");
  }
  var LT_VIS = 7;                                        // channel rows on screen (two lines each)
  var LT_COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#bf5af2", "#ff375f", "#64d2ff", "#5e5ce6", "#ffd60a"];
  function ltMono(name) {                                 // a channel's monogram: two letters, a colour from its name
    var w = String(name).replace(/[^\w\s]/g, " ").trim().split(/\s+/), t = (w[0] || "?").charAt(0) + (w[1] ? w[1].charAt(0) : (w[0] || "").charAt(1) || "");
    var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return '<i class="fm-ico lt-mono" style="background:' + LT_COLORS[Math.abs(h) % LT_COLORS.length] + '">' + esc(t.toUpperCase()) + "</i>";
  }
  function ltWindow(n, at, vis) { return Math.max(0, Math.min(at - Math.floor(vis / 2), n - vis)); }
  function ltIsFav(c) { return LT.fav.indexOf(ltKey(c)) >= 0; }
  // The guide grid: channels down, the next two hours across (from the last half hour), like a cable box.
  var LT_SPAN = 120;
  function ltBlocks(c, t0) {                              // a row's programmes within the grid's two hours
    var sh = ltShows(c) || [], out = [];
    sh.forEach(function (x) { if (x[1] > t0 && x[0] < t0 + LT_SPAN) out.push({ s: x[0], e: x[1], t: x[2], d: x[3] || "" }); });
    if (!out.length) out.push({ s: t0, e: t0 + LT_SPAN, t: "", d: "", none: true });
    return out;
  }
  function renderLiveTv() {
    var st = LT.st || { lists: [] }, allIt = LT.items.filter(function (x) { return x.id === "all"; })[0], all = allIt ? allIt.list.length : 0;
    document.getElementById("ltSum").innerHTML = "<b>" + all.toLocaleString() + "</b> channels" + (LT.only ? " · " + ltFlag(LT.only) + " " + esc(ltCountryName(LT.only)) : "") +
      (st.lists.length > 1 ? " · " + st.lists.length + " playlists" : "");
    var its = LT.items, gStart = ltWindow(its.length, LT.gi, 11);
    document.getElementById("ltGroups").innerHTML = its.slice(gStart, gStart + 11).map(function (g, k) {
      var i = gStart + k;
      if (g.head) return '<div class="lt-h">' + esc(g.head) + "</div>";
      var f = LT.side === "groups" && i === LT.gi;
      return '<div class="fm-pl' + (f ? " focus" : i === LT.gi ? " on" : "") + '">' + '<span class="lt-gi">' + esc(g.icon || "") + "</span>" +
        '<div class="tx"><div class="t">' + esc(g.name) + "</div><small>" + (g.list.length ? g.list.length.toLocaleString() : g.id === "fav" ? "None yet" : "0") + "</small></div></div>";
    }).join("");
    var g = ltItem(), list = g.list, cStart = ltWindow(list.length, LT.ci, LT_VIS), rows = list.slice(cStart, cStart + LT_VIS);
    ltFetchGuide(rows);
    var now = Date.now() / 60000, t0 = Math.floor(now / 30) * 30, pc = function (m) { return Math.max(0, Math.min(100, (m - t0) / LT_SPAN * 100)); };
    document.getElementById("ltPath").innerHTML = '<span class="lt-hn">' + esc((g.icon ? g.icon + "  " : "") + (g.name || "")) + '</span><span class="lt-ht">' +
      [0, 30, 60, 90].map(function (m) { return '<span style="left:' + pc(t0 + m) + '%">' + esc(ltWhen(t0 + m)) + "</span>"; }).join("") + "</span>";
    var lEl = document.getElementById("ltList"), focusBlock = null, focusChan = null;
    lEl.innerHTML = list.length ? rows.map(function (c, k) {
      var i = cStart + k, onRow = LT.side === "list" && i === LT.ci, bl = ltBlocks(c, t0);
      if (onRow) { LT.ti = Math.max(0, Math.min(LT.ti, bl.length - 1)); focusBlock = bl[LT.ti]; focusChan = c; }
      return '<div class="lt-g' + (onRow ? " on" : "") + '"><span class="lt-num">' + (c.num || "–") + "</span>" +
        '<span class="lt-cn">' + ltMono(c.n) + '<span class="lt-nm">' + esc(c.n) + "</span>" + (g.id !== "fav" && ltIsFav(c) ? '<em class="lt-star">★</em>' : "") + "</span>" +
        '<span class="lt-tl">' + bl.map(function (b, bi) {
          var left = pc(b.s), w = pc(b.e) - left;
          return '<span class="lt-b' + (b.none ? " none" : "") + (onRow && bi === LT.ti ? " focus" : "") + '" style="left:' + left + "%;width:calc(" + w + '% - 6px)">' +
            (b.none ? "<b>" + esc(ltCatOf(c.k).name) + "</b><small>No listings</small>" : "<b>" + esc(b.t) + "</b><small>" + esc(ltWhen(b.s)) + "</small>") + "</span>";
        }).join("") + '<i class="lt-nowl" style="left:' + pc(now) + '%"></i></span></div>';
    }).join("") : '<div class="fm-empty">' + (g.id === "fav" ? "No favorites yet. Highlight a channel and press ☰ (or hold OK) to add it here." :
                                               g.id === "recent" ? "Channels you watch show up here." : "Nothing here.") + "</div>";
    lEl.classList.toggle("fade-top", cStart > 0);
    lEl.classList.toggle("fade-bot", cStart + LT_VIS < list.length);
    // The detail strip: the highlighted programme (or channel), its time and what it's about.
    var info = document.getElementById("ltInfo");
    if (focusBlock && !focusBlock.none) info.innerHTML = "<b>" + esc(focusBlock.t) + '</b><span class="lt-time">' + esc(ltWhen(focusBlock.s)) + " – " + esc(ltWhen(focusBlock.e)) +
      " · " + (focusChan.num || "") + " " + esc(focusChan.n) + "</span>" + (focusBlock.d ? '<span class="lt-desc">' + esc(focusBlock.d) + "</span>" : "");
    else if (focusChan) info.innerHTML = "<b>" + (focusChan.num || "") + " " + esc(focusChan.n) + '</b><span class="lt-time">' + esc(ltCatOf(focusChan.k).name) +
      (focusChan.local ? " · " + esc(focusChan.local) + " station" : "") + " · plays in VLC</span>";
    else info.innerHTML = '<span class="lt-time">Your channels, sorted like cable. ▶ into the guide, OK watches, ☰ on a channel adds it to Favorites.</span>';
    document.getElementById("ltFoot").textContent = LT.pop ? "▲ ▼ choose · OK select · Back to cancel" :
      LT.side === "list" ? "▲ ▼ channels · ◀ ▶ shows · OK watch · ☰ options · Back" : "▲ ▼ choose · OK or ▶ the guide · Back closes";
    var box = document.getElementById("ltPop");
    document.getElementById("livetv").classList.toggle("popping", !!LT.pop);
    box.classList.toggle("open", !!LT.pop);
    if (LT.pop) box.innerHTML = "<h3>" + esc(LT.pop.title) + "</h3>" + (LT.pop.sub ? "<p>" + esc(LT.pop.sub) + "</p>" : "") + '<div class="btns">' +
      LT.pop.btns.map(function (b, i) { return '<div class="sbtn glass' + (i === LT.pop.f ? " focus" : "") + '">' + esc(b[1]) + "</div>"; }).join("") + "</div>";
  }
  function ltMenu(c) {                                    // a channel's options
    var g = ltItem(), fav = ltIsFav(c), btns = [["fav", fav ? "Remove from Favorites" : "★  Add to Favorites"]];
    if (g.id === "fav") { var at = LT.fav.indexOf(ltKey(c)); if (at > 0) btns.push(["up", "Move up"]); if (at < LT.fav.length - 1) btns.push(["down", "Move down"]); }
    btns.push(["hide", "Hide this channel"]);
    if (c.k && c.k !== "other" && c.k !== "local") btns.push(["hidecat", "Hide all of " + ltCatOf(c.k).name]);
    if (c.c) btns.push(["hidecty", "Hide all from " + ltCountryName(c.c)]);
    btns.push(["cancel", "Cancel"]);
    LT.pop = { title: (c.num ? c.num + "  " : "") + c.n, sub: ltCatOf(c.k).name + (c.c ? " · " + ltCountryName(c.c) : ""), btns: btns, f: 0, ch: c };
  }
  function ltDo(what, c) {
    var P = ltPrefs(), k = ltKey(c), g = ltItem(), keepId = g.id;
    if (what === "fav") {
      var at = P.fav.indexOf(k);
      if (at >= 0) { P.fav.splice(at, 1); toast("Removed from Favorites"); } else { P.fav.push(k); toast("★ " + c.n + " is in Favorites"); }
    } else if (what === "up" || what === "down") {
      var i = P.fav.indexOf(k), j = i + (what === "up" ? -1 : 1);
      if (i >= 0 && j >= 0 && j < P.fav.length) { P.fav[i] = P.fav[j]; P.fav[j] = k; LT.ci = j; }
    } else if (what === "hide") { P.hide.ch.push(k); toast("Hidden. Settings › Live TV › Hidden brings it back"); }
    else if (what === "hidecat") { P.hide.cat.push(ltCatOf(c.k).name); toast(ltCatOf(c.k).name + " hidden. Settings › Live TV › Hidden brings it back"); }
    else if (what === "hidecty") { P.hide.cty.push(c.c); toast(ltCountryName(c.c) + " hidden. Settings › Live TV › Hidden brings it back"); }
    ltSavePrefs(P);
    ltBuild();
    var gi = LT.items.map(function (x) { return x.id; }).indexOf(keepId);   // stay on the same group if it's still there
    LT.gi = gi >= 0 ? gi : LT.items.map(function (x) { return x.id; }).indexOf("all");
    var n = ltItem().list.length;
    if (!n) LT.side = "groups";
    LT.ci = Math.min(LT.ci, Math.max(0, n - 1));
  }
  function liveTvNav(action) {
    if (LT.pop) {                                        // the options card
      var p = LT.pop;
      if (action === "back") LT.pop = null;
      else if (action === "up") p.f = Math.max(0, p.f - 1);
      else if (action === "down") p.f = Math.min(p.btns.length - 1, p.f + 1);
      else if (action === "ok") { var b = p.btns[p.f][0]; LT.pop = null; if (b !== "cancel") ltDo(b, p.ch); }
      renderLiveTv(); return;
    }
    var g = ltItem(), step = function (d) { var i = LT.gi + d; while (LT.items[i] && LT.items[i].head) i += d; if (LT.items[i]) LT.gi = i; };
    var t0 = Math.floor(Date.now() / 1800000) * 30;
    var atTime = function () {                            // keep the same time when moving between channels, like cable
      var bl = ltBlocks(g.list[LT.ci], t0), want = LT.ft || Date.now() / 60000;
      LT.ti = 0; bl.forEach(function (b, i) { if (b.s <= want) LT.ti = i; });
    };
    if (action === "back") { if (LT.side === "list") LT.side = "groups"; else { closeLiveTv(); return; } }
    else if (action === "menu" || action === "hold") { if (LT.side === "list" && g.list[LT.ci]) ltMenu(g.list[LT.ci]); }
    else if (LT.side === "groups") {
      if (action === "up") { step(-1); LT.ci = 0; }
      else if (action === "down") { step(1); LT.ci = 0; }
      else if ((action === "right" || action === "ok") && g.list.length) { LT.side = "list"; LT.ci = 0; LT.ft = 0; atTime(); }
    } else {
      if (action === "up" && LT.ci > 0) { LT.ci--; atTime(); }
      else if (action === "down" && LT.ci < g.list.length - 1) { LT.ci++; atTime(); }
      else if (action === "right" || action === "left") {
        var bl = ltBlocks(g.list[LT.ci], t0);
        if (action === "left" && LT.ti === 0) LT.side = "groups";
        else { LT.ti = Math.max(0, Math.min(bl.length - 1, LT.ti + (action === "right" ? 1 : -1))); LT.ft = Math.max(bl[LT.ti].s, Date.now() / 60000); }
      }
      else if (action === "ok" && g.list[LT.ci]) ltPlay(g.list[LT.ci]);
    }
    renderLiveTv();
  }
  function ltPlay(c) {
    var r = app && app.liveTvPlay ? app.liveTvPlay(c.l, c.p, c.n) : "preview";
    if (r === "preview") { toast("Would play " + c.n + " in VLC"); }
    else if (r === "novlc") { toast("Live TV plays in VLC. Opening it in the Appstore…"); if (window.Offshore && Offshore.launch) Offshore.launch("getvlc"); return; }
    else if (r === "gone") { toast("That channel changed. Reading your playlist again…"); app.liveTvRefresh(c.l); return; }
    var k = ltKey(c), rec = ltRecent().filter(function (x) { return x !== k; });
    rec.unshift(k); save("livetvRecent", rec.slice(0, 12));
    kwAdd({ k: "tv", id: k, l: c.l, p: c.p, n: c.n });   // Keep watching (24f)
  }
  // The app read a playlist (after adding, refreshing or a day-old check).
  window.guestLiveTv = function (id, error, count) {
    var l = (ltState().lists || []).filter(function (x) { return x.id === id; })[0], name = l ? l.name : "Your playlist";
    if (custOpen && /^live/.test(custMode)) renderCustom();
    if (error) toast("Live TV: " + error);
    else if (custOpen || !LT.open) toast(name + ": " + count.toLocaleString() + " channels ready");
    if (!error && !APPS.some(function (a) { return a.id === LIVETV_ID; })) reloadOnClose = true;   // the Live TV tile appears
  };
  window.guestLiveTvGuide = function (id, error, count) {   // a guide was read: draw the new listings
    LT_GUIDE = {};
    if (LT.open) renderLiveTv();
    if (custOpen && /^live/.test(custMode)) renderCustom();
    if (error && custOpen) toast("Live TV guide: " + error);
  };
  window.guestLiveTvAdded = function () {
    LTPHONE = null;
    if (custOpen && custMode === "livephone") { custMode = "livetv"; custRow = 0; renderCustom(); }
    toast("Playlist added. Reading your channels…");
  };
  window.guestLiveTvPhoneEnded = function () { if (custOpen && custMode === "livephone") { LTPHONE = null; custMode = "livetv"; custRow = 0; renderCustom(); toast("Phone link closed"); } };

  // Settings > Live TV
  function liveTvRows() {
    var st = ltState(), rows = [{ label: "Watch channels from your own playlist (M3U), like a cable box. Add only playlists you have the right to watch; Offshore doesn't include or suggest any.", act: true, none: true }];
    (st.lists || []).forEach(function (l) {
      rows.push({ label: l.name, act: true, id: "ltlist", lid: l.id,
                  value: l.error ? l.error + " · OK tries again" : l.at ? l.count.toLocaleString() + " channels · read " + ago2(l.at) + "  ↻" : "Reading…",
                  note: "OK reads this playlist again now. It's also read again by itself when Live TV opens and it's a day old." });
    });
    if (st.lists && st.lists.length) rows.push({ label: "Open Live TV", value: "›", act: true, id: "ltopen" });
    rows.push({ label: "Add a playlist from your phone", value: "›", act: true, id: "ltadd", note: "Your phone shows a short form: paste the playlist link your TV provider or service gave you." });
    rows.push({ label: "VLC, which plays the channels", value: !app ? "On the TV" : st.vlc ? "Installed  ✓" : "Get it from the Appstore  ›", act: true, id: "ltvlc",
                note: "VLC is free, from the Amazon Appstore. Offshore hands it the channel; Back in VLC returns to the guide." });
    if (st.lists && st.lists.length) {
      var P = ltPrefs(), nh = P.hide.ch.length + P.hide.cat.length + P.hide.cty.length;
      rows.push({ label: "Favorites", value: P.fav.length ? P.fav.length + (P.fav.length === 1 ? " channel" : " channels") : "None yet", act: true, id: "ltfavinfo",
                  note: "In Live TV, highlight a channel and press ☰ (or hold OK) to add it to Favorites, move it up or down, or hide it." });
      var hc = ltHome();
      if (hc) rows.push({ label: "International channels", value: ltAllCountries() ? "On" : "Off · " + ltCountryName(hc) + " only", adj: true, id: "ltregion",
                          note: ltAllCountries() ? "Channels from every country in your playlist, with a Countries section in the guide. ◀ ▶ turns it off." :
                                "Live TV shows " + ltCountryName(hc) + " channels only, from this TV's location. ◀ ▶ adds channels from other countries." });
      rows.push({ label: "Hidden", value: nh ? nh + "  ›" : "Nothing hidden", act: true, id: "lthidden", note: "Channels, categories and countries you hid in Live TV. OK on one shows it again." });
      rows.push({ label: "Remove a playlist", value: "›", act: true, id: "ltdel" });
    }
    rows.push({ label: "Links stay on this TV only, out of its backups. Nothing is recorded or shared.", act: true, none: true });
    return rows;
  }
  function liveTvHiddenRows() {
    var P = ltPrefs(), rows = [];
    P.hide.cty.forEach(function (c) { rows.push({ label: ltFlag(c) + "  " + ltCountryName(c), value: "Country · OK shows it", act: true, hk: "cty", hv: c }); });
    P.hide.cat.forEach(function (c) { rows.push({ label: c, value: "Category · OK shows it", act: true, hk: "cat", hv: c }); });
    P.hide.ch.forEach(function (k) { rows.push({ label: k.slice(k.indexOf("|") + 1), value: "Channel · OK shows it", act: true, hk: "ch", hv: k }); });
    return rows.length ? rows : [{ label: "Nothing hidden", act: true, none: true }];
  }
  function liveTvDelRows() {
    var ls = ltState().lists || [];
    return ls.length ? ls.map(function (l) { return { label: l.name, value: "OK removes it from this TV", act: true, lid: l.id }; })
                     : [{ label: "No playlists on this TV", act: true, none: true }];
  }
  function livePhoneRows() {
    if (!LTPHONE || !LTPHONE.url) return [{ label: app ? "Couldn't find this TV's address. Check that it's on Wi-Fi or Ethernet." : "Adding from a phone works on the TV", act: true, none: true }];
    return [{ label: "On your phone or computer (same Wi-Fi), open:", act: true, none: true },
            { label: LTPHONE.url.replace(/^http:\/\//, ""), value: "", act: true, id: "addr" },
            { label: "Code", value: LTPHONE.code, act: true, id: "code" },
            { label: "Paste your playlist link there, enter the code and confirm you have the right to watch these channels.", act: true, none: true },
            { label: "This stays open for 10 minutes, or until a playlist is added. Back closes it.", act: true, none: true }];
  }
  function liveTvSummary() {
    var ls = ltState().lists || [];
    if (!ls.length) return app || ltDemoOn ? "Add your own channels" : "On the TV";
    var n = ls.reduce(function (s, l) { return s + (l.count || 0); }, 0);
    return n.toLocaleString() + " channels";
  }
  function liveTvSettingsNav(action, rows) {
    var r = rows[custRow];
    if (r && r.id === "ltregion" && (action === "ok" || action === "left" || action === "right")) {
      save("livetvRegion", ltAllCountries() ? "home" : "all");
      toast(ltAllCountries() ? "International channels on" : "International channels off: " + ltCountryName(ltHome()) + " only");
      return;
    }
    if (!r || action !== "ok") return;
    if (custMode === "livehidden") {
      if (!r.hk) return;
      var P = ltPrefs(); P.hide[r.hk] = P.hide[r.hk].filter(function (x) { return x !== r.hv; }); ltSavePrefs(P);
      toast(r.label.trim() + " is back in Live TV");
      var left = liveTvHiddenRows(); if (!left[0].hk) { custMode = "livetv"; custRow = 0; } else custRow = Math.min(custRow, left.length - 1);
      return;
    }
    if (custMode === "livedel") {
      if (!r.lid) return;
      if (app && app.liveTvRemove) app.liveTvRemove(r.lid);
      toast("Removed " + r.label + " from this TV"); reloadOnClose = true;
      if (!liveTvDelRows()[0].lid) { custMode = "livetv"; custRow = 0; }
      return;
    }
    if (r.id === "ltlist") { if (app && app.liveTvRefresh) { app.liveTvRefresh(r.lid); toast("Reading " + r.label + "…"); } else toast("Would read it again"); }
    else if (r.id === "ltopen") { closeCustom(); openLiveTv(); }
    else if (r.id === "ltadd") {
      try { LTPHONE = app && app.liveTvPhoneStart ? JSON.parse(app.liveTvPhoneStart()) : null; } catch (e) { LTPHONE = null; }
      custMode = "livephone"; custRow = 1;
    }
    else if (r.id === "ltvlc") { if (app && !ltState().vlc) { closeCustom(); Offshore.launch("getvlc"); } else if (!app) toast("Opens VLC in the Appstore on the TV"); }
    else if (r.id === "ltdel") { custMode = "livedel"; custRow = 0; }
    else if (r.id === "lthidden") { if (liveTvHiddenRows()[0].hk) { custMode = "livehidden"; custRow = 0; } }
    else if (r.id === "ltfavinfo") toast("In Live TV: ☰ on a channel adds it to Favorites");
  }
