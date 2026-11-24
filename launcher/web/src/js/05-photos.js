  // Background cross-fade. The next photo is decoded off-screen first (img.decode), so the fade never
  // stalls on a 1920x1080 JPEG decode; only the two layers' photos are kept in memory.
  var bgs = [document.getElementById("bgA"), document.getElementById("bgB")], front = 0, shown = "";
  function setBg(url) {
    if (url === shown) return;
    shown = url;
    var img = new Image();
    img.src = url;
    var swap = function () {
      var back = 1 - front;
      bgs[back].style.backgroundImage = "url(" + JSON.stringify(String(url)) + ")";   // quoted: a ' in a name can't add layers
      bgs[back].classList.add("on");
      bgs[front].classList.remove("on");
      front = back;
    };
    if (img.decode) img.decode().then(swap, swap); else img.onload = swap;
  }

  var nameEl = document.getElementById("name"), lineEl = document.getElementById("line");
  function render() {
    if (KW && typeof kwFollow === "function") kwFollow();   // the row over the tiles follows the highlighted app
    var onShelf = !!(KW && KW.focus);                    // Keep watching and your cards (24f), over the tiles
    els.forEach(function (r, ri) { r.forEach(function (el, ci) { el.classList.toggle("focus", !wxFocus && !onShelf && ri === row && ci === col); }); });
    document.querySelector(".clock").classList.toggle("focus", wxFocus);
    var it = wxFocus ? { name: T("Weather"), line: T("The week ahead") + (LOC && LOC.name ? T(" in ") + LOC.name : "") + "." } : onShelf ? kwHero(KW.items[KW.idx]) : ROWS[row][col];
    if (KW) kwPaint();
    if (document.body.classList.contains("homepick") && HOME_LAYOUTS[HP.idx]) it = { name: HOME_LAYOUTS[HP.idx][1], line: HOME_LAYOUTS[HP.idx][2] };
    nameEl.textContent = T(it.name);
    lineEl.textContent = T(it.line);
    if (MV && it.id === MV.id) {                         // arranging: what the keys do
      nameEl.textContent = "Moving " + it.name;
      lineEl.textContent = "◀ ▶ move  ·  ▲ " + (MV.pins.indexOf(MV.id) >= 0 ? "unpin" : "pin to the front") + "  ·  OK done  ·  Back puts it back";
    }
    if (tileRows) {                     // keep the focused tile in the five-tile window; tiles outside it dim
      var n = els[0].length, c = row === 0 ? col : tileCol;
      if (c < winStart) winStart = c; else if (c > winStart + TILE_VIS - 1) winStart = c - TILE_VIS + 1;
      winStart = Math.max(0, Math.min(winStart, n - TILE_VIS));
      gridEl.style.transform = "translateX(" + (-winStart * TILE_STEP) + "px)";
      els[0].forEach(function (el, i) { el.classList.toggle("far", i < winStart || i >= winStart + TILE_VIS); });
    }
  }

  // Background photos (img/CREDITS.txt) cycle slowly on their own: 45 s per photo, 4 s dissolve. They follow the time of
  // day at this TV's location: bright water by day, sunsets around sunrise and sunset, dusk and blue hour at night.
  var SETS = { day: [3, 5, 8, 11, 13], golden: [2, 4, 6, 7, 9, 10, 12, 15], night: [1, 14, 16, 17, 18, 19] };
  var SUN = null;                       // { rise: [ms today, ms tomorrow], set: [...] } from the weather feed
  function photoUrl(n) { return "img/ocean-" + (n < 10 ? "0" : "") + n + ".jpg"; }
  // Names for the built-in photos (img/CREDITS.txt), for Backgrounds › Photos › a set › Keep one photo.
  var PHOTO_NAMES = ["", "Storm cloud sunset", "La Digue at sunset, Seychelles", "Anse Volbert, Praslin, Seychelles", "Sunset at Naples Beach, Florida",
    "Bacuit Bay lagoon, El Nido", "Norderney beach at sunset", "Koh Mak sunset with palms, Thailand", "Thudufushi water villas, Maldives",
    "Sunset in Sanibel, Florida", "Agios Prokopios at sunset, Naxos", "Malapascua tropical beach, Philippines", "Gulf of Mexico sunset, Campeche",
    "Mangrove tree, Havelock Island", "North Sea sunset", "Fisherman at Muzhappilangad Beach", "Dike at Lazaret, evening", "Norderney fishing boat",
    "Norderney beach at dusk", "Plage des 3 digues"];
  function period() {
    var now = Date.now(), d = new Date(), m = 60000;
    var rise = SUN ? SUN.rise[0] : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 7).getTime();
    var set = SUN ? SUN.set[0] : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, 30).getTime();
    if ((now > rise - 30 * m && now < rise + 75 * m) || (now > set - 90 * m && now < set + 30 * m)) return "golden";
    return now > rise && now < set ? "day" : "night";
  }
  SETS.all = [];
  for (var s = 1; s <= 19; s++) SETS.all.push(s);
  // Settings > Backgrounds: a beach set, or "cat:<id>", a downloaded category (see "Background categories").
  // A category with no photos yet (still downloading, or deleted) follows the time of day meanwhile.
  function photoSet() {
    var b = PREFS.bg;
    if (b.indexOf("vid:") === 0) return period();       // a live background: photos for the time of day stay underneath
    if (b === "nas") return NASLIST.length ? "nas" : period();
    return b === "time" || (b.indexOf("cat:") === 0 && !catPhotos(b.slice(4))) || (b.indexOf("cat:") !== 0 && !SETS[b]) ? period() : b;
  }
  function photoList(p) {
    if (p === "nas") return NASLIST.map(function (n) { return { u: "nas:" + n, f: String(n).split("/").pop() }; });
    return p.indexOf("cat:") === 0 ? catPhotos(p.slice(4)) : SETS[p].map(function (n) { return { u: photoUrl(n), n: PHOTO_NAMES[n] }; });
  }
  // One photo instead of the whole set (Backgrounds › Photos › a set › Keep one photo): PREFS.bgPhoto is
  // "<set>|<photo address>". "" takes turns through the set at the photo speed, as before. A kept photo stays put
  // all day (it doesn't follow the time of day, since you chose it).
  function photoKey(set, ph) { return set + "|" + ph.u; }
  function pinnedPhoto(set) {                            // the kept photo's place in its set, or -1 (take turns)
    var k = PREFS.bgPhoto || "";
    if (!set || set === "time" || k.indexOf(set + "|") !== 0) return -1;
    var list = set === "nas" ? (NASLIST.length ? photoList("nas") : null) : set.indexOf("cat:") === 0 ? catPhotos(set.slice(4)) : SETS[set] ? photoList(set) : null;
    if (!list) return -1;
    for (var i = 0; i < list.length; i++) if (photoKey(set, list[i]) === k) return i;
    return -1;
  }
  function photoEveryText() { var v = +PREFS.speed || 45; return v < 60 ? v + " seconds" : v === 60 ? "minute" : Math.round(v / 60) + " minutes"; }
  function photoName(ph, i) {
    if (ph.n) return ph.n;
    var n = (ph.f || "").replace(/\.(jpe?g|png|tiff?|webp)$/i, "").replace(/_/g, " ")
      .replace(/\s+Photo by .*$/i, "").replace(/\s+--\s+\d{4}\s+--\s+\d+$/, "").replace(/^\d+\s+/, "").replace(/\s+/g, " ").trim();
    if (n.length > 46) n = clipName({ f: n }, i);        // keeps the start and the end (one shoot's photos differ at the end)
    return n || "Photo " + (i + 1) + (ph.a && !ph.shared ? " · " + ph.a : ph.shared ? " from " + ph.a : "");
  }
  var shownSet = "", photo = 0, photoTimer = 0;
  var forced = +new URLSearchParams(location.search).get("photo");   // ?photo=N: preview a photo
  function showPhoto(ph) {
    if (ph.u.indexOf("nas:") === 0) {                                 // on the network folder: the app fetches it first
      nasCall("nasPhoto", ph.u.slice(4)).then(setBg, function (e) { console.info("network folder photo: " + e); });
    } else setBg(ph.u);
    var c = document.getElementById("credit");                        // free licences ask for the author's name
    c.textContent = ph.shared ? "Shared from " + ph.a : ph.a ? "Photo: " + ph.a + (ph.l ? " · " + ph.l : "") + " · " + srcName(ph) : "";
  }
  // Settings > Backgrounds previews the highlighted set behind the panel (owner: "preview as we select them").
  var previewing = false;
  function previewBg(r) {
    if (!r) return;
    var p = r.id === "nas" ? "nas" : r.bg, list = null;
    if (p && p.indexOf("vid:") === 0) {                               // a live background plays while highlighted
      var pt = liveTopic(p), pc = vidCatOf(pt);
      if (!vidList(pt) && pc && !pc.local && PREFS.vidKeep !== "keep") downloadVid(pc);   // streaming: just the clip list, then it plays
      var pl = vidList(pt);
      if (pl) {
        // A clip row plays that clip; a set row keeps a clip of that set already playing, else its chosen clip or the first.
        var want = r.clip != null ? r.clip : liveSet === "vid:" + pt ? -1 : Math.max(0, pinnedClip(pt));
        if (liveSet !== "vid:" + pt || (want >= 0 && liveIdx % pl.length !== want)) {
          document.body.classList.add("live-bg"); liveSet = "vid:" + pt; liveIdx = Math.max(0, want); liveFails = 0; livePlay();
        }
      }
      return;
    }
    if (liveSet) liveStop();                                          // a photo set: the video steps away
    if (r.pic != null) {                                              // a photo row shows that photo
      var pl2 = p.indexOf("cat:") === 0 ? catPhotos(p.slice(4)) : p === "nas" ? photoList("nas") : SETS[p] ? photoList(p) : null;
      if (pl2 && pl2[r.pic]) showPhoto(pl2[r.pic]);
      return;
    }
    if (p === "time") list = photoList(period());
    else if (p === "nas") list = NASLIST.length ? photoList("nas") : null;
    else if (p && p.indexOf("cat:") === 0) list = catPhotos(p.slice(4));
    else if (p && SETS[p]) list = photoList(p);
    if (list && list.length) showPhoto(list[Math.max(0, pinnedPhoto(p))]);   // its kept photo, if it has one
  }
  function endPreview() { if (previewing) { previewing = false; document.body.classList.remove("previewing"); shownSet = ""; if (PREFS.bg.indexOf("vid:") !== 0 || liveSet !== "vid:" + liveTopic()) liveStop(); nextPhoto(); liveSync(); } }
  // A chosen photo set follows the time of day too (owner), unless Backgrounds > Photos > Match the time of day is off:
  // only its photos for now (golden around sunrise and sunset, day, night), else night falls back to its sunsets, and a
  // set with nothing for this time (or downloaded before photos were sorted) shows all its photos.
  function timeMatched(p, list) {
    if (p.indexOf("cat:") !== 0 || PREFS.bgMatch === "off") return { key: p, list: list };
    var now = period(), pick = function (t) { return list.filter(function (x) { return x.p === t; }); };
    var m = pick(now);
    if (!m.length && now === "night") m = pick("golden");
    return m.length ? { key: p + "|" + now, list: m } : { key: p, list: list };
  }
  function nextPhoto() {
    if (document.hidden || previewing || nativeOn || (liveSet && vidEl.classList.contains("on"))) return;   // a video is showing
    var p = photoSet(), pin = p === PREFS.bg ? pinnedPhoto(p) : -1;
    if (pin >= 0) {                                       // one photo kept: it stays, with no change and no fade
      if (shownSet !== "pin:" + PREFS.bgPhoto) { shownSet = "pin:" + PREFS.bgPhoto; showPhoto(photoList(p)[pin]); }
      return;
    }
    var tm = timeMatched(p, photoList(p)), list = tm.list;
    photo = tm.key === shownSet ? (photo + 1) % list.length : 0;
    shownSet = tm.key;
    showPhoto(list[photo]);
  }
  if (forced) setBg(photoUrl(forced)); else nextPhoto();
  // A page that starts while it isn't visible (a reload during a sync or update) skips the first photo; with a slow
  // photo speed (up to 10 min) the screen would stay black that long. The first time it's seen, a photo comes at once.
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !shown && !forced) nextPhoto(); });
  function startPhotos() { clearInterval(photoTimer); photoTimer = setInterval(nextPhoto, PREFS.speed * 1000); }   // Settings > speed
  startPhotos();

