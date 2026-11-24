  // Water temperature (NOAA tide station sensor) and waves (nearest NOAA buoy with a wave sensor).
  function seaData() {
    if (!LOC || LOC.unsupported || !LOC.tide) return;
    if (LOC.wtemp) getJson("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=" + LOC.wtemp +
        "&product=water_temperature&date=latest&units=english&time_zone=lst_ldt&format=json&application=Offshore")
      .then(function (j) { var v = j.data && j.data[0] && parseFloat(j.data[0].v); if (!isNaN(v)) { BEACH.water = v; renderBeach(); } }).catch(function () {});
    (function tryBuoy(i) {
      if (i >= (LOC.buoys || []).length) return;
      getText("https://www.ndbc.noaa.gov/data/realtime2/" + LOC.buoys[i] + ".txt").then(function (t) {
        var lines = t.split("\n"), cols = lines[0].replace(/^#/, "").trim().split(/\s+/), at = cols.indexOf("WVHT");
        for (var k = 2; k < Math.min(lines.length, 14); k++) {
          var v = lines[k].trim().split(/\s+/)[at];
          if (v && v !== "MM") { BEACH.waves = parseFloat(v) * 3.281; renderBeach(); return; }   // metres -> feet
        }
        tryBuoy(i + 1);
      }).catch(function () { tryBuoy(i + 1); });
    })(0);
    every("sea", seaData, 30 * 60000);
  }

  // UV index: EPA's hourly forecast for the nearest ZIP code; when that has nothing (it answers "not found" until the
  // EPA publishes the day's hourly forecast, in the early morning), the EPA's daily forecast: the day's peak, "UV peak".
  function uv() {
    if (!LOC || LOC.unsupported || !LOC.zip) return;
    var base = "https://data.epa.gov/efservice/getEnvirofactsUV";
    getJson(base + "HOURLY/ZIP/" + LOC.zip + "/JSON").then(function (list) {
      var h = new Date().getHours(), got = null;
      (list || []).forEach(function (e) {               // "Nov/02/2026 07 AM"
        var m = /(\d+) (AM|PM)$/.exec(e.DATE_TIME || ""); if (!m) return;
        var hr = (+m[1] % 12) + (m[2] === "PM" ? 12 : 0);
        if (hr === h) got = e.UV_VALUE;
      });
      if (got == null) throw new Error("no hourly UV");
      BEACH.uv = got; BEACH.uvPeak = false; renderBeach();
    }).catch(function () {
      return getJson(base + "DAILY/ZIP/" + LOC.zip + "/JSON").then(function (list) {
        var e = (list || [])[0], v = e ? parseFloat(e.UV_INDEX) : NaN;
        if (isNaN(v)) return;
        BEACH.uv = v; BEACH.uvPeak = true; renderBeach();
      });
    }).catch(function () {});
    every("uv", uv, 60 * 60000);
  }
  var CX = {
    water: '<svg viewBox="0 0 24 24"><path d="M10 13.5V4a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v6"/></svg>',
    waves: '<svg viewBox="0 0 24 24"><path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 16c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/></svg>',
    high: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    low: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    sunset: '<svg viewBox="0 0 24 24"><path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 3v4M4.9 7.9l1.4 1.4M19.1 7.9l-1.4 1.4"/></svg>',
    uv: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>'
  };
  function tides() {
    if (!LOC || LOC.unsupported || !LOC.tide) return;
    var d = new Date(), ymd = "" + d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
    fetch("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=" + LOC.tide +
      "&product=predictions&datum=MLLW&interval=hilo&units=english&time_zone=lst_ldt&format=json&range=48&application=Offshore&begin_date=" + ymd)
      .then(function (r) { return r.json(); }).then(function (j) {
        BEACH.tides = (j.predictions || []).map(function (p) {           // "2026-11-02 18:25", local time
          var a = p.t.split(/[- :]/);
          return { t: new Date(+a[0], a[1] - 1, +a[2], +a[3], +a[4]).getTime(), high: p.type === "H" };
        });
        renderBeach();
      }).catch(function () {});
    every("tides", tides, 6 * 3600000);
  }
  function uvWord(u) { return u < 3 ? "Low" : u < 6 ? "Moderate" : u < 8 ? "High" : u < 11 ? "Very high" : "Extreme"; }
  function renderBeach() {
    var now = Date.now(), items = [];
    if (BEACH.water != null) items.push(["water", "Water", Math.round(units() === "celsius" ? (BEACH.water - 32) * 5 / 9 : BEACH.water) + "°"]);
    if (BEACH.waves != null) items.push(["waves", "Waves", (Math.max(.5, Math.round(BEACH.waves * 2) / 2)) + "<small>ft</small>"]);
    var next = (BEACH.tides || []).filter(function (t) { return t.t > now; })[0];
    if (next) items.push([next.high ? "high" : "low", next.high ? "High tide" : "Low tide", hm(next.t).replace(/\s?([AP]M)$/, "<small>$1</small>")]);
    if (SUN) {
      var sunset = SUN.set[0] > now, t = sunset ? SUN.set[0] : (SUN.rise[0] > now ? SUN.rise[0] : SUN.rise[1]);
      items.push(["sunset", sunset && now > SUN.rise[0] ? "Sunset" : "Sunrise", hm(t).replace(/\s?([AP]M)$/, "<small>$1</small>")]);
    }
    if (BEACH.day && BEACH.uv != null) items.push(["uv", BEACH.uvPeak ? "UV peak" : "UV", Math.round(BEACH.uv) + "<small>" + T(uvWord(BEACH.uv)) + "</small>"]);
    var el = document.getElementById("beach");
    el.innerHTML = items.map(function (i) {
      return '<div class="cx"><div class="lbl">' + CX[i[0]] + T(i[1]) + '</div><div class="val">' + i[2] + "</div></div>";
    }).join("");
    el.classList.toggle("on", items.length > 0);
    var why = "beach: " + items.map(function (i) { return i[0]; }).join("/") + " (" + (LOC ? LOC.how + " " + (LOC.name || "") + (LOC.tide ? "" : ", no tide station") : "no location") +
      (PREFS.beach === "hide" ? ", turned off" : "") + ")";
    if (why !== beachWhy) { beachWhy = why; console.info(why); }   // in the TV's log, once per change
    applyTop();
  }

