  // ---- Network folder (Settings > Backgrounds > Network folder) ----------------------------------------------
  // Photos from the owner's NAS over SMB or NFS (the app does the network part, see Nas.java). The NAS decides access:
  // an SMB user that can read the folder, or the TV's address allowed on the NFS export. Only the photo on screen and
  // the next are kept on the TV. "Keep downloads on the NAS" puts downloaded categories there too (Offshore/<category>).
  var NASF = null, NASLIST = [], nasSeq = 0, pendingNas = {}, nasState = "";   // NASF: the settings being edited
  var NFS_IDS = [1000, 1026, 501, 99, 65534];    // common NAS user ids (Linux, Synology, macOS, unRAID nobody, nobody)
  var KB_HINT = { search: "Type a topic, like “northern lights”", vidq: "Type a topic, like “waterfall” or “space station”", host: "NAS name or address, like 192.168.1.20",
                  share: "Share name (SMB) or export path (NFS)", folder: "Folder inside the share (optional)",
                  user: "User name on the NAS", pass: "Password", wifipass: "Wi-Fi password", sound: "A sound, like “chime”, “click” or “bell”" };
  window.guestNas = function (id, ok, text) { var p = pendingNas[id]; delete pendingNas[id]; if (p) (ok ? p[0] : p[1])(text); };
  function nasCall(method, arg) {
    return new Promise(function (res, rej) { var id = "n" + (++nasSeq); pendingNas[id] = [res, rej]; if (arg == null) app[method](id); else app[method](id, arg); });
  }
  function nasReady() { return !!(app && app.nasGet); }
  function nasInfo() { try { return nasReady() ? JSON.parse(app.nasGet()) : {}; } catch (e) { return {}; } }
  function loadNasList() {
    if (!nasInfo().host) return Promise.resolve([]);
    return nasCall("nasList").then(function (t) {
      NASLIST = JSON.parse(t);
      nasState = NASLIST.length + (NASLIST.length === 1 ? " photo" : " photos");
      return NASLIST;
    }, function (e) { nasState = e; throw e; });
  }
  function nasRows() {
    var f = NASF, smb = f.type !== "nfs", rows = [
      { label: "Type", value: smb ? "SMB (Windows, Mac and most NAS)" : "NFS", id: "type" },
      { label: "NAS address", value: f.host || "Not set", id: "host", act: true },
      { label: smb ? "Share" : "Export path", value: f.share || "Not set", id: "share", act: true },
      { label: "Folder", value: f.folder || "Whole share", id: "folder", act: true }];
    if (smb) {
      rows.push({ label: "User", value: f.user || "Guest", id: "user", act: true });
      rows.push({ label: "Password", value: f.pass ? "••••••" : f.hasPass && !f.clearPass ? "Saved" : "None", id: "pass", act: true });
    } else rows.push({ label: "NFS user ID", value: String(f.uid || 1000), id: "uid" });
    rows.push({ label: "Test and save", value: nasState, act: true, id: "test", save: true });
    rows.push({ label: "Show these photos", value: PREFS.bg === "nas" ? "✓" : "", act: true, id: "use" });
    if (nasInfo().host) rows.push({ label: "Forget this NAS", act: true, id: "forget" });
    rows.push({ label: smb ? "Your NAS decides access: use a user that can read this folder" : "Your NAS decides access: allow this TV's address on the export",
                act: true, none: true });
    return rows;
  }
  function nasRowIndex(id) { return Math.max(0, nasRows().map(function (r) { return r.id; }).indexOf(id)); }
  function nasOpen() {
    NASF = nasInfo();
    NASF.type = NASF.type || "smb"; NASF.uid = NASF.uid || 1000; NASF.pass = "";
    custMode = "nas"; custRow = 0;
  }
  function nasNav(action, rows) {
    var r = rows[custRow], change = action === "ok" || action === "left" || action === "right";
    if (!r) return;
    if (r.id === "type" && change) NASF.type = NASF.type === "nfs" ? "smb" : "nfs";
    else if (r.id === "uid" && change) {
      var i = NFS_IDS.indexOf(NASF.uid);
      NASF.uid = NASF.gid = NFS_IDS[(i + (action === "left" ? NFS_IDS.length - 1 : 1)) % NFS_IDS.length];
    }
    else if (action !== "ok") return;
    else if (/^(host|share|folder|user|pass)$/.test(r.id)) { kbField = r.id; kbText = r.id === "pass" ? "" : NASF[r.id] || ""; kbIdx = 0; kbShift = false; custMode = "search"; }
    else if (r.id === "test") {
      if (!NASF.host || !NASF.share) { toast("Enter the NAS address and share first"); return; }
      app.nasSet(JSON.stringify(NASF));
      NASF.pass = ""; NASF.hasPass = nasInfo().hasPass;
      nasState = "Connecting…";
      loadNasList().then(function (l) { toast("Connected · " + nasState); if (custOpen) renderCustom(); },
                         function (e) { toast(e); if (custOpen) renderCustom(); });
    }
    else if (r.id === "use") {
      if (!NASLIST.length) toast("Test and save first (the folder needs some photos)");
      else { PREFS.bg = "nas"; applyPrefs("bg"); }
    }
    else if (r.id === "forget") {
      app.nasForget();
      NASLIST = []; nasState = ""; NASF = { type: "smb", uid: 1000 };
      if (PREFS.bg === "nas") { PREFS.bg = "time"; applyPrefs("bg"); }
      toast("Network folder removed");
    }
  }
  if (nasInfo().host) loadNasList().then(function () { if (PREFS.bg === "nas") { shownSet = ""; nextPhoto(); } }, function () {});
  setInterval(function () { if (nasInfo().host && homeVisible) loadNasList().catch(function () {}); }, 30 * 60000);

  function bgName(v) {
    if (v === "nas") return "Network folder";
    var b = PREF_ROWS.filter(function (r) { return r.key === "bg"; })[0].opts.filter(function (o) { return o[0] === v; })[0];
    if (b) return b[1];
    var c = v.indexOf("cat:") === 0 && catOf(v.slice(4));
    return c ? c.name : "Follow time of day";
  }

