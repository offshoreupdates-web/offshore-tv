  // Tile order: A to Z by name, with this TV's most-opened app (last 30 days) first. Until one app has been opened more
  // than tv.json's "first" app, that one stays in front. Launches are counted on the TV only (localStorage).
  var APPS = [], FIRST = "", BANNERS = {}, cols = 5, tileH = 171;
  var MONTH = 30 * 86400000;
  function usage() { try { return JSON.parse(localStorage.getItem("usage")) || {}; } catch (e) { return {}; } }
  function launches(u, pkg) {
    var now = Date.now();
    return (u[pkg] || []).filter(function (t) { return now - t < MONTH; });
  }
  function recordLaunch(pkg) {
    var u = usage();
    u[pkg] = launches(u, pkg).concat([Date.now()]).slice(-100);
    try { localStorage.setItem("usage", JSON.stringify(u)); } catch (e) {}
  }
  // Pinned tiles (☰ on a tile, then ▲) always lead, in their own order; the rest follow App order. "Your order" is the
  // arrangement made with ☰ (tileArr); apps installed since go at the end.
  function ordered() {
    var pins = MV ? MV.pins : tilePins(), arr = MV ? MV.list : tileArr();
    var byName = function (a, b) { return a.name.localeCompare(b.name, "en", { sensitivity: "base" }); };
    var pinned = pins.map(function (id) { return APPS.filter(function (a) { return a.id === id; })[0]; }).filter(Boolean);
    var free = APPS.filter(function (a) { return pins.indexOf(a.id) < 0; });
    if (MV || PREFS.tileOrder === "custom") {
      var at = function (a) { var i = arr.indexOf(a.id); return i < 0 ? 1e6 : i; };
      return pinned.concat(free.sort(function (a, b) { return at(a) - at(b) || byName(a, b); }));
    }
    var u = usage(), best = FIRST, bestN = launches(u, FIRST).length;
    free.forEach(function (a) { var n = launches(u, a.id).length; if (n > bestN) { best = a.id; bestN = n; } });
    if (PREFS.tileOrder === "az") best = "";                 // Home screen > App order: A to Z
    var top = free.filter(function (a) { return a.id === best; });
    return pinned.concat(top, free.filter(function (a) { return a.id !== best; }).sort(byName));
  }

  // ---- Arranging tiles: the ☰ (Menu) button on the remote, as on Fire TV's own home -----------------------------
  // Press or hold ☰ on a tile (or Move in its hold-OK card): it lifts, ◀ ▶ moves it, ▲ pins it to the front (▲ again
  // unpins), OK or ☰ keeps the new order, Back puts everything back. Moving makes App order "Your order".
  var MV = null;                                       // { id, pins, list, startPins, startList }
  function tilePins() { return load("tilePins") || []; }
  function tileArr() { return load("tileArr") || []; }
  function moveStart(it) {
    if (!it || !it.id || row >= tileRows) return;
    var ids = ordered().map(function (a) { return a.id; }), pins = tilePins().filter(function (p) { return ids.indexOf(p) >= 0; });
    MV = { id: it.id, pins: pins, list: ids, startPins: pins.join(), startList: ids.join() };
    document.body.classList.add("arranging");
    moveShow();
  }
  function moveShow() {
    layoutTiles();
    row = 0; col = ordered().map(function (a) { return a.id; }).indexOf(MV.id);
    render();
    els[0].forEach(function (el, i) {
      var id = ROWS[0][i].id;
      el.classList.toggle("moving", id === MV.id);
      if (MV.pins.indexOf(id) >= 0) { var b = document.createElement("i"); b.className = "pinb"; b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8"/></svg>'; el.appendChild(b); }
    });
  }
  function moveNav(action) {
    var ids = ordered().map(function (a) { return a.id; }), i = ids.indexOf(MV.id), pinned = MV.pins.indexOf(MV.id) >= 0;
    if (action === "left" || action === "right") {
      var j = i + (action === "left" ? -1 : 1);
      if (j < 0 || j >= ids.length || (MV.pins.indexOf(ids[j]) >= 0) !== pinned) return;   // pinned and unpinned stay apart
      ids[i] = ids[j]; ids[j] = MV.id;
      MV.list = ids;
      if (pinned) MV.pins = ids.filter(function (id) { return MV.pins.indexOf(id) >= 0; });
      moveShow();
    } else if (action === "up") {                      // pin to the front, or unpin to just after the pinned ones
      if (pinned) MV.pins = MV.pins.filter(function (id) { return id !== MV.id; }); else MV.pins = MV.pins.concat([MV.id]);
      var rest = ids.filter(function (id) { return id !== MV.id; });
      rest.splice(MV.pins.length - (pinned ? 0 : 1), 0, MV.id);
      MV.list = rest;
      moveShow();
      toast(pinned ? "Unpinned" : "Pinned to the front");
    } else if (action === "ok" || action === "menu") moveEnd(true);
    else if (action === "back") moveEnd(false);
  }
  function moveEnd(keep) {
    var m = MV, changed = m.list.join() !== m.startList || m.pins.join() !== m.startPins;
    MV = null;
    document.body.classList.remove("arranging");
    if (keep && changed) {
      save("tilePins", m.pins); save("tileArr", m.list);
      if (m.list.join() !== m.startList && PREFS.tileOrder !== "custom") {   // App order follows what you made
        PREFS.tileOrder = "custom";
        var sv = load("prefs") || {}; sv.tileOrder = "custom"; save("prefs", sv);
      }
      toast("Saved · Settings › Home screen › App order goes back to automatic");
    }
    layoutTiles();
    row = 0; col = Math.max(0, ordered().map(function (a) { return a.id; }).indexOf(m.id));
    render();
  }

  function addBanner(el, data) {
    if (!data || el.querySelector("img.banner")) return;
    var img = document.createElement("img");
    img.className = "banner";
    img.alt = "";
    img.addEventListener("error", function () { img.remove(); });   // a picture since deleted: the tile's own look
    img.src = data;
    el.appendChild(img);
  }

  // (Re)build the tile rows in the current order; the pill row stays last.
  function layoutTiles() {
    var pills = ROWS.length > tileRows ? ROWS[ROWS.length - 1] : null, pillEls = pills ? els[els.length - 1] : null;
    ROWS = []; els = [];
    gridEl.innerHTML = ""; dotsEl.innerHTML = "";
    var apps = ordered();
    for (var i = 0; i < apps.length; i += cols) ROWS.push(apps.slice(i, i + cols));
    tileRows = ROWS.length;
    ROWS.forEach(function (r) {
      var rowEl = document.createElement("div"), rowEls = [];
      rowEl.className = "trow";
      r.forEach(function (it) {
        var el = document.createElement("div");
        el.className = "tile " + it.cls;
        if (it.art) el.innerHTML = it.art;
        else { var s = document.createElement("span"); s.textContent = it.name; el.appendChild(s); }
        el.setAttribute("role", "listitem");
        el.setAttribute("aria-label", it.name);
        addBanner(el, tileArtOf(it.id) || BANNERS[it.id]);   // your own picture (hold OK › Change picture), else the app's
        rowEl.appendChild(el);
        rowEls.push(el);
      });
      gridEl.appendChild(rowEl);
      els.push(rowEls);
    });
    if (tileRows > 2) {
      for (var d = 0; d < tileRows; d++) dotsEl.appendChild(document.createElement("i"));
      dotsEl.style.top = (630 +(2 * tileH + 44) / 2 - (tileRows * 24 - 14) / 2) + "px";
      dotsEl.classList.add("on");
    }
    if (pills) { ROWS.push(pills); els.push(pillEls); }
    if (app && app.order) app.order(apps.map(function (a) { return a.id; }).join(","));   // for tools/audit.ps1
  }

  // One row of tiles for any number of apps (Apple TV top-shelf style): six fit on screen, and
  // moving left or right glides the row so the rest slide in; the next tile peeks in at the edge.
  var TILE_STEP = 292, TILE_VIS = 6, winStart = 0, tileCol = 0;   // 256 px tiles + 36 px gap
  function build(tv) {
    // tv.json's apps, then every app installed from the Appstore (the app lists them; Fire OS's own apps aren't included).
    var auto = []; try { auto = app && app.autoApps && PREFS.tileAuto !== "off" ? JSON.parse(app.autoApps()) : []; } catch (e) {}
    var pkgs = (tv.apps || []).concat(auto.filter(function (p) { return (tv.apps || []).indexOf(p) < 0; }));
    var hidden = hiddenTiles();                              // hold OK on a tile > Hide tile
    if (app) {                                               // an app removed while hidden leaves no trace in Hidden tiles
      var still = hidden.filter(function (p) { return /^offshore:/.test(p) || app.installed(p); });
      if (still.length < hidden.length) save("hiddenTiles", hidden = still);
    }
    if (liveTvOn() && pkgs.indexOf(LIVETV_ID) < 0) pkgs.push(LIVETV_ID);   // Live TV, once there are channels
    if (pkgs.indexOf("offshore:radio") < 0) pkgs.push("offshore:radio");    // Radio (24d-radio): needs nothing set up
    APPS = pkgs.filter(function (p) { return (/^offshore:/.test(p) || !app || app.installed(p)) && hidden.indexOf(p) < 0; }).map(appItem);
    FIRST = tv.first || "";
    var apps = APPS;
    cols = Math.max(1, apps.length);
    tileH = 144;
    tilesEl.style.top = "780px";                         // low, just over the bottom bar: the photo gets the rest
    tilesEl.classList.add("compact");                    // preview wordmarks shrink with the smaller tiles
    layoutTiles();

    hasKodi = apps.some(function (a) { return a.id === KODI; });
    var pills = PILLS.slice();
    var pillEls = [];
    pills.forEach(function (it) {
      var el = document.createElement("div");
      el.className = "pill glass";    // all bottom buttons look the same; `small` only affects D-pad down
      el.setAttribute("role", "listitem");
      el.innerHTML = ICON[it.icon] + "<span>" + T(it.name) + "</span>";
      document.getElementById("pills").appendChild(el);
      pillEls.push(el);
    });
    // Then the dock (Music, Bluetooth, Share, Mirror) and the status box, the last stop on the bottom row.
    DOCK.forEach(function (d) { pills.push(d); pillEls.push(document.getElementById(d.el)); });
    pills.push({ id: "system", name: "Notifications & System", line: "Notifications, Settings, Clear cache" + (hasKodi ? ", Close Kodi" : "") + " and device details.", small: true });
    pillEls.push(document.getElementById("status"));
    ROWS.push(pills);
    els.push(pillEls);
    var big = pills.filter(function (it) { return !it.small; }).length;
    lastBigPill = (big || pills.length - 1) - 1;          // with no big buttons, Down lands on the dock (never the status box)
  }


