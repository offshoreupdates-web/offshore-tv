  // ---- Sounds (Settings > Music & sound) ---------------------------------------------------------------------------
  // Built-in sets (made for this app, tools/make_sounds.ps1) and notification sounds, previewed as you choose; or sounds
  // from Wikimedia Commons' free library (only upload.wikimedia.org, up to 2 MB, cut off after a moment), credited.
  if (PREFS.sounds === "on") PREFS.sounds = "soft";          // before 2.30: on/off
  var SOUND_RES = [], sndSel = null, sndSeq = 0, sndPending = {};
  var SLOT_NAME = { select: "Selecting", move: "Moving", back: "Going back", notify: "Notifications" };
  function soundCredits() { return load("soundcredits") || {}; }
  function soundSync(key) {
    if (!app || !app.setSounds) return;
    app.setSounds(PREFS.sounds, PREFS.notifySound);
    if (key === "sounds" && PREFS.sounds !== "off") { if (PREFS.sounds === "custom") app.sound("select"); else app.previewBuiltin(PREFS.sounds + "_select"); }
    if (key === "notifySound" && PREFS.notifySound !== "off") { if (PREFS.notifySound === "custom") app.playNotify(); else app.previewBuiltin("notif_" + PREFS.notifySound); }
  }
  setTimeout(function () { soundSync(null); }, 500);
  window.guestSound = function (id, ok) { var p = sndPending[id]; delete sndPending[id]; if (p) p(ok); };
  function soundSearch(q) {
    toast("Searching free sounds…");
    var url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=40" +
      "&prop=imageinfo&iiprop=url|size|metadata|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&gsrsearch=" + encodeURIComponent(q + " filetype:audio");
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var pages = j.query ? Object.keys(j.query.pages).map(function (k) { return j.query.pages[k]; }) : [];
      pages.sort(function (a, b) { return a.index - b.index; });
      SOUND_RES = pages.map(function (p) {
        var i = p.imageinfo && p.imageinfo[0]; if (!i) return null;
        var file = i.url.split("?")[0];                       // Commons adds tracking parameters to its links
        if (!/\.(ogg|oga|wav|mp3|flac)$/i.test(file) || i.size > 2 << 20) return null;
        var len = 0; (i.metadata || []).forEach(function (m) { if (m.name === "length" || m.name === "playtime_seconds") len = parseFloat(m.value) || len; });
        if (len > 12) return null;                            // short sounds only
        var em = i.extmetadata || {};
        var who = new DOMParser().parseFromString((em.Artist && em.Artist.value) || "", "text/html").body.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
        return { url: file, title: p.title.replace(/^File:/, "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 46),
                 len: len, who: who || "Unknown", lic: (em.LicenseShortName && em.LicenseShortName.value) || "" };
      }).filter(Boolean).slice(0, 20);
      if (!SOUND_RES.length) toast("No short free sounds found for “" + q + "”");
      if (custOpen && custMode === "sndres") renderCustom();
    }).catch(function () { toast("Couldn't reach Wikimedia Commons"); });
  }
  function sndResRows() {
    if (!SOUND_RES.length) return [{ label: "Searching…", act: true, none: true }];
    return SOUND_RES.map(function (s) { return { label: s.title, value: (s.len ? s.len.toFixed(1) + " s · " : "") + (s.lic || "free"), act: true, snd: s }; })
      .concat([{ label: "Sounds from Wikimedia Commons, free to use; the author is credited in Your sounds", act: true, none: true }]);
  }
  function sndDoRows() {
    return [{ label: "Hear it", value: "›", act: true, id: "hear" },
            { label: "Use when selecting", value: "›", act: true, slot: "select" },
            { label: "Use when moving", value: "›", act: true, slot: "move" },
            { label: "Use when going back", value: "›", act: true, slot: "back" },
            { label: "Use for notifications", value: "›", act: true, slot: "notify" },
            { label: "By " + sndSel.who + (sndSel.lic ? " · " + sndSel.lic : ""), act: true, none: true }];
  }
  function sndSlotRows() {
    var c = soundCredits(), keys = Object.keys(c);
    if (!keys.length) return [{ label: "No sounds of your own yet. Find sounds online to add some.", act: true, none: true }];
    return keys.map(function (k) { return { label: SLOT_NAME[k] + ": " + c[k].title, value: "by " + c[k].who + (c[k].lic ? " · " + c[k].lic : "") + " · OK removes", act: true, slot: k }; });
  }
  function soundNav(action, rows) {
    var r = rows[custRow]; if (!r) return;
    if (action === "right" && r.snd && app) {                 // ▶ on a result: hear it straight away
      var pid = "s" + (++sndSeq); toast("Playing “" + r.snd.title + "”");
      sndPending[pid] = function (ok) { if (!ok) toast("That sound couldn't be played"); }; app.previewSound(pid, r.snd.url); return;
    }
    if (action !== "ok") return;
    if (custMode === "sndres" && r.snd) { sndSel = r.snd; custMode = "snddo"; custRow = 0; return; }
    if (custMode === "sndslots" && r.slot) {
      if (app) app.removeSound(r.slot);
      var c = soundCredits(); delete c[r.slot]; save("soundcredits", c);
      toast(SLOT_NAME[r.slot] + ": back to the built-in sound"); return;
    }
    if (custMode !== "snddo" || !app) { if (!app) toast("This works on the TV"); return; }
    var id = "s" + (++sndSeq);
    if (r.id === "hear") { toast("Playing…"); sndPending[id] = function (ok) { if (!ok) toast("That sound couldn't be played"); }; app.previewSound(id, sndSel.url); return; }
    if (r.slot) {
      var slot = r.slot, chosen = sndSel;
      toast("Getting the sound…");
      sndPending[id] = function (ok) {
        if (!ok) { toast("That sound couldn't be used (too big, or not a sound file)"); return; }
        var c = soundCredits(); c[slot] = { title: chosen.title, who: chosen.who, lic: chosen.lic }; save("soundcredits", c);
        if (slot === "notify") PREFS.notifySound = "custom"; else PREFS.sounds = "custom";
        applyPrefs(slot === "notify" ? "notifySound" : "sounds");
        toast(SLOT_NAME[slot] + " now uses “" + chosen.title + "” · Save settings to keep it");
        if (custOpen) renderCustom();
      };
      app.saveSound(id, chosen.url, slot);
    }
  }

  // ---- Sleep sounds (Settings > Music & sound > Sleep sounds, and the Sleep card) ----------------------------------
  // For falling asleep with the TV on. Built-in sounds are made on the TV as it plays (Web Audio noise, shaped for each
  // sound), so they need no files and no internet. Sounds found on Wikimedia Commons stream from upload.wikimedia.org
  // and loop. Fades in and out, can turn itself off after a while, can darken the screensaver, and stops when an app
  // opens. Choices are kept at once (no Save needed), like other things that act right away.
  var SLEEP_BUILT = [["brown", "Brown noise (deep, soft)"], ["pink", "Pink noise (balanced)"], ["white", "White noise (bright)"],
                     ["ocean", "Ocean waves"], ["rain", "Rain"], ["fan", "Fan"]];
  var SLEEP_TIMES = [0, 15, 30, 60, 90, 120, 240, 480], SLEEP_SCREEN = [["dark", "Dark"], ["dim", "Dim"], ["normal", "Normal"]];
  var SLEEP = { on: false, ctx: null, gain: null, audio: null, until: 0, timer: 0, fade: 0 }, SLEEP_RES = [];
  function sleepSaved() { return load("sleepsounds") || []; }
  function sleepName(id) {
    var b = SLEEP_BUILT.filter(function (x) { return x[0] === id; })[0];
    if (b) return b[1].replace(/ \(.*\)$/, "");
    var s = sleepSaved().filter(function (x) { return "web:" + x.url === id; })[0];
    return s ? s.title : "Brown noise";
  }
  function liveSave(key) {                          // kept straight away, and not undone by Discard
    var p = load("prefs") || {}; p[key] = PREFS[key]; save("prefs", p);
    if (custSnapshot) custSnapshot[key] = PREFS[key];
  }
  var NOISE = {};                                    // the samples are made once per kind and reused (~0.1 s of work each)
  function noiseBuffer(ctx, kind) {
    var len = ctx.sampleRate * 8, buf = ctx.createBuffer(2, len, ctx.sampleRate), key = kind + ctx.sampleRate;
    if (NOISE[key]) { buf.copyToChannel(NOISE[key][0], 0); buf.copyToChannel(NOISE[key][1], 1); return buf; }
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (var i = 0; i < len; i++) {
        var w = Math.random() * 2 - 1;
        if (kind === "white") d[i] = w * 0.5;
        else if (kind === "pink") {                 // Paul Kellet's filter
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }   // brown
      }
      var fadeN = ctx.sampleRate * 0.05;            // a short crossfade so the loop point can't be heard
      for (var j = 0; j < fadeN; j++) { var t = j / fadeN; d[len - fadeN + j] = d[len - fadeN + j] * (1 - t) + d[j] * t; }
    }
    NOISE[key] = [new Float32Array(buf.getChannelData(0)), new Float32Array(buf.getChannelData(1))];
    return buf;
  }
  function sleepStart() {
    sleepStop(true);
    var id = PREFS.sleepSound || "brown", vol = (+PREFS.sleepVol || 50) / 100;
    if (id.indexOf("web:") === 0) {
      if (!/^https:\/\/upload\.wikimedia\.org\//.test(id.slice(4))) { PREFS.sleepSound = "brown"; return sleepStart(); }   // Commons only
      var a = new Audio(id.slice(4)); a.loop = true; a.volume = 0;
      a.play().catch(function () { toast("That sound couldn't be played"); sleepStop(true); });
      SLEEP.audio = a;
      SLEEP.fade = setInterval(function () { a.volume = Math.min(vol, a.volume + vol / 30); if (a.volume >= vol) clearInterval(SLEEP.fade); }, 100);
    } else {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { toast("This TV can't make sounds here"); return; }
      var ctx = new AC(), src = ctx.createBufferSource(), out = ctx.createGain(), node = src;
      src.buffer = noiseBuffer(ctx, { white: "white", pink: "pink", rain: "pink" }[id] || "brown"); src.loop = true;
      var filt = function (type, f, q) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q) x.Q.value = q; node.connect(x); node = x; };
      if (id === "rain") { filt("highpass", 700); filt("lowpass", 9000); }
      if (id === "fan") filt("lowpass", 420);
      if (id === "ocean") {                         // swells: a slow wave of loudness and brightness, about every 11 s
        filt("lowpass", 900);
        var swell = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
        swell.gain.value = 0.6; lfo.frequency.value = 0.09; depth.gain.value = 0.4;
        lfo.connect(depth); depth.connect(swell.gain); node.connect(swell); node = swell; lfo.start();
      }
      node.connect(out); out.connect(ctx.destination);
      out.gain.setValueAtTime(0, ctx.currentTime); out.gain.linearRampToValueAtTime(vol, ctx.currentTime + 3);
      src.start(); SLEEP.ctx = ctx; SLEEP.gain = out;
    }
    SLEEP.on = true;
    var mins = +PREFS.sleepTimer || 0;
    SLEEP.until = mins ? Date.now() + mins * 60000 : 0;
    if (mins) SLEEP.timer = setTimeout(function () { sleepStop(false); }, mins * 60000);
    sleepScreen();
  }
  function sleepStop(quick) {
    clearTimeout(SLEEP.timer); clearInterval(SLEEP.fade);
    var ctx = SLEEP.ctx, a = SLEEP.audio, secs = quick ? 0.3 : 20;   // the timer fades out slowly
    if (ctx) { try { SLEEP.gain.gain.setValueAtTime(SLEEP.gain.gain.value, ctx.currentTime); SLEEP.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + secs); } catch (e) { }
               setTimeout(function () { try { ctx.close(); } catch (e) { } }, secs * 1000 + 200); }
    if (a) { var v0 = a.volume, steps = Math.max(1, secs * 10), k = 0;
             var f = setInterval(function () { k++; a.volume = Math.max(0, v0 * (1 - k / steps)); if (k >= steps) { clearInterval(f); a.pause(); a.src = ""; } }, 100); }
    SLEEP.ctx = SLEEP.gain = SLEEP.audio = null; SLEEP.on = false; SLEEP.until = 0;
    sleepScreen();
  }
  function sleepVolume() {
    var vol = (+PREFS.sleepVol || 50) / 100;
    if (SLEEP.gain && SLEEP.ctx) SLEEP.gain.gain.setTargetAtTime(vol, SLEEP.ctx.currentTime, 0.2);
    if (SLEEP.audio) { clearInterval(SLEEP.fade); SLEEP.audio.volume = vol; }
  }
  function sleepScreen() {                          // darken the screensaver while a sleep sound plays
    document.body.classList.toggle("sleep-dim", SLEEP.on && PREFS.sleepScreen === "dim");
    document.body.classList.toggle("sleep-dark", SLEEP.on && (PREFS.sleepScreen || "dark") === "dark");
  }
  function sleepSearch(q) {                         // longer free sounds (20 s or more) to loop
    toast("Searching free sounds…");
    SLEEP_RES = [];
    var url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=50" +
      "&prop=imageinfo&iiprop=url|size|metadata|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&gsrsearch=" + encodeURIComponent(q + " filetype:audio");
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var pages = j.query ? Object.keys(j.query.pages).map(function (k) { return j.query.pages[k]; }) : [];
      pages.sort(function (a, b) { return a.index - b.index; });
      SLEEP_RES = pages.map(function (p) {
        var i = p.imageinfo && p.imageinfo[0]; if (!i) return null;
        var file = i.url.split("?")[0];
        if (!/\.(ogg|oga|mp3|wav)$/i.test(file) || i.size > 40 << 20) return null;
        var len = 0; (i.metadata || []).forEach(function (m) { if (m.name === "length" || m.name === "playtime_seconds") len = parseFloat(m.value) || len; });
        if (len && len < 20) return null;
        var em = i.extmetadata || {};
        var who = new DOMParser().parseFromString((em.Artist && em.Artist.value) || "", "text/html").body.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
        return { url: file, title: p.title.replace(/^File:/, "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 46), len: len, who: who || "Unknown",
                 lic: (em.LicenseShortName && em.LicenseShortName.value) || "" };
      }).filter(Boolean).slice(0, 20);
      if (!SLEEP_RES.length) toast("No long free sounds found for “" + q + "”");
      if (custOpen && custMode === "sleepres") renderCustom();
    }).catch(function () { toast("Couldn't reach Wikimedia Commons"); });
  }
  function sleepRows() {
    var cur = PREFS.sleepSound || "brown", mins = +PREFS.sleepTimer || 0, rows = [];
    var left = SLEEP.until ? Math.max(1, Math.ceil((SLEEP.until - Date.now()) / 60000)) : 0;
    rows.push({ label: SLEEP.on ? "Stop" : "Play", value: (SLEEP.on ? "Playing: " : "") + sleepName(cur) + (left ? " · " + left + " min left" : ""), act: true, id: "play" });
    rows.push({ label: "Made on the TV · no internet needed", act: true, none: true });
    SLEEP_BUILT.forEach(function (b) { rows.push({ label: b[1], value: cur === b[0] ? "✓" : "", act: true, pick: b[0] }); });
    var saved = sleepSaved();
    if (saved.length) rows.push({ label: "Your sleep sounds  ·  ◀ removes", act: true, none: true });
    saved.forEach(function (s) { rows.push({ label: s.title, value: (cur === "web:" + s.url ? "✓  " : "") + "by " + s.who, act: true, pick: "web:" + s.url, web: s }); });
    rows.push({ label: "Find sounds online…", value: "›", act: true, id: "find" });
    rows.push({ label: "Volume", value: (+PREFS.sleepVol || 50) + "%", act: true, adj: true, id: "vol" });
    rows.push({ label: "Turn off after", value: (mins ? (mins < 60 ? mins + " min" : mins / 60 + " hour" + (mins > 60 ? "s" : "")) : "Never"), act: true, adj: true, id: "timer" });
    rows.push({ label: "Screen while playing", value: ((SLEEP_SCREEN.filter(function (x) { return x[0] === (PREFS.sleepScreen || "dark"); })[0] || [])[1] || "Dark"), act: true, adj: true, id: "screen" });
    rows.push({ label: "Plays on the home screen and screensaver; stops when you open an app. Dark and Dim apply once the screensaver comes on.", act: true, none: true });
    return rows;
  }
  function sleepResRows() {
    if (!SLEEP_RES.length) return [{ label: "Searching…", act: true, none: true }];
    return SLEEP_RES.map(function (s) {
      var m = Math.floor(s.len / 60), sec = Math.round(s.len % 60);
      return { label: s.title, value: (s.len ? m + ":" + (sec < 10 ? "0" : "") + sec + " · " : "") + (s.lic || "free"), act: true, web: s };
    }).concat([{ label: "OK uses it as your sleep sound · ▶ plays it now · free sounds from Wikimedia Commons", act: true, none: true }]);
  }
  function sleepNav(action, rows) {
    var r = rows[custRow]; if (!r) return;
    var step = action === "left" ? -1 : 1;
    if (custMode === "sleepres") {
      if (!r.web) return;
      if (action === "right") { PREFS.sleepSound = "web:" + r.web.url; sleepStart(); toast("Playing “" + r.web.title + "”"); return; }
      if (action !== "ok") return;
      var list = sleepSaved().filter(function (s) { return s.url !== r.web.url; }).concat([r.web]);
      save("sleepsounds", list);
      PREFS.sleepSound = "web:" + r.web.url; liveSave("sleepSound"); sleepStart();
      toast("“" + r.web.title + "” is your sleep sound"); custMode = "sleep"; custRow = 0; return;
    }
    if (r.id === "play" && action === "ok") { if (SLEEP.on) sleepStop(true); else sleepStart(); }
    else if (r.pick && action === "ok") { PREFS.sleepSound = r.pick; liveSave("sleepSound"); sleepStart(); }
    else if (r.web && action === "left") {
      save("sleepsounds", sleepSaved().filter(function (s) { return s.url !== r.web.url; }));
      if (PREFS.sleepSound === r.pick) { PREFS.sleepSound = "brown"; liveSave("sleepSound"); if (SLEEP.on) sleepStart(); }
      toast("Removed “" + r.web.title + "”");
    }
    else if (r.id === "find" && action === "ok") { kbField = "sleep"; kbText = ""; kbIdx = 0; kbShift = false; custMode = "search"; }
    else if (r.id === "vol" && action !== "ok") { PREFS.sleepVol = Math.max(10, Math.min(100, (+PREFS.sleepVol || 50) + step * 10)); liveSave("sleepVol"); sleepVolume(); }
    else if (r.id === "timer" && action !== "ok") {
      var i = SLEEP_TIMES.indexOf(+PREFS.sleepTimer || 0);
      PREFS.sleepTimer = SLEEP_TIMES[(i + step + SLEEP_TIMES.length) % SLEEP_TIMES.length]; liveSave("sleepTimer");
      if (SLEEP.on) {                              // restart the countdown from now
        clearTimeout(SLEEP.timer); var mm = +PREFS.sleepTimer;
        SLEEP.until = mm ? Date.now() + mm * 60000 : 0;
        if (mm) SLEEP.timer = setTimeout(function () { sleepStop(false); }, mm * 60000);
      }
    }
    else if (r.id === "screen" && action !== "ok") {
      var si = SLEEP_SCREEN.map(function (x) { return x[0]; }).indexOf(PREFS.sleepScreen || "dark");
      PREFS.sleepScreen = SLEEP_SCREEN[(si + step + SLEEP_SCREEN.length) % SLEEP_SCREEN.length][0]; liveSave("sleepScreen"); sleepScreen();
    }
  }

  function hiddenTiles() { return load("hiddenTiles") || []; }
  function hiddenRows() {
    var h = hiddenTiles();
    if (!h.length) return [{ label: "No hidden tiles. Hold OK on a tile to hide it.", act: true, none: true }];
    return h.map(function (p) { return { label: app ? app.label(p) : p, value: "Show again  ›", act: true, pkg: p }; });
  }

