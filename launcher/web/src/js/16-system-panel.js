  // ---- System panel ---------------------------------------------------------------------------------------
  // Device details from the app (Offshore.systemInfo): model, Fire OS, app version, IP, storage, memory, uptime, screen.
  var sysOpen = false;
  function gb(b) { return (b / 1073741824).toFixed(b < 10737418240 ? 1 : 0) + " GB"; }
  function openSystem() {
    var s = {};
    try { s = app && app.systemInfo ? JSON.parse(app.systemInfo()) : {}; } catch (e) { s = {}; }
    if (!app) s = { model: "Fire TV (preview)", os: "Fire OS", app: "preview", ip: "192.168.1.20", storageFree: 5.2e9, storageTotal: 10.7e9,
      memFree: 0.8e9, memTotal: 1.9e9, uptime: 93 * 3600000, screen: "1920 × 1080 (TV 3840 × 2160)", sound: "HDMI ARC · Soundbar · Dolby Digital Plus" };
    var net = !NET.online || NET.type === "none" ? "Offline" : NET.type === "ethernet" ? "Ethernet" : "Wi-Fi · " + ["Weak", "Weak", "Fair", "Good", "Excellent"][NET.bars || 0] + " signal";
    var up = s.uptime ? Math.floor(s.uptime / 86400000) + " d " + Math.floor(s.uptime % 86400000 / 3600000) + " h" : "—";
    var rows = [["Room", room()], ["Device", s.model], ["Software", s.os], ["Network", net], ["IP address", s.ip || "—"], ["VPN", NET.vpn ? "Connected" : "Off"],
      ["Storage free", s.storageTotal ? gb(s.storageFree) + " of " + gb(s.storageTotal) : "—"],
      ["Memory free", s.memTotal ? gb(s.memFree) + " of " + gb(s.memTotal) : "—"], ["Up for", up],
      ["Screen", s.screen || "—"], ["Home screen", "Version " + (s.app || "—")], ["Sound", s.sound || "—"]];
    var grid = document.getElementById("sysGrid");
    grid.innerHTML = "";
    rows.forEach(function (r) {
      var cell = document.createElement("div"), k = document.createElement("div"), v = document.createElement("div");
      k.className = "k"; k.textContent = r[0]; v.className = "v"; v.textContent = r[1] || "—";
      if (r[0] === "Sound") cell.className = "wide";       // formats need the full width
      var adb = r[0] === "Home screen" ? adbState() : null;   // left on after setup? say so (Settings > Security & privacy)
      if (adb && adb.on) { var w = document.createElement("span"); w.className = "warn"; w.textContent = " · Developer access on"; v.appendChild(w); }
      cell.appendChild(k); cell.appendChild(v); grid.appendChild(cell);
    });
    sysOpen = true;
    sysFocus = 0;
    sysRow = 0;
    renderSysButtons();
    document.getElementById("sys").classList.add("open");
    document.getElementById("sysdim").classList.add("open");
  }

  // Clear and Pause buttons at the top of the panel (◀ ▶ to choose, OK to use).
  var sysFocus = 0;
  var TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  var SLIDERS = '<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
  var sysRow = 0;                       // 0: Clear all / Pause / Settings, 1: maintenance (Clear cache, Close Kodi)
  function maintItems() { return MAINT.filter(function (m) { return m.id !== "kill_kodi" || hasKodi; }); }
  function renderSysButtons() {
    var b = [document.getElementById("bClear"), document.getElementById("bPause"), document.getElementById("bCust")];
    var un = unreadNotes();
    b[0].innerHTML = SICON.bell + "Notifications" + "<small>" + (un ? un + " new" : NOTE_LOG.length ? "Read" : "None") + "  ›</small>";
    b[1].innerHTML = MOON + (isPaused() ? "Paused" : "Pause") + "<small>" + pauseLabel().replace("Until you turn it on", "Until on") + "</small>";
    b[2].innerHTML = SLIDERS + "Settings" + "<small>›</small>";
    b.forEach(function (el, i) { el.classList.toggle("focus", sysRow === 0 && sysFocus === i); });
    var row = document.getElementById("maint");
    row.innerHTML = "";
    maintItems().forEach(function (m, i) {
      var el = document.createElement("div");
      el.className = "sbtn glass" + (sysRow === 1 && sysFocus === i ? " focus" : "");
      el.innerHTML = ICON[m.icon] + m.name + "<small>" + m.hint + "</small>";
      row.appendChild(el);
    });
  }
  function runMaint(m) {                // Clear cache / Close Kodi: handled by the app's Home-button service, which reports back
    closeSystem();
    if (app && window.Offshore.launch) window.Offshore.launch(m.id);
    else toast("Would do: " + m.done);
  }
  function clearNotices() {
    NOTICES = [];
    NOTE_LOG = []; save("noticelog", NOTE_LOG);
    renderStatus();
    renderSysButtons();
    toast("Notifications cleared");
  }
  // Notifications: the history as a list (unread marked), and one notice in full. Shown on the Settings sheet so it
  // scrolls and focuses like every other list; Back from the list closes it.
  var noteSel = 0;
  function openInbox() {
    closeSystem();
    openCustom(true);                                // reading needs no PIN; the only shortcut inside is read-only
    dockEntry = true; custMode = "inbox"; custRow = NOTE_LOG.length ? 1 : 0;   // the newest, below Clear all
    renderCustom();
  }
  function noteWhen(t) {
    return new Date(t).toDateString() === new Date().toDateString() ? hm(t) : dayText(t, { weekday: "short", month: "short", day: "numeric" }) + " " + hm(t);
  }
  function inboxRows() {
    if (!NOTE_LOG.length) return [{ label: "No notifications. Weather alerts, updates and notices from your devices appear here.", act: true, none: true }];
    // Clear all leads the list (owner: easy to find); the list opens on the newest notification, so a quick OK reads it.
    return [{ label: "Clear all notifications", value: NOTE_LOG.length + (NOTE_LOG.length === 1 ? " notification" : " notifications"), act: true, id: "clear" }]
      .concat(NOTE_LOG.map(function (n, i) { return { label: (n.read ? "" : "●  ") + (n.title || n.message), value: noteWhen(n.at) + "  ›", act: true, note: i }; }));
  }
  function noteRows() {
    var n = NOTE_LOG[noteSel];
    if (!n) return [{ label: "This notification was removed", act: true, none: true }];
    if (!n.read) { n.read = true; save("noticelog", NOTE_LOG); renderStatus(); }
    var rows = [{ label: n.title || n.source || "Notification", value: "", act: true, id: "head" }];
    if (n.message && n.title && !(n.details && n.details.length)) rows.push({ label: n.message, act: true, none: true });   // the notes say it in full
    (n.details || []).forEach(function (d) { rows.push({ label: "•  " + d, act: true, none: true }); });
    rows.push({ label: (n.source ? n.source + " · " : "") + dayText(n.at, { weekday: "long", month: "long", day: "numeric" }) + " " + hm(n.at), act: true, none: true });
    if (n.action === "whatsnew") rows.push({ label: "What's new", value: "›", act: true, go: "whatsnew" });
    if (n.action === "perms") rows.push({ label: "Permissions & setup", value: "›", act: true, go: "perms" });
    rows.push({ label: "Delete", value: "", act: true, id: "del" });
    return rows;
  }
  function inboxNav(action, rows) {
    var r = rows[custRow];
    if (!r || action !== "ok") return;
    if (custMode === "inbox") {
      if (r.note != null) { noteSel = r.note; custMode = "notice"; custRow = 0; }
      else if (r.id === "clear") { clearNotices(); custRow = 0; }
    } else {
      if (r.go) { custMode = r.go; custRow = 0; }
      else if (r.id === "del") { NOTE_LOG.splice(noteSel, 1); save("noticelog", NOTE_LOG); renderStatus(); custMode = "inbox"; custRow = NOTE_LOG.length ? Math.min(noteSel, NOTE_LOG.length - 1) + 1 : 0; toast("Deleted"); }
    }
  }

