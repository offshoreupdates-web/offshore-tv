  // ---- Bluetooth and Wi-Fi inside Settings (Devices.java), hidden tiles ------------------------------------------
  // Lists update by themselves while open (the app reports devices and networks as they're found). Fire TV's own screens
  // stay one row away as a fallback. The Fire TV remote can't be forgotten here, and Bluetooth is never turned off.
  var BT = {}, WIFI = {}, btSel = null, wifiTarget = "";
  var KIND = { audio: "Headphones or speaker", input: "Controller or keyboard", phone: "Phone", computer: "Computer", other: "Device" };
  window.guestBt = function (s) { BT = s; if (custOpen && /^bt/.test(custMode)) renderCustom(); };
  window.guestWifi = function (s) { WIFI = s; if (custOpen && custMode === "wifi") renderCustom(); };
  window.guestPerm = function (ok) {
    if (ok && app) { if (custMode === "bt") app.btScan(); if (custMode === "wifi") app.wifiScan(); }
    else if (!ok) toast("Without it, nearby devices and networks can't be listed");
    if (custOpen) renderCustom();
  };
  function bars(l) { return "▂▄▆█".slice(0, Math.max(1, Math.min(4, l))); }
  function permRows(what) {
    return [{ label: "Allow finding nearby " + what, value: "›", act: true, id: "perm" },
            { label: "Android asks once: it ties searching to location access. No location is used.", act: true, none: true }];
  }
  function enterDevices(mode) {
    custMode = mode; custRow = 0;
    if (!app || !app.btState) return;
    try { if (mode === "bt") BT = JSON.parse(app.btState()); else WIFI = JSON.parse(app.wifiState()); } catch (e) {}
    if (app.locPermission()) { if (mode === "bt") app.btScan(); else app.wifiScan(); }
  }
  function btRows() {
    if (!app || !app.btState) return [{ label: "Bluetooth works on the TV", act: true, none: true }];
    var rows = [], paired = BT.paired || [];
    if (paired.length) rows.push({ label: "Paired", act: true, none: true });
    paired.forEach(function (d) { rows.push({ label: d.name, value: (d.connected ? "Connected" : "Paired") + "  ›", act: true, dev: d }); });
    if (!app.locPermission()) return rows.concat(permRows("devices"), [{ label: "Fire TV Bluetooth settings", value: "›", act: true, id: "fire" }]);
    rows.push({ label: BT.scanning ? "Looking for devices… (put yours in pairing mode)" : "Nearby", act: true, none: true });
    (BT.near || []).forEach(function (d) { rows.push({ label: d.name, value: d.pairing ? "Pairing…" : KIND[d.kind] + " · Pair", act: true, near: d }); });
    rows.push({ label: "Search again", value: "›", act: true, id: "scan" });
    rows.push({ label: "Fire TV Bluetooth settings", value: "›", act: true, id: "fire" });
    return rows;
  }
  function btDevRows() {
    var d = btSel || {}, rows = [];
    if (d.kind === "audio" && !d.connected) rows.push({ label: "Connect", value: "›", act: true, id: "connect" });
    if (!d.locked) rows.push({ label: "Forget this device", value: "›", act: true, id: "forget" });
    else rows.push({ label: "The Fire TV remote stays paired, so the TV keeps working", act: true, none: true });
    rows.push({ label: KIND[d.kind] + (d.connected ? " · connected" : ""), act: true, none: true });
    return rows;
  }
  function wifiRows() {
    if (!app || !app.wifiState) return [{ label: "Wi-Fi works on the TV", act: true, none: true }];
    var rows = [];
    if (WIFI.now) rows.push({ label: WIFI.now, value: "Connected  " + bars(WIFI.nowLevel), act: true, id: "current" });
    if (!app.locPermission()) return rows.concat(permRows("networks"), [{ label: "Fire TV network settings", value: "›", act: true, id: "fire" }]);
    var nets = (WIFI.networks || []).filter(function (n) { return n.ssid !== WIFI.now; }).sort(function (a, b) { return b.level - a.level; });
    if (!nets.length) rows.push({ label: WIFI.scanned ? "No other networks found" : "Looking for networks…", act: true, none: true });
    nets.slice(0, 12).forEach(function (n) {
      rows.push({ label: n.ssid, value: (n.saved ? "Saved · " : "") + (n.sec === "open" ? "Open" : "Secured") + "  " + bars(n.level), act: true, net: n });
    });
    rows.push({ label: "Search again", value: "›", act: true, id: "scan" });
    rows.push({ label: "Fire TV network settings", value: "›", act: true, id: "fire" });
    return rows;
  }
  function devicesNav(action, rows) {
    var r = rows[custRow]; if (!r || action !== "ok") return;
    var fire = custMode === "wifi" ? "network" : "bluetooth";
    if (r.id === "perm") app.askLocPermission();
    else if (r.id === "scan") { if (custMode === "bt") app.btScan(); else app.wifiScan(); toast("Searching…"); }
    else if (r.id === "fire") { if (custDirty) { toast("Save settings first"); return; } closeCustom(); app.launch(fire); }
    else if (r.dev) { btSel = r.dev; custMode = "btdev"; custRow = 0; }
    else if (r.near) { app.btPair(r.near.addr); toast("Pairing with " + r.near.name + "… some devices ask you to confirm"); }
    else if (r.id === "connect") { toast(app.btConnect(btSel.addr) ? "Connecting to " + btSel.name + "…" : "Couldn't connect from here: try Fire TV Bluetooth settings"); }
    else if (r.id === "forget") {
      if (app.btForget(btSel.addr)) { toast("Forgot " + btSel.name); custMode = "bt"; custRow = 0; try { BT = JSON.parse(app.btState()); } catch (e) {} }
      else toast("Couldn't forget it here: try Fire TV Bluetooth settings");
    }
    else if (r.id === "current") toast("Connected to " + WIFI.now);
    else if (r.net) {
      var n = r.net;
      if (n.saved || n.sec === "open") { var res = app.wifiJoin(n.ssid, ""); toast(res === "ok" ? "Joining " + n.ssid + "…" : "Couldn't join " + n.ssid); }
      else if (n.sec === "wpa") { wifiTarget = n.ssid; kbField = "wifipass"; kbText = ""; kbIdx = 0; kbShift = false; custMode = "search"; }
      else toast("This kind of network is joined in Fire TV network settings");
    }
  }
