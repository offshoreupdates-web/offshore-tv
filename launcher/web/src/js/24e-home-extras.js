  // Home extras, 0.17 (owner, 23 November 2026: each one the user's to turn off):
  // weather on the background, the lighter home for slow TVs, and full-screen Now playing. The big clock is CSS only
  // (homeClockStyle, a class from applyTheme).

  // ── Weather on the background ── Rain, snow or fog over the photo while it's really happening here (the same NWS
  // forecast as the clock panel). Drawn once into small tiles, then only moved by the GPU (transform animations, no
  // repaints), so it costs next to nothing; it stops while an app is open, and the lighter home turns it off.
  var FX = { kind: "", tiles: {} };
  function fxTile(kind) {                                  // a 512 px tile of streaks or flakes, made once
    if (FX.tiles[kind]) return FX.tiles[kind];
    var c = document.createElement("canvas"), g, i, x, y, r, seed = kind.length * 977;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }   // the same pattern every time
    c.width = c.height = 512; g = c.getContext("2d");
    if (kind.indexOf("rain") === 0) {
      var n = kind === "rain-far" ? 90 : 46;
      for (i = 0; i < n; i++) {
        x = rnd() * 512; y = rnd() * 512; r = kind === "rain-far" ? 18 + rnd() * 16 : 34 + rnd() * 30;
        var lg = g.createLinearGradient(x, y, x, y + r);
        lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(1, "rgba(220,232,255," + (kind === "rain-far" ? .32 : .5) + ")");
        g.strokeStyle = lg; g.lineWidth = kind === "rain-far" ? 1 : 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + r); g.stroke();
        if (y + r > 512) { g.beginPath(); g.moveTo(x, y - 512); g.lineTo(x, y + r - 512); g.stroke(); }   // wraps seamlessly
      }
    } else {
      var m = kind === "snow-far" ? 70 : 34;
      for (i = 0; i < m; i++) {
        x = rnd() * 512; y = rnd() * 512; r = kind === "snow-far" ? 1.4 + rnd() * 1.6 : 2.6 + rnd() * 3.2;
        [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]].forEach(function (o) {
          var rg = g.createRadialGradient(x + o[0], y + o[1], 0, x + o[0], y + o[1], r);
          rg.addColorStop(0, "rgba(255,255,255,.95)"); rg.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = rg; g.beginPath(); g.arc(x + o[0], y + o[1], r, 0, 7); g.fill();
        });
      }
    }
    return (FX.tiles[kind] = c.toDataURL("image/png"));
  }
  function fxWanted() {                                    // what the weather is doing now, or "" (?wxfx=rain etc. previews one)
    var forced = new URLSearchParams(location.search).get("wxfx");
    if (forced) return forced;
    if (FX && FX.preview) return FX.preview;               // Settings shows it while you're on its row (custLive)
    if (PREFS.wxFx === "off" || document.body.classList.contains("lite")) return "";
    var w = load("weather");
    if (!w || !w.text || Date.now() - (w.at || 0) > 3 * 3600000) return "";   // an old forecast doesn't make it rain
    var t = String(w.text).toLowerCase();
    if (/thunder|t-storm/.test(t)) return "storm";
    if (/snow|flurr|sleet|blizzard/.test(t)) return /heavy|blizzard/.test(t) ? "snow-heavy" : "snow";
    if (/rain|shower|drizzle/.test(t)) return /heavy/.test(t) ? "rain-heavy" : /drizzle|light|chance|slight|isolated|scattered/.test(t) ? "rain-light" : "rain";
    if (/fog|mist|haze/.test(t)) return "fog";
    return "";
  }
  function weatherFx() {
    if (!FX) return;                                       // called before this file has run (start-up): it runs below
    var k = fxWanted(), el = document.getElementById("wxfx");
    if (!el || k === FX.kind) return;
    FX.kind = k;
    el.className = k ? "on fx-" + k.split("-")[0] + (k.indexOf("-") > 0 ? " fx-" + k : "") : "";
    if (/^(rain|storm)/.test(k)) { el.children[0].style.backgroundImage = "url(" + fxTile("rain-far") + ")"; el.children[1].style.backgroundImage = "url(" + fxTile("rain-near") + ")"; }
    else if (/^snow/.test(k)) { el.children[0].style.backgroundImage = "url(" + fxTile("snow-far") + ")"; el.children[1].style.backgroundImage = "url(" + fxTile("snow-near") + ")"; }
    else { el.children[0].style.backgroundImage = el.children[1].style.backgroundImage = ""; }
  }
  setInterval(weatherFx, 5 * 60000);                       // the forecast refreshes every 30 min; this follows it
  setTimeout(weatherFx, 3000);

  // ── Lighter home ── For slow TVs: no blur, no shine, no weather on the background, shorter animations. Automatic
  // turns it on when the TV has under 1.5 GB of memory, or the home drew under 40 frames a second three times in a row
  // (6 s, 1 min and 3 min after start, on screen): one busy moment while starting doesn't make a TV "slow".
  var LITE = { slow: false, measured: false, tries: [] };
  function liteApply() {
    if (!LITE) return;
    var on = PREFS.lite === "on" || (PREFS.lite !== "off" && LITE.slow);
    document.body.classList.toggle("lite", on);
    FX.kind = "?"; weatherFx();
  }
  function liteMeasure() {
    var info = {};
    try { info = app && app.systemInfo ? JSON.parse(app.systemInfo()) : {}; } catch (e) { }
    if (info.memTotal && info.memTotal < 1.5e9) { LITE.slow = true; LITE.why = "memory"; liteApply(); return; }
    if (document.hidden || !homeVisible) { setTimeout(liteMeasure, 20000); return; }
    var n = 0, t0 = 0;
    (function frame(t) {
      if (!t0) t0 = t;
      n++;
      if (t - t0 < 2000) { requestAnimationFrame(frame); return; }
      var fps = n * 1000 / (t - t0);
      if (document.hidden || !homeVisible) { setTimeout(liteMeasure, 20000); return; }
      LITE.tries.push(Math.round(fps));
      if (fps >= 40) { LITE.measured = true; return; }            // smooth once: not a slow TV
      if (LITE.tries.length < 3) { setTimeout(liteMeasure, LITE.tries.length === 1 ? 54000 : 120000); return; }
      LITE.measured = true; LITE.slow = true; LITE.why = "speed";
      liteApply();
    })(0);
  }
  liteApply();
  setTimeout(liteMeasure, 6000);                           // after start-up settles (tiles, first photo)

  // ── Full-screen Now playing ── The cover large over a blurred copy of itself, the song, and the time; or the radio
  // station that's playing. Opened from the music card (Full screen), or by itself after a minute of music with nobody
  // pressing anything on the home (Settings › Appearance › Full-screen Now playing). The screensaver still comes at its
  // own time (Settings › Screensaver › Start after) and takes over from it, with the song in its music corner. OK plays or pauses (stops the
  // radio), ◀ ▶ skip, Back or any other key closes. The text drifts a few pixels every minute so nothing burns in.
  var NPF = { open: false, last: Date.now(), timer: 0, hintT: 0, drift: 0 };
  function npfTouch() { NPF.last = Date.now(); }
  function npfWhat() { return MUSIC.title && (MUSIC.playing || NPF.open) ? "music" : RD.now ? "radio" : ""; }
  function npfOpen() {
    if (!npfWhat()) { toast("Nothing is playing"); return; }
    if (dockCard) closeDockCard();
    NPF.open = true; NPF.shownArt = "";
    document.getElementById("npf").classList.add("open");
    npfRender(); npfHint();
    clearInterval(NPF.timer); NPF.timer = setInterval(npfTick, 1000);
  }
  function npfClose() {
    if (!NPF.open) return;
    NPF.open = false; clearInterval(NPF.timer); npfTouch();
    document.getElementById("npf").classList.remove("open");
  }
  function npfHint() {
    var h = document.getElementById("npfHint"), w = npfWhat();
    h.textContent = w === "radio" ? "OK stop  ·  Back close" : "◀ ▶ skip  ·  OK " + (MUSIC.playing ? "pause" : "play") + "  ·  Back close";
    h.classList.add("on"); clearTimeout(NPF.hintT);
    NPF.hintT = setTimeout(function () { h.classList.remove("on"); }, 4000);
  }
  function npfRender() {
    if (!NPF.open) return;
    var w = npfWhat();
    if (!w) { npfClose(); return; }
    var art = "", artEl = document.getElementById("npfArt");
    if (w === "music") {
      art = musicArt();
      document.getElementById("npfK").textContent = MUSIC.playing ? (MUSIC.app ? "Playing in " + MUSIC.app : "Now playing") : "Paused";
      document.getElementById("npfT").textContent = MUSIC.title;
      document.getElementById("npfA").textContent = MUSIC.artist || "";
      document.getElementById("npfS").textContent = MUSIC.out ? "Sound · " + MUSIC.out : "";
    } else {
      art = RD.now.f || "";
      document.getElementById("npfK").textContent = RD.status === "buffering" ? "Tuning in…" : "Live radio";
      document.getElementById("npfT").textContent = RD.now.n;
      document.getElementById("npfA").textContent = [RD.now.loc || RD.now.st || "", RD.now.t].filter(Boolean).join(" · ");
      document.getElementById("npfS").textContent = "";
    }
    var key = w + "|" + art + "|" + (w === "radio" ? RD.now.n : "");
    if (key !== NPF.shownArt) {                            // the cover (or the station's logo, else its call letters)
      NPF.shownArt = key;
      artEl.innerHTML = ""; artEl.className = "npf-art" + (w === "radio" ? " radio" : "");
      var blur = document.getElementById("npfBlur");
      blur.classList.remove("on");
      if (art) {
        var im = new Image(); im.alt = ""; im.src = art;
        im.addEventListener("error", function () { artEl.classList.add("none"); if (w === "radio") artEl.textContent = rdCall(RD.now.n) || "♪"; });
        im.addEventListener("load", function () {          // the backdrop: the middle of the cover, tiny
          try {
            var g = blur.getContext("2d"), s = Math.min(im.naturalWidth, im.naturalHeight * 24 / 14);
            g.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s * 14 / 24) / 2, s, s * 14 / 24, 0, 0, 24, 14);
            blur.classList.add("on");
          } catch (e) { }
        });
        artEl.appendChild(im);
      } else {
        artEl.classList.add("none"); artEl.textContent = w === "radio" ? (rdCall(RD.now.n) || "📻") : "♪";
      }
      document.getElementById("npf").classList.toggle("noart", !art || w === "radio");   // a small logo blurred looks muddy: the accent glow instead
    }
    document.getElementById("npf").classList.toggle("live", w === "radio" && RD.status !== "buffering");
    npfTick();
  }
  function npfTick() {
    if (!NPF.open) return;
    var d = new Date(), w = npfWhat();
    document.getElementById("npfClock").textContent = d.toLocaleTimeString(locale(), tzOpts({ hour: "numeric", minute: "2-digit" }));
    var prog = document.getElementById("npfProg"), dur = w === "music" ? MUSIC.duration || 0 : 0;
    prog.classList.toggle("on", dur > 0);
    if (dur > 0) {
      var p = Math.max(0, Math.min(dur, musicPos() || 0));
      document.getElementById("npfBar").style.transform = "scaleX(" + Math.min(1, p / dur) + ")";
      document.getElementById("npfPos").textContent = clock(p);
      document.getElementById("npfDur").textContent = clock(dur);
    }
    if (d.getMinutes() !== NPF.drift) {                    // a few pixels each minute, so a long album doesn't burn in
      NPF.drift = d.getMinutes();
      document.getElementById("npfIn").style.transform = "translate(" + ((NPF.drift * 7) % 24 - 12) + "px," + ((NPF.drift * 5) % 18 - 9) + "px)";
    }
    if (w === "music" && !MUSIC.playing && Date.now() - NPF.last > 10 * 60000) npfClose();   // paused ten minutes: back home
  }
  function npfNav(action) {
    npfTouch();
    var w = npfWhat();
    if (action === "ok") {
      if (w === "radio") { rdStop(); toast("Radio off"); npfClose(); return; }
      if (app && app.musicCmd) app.musicCmd(MUSIC.playing ? "pause" : "play");
      npfHint(); return;
    }
    if ((action === "left" || action === "right") && w === "music") { if (app && app.musicCmd) app.musicCmd(action === "left" ? "previous" : "next"); npfHint(); return; }
    npfClose();
  }
  setInterval(function () {                                // by itself: a minute of music with nobody at the remote
    if (PREFS.npFull !== "auto" || NPF.open || !homeVisible || ambient) return;
    if (custOpen || sysOpen || dockCard || FM.open || LT.open || RD.open || weekOpen) return;
    if (!((MUSIC.title && MUSIC.playing) || (RD.now && RD.status === "playing"))) return;
    if (Date.now() - NPF.last > 60000) npfOpen();
  }, 5000);
