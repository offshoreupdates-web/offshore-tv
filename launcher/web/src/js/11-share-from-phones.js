  // ---- Receive from phones (Settings; the app does the LocalSend part, see LocalSend.java) ---------------------
  // Someone sends from the LocalSend app on their phone or computer: a card asks here first (declined after 60 s; with
  // "code" on, the code shown here must be typed on the phone first). Received photos open full screen.
  var shareReq = null, shareFocus = 0, shareTimer = 0, viewerList = [], viewerIdx = 0, viewerFrom = "";
  function shareSync() {
    if (app && app.shareConfig) app.shareConfig(JSON.stringify({ on: PREFS.share !== "off", pin: PREFS.share === "pin", alias: room() + " TV" }));
    if (app && app.setDeviceName) app.setDeviceName(room() + " TV");   // the same name in Bluetooth (headphones, phones)
  }
  setTimeout(shareSync, 3000);                         // after tv.json has set the room name
  function mb(n) { return n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : n >= 1e6 ? Math.round(n / 1e6) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB"; }
  function shareCard(title, sub, buttons, foot) {
    document.getElementById("saTitle").textContent = title;
    document.getElementById("saSub").innerHTML = sub;
    document.getElementById("saActs").style.display = buttons ? "" : "none";
    document.getElementById("saFoot").textContent = foot;
    document.getElementById("shareAsk").classList.add("open");
    document.getElementById("sysdim").classList.add("open");
    document.body.classList.add("asking");                          // other open panels step aside until it's answered
    renderShareButtons();
  }
  function renderShareButtons() {
    document.getElementById("saYes").classList.toggle("focus", shareFocus === 0);
    document.getElementById("saNo").classList.toggle("focus", shareFocus === 1);
  }
  function closeShare() {
    clearTimeout(shareTimer);
    shareReq = null;
    document.getElementById("shareAsk").classList.remove("open");
    document.body.classList.remove("asking");
    if (!sysOpen && !custOpen && !weekOpen && !dockCard) document.getElementById("sysdim").classList.remove("open");
  }
  // Text only, never markup; quotes too, so it's also safe inside an attribute (a station's logo address, say).
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  window.guestShare = function (id, r) {
    wake();
    if (shareReq && shareReq.id && app) app.shareAnswer(shareReq.id, false);
    shareReq = { id: id, pin: false };
    shareFocus = 0;
    var what = r.photos === r.count ? r.count + (r.count === 1 ? " photo" : " photos")
             : r.videos === r.count ? r.count + (r.count === 1 ? " video" : " videos") : r.count + (r.count === 1 ? " file" : " files");
    var names = (r.names || []).map(esc).join(", ") + (r.count > 3 ? " and " + (r.count - 3) + " more" : "");
    shareCard(r.from + " wants to send " + what,
      "<b>" + mb(+r.bytes || 0) + "</b> · " + names + ((r.refused | 0) ? "<br>" + (r.refused | 0) + " app or script file(s) will be left out" : ""),
      true, "Only accept from people you know · ◀ ▶ choose · OK");
    clearTimeout(shareTimer);
    shareTimer = setTimeout(function () { if (shareReq && shareReq.id === id) closeShare(); }, 60000);   // the app declines too
  };
  function sharePinNow() { return app && app.sharePin ? app.sharePin() || "------" : "123456"; }   // the preview shows a sample
  window.guestSharePin = function (pin, from) {
    wake();
    if (dockCard === "share") openDockCard("share", true);         // after wrong tries the code is new
    shareReq = { id: "", pin: true };
    shareCard("Enter this code in LocalSend", '<div class="sa-code">' + esc(pin.slice(0, 3) + " " + pin.slice(3)) + "</div>", false,
      "It's asked for on the phone or computer sending · Back to close");
    clearTimeout(shareTimer);
    shareTimer = setTimeout(function () { if (shareReq && shareReq.pin) closeShare(); }, 120000);
  };
  window.guestShareDone = function (res) {
    if (res.cancelled && !res.files.length) { toast("The transfer was cancelled"); return; }
    var photos = res.files.filter(function (f) { return /^image\//.test(f.type); });
    guestNotice({ title: "Received " + res.files.length + (res.files.length === 1 ? " file" : " files") + " from " + res.from,
                  message: photos.length ? "Photos open on screen. Others are kept in this TV's received files." : "Kept in this TV's received files.",
                  level: "info", source: "LocalSend" });
    var vids = res.files.filter(function (f) { return /^video\/(mp4|webm|quicktime|x-matroska)/.test(f.type) && f.url; });
    if (vids.length) {                                              // videos become a live background ("Videos from phones")
      var vs = load("vidset:shared") || { t: Date.now(), videos: [], kept: true };
      vids.forEach(function (f) { vs.videos.push({ u: f.url, a: res.from, shared: true }); });
      vs.videos = vs.videos.slice(-20);
      save("vidset:shared", vs);
    }
    var bgs = photos.filter(function (f) { return f.bg; });         // kept as backgrounds too ("Shared photos")
    if (bgs.length) {
      var set = load("bgset:shared") || { t: Date.now(), photos: [] };
      bgs.forEach(function (f) { set.photos.push({ u: f.bg, a: res.from, shared: true }); });
      set.photos = set.photos.slice(-100);
      save("bgset:shared", set);
    }
    if (photos.length && homeVisible) openViewer(photos.map(function (f) { return f.url; }), res.from);
  };
  function deleteReceived() {                         // received files, and the live background made from their videos
    if (app && app.shareDelete) app.shareDelete();
    deleteVid("shared");
    toast("Received files deleted");
  }
  var viewerNames = null;                              // Files: each photo's name in the caption, OK just closes
  function openViewer(list, from, names, at) {
    viewerList = list; viewerIdx = at || 0; viewerFrom = from; viewerNames = names || null;
    document.getElementById("viewer").classList.add("open");
    showViewer();
  }
  function showViewer() {
    document.getElementById("vImg").src = viewerList[viewerIdx];
    document.getElementById("vCap").textContent = (viewerList.length > 1 ? (viewerIdx + 1) + " of " + viewerList.length + " · " : "") +
      (viewerNames ? viewerNames[viewerIdx] + " · " + (viewerList.length > 1 ? "◀ ▶ · " : "") + "Back to close"
                   : "From " + viewerFrom + " · " + (viewerList.length > 1 ? "◀ ▶ · " : "") + "OK: use as background · Back to close");
  }
  function closeViewer() { viewerList = []; viewerNames = null; document.getElementById("viewer").classList.remove("open"); document.getElementById("vImg").removeAttribute("src"); }

  // ---- Files (bottom bar, and Settings > Network & storage > Files) ----------------------------------------------
  // How the TV's space is used (by kind, as Fire TV counts it), then places on the left (This TV, its main folders,
  // files from phones, USB drives) and the open folder on the right: name, kind, size, and the date and time it last
  // changed. ◀ ▶ moves between the two sides; ▲ from the first file reaches the column names, where ◀ ▶ changes the
  // sort. OK opens a folder or shows a photo; Back goes up a folder, then closes. Names come from the disk: never markup.
  // The app only answers for paths inside the places (Files.java). Reading the TV's folders and USB drives needs
  // Android's storage permission, asked once with its own prompt; files from phones are always readable.
  // Managing: ▶ or holding OK on a file or folder opens its options (Open, Rename, Copy, Move, Delete).
  // Copy and Move remember the item (FM.clip); you go to the folder you want and ▶ there offers Paste here. Delete
  // always asks first, with Cancel in focus. Videos, music and documents open in an app that can play or read them
  // (FileShare hands that app the one file); app installers never open. Every change needs a real OK press (Home.java).
  var FM = { open: false, side: "list", pi: 0, li: 0, sort: "name", path: "", root: "", items: [], st: null, denied: false, pop: null, clip: null, busy: null };
  var FM_ROWS = 8, FM_SORTS = [["name", "Name"], ["kind", "Kind"], ["size", "Size"], ["date", "Modified"]];
  var FM_COL = { apps: "#0a84ff", images: "#ff9f0a", video: "#bf5af2", audio: "#ff375f", files: "#30d158", system: "#8e8e93" };
  var FM_ICON = {
    folder: ["#0a84ff", DICON_FILES()],
    image: ["#ff9f0a", '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-8 8"/></svg>'],
    video: ["#bf5af2", '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>'],
    audio: ["#ff375f", '<svg viewBox="0 0 24 24"><path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>'],
    apk: ["#30d158", '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10 18h4"/></svg>'],
    zip: ["#8e8e93", '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M11 6h2M11 9h2M11 12h2M11 15h2"/></svg>'],
    doc: ["#64d2ff", '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>'],
    tv: ["#5e5ce6", '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'],
    usb: ["#30d158", '<svg viewBox="0 0 24 24"><rect x="7" y="9" width="10" height="12" rx="2"/><path d="M9 9V3h6v6M11 5v1M13 5v1"/></svg>'],
    received: ["#0a84ff", '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>'],
    nas: ["#ff9f0a", '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>'],
    nasSetup: ["#8e8e93", '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="2"/><path d="M7 7.5h.01M12 14v7M8.5 17.5h7"/></svg>']
  };
  function DICON_FILES() { return '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'; }
  function fmIco(k) { var i = FM_ICON[k] || FM_ICON.doc; return '<i class="fm-ico" style="background:' + i[0] + '">' + i[1] + "</i>"; }
  function bytes(b) {
    if (b == null) return "";
    if (b < 1024) return b + (b === 1 ? " byte" : " bytes");
    var u = ["KB", "MB", "GB", "TB"], i = -1;
    do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
    return (b < 10 ? b.toFixed(1) : Math.round(b)) + " " + u[i];
  }
  function fmWhen(t) {
    if (!t) return "";
    var d = new Date(t);
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) + "  " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function fmExt(n) { var i = n.lastIndexOf("."); return i > 0 ? n.slice(i + 1).toLowerCase() : ""; }
  // The kind of a file in words, and which icon it gets.
  function fmKind(it) {
    if (it.dir) return { k: "folder", t: it.n == null ? "Folder" : "Folder · " + it.n + (it.n === 1 ? " item" : " items") };
    var m = it.mime || "", e = fmExt(it.name), E = e.toUpperCase();
    if (/^image\//.test(m)) return { k: "image", t: E + " image" };
    if (/^video\//.test(m)) return { k: "video", t: E + " video" };
    if (/^audio\//.test(m)) return { k: "audio", t: E + " audio" };
    if (e === "apk" || e === "apks" || e === "xapk") return { k: "apk", t: "App installer" };
    if (/^(zip|rar|7z|tar|gz|tgz|bz2|xz)$/.test(e)) return { k: "zip", t: E + " archive" };
    if (e === "pdf") return { k: "doc", t: "PDF document" };
    if (/^text\//.test(m)) return { k: "doc", t: E ? E + " text" : "Text" };
    return { k: "doc", t: E ? E + " file" : "File" };
  }
  function fmJson(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }
  function fmDemo() {                                  // the computer preview (?files=demo): made-up files to design with
    var now = Date.now(), h = 3600000;
    return { st: { allowed: true, total: 12.4e9, free: 3.7e9, apps: 4.1e9, images: 0.6e9, video: 1.9e9, audio: 0.2e9, files: 0.3e9,
                   places: [{ label: "This TV", path: "/tv", kind: "tv" }, { label: "Downloads", path: "/tv/Download", kind: "folder" }, { label: "Pictures", path: "/tv/Pictures", kind: "folder" },
                            { label: "Movies", path: "/tv/Movies", kind: "folder" }, { label: "From phones", path: "/recv", kind: "received", size: 48e6 },
                            { label: "SanDisk USB", path: "/usb", kind: "usb", total: 64e9, free: 51e9 },
                            { label: q.get("nas") === "none" ? "Network folder" : "media on 192.168.1.20", path: q.get("nas") === "none" ? "" : "nas:", kind: q.get("nas") === "none" ? "nasSetup" : "nas", type: "smb", writable: true }] },
             items: [{ name: "Vacation", dir: true, n: 42, mod: now - 30 * h }, { name: "Screenshots", dir: true, n: 7, mod: now - 200 * h },
                     { name: "beach-sunset.jpg", size: 4.2e6, mime: "image/jpeg", mod: now - 2 * h }, { name: "birthday.mp4", size: 812e6, mime: "video/mp4", mod: now - 50 * h },
                     { name: "playlist.mp3", size: 7.9e6, mime: "audio/mpeg", mod: now - 400 * h }, { name: "Downloader.apk", size: 9.1e6, mime: "", mod: now - 900 * h },
                     { name: "wifi-guest-card.pdf", size: 220e3, mime: "application/pdf", mod: now - 1200 * h }, { name: "backup.zip", size: 1.3e9, mime: "", mod: now - 2000 * h },
                     { name: "notes.txt", size: 1800, mime: "text/plain", mod: now - 20 * h }, { name: "IMG_2041.HEIC", size: 2.8e6, mime: "image/heic", mod: now - 80 * h }] };
  }
  function openFiles() {
    if (custOpen) closeCustom();
    FM.open = true; FM.side = "places"; FM.pi = 0; FM.li = 0; FM.denied = false;
    fmStorage();
    fmPlace(0);
    document.getElementById("files").classList.add("open");
    document.body.classList.add("bigpanel");
    document.getElementById("sysdim").classList.add("open");
    renderFiles();
  }
  function closeFiles() {
    FM.pick = null;
    FM.open = false; FM.items = []; FM.pop = null;
    if (!FM.busy) FM.clip = null;                          // a copy still running finishes, and says so
    document.getElementById("files").classList.remove("open");
    if (!LT.open) document.body.classList.remove("bigpanel");
    if (!sysOpen && !custOpen && !weekOpen && !dockCard) document.getElementById("sysdim").classList.remove("open");
  }
  function fmStorage() { FM.st = app && app.filesStorage ? fmJson(app.filesStorage(), {}) : q.get("files") === "demo" ? fmDemo().st : null; }
  function fmPlace(i) {                                // show a place's top folder
    var pl = FM.st && FM.st.places ? FM.st.places[i] : null;
    FM.pi = i; FM.root = pl ? pl.path : "";
    fmLoad(FM.root);
  }
  function fmNas(p) { return /^nas:/.test(p || ""); }
  function fmPlaceAt() { return FM.st && FM.st.places ? FM.st.places[FM.pi] : null; }
  function fmLoad(path, keepName) {
    FM.path = path; FM.items = []; FM.denied = false; FM.loading = false; FM.nasErr = "";
    var pl = fmPlaceAt();
    if (pl && pl.kind === "nasSetup") { FM.li = -1; return; }
    if (fmNas(path)) {                                     // the network folder answers later (guestFilesListed)
      FM.loading = true; FM.keep = keepName || ""; FM.li = 0;
      if (app && app.filesNas) app.filesNas("list", path, "");
      else { FM.loading = false; if (q.get("files") === "demo") { FM.items = fmDemo().items; fmSort(); } }
      return;
    }
    if (app && app.filesList) {
      var r = fmJson(app.filesList(path), {});
      if (r.ok) FM.items = r.items || []; else FM.denied = true;
    } else if (q.get("files") === "demo") FM.items = fmDemo().items;
    fmSort();
    FM.li = 0;
    if (keepName) FM.items.forEach(function (it, k) { if (it.name === keepName) FM.li = k; });
  }
  function fmSort() {
    var by = FM.sort, kind = function (it) { return fmKind(it).t; };
    FM.items.sort(function (a, b) {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;           // folders first, whatever the sort
      var c = by === "date" ? b.mod - a.mod : by === "size" ? (b.size || 0) - (a.size || 0) : by === "kind" ? kind(a).localeCompare(kind(b)) : 0;
      return c || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
  }
  window.guestFilesListed = function (r) {
    if (!FM.open || r.path !== FM.path) return;          // an answer for a folder we've left
    FM.loading = false;
    if (r.ok) { FM.items = r.items || []; fmSort(); FM.li = 0; FM.items.forEach(function (it, k) { if (it.name === FM.keep) FM.li = k; }); }
    else FM.nasErr = r.error || "Couldn't open this folder";
    if (FM.side === "list" && !FM.items.length) FM.li = -1;
    renderFiles();
  };
  function fmNasSetup() {                                 // Settings > Network & storage > Network folder (NAS)
    closeFiles();
    if (PREFS.custPin) { openCustom(); toast("Then Network & storage › Network folder"); return; }
    openCustom(true);
    if (nasReady()) { nasReturn = "g:net"; nasOpen(); } else { custMode = "g:net"; custRow = 0; toast("Network folders work on the TV"); }
    renderCustom();
  }
  // Files from phones arrive in one folder per transfer (named by a code): shown by when they came instead.
  function fmName(it) {
    var pl = FM.st && FM.st.places[FM.pi];
    return pl && pl.kind === "received" && it.dir && FM.path === FM.root ? "Received " + fmWhen(it.mod) : it.name;
  }
  function renderFiles() {
    var st = FM.st || {};
    // Storage: used of total, then by kind (when the TV allows the breakdown).
    var used = st.total ? st.total - st.free : 0, parts = [];
    if (st.apps != null) {
      parts = [["apps", "Apps", st.apps], ["images", "Photos", st.images], ["video", "Videos", st.video], ["audio", "Music", st.audio], ["files", "Other files", st.files]];
      var known = parts.reduce(function (s, p) { return s + (p[2] || 0); }, 0);
      parts.push(["system", "System", Math.max(0, used - known)]);
    } else if (used) parts = [["apps", "Used", used]];
    document.getElementById("fmSum").innerHTML = st.total ? "<b>" + bytes(used) + "</b> used of " + bytes(st.total) + "  ·  <b>" + bytes(st.free) + "</b> free" : app ? "" : "Storage shows on the TV";
    document.getElementById("fmBar").innerHTML = parts.map(function (p) {
      return p[2] > 0 ? '<i style="width:' + (100 * p[2] / st.total).toFixed(2) + "%;background:" + FM_COL[p[0]] + '"></i>' : "";
    }).join("");
    document.getElementById("fmLegend").innerHTML = parts.map(function (p) {
      return p[2] > 0 ? '<span><em style="background:' + FM_COL[p[0]] + '"></em>' + p[1] + " <b>" + bytes(p[2]) + "</b></span>" : "";
    }).join("") + (st.total ? '<span><em style="background:rgba(255,255,255,.25)"></em>Free <b>' + bytes(st.free) + "</b></span>" : "");
    // Places.
    var places = st.places || [];
    document.getElementById("fmPlaces").innerHTML = places.map(function (p, i) {
      var sub = p.kind === "usb" && p.total ? bytes(p.free) + " free of " + bytes(p.total) : p.kind === "received" ? (p.size ? bytes(p.size) : "Nothing yet") : p.kind === "tv" && st.total ? bytes(st.free) + " free"
              : p.kind === "nas" ? (p.type || "smb").toUpperCase() + (p.writable ? "" : " · read-only") : p.kind === "nasSetup" ? "Connect a NAS or computer" : "";
      return '<div class="fm-pl' + (i === FM.pi ? (FM.side === "places" ? " focus" : " on") : "") + '">' + fmIco(p.kind === "folder" ? "folder" : p.kind) +
        '<span class="tx"><div class="t">' + esc(p.label) + "</div>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span></div>";
    }).join("") || '<div class="fm-empty">Files show on the TV</div>';
    // Where we are: the place, then each folder below it.
    var pl = places[FM.pi], crumbs = pl ? [pl.label] : [];
    if (pl && FM.path.length > FM.root.length) crumbs = crumbs.concat(FM.path.slice(FM.root.length).replace(/^\//, "").split("/"));
    document.getElementById("fmPath").innerHTML = crumbs.map(function (c, k) { return k === crumbs.length - 1 ? "<b>" + esc(c) + "</b>" : esc(c); }).join("  ›  ");
    var cols = document.getElementById("fmCols");
    cols.className = "fm-cols" + (FM.side === "list" && FM.li === -1 && pl && pl.kind !== "nasSetup" && !FM.loading ? " focus" : "");
    cols.style.visibility = pl && pl.kind === "nasSetup" ? "hidden" : "";
    cols.innerHTML = "<span></span>" + FM_SORTS.map(function (s) { return '<span class="' + (s[0] === FM.sort ? "sorted" : "") + (s[0] === "size" ? '" style="text-align:right' : "") + '">' + s[1] + "</span>"; }).join("");
    // The folder: a window of FM_ROWS rows around the focus.
    var list = document.getElementById("fmList"), n = FM.items.length;
    if (pl && pl.kind === "nasSetup") {
      list.className = "fm-list";
      list.innerHTML = '<div class="fm-empty">Browse a shared folder on your NAS or computer here (SMB or NFS), and copy files between it and the TV. ' +
        "The password stays encrypted on this TV.<br>" + '<div class="sbtn glass' + (FM.side === "list" ? " focus" : "") + '">Set up a network folder</div></div>';
    } else if (FM.loading) {
      list.className = "fm-list";
      list.innerHTML = '<div class="fm-empty">Opening ' + esc(pl ? pl.label : "the network folder") + "…</div>";
    } else if (FM.nasErr) {
      list.className = "fm-list";
      list.innerHTML = '<div class="fm-empty">' + esc(FM.nasErr) + ". Check that the NAS is on, or its settings in Settings › Network & storage › Network folder.</div>";
    } else if (FM.denied && pl && pl.kind !== "received" && !st.allowed) {
      list.className = "fm-list";
      list.innerHTML = '<div class="fm-empty">To show what\'s on this TV, Offshore needs Android\'s permission to read its storage. It only reads; nothing leaves the TV.' +
        '<br><div class="sbtn glass' + (FM.side === "list" ? " focus" : "") + '">Allow access</div></div>';
    } else if (!n) {
      list.className = "fm-list";
      list.innerHTML = '<div class="fm-empty">' + (FM.denied ? "This folder can't be opened." : !app && q.get("files") !== "demo" ? "Your files show on the TV." : pl && pl.kind === "received" && FM.path === FM.root ? "Nothing received yet. Send photos and files from a phone with Share." : "This folder is empty.") + "</div>";
    } else {
      var start = Math.max(0, Math.min(Math.max(0, FM.li) - Math.floor(FM_ROWS / 2), n - FM_ROWS));
      list.className = "fm-list" + (start > 0 ? " fade-top" : "") + (start + FM_ROWS < n ? " fade-bot" : "");
      list.innerHTML = FM.items.slice(start, start + FM_ROWS).map(function (it, k) {
        var kd = fmKind(it);
        return '<div class="fm-row' + (FM.side === "list" && start + k === FM.li ? " focus" : "") + '">' + fmIco(kd.k) +
          '<span class="fm-n">' + esc(fmName(it)) + '</span><span class="fm-k">' + esc(kd.t) + '</span><span class="fm-s">' + (it.dir ? "" : bytes(it.size)) +
          '</span><span class="fm-d">' + esc(fmWhen(it.mod)) + "</span></div>";
      }).join("");
    }
    // The focused file in full, and the keys.
    var cur = FM.side === "list" && FM.li >= 0 ? FM.items[FM.li] : null, info = "";
    if (cur) info = fmName(cur) + "  ·  " + fmKind(cur).t + (cur.dir ? "" : "  ·  " + bytes(cur.size)) + "  ·  Modified " + fmWhen(cur.mod);
    else if (FM.side === "list" && FM.li === -1 && fmPlaceKind() !== "nasSetup") info = "Sort by " + FM_SORTS.filter(function (s) { return s[0] === FM.sort; })[0][1].toLowerCase() + " · folders stay on top";
    else if (pl) info = pl.kind === "usb" ? "A USB drive plugged into the TV" : pl.kind === "received" ? "Photos and files sent from phones with Share (LocalSend)"
                      : pl.kind === "nasSetup" ? "Set up once in Settings › Network & storage" : pl.kind === "nas" && !pl.writable ? "NFS folders are read-only for the TV: open files or copy them to the TV"
                      : n + (n === 1 ? " item" : " items");
    if (FM.clip && !FM.busy) info = (FM.clip.move ? "Moving " : "Copying ") + FM.clip.name + "  ·  go to the folder you want, then ▶ and Paste here";
    if (FM.busy) info = FM.busy;
    document.getElementById("fmInfo").textContent = info;
    document.getElementById("fmFoot").textContent = FM.side === "places" ? "▲ ▼ choose a place · ▶ or OK its files · Back to close"
      : fmPlaceKind() === "nasSetup" ? "OK opens the network folder settings · ◀ places · Back to close"
      : FM.li === -1 ? "◀ ▶ change the sort · ▼ the files · " + (FM.clip ? "OK to paste here · " : "") + "Back to close"
      : "▲ ▼ choose · OK opens · ▶ options · ◀ places · Back " + (FM.path !== FM.root ? "goes up a folder" : "to close");
    if (FM.pop) document.getElementById("fmFoot").textContent = FM.pop.kind === "rename" ? "Arrows choose · OK types · ✓ saves · Back cancels" : "▲ ▼ choose · OK select · Back to cancel";
    renderFmPop();
  }
  function renderFmPop() {
    var p = FM.pop, box = document.getElementById("fmPop");
    document.getElementById("files").classList.toggle("popping", !!p);
    box.classList.toggle("open", !!p);
    if (!p) return;
    box.classList.toggle("wide", p.kind === "rename");
    var h = "<h3>" + esc(p.title) + "</h3>" + (p.sub ? "<p>" + esc(p.sub) + "</p>" : "");
    if (p.kind === "rename") {
      h += '<div class="kbdisp">' + esc(p.text) + "▏</div>";
      box.innerHTML = h;
      var kg = document.createElement("div");
      kg.className = "zipgrid kbgrid";
      KB.forEach(function (k, i) {
        var b = document.createElement("div");
        b.className = "zipkey glass" + (i === p.idx ? " focus" : "") + (k === "⇧" && p.shift ? " on" : "");
        b.textContent = p.shift && /^[a-z]$/.test(k) ? k.toUpperCase() : k;
        kg.appendChild(b);
      });
      box.appendChild(kg);
      return;
    }
    box.innerHTML = h + '<div class="btns">' + p.btns.map(function (b, i) {
      return '<div class="sbtn glass' + (b[0] === "delete" ? " danger" : "") + (i === p.f ? " focus" : "") + '">' + esc(b[1]) + "</div>";
    }).join("") + "</div>";
  }
  // A file or folder's options, or Paste here while copying or moving.
  function fmMenu(it) {
    if (FM.busy) { toast("One moment, still " + FM.what.toLowerCase()); return; }
    if (FM.clip) {
      FM.pop = { kind: "menu", title: (FM.clip.move ? "Move " : "Copy ") + FM.clip.name, sub: "Into " + (fmHere() || "this folder"),
                 btns: [["paste", "Paste here"], ["unclip", FM.clip.move ? "Cancel moving" : "Cancel copying"]], f: 0 };
      return;
    }
    if (!it) return;
    var k = fmKind(it), sub = k.t + (it.dir ? "" : " · " + bytes(it.size)) + " · " + fmWhen(it.mod), b = [];
    var pl = fmPlaceAt(), ro = pl && pl.kind === "nas" && !pl.writable;   // NFS: open and copy to the TV only
    if (k.k !== "apk") b.push(["open", it.dir ? "Open" : k.k === "image" || k.k === "video" ? "Show" : k.k === "audio" ? "Play" : "Open"]);
    if (!ro) b.push(["rename", "Rename"]);
    b.push(["copy", "Copy to…"]);
    if (!ro) b.push(["move", "Move to…"], ["delete", "Delete"]);
    FM.pop = { kind: "menu", title: fmName(it), sub: sub, btns: b, f: 0, it: it };
  }
  function fmHere() { var c = document.getElementById("fmPath").textContent.split("  ›  "); return c[c.length - 1]; }
  function fmPopNav(action) {
    var p = FM.pop;
    if (p.kind === "rename") {
      if (action === "back") { FM.pop = null; return; }
      if (action === "left" && p.idx % 10) p.idx--;
      else if (action === "right" && p.idx % 10 < 9 && p.idx < KB.length - 1) p.idx++;
      else if (action === "up" && p.idx > 9) p.idx -= 10;
      else if (action === "down") p.idx = Math.min(KB.length - 1, p.idx + 10);
      else if (action === "ok") {
        var k = KB[p.idx];
        if (k === "⌫") p.text = p.text.slice(0, -1);
        else if (k === "⇧") p.shift = !p.shift;
        else if (k === "␣") { if (p.text && p.text.slice(-1) !== " " && p.text.length < 120) p.text += " "; }
        else if (k === "/") toast("Names can't have a slash");
        else if (k === "✓") fmRename(p.it, p.text.trim());
        else if (p.text.length < 120) { p.text += p.shift ? k.toUpperCase() : k; p.shift = false; }
      }
      return;
    }
    if (action === "back") { FM.pop = null; return; }
    if (action === "up" || action === "down") { p.f = Math.max(0, Math.min(p.btns.length - 1, p.f + (action === "up" ? -1 : 1))); return; }
    if (action !== "ok") return;
    var id = p.btns[p.f][0], it = p.it;
    FM.pop = null;
    if (id === "cancel") return;
    if (id === "open") { fmOpen(it); return; }
    if (id === "rename") { var dot = it.dir ? -1 : it.name.lastIndexOf("."); FM.pop = { kind: "rename", title: "Rename " + (it.dir ? "folder" : "file"), sub: "", text: it.name, idx: KB.indexOf("✓"), shift: false, it: it, dot: dot }; return; }
    if (id === "copy" || id === "move") { FM.clip = { path: it.path, name: it.name, move: id === "move" }; toast("Now go to the folder you want, then ▶ and Paste here"); return; }
    if (id === "unclip") { FM.clip = null; return; }
    if (id === "paste") { fmPaste(); return; }
    if (id === "delete") {                                    // always asked, Cancel in focus
      FM.pop = { kind: "confirm", title: "Delete " + fmName(it) + "?", it: it, f: 0,
                 sub: (it.dir ? (it.n ? "This folder and the " + it.n + (it.n === 1 ? " item" : " items") + " in it" : it.n === 0 ? "This empty folder" : "This folder and everything in it") : "This file") +
                      " will be deleted from " + (fmNas(it.path) ? "the network folder" : "the TV") + ". This can't be undone.",
                 btns: [["cancel", "Cancel"], ["delete2", "Delete"]] };
      return;
    }
    if (id === "delete2") {
      if (!app) { toast("Would delete " + it.name); return; }
      if (fmNas(it.path)) { fmTask("Deleting " + it.name); app.filesNas("delete", it.path, ""); return; }
      var n = app.filesDelete(it.path);
      if (n < 0) toast("Couldn't delete " + it.name + (fmPlaceKind() === "usb" ? " · USB drives are read-only on Fire TV" : ""));
      else { toast("Deleted " + fmName(it)); fmRefresh(""); }
    }
  }
  function fmPlaceKind() { var pl = FM.st && FM.st.places[FM.pi]; return pl ? pl.kind : ""; }
  function fmOpen(it) {
    if (it.dir) { fmLoad(it.path); return; }
    var k = fmKind(it).k;
    if (FM.pick) {                                         // choosing a tile's picture (hold OK on a tile › Change picture)
      if (k !== "image") { toast("Pick a photo (JPEG or PNG) for " + FM.pick.name); return; }
      if (fmNas(it.path)) { toast("Copy it to the TV first (☰ › Copy), then pick it there"); return; }
      var pk = FM.pick; closeFiles();
      tileArtSet(pk.id, "file://" + it.path.split("/").map(encodeURIComponent).join("/"));
      toast(pk.name + " has your picture · hold OK on it › Original picture undoes it");
      return;
    }
    if (k === "apk") { toast("App installers aren't opened from Files, to keep the TV safe"); return; }
    if (fmNas(it.path)) {                                  // fetched to the TV first (guestFilesFetched shows or opens it)
      if (!app) { toast("Would open " + it.name); return; }
      if (FM.busy) { toast("One moment, still " + FM.what.toLowerCase()); return; }
      fmTask("Getting " + it.name); app.filesNas("fetch", it.path, "");
      return;
    }
    if (k === "image" && /^image\/(jpeg|png|gif|webp|bmp)$/.test(it.mime || "")) {   // photos: Offshore's own viewer
      var pics = FM.items.filter(function (x) { return !x.dir && /^image\/(jpeg|png|gif|webp|bmp)$/.test(x.mime || ""); });
      openViewer(pics.map(function (x) { return "file://" + x.path.split("/").map(encodeURIComponent).join("/"); }), "", pics.map(function (x) { return x.name; }), pics.indexOf(it));
      return;
    }
    if (!app || !app.filesOpen) { toast("Would open " + it.name); return; }
    var r = app.filesOpen(it.path);
    if (r === "ok" && (k === "video" || k === "audio")) kwAdd({ k: "file", id: it.path, n: it.name, audio: k === "audio" });   // Keep watching
    if (r === "noapp") toast(k === "video" || k === "audio" ? "No app here plays " + fmKind(it).t + " · VLC or Kodi from the Appstore can" : "No app on this TV opens " + fmKind(it).t + " files");
    else if (r !== "ok") toast("Couldn't open " + it.name);
  }
  function fmRename(it, name) {
    if (!name || name === it.name) { FM.pop = null; return; }
    if (/^\./.test(name)) { toast("Names can't start with a dot"); return; }
    if (FM.pop.dot > 0 && fmExt(name) !== fmExt(it.name)) toast("The ending changed: some apps may not open it");
    if (!app) { FM.pop = null; toast("Would rename to " + name); return; }
    if (fmNas(it.path)) { FM.pop = null; fmTask("Renaming " + it.name); app.filesNas("rename", it.path, name); return; }
    var r = app.filesRename(it.path, name);
    if (r === "exists") { toast("There's already something called " + name + " here"); return; }
    FM.pop = null;
    if (!r) toast("Couldn't rename " + it.name + (fmPlaceKind() === "usb" ? " · USB drives are read-only on Fire TV" : ""));
    else { toast("Renamed to " + name); fmRefresh(name); }
  }
  function fmPaste() {
    var c = FM.clip;
    if (!app) { toast("Would " + (c.move ? "move " : "copy ") + c.name + " here"); FM.clip = null; return; }
    if (!app.filesCopy(c.path, FM.path, c.move)) { toast("Couldn't start"); return; }
    fmTask((c.move ? "Moving " : "Copying ") + c.name);
  }
  function fmTask(what) { FM.what = what; FM.busy = what + "…"; }
  function fmRefresh(name) {                              // after a change: this folder again, and the storage numbers
    fmStorage();
    var li = FM.li;
    fmLoad(FM.path, name);
    if (!name) FM.li = Math.min(li, FM.items.length - 1);
  }
  var FM_WHY = { same: "A folder can't go inside itself", space: "There isn't enough free space", readonly: "USB drives are read-only on Fire TV",
                 nfs: "NFS network folders are read-only for the TV", nascopy: "Copies inside the network folder need a computer; Move works",
                 denied: "The NAS didn't allow it", exists: "Something there already has that name" };
  window.guestFilesProgress = function (done, total) {
    if (!FM.busy) return;
    FM.busy = FM.what + "  ·  " + Math.min(99, Math.round(100 * done / Math.max(1, total))) + "%  ·  " + bytes(done) + " of " + bytes(total);
    if (FM.open) renderFiles();
  };
  window.guestFilesDone = function (r) {
    var c = FM.clip || {};
    FM.busy = null; FM.clip = null;
    var why = FM_WHY[r.error];
    toast(r.ok ? (r.move ? "Moved " : "Copied ") + (c.name || "") + (r.name && r.name !== c.name ? " as " + r.name : "")
               : "Couldn't " + (r.move ? "move " : "copy ") + (c.name || "it") + (why ? " · " + why : ""));
    if (FM.open) { fmRefresh(r.ok ? r.name : ""); renderFiles(); }
  };
  window.guestFilesNasDone = function (r) {               // a network folder delete or rename
    var what = FM.what || "";
    FM.busy = null;
    toast(r.ok ? (r.op === "delete" ? "Deleted" : "Renamed to " + r.name) : "Couldn't finish " + what.toLowerCase() + (FM_WHY[r.error] ? " · " + FM_WHY[r.error] : ""));
    if (FM.open) { fmRefresh(r.ok && r.op === "rename" ? r.name : ""); renderFiles(); }
  };
  window.guestFilesFetched = function (r) {               // a network file is on the TV now: show it or hand it to an app
    var what = FM.what || "";
    FM.busy = null;
    if (!r.ok) { toast("Couldn't get " + what.replace(/^Getting /, "") + (FM_WHY[r.error] ? " · " + FM_WHY[r.error] : "")); if (FM.open) renderFiles(); return; }
    if (FM.open) renderFiles();
    if (/^image\/(jpeg|png|gif|webp|bmp)$/.test(r.mime || "")) { openViewer(["file://" + r.path.split("/").map(encodeURIComponent).join("/")], "", [r.name]); return; }
    var o = app.filesOpen(r.path);
    if (o === "noapp") toast("No app on this TV opens " + fmKind({ name: r.name, mime: r.mime }).t + " · VLC or Kodi from the Appstore can");
    else if (o !== "ok") toast("Couldn't open " + r.name);
  };
  function filesNav(action) {
    var places = FM.st && FM.st.places || [];
    if (FM.pop) { fmPopNav(action); renderFiles(); return; }
    if (action === "hold") action = FM.side === "list" ? "right" : "ok";
    if (FM.side === "places") {
      if (action === "back") { closeFiles(); return; }
      if (action === "up" || action === "down") {
        var to = Math.max(0, Math.min(places.length - 1, FM.pi + (action === "up" ? -1 : 1)));
        if (to !== FM.pi) fmPlace(to);                       // the place's files show at once on the right
      } else if ((action === "right" || action === "ok") && places.length) { FM.side = "list"; FM.li = FM.items.length || FM.denied ? 0 : -1; }
      renderFiles(); return;
    }
    if (fmPlaceKind() === "nasSetup") {                      // "Set up a network folder"
      if (action === "ok") fmNasSetup();
      else if (action === "left" || action === "back") { FM.side = "places"; renderFiles(); }
      return;
    }
    if (FM.loading) { if (action === "left") FM.side = "places"; else if (action === "back") { if (FM.path !== FM.root) fmUp(); else closeFiles(); return; } renderFiles(); return; }
    if (FM.denied && !FM.items.length) {                     // "Allow access"
      if (action === "ok" && app && app.filesAsk) app.filesAsk();
      else if (action === "left" || action === "back") FM.side = "places";
      renderFiles(); return;
    }
    if (FM.li === -1) {                                      // the column names: the sort
      var si = FM_SORTS.map(function (s) { return s[0]; }).indexOf(FM.sort);
      if (action === "left" && si === 0) FM.side = "places";
      else if (action === "left" || action === "right") { FM.sort = FM_SORTS[(si + (action === "left" ? -1 : 1) + FM_SORTS.length) % FM_SORTS.length][0]; fmSort(); }
      else if (action === "down" && FM.items.length) FM.li = 0;
      else if (action === "ok" && FM.clip) fmMenu(null);     // an empty folder: paste from here
      else if (action === "back") { if (FM.path !== FM.root) fmUp(); else closeFiles(); return; }
      renderFiles(); return;
    }
    var it = FM.items[FM.li];
    if (action === "up") FM.li = FM.li - 1;                  // from the first file: the column names
    else if (action === "down") FM.li = Math.min(FM.items.length - 1, FM.li + 1);
    else if (action === "left") FM.side = "places";
    else if (action === "right") fmMenu(it);
    else if (action === "back") { if (FM.path !== FM.root) fmUp(); else { closeFiles(); return; } }
    else if (action === "ok" && it) fmOpen(it);
    renderFiles();
  }
  function fmUp() {                                          // up a folder, the one we came from in focus
    var cut = FM.path.lastIndexOf("/"), base = fmNas(FM.path) ? "nas:".length - 1 : -1;   // "nas:Movies" -> "nas:"
    var from = FM.path.slice(Math.max(cut, base) + 1);
    fmLoad(cut > base ? FM.path.slice(0, cut) : FM.root, from);
    renderFiles();
  }
  window.guestFilesPerm = function (ok) {
    if (!FM.open) return;
    fmStorage(); fmPlace(FM.pi); renderFiles();
    if (!ok) toast("Without it, Files only shows files from phones");
  };
  function shareNav(action) {                          // true when the card or viewer used the key
    if (shareReq) {
      if (shareReq.pin) { if (action === "back" || action === "ok") closeShare(); return true; }
      if (action === "left" || action === "right") { shareFocus = action === "left" ? 0 : 1; renderShareButtons(); }
      else if (action === "ok" || action === "back") {
        var yes = action === "ok" && shareFocus === 0;
        if (app && app.shareAnswer) app.shareAnswer(shareReq.id, yes);
        closeShare();
        toast(yes ? "Receiving…" : "Declined");
      }
      return true;
    }
    if (viewerList.length) {
      if (action === "left" && viewerIdx > 0) { viewerIdx--; showViewer(); }
      else if (action === "right" && viewerIdx < viewerList.length - 1) { viewerIdx++; showViewer(); }
      else if (action === "ok" && !viewerNames && catPhotos("shared")) {              // show the shared photos as the background
        PREFS.bg = "cat:shared";
        var sv = load("prefs") || {}; sv.bg = PREFS.bg; save("prefs", sv);
        closeViewer(); shownSet = ""; nextPhoto(); toast("Background: Shared photos");
      }
      else if (action === "back" || action === "ok") closeViewer();
      return true;
    }
    return false;
  }

