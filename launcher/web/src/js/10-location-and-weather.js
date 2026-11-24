  // ---- Location and official data (US only for now) ---------------------------------------------------------
  // Weather: National Weather Service. Tides and water temperature: NOAA tide stations. Waves: NOAA buoys (NDBC).
  // UV: EPA. Sunrise/sunset: calculated on the TV (NOAA's solar formulas). Place names: NWS. ZIP codes: US Census.
  // Location priority: a ZIP set in Settings > Location, then tv.json's "weather" lat/lon, then an automatic guess
  // from the internet connection (ipwho.is, third party, shown as "estimated"). Outside the US these features hide.
  var LOC = null;                       // { lat, lon, zip, name, how: zip|tv|auto, hourly, tide, wtemp, buoys, unsupported }
  var TVDEF = null;                     // tv.json's location, if any
  var BEACH = {}, beachWhy = "";
  var timers = {};
  // While an app is on screen nothing here is looked at, so refreshes wait for the home screen (guestShown runs them,
  // spaced out). Weather alerts keep their 5-minute check: they can come over any app.
  var everyLater = {};
  function every(name, fn, ms) {
    clearTimeout(timers[name]);
    timers[name] = setTimeout(function () { if (homeVisible || name === "alerts") fn(); else everyLater[name] = fn; }, ms);
  }
  function everyCatchUp() {
    var due = Object.keys(everyLater), fns = everyLater; everyLater = {};
    due.forEach(function (n, i) { setTimeout(fns[n], 800 + i * 1500); });
  }

  // Text from a URL; NOAA buoys and EPA go through the app (those servers don't let pages read them directly).
  var pendingFetch = {}, fetchSeq = 0;
  function getText(url) {
    if (app && app.fetchUrl && NEWS_HOSTS.indexOf((url.match(/^https:\/\/([^\/]+)\//) || [])[1]) >= 0) {   // news feeds (Settings > Screensaver)
      return new Promise(function (res, rej) { var id = "f" + (++fetchSeq); pendingFetch[id] = [res, rej]; app.fetchUrl(id, url); });
    }
    if (app && app.fetchUrl && /^https:\/\/(api\.exchange\.coinbase\.com\/products\/|api\.nasdaq\.com\/api\/quote\/|www\.ndbc\.noaa\.gov|data\.epa\.gov|api-web\.nhle\.com|itunes\.apple\.com\/search|mirrors\.kodi\.tv\/releases\/|transition\.fcc\.gov\/fcc-bin\/(tvq|fmq|amq)\?|site\.api\.espn\.com\/apis\/site\/v2\/sports\/[^?]+\/teams\/)/.test(url)) {
      return new Promise(function (res, rej) { var id = "f" + (++fetchSeq); pendingFetch[id] = [res, rej]; app.fetchUrl(id, url); });
    }
    if (!app && location.hostname === "localhost" && NEWS_HOSTS.concat(["files.airnowtech.org", "api.exchange.coinbase.com", "api.nasdaq.com", "api-web.nhle.com", "site.api.espn.com", "www.ndbc.noaa.gov", "data.epa.gov", "transition.fcc.gov"])
          .indexOf((url.match(/^https:\/\/([^\/]+)\//) || [])[1]) >= 0)
      url = "/proxy?u=" + encodeURIComponent(url);       // computer preview: tools\serve_preview.ps1 fetches it
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); });
  }
  window.guestFetched = function (id, ok, text) { var p = pendingFetch[id]; delete pendingFetch[id]; if (p) (ok ? p[0] : p[1])(text); };
  function getJson(url) { return getText(url).then(JSON.parse); }

  function km(aLat, aLon, bLat, bLon) {
    var k = Math.cos(aLat * Math.PI / 180);
    return Math.sqrt(Math.pow((aLat - bLat) * 111.2, 2) + Math.pow((aLon - bLon) * 111.2 * k, 2));
  }
  function nearest(list, lat, lon, maxKm) {             // list: [[id, lat, lon, ...]]
    return list.map(function (s) { return [km(lat, lon, s[1], s[2])].concat(s); })
      .filter(function (s) { return s[0] <= maxKm; }).sort(function (a, b) { return a[0] - b[0]; });
  }
  // Station lists, cached on the TV for 7 days (compact [id, lat, lon]).
  function stations(kind) {
    var c = load("st:" + kind);
    if (c && Date.now() - c.t < 7 * 86400000) return Promise.resolve(c.list);
    var p = kind === "buoy"
      ? getText("https://www.ndbc.noaa.gov/activestations.xml").then(function (x) {
          var list = [], re = /<station id="([^"]+)" lat="([^"]+)" lon="([^"]+)"[^>]*type="buoy" met="y"/g, m;
          while ((m = re.exec(x))) list.push([m[1], +m[2], +m[3]]);
          return list;
        })
      : getJson("https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=" + (kind === "tide" ? "tidepredictions" : "watertemp"))
          .then(function (j) { return j.stations.map(function (s) { return [s.id, +s.lat, +s.lng]; }); });
    return p.then(function (list) { save("st:" + kind, { t: Date.now(), list: list }); return list; });
  }

  function setLocation(lat, lon, zip, how) {
    return getJson("https://api.weather.gov/points/" + lat.toFixed(4) + "," + lon.toFixed(4)).then(function (j) {
      var rl = j.properties.relativeLocation.properties;
      var loc = { lat: lat, lon: lon, zip: zip || (app && app.zipNearest ? app.zipNearest(lat, lon) : ""), how: how,
                  name: rl.city + ", " + rl.state, hourly: j.properties.forecastHourly };
      return Promise.all([stations("tide"), stations("wtemp"), stations("buoy").catch(function () { return []; })]).then(function (s) {
        var t = nearest(s[0], lat, lon, 25)[0], w = nearest(s[1], lat, lon, 40)[0];
        loc.tide = t ? t[1] : null;                     // no tide station within 25 km: not near the coast, no beach row
        loc.wtemp = w ? w[1] : null;
        loc.buoys = nearest(s[2], lat, lon, 60).slice(0, 3).map(function (b) { return b[1]; });
        return loc;
      });
    }, function () {
      return { lat: lat, lon: lon, zip: zip, how: how, unsupported: true, name: "" };   // outside the US (NWS has no data)
    }).then(function (loc) {
      LOC = loc;
      if (how !== "tv") save("loc", loc); else save("loc:tv", loc);
      BEACH = {};
      refreshData();
      return loc;
    });
  }
  function initLocation(tv) {
    TVDEF = tv.weather && tv.weather.lat != null ? tv.weather : null;
    var saved = load("loc");
    if (q.get("zip")) { useZip(q.get("zip")); return; }                 // preview: ?zip=10001
    if (saved && saved.how === "zip") { LOC = saved; refreshData(); return; }
    if (TVDEF) {
      var c = load("loc:tv");
      if (c && c.lat === TVDEF.lat && c.lon === TVDEF.lon && !c.unsupported) { LOC = c; refreshData(); }
      else setLocation(TVDEF.lat, TVDEF.lon, null, "tv");
      return;
    }
    if (saved && saved.how === "auto") { LOC = saved; refreshData(); autoLocation(true); return; }   // shown at once, then re-checked
    autoLocation();
  }
  // Automatic location follows the TV (owner: a travel stick): checked at start and, when the home screen comes back,
  // at most every 3 hours. A move of 15 km or more switches the weather, beach and alerts to the new place. A ZIP code
  // chosen in Settings > Location stays put. A VPN on the TV makes this guess the VPN server's city instead.
  var locCheckedAt = 0;
  function autoLocation(recheck) {
    locCheckedAt = Date.now();
    return fetch("https://ipwho.is/").then(function (r) { return r.json(); }).then(function (j) {
      if (!j.success) throw new Error("no guess");
      if (recheck && LOC && LOC.how === "auto" && LOC.lat != null && j.country_code === "US") {
        var k = Math.cos(LOC.lat * Math.PI / 180), km = Math.sqrt(Math.pow((j.latitude - LOC.lat) * 111.2, 2) + Math.pow((j.longitude - LOC.lon) * 111.2 * k, 2));
        if (km < 15) return;                                           // same place
      }
      if (j.country_code !== "US") { LOC = { unsupported: true, how: "auto", name: j.city || "" }; save("loc", LOC); refreshData(); return; }
      return setLocation(j.latitude, j.longitude, j.postal, "auto").then(function (loc) {
        guestNotice({ title: "Location: " + loc.name + " (estimated)", message: "Change it in Settings > Location.", level: "info", source: "Setup" });
      });
    }).catch(function () { every("autoloc", autoLocation, 10 * 60000); });
  }
  function useZip(zip) {
    zip = String(zip).replace(/\D/g, "").slice(0, 5);
    var hit = app && app.zipLookup ? Promise.resolve(app.zipLookup(zip))
      : fetch("zips.txt").then(function (r) { return r.text(); }).then(function (t) { var m = t.match(new RegExp("^" + zip + ",([^,]+),([^\\r\\n]+)", "m")); return m ? m[1] + "," + m[2] : ""; });
    return hit.then(function (ll) {
      if (!ll) { toast("ZIP code " + zip + " not found"); return null; }
      var p = ll.split(",");
      return setLocation(+p[0], +p[1], zip, "zip").then(function (loc) {
        toast(loc.unsupported ? "That location isn't supported yet" : "Location set: " + loc.name);
        return loc;
      });
    });
  }
  function refreshData() {
    document.getElementById("wPlace").textContent = LOC ? LOC.name : "";
    if (!LOC || LOC.unsupported) {                      // clock only
      SUN = null;
      document.getElementById("weather").classList.remove("on");
      document.getElementById("mWx").innerHTML = "";
      document.getElementById("wMore").textContent = ""; document.getElementById("mWxMore").textContent = "";
      ALERTS = []; renderAlert(); renderBeach();
      return;
    }
    SUN = sunTimes(LOC.lat, LOC.lon);
    weather(); tides(); seaData(); uv(); alerts(); air();
    weekKey = ""; renderWeekPanel();
    renderBeach();
  }

  // Sunrise and sunset, calculated here (NOAA's general solar position formulas; within a minute or two).
  function sunTimes(lat, lon) {
    var out = { rise: [], set: [] }, rad = Math.PI / 180;
    for (var k = 0; k < 2; k++) {
      var d = new Date(); d.setDate(d.getDate() + k);
      var start = new Date(d.getFullYear(), 0, 0), doy = Math.floor((d - start) / 86400000);
      var g = 2 * Math.PI / 365 * (doy - 1);
      var eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
      var dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
              - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
      var ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(dec)) - Math.tan(lat * rad) * Math.tan(dec)) / rad;
      var utc0 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
      out.rise.push(utc0 + (720 - 4 * (lon + ha) - eqt) * 60000);
      out.set.push(utc0 + (720 - 4 * (lon - ha) - eqt) * 60000);
    }
    return out;
  }

  // Weather now: the first hour of the National Weather Service hourly forecast for this location.
  function nwsLook(t, day) {
    t = (t || "").toLowerCase();
    if (/thunder|t-storm/.test(t)) return [WX.storm, "Storms"];
    if (/snow|sleet|flurr|ice/.test(t)) return [WX.snow, "Snow"];
    if (/rain|shower|drizzle/.test(t)) return [WX.rain, /drizzle/.test(t) ? "Drizzle" : "Rain"];
    if (/fog|haze|smoke|mist/.test(t)) return [WX.fog, /fog/.test(t) ? "Fog" : "Haze"];
    if (/partly|mostly sunny|mostly clear|few clouds/.test(t)) return [WX.part, "Partly cloudy"];
    if (/cloudy|overcast/.test(t)) return [WX.cloud, "Cloudy"];
    return [day ? WX.sun : WX.moon, day ? "Sunny" : "Clear"];
  }
  // The line under the temperature: today's high and low, then the one thing worth knowing next (from the same hourly
  // forecast): storms, rain, strong wind, or a dry spell. Kept to one line on purpose.
  function wxOutlook(periods) {
    var now = Date.now(), today = new Date().toDateString();
    var hrs = periods.map(function (p) {
      var w = (String(p.windSpeed).match(/\d+/g) || [0]).map(Number);       // "10 to 20 mph": the higher one
      return { t: Date.parse(p.startTime), temp: p.temperature, pop: +((p.probabilityOfPrecipitation || {}).value) || 0,
               storm: /thunder|t-storm/i.test(p.shortForecast), wind: Math.max.apply(null, w) };
    }).filter(function (h) { return h.t + 3600000 > now; });
    var day = hrs.filter(function (h) { return new Date(h.t).toDateString() === today; }), label = "";
    if (day.length < 4) {                                                  // late evening: tomorrow is the useful one
      var tm = new Date(now + 86400000).toDateString();
      day = hrs.filter(function (h) { return new Date(h.t).toDateString() === tm; }); label = "Tomorrow ";
    }
    var temps = day.map(function (h) { return h.temp; });
    var out = { hi: temps.length ? Math.max.apply(null, temps) : null, lo: temps.length ? Math.min.apply(null, temps) : null, hlLabel: label, next: "" };
    var soon = hrs.slice(0, 12), metric = units() === "celsius", windy = metric ? 40 : 25;
    function when(h) { return h.t <= now ? "now" : "from " + new Date(h.t).toLocaleTimeString(locale(), tzOpts({ hour: "numeric" })); }
    var s = soon.filter(function (h) { return h.storm && h.pop >= 30; })[0], r = soon.filter(function (h) { return h.pop >= 50; })[0];
    var g = soon.filter(function (h) { return h.wind >= windy; })[0];
    if (s) out.next = s.t <= now ? "Storms nearby" : "Storms possible " + when(s);
    else if (r) out.next = r.t <= now ? "Rain now" : "Rain likely " + when(r);
    else if (g) out.next = "Windy " + when(g) + ", up to " + g.wind + (metric ? " km/h" : " mph");
    else if (soon.length >= 8 && soon.every(function (h) { return h.pop < 20; })) out.next = "Dry for the next 12 hours";
    return out;
  }
  function wxMore(w) {                                  // "H 84° · L 71° · Rain likely from 3 PM"
    var bits = [];
    if (w.hi != null) bits.push((w.hlLabel ? T("Tomorrow") + " " : "") + "H " + Math.round(w.hi) + "°  L " + Math.round(w.lo) + "°");
    if (w.next) bits.push(T(w.next));
    return bits;
  }
  // How fresh the weather is. Over 90 minutes old, or the TV offline: say so in amber, so it's never trusted blindly.
  var WX_STALE = 90 * 60000;
  function wxStale(w) { return !w || !w.at || Date.now() - w.at > WX_STALE || !NET.online; }
  function wxStamp(w) {
    if (!w || !w.at) return "";
    return (wxStale(w) ? (NET.online ? "Not updated since " : "Offline · last updated ") : "National Weather Service · updated ") + hm(w.at);
  }
  function showWeather(w) {
    var ic = nwsLook(w.text, w.day), more = wxMore(w);
    document.getElementById("wIcon").innerHTML = ic[0];
    document.getElementById("wTemp").textContent = Math.round(w.temp) + "°";
    document.getElementById("wText").textContent = T(ic[1]);
    document.getElementById("weather").classList.add("on");
    document.getElementById("wMore").textContent = w.next ? T(w.next) : "";   // the clock panel's week strip already has the highs
    document.getElementById("mWx").innerHTML = ic[0] + "<span>" + Math.round(w.temp) + "°  " + T(ic[1]) + "</span>";
    document.getElementById("mWxMore").textContent = more.join("  ·  ");     // one line on the screensaver
    BEACH.day = w.day;
    renderBeach();
    renderFresh();
    weatherFx();                                          // rain, snow or fog on the background (24e)
  }
  function renderFresh() {                              // the stamp on the screensaver; amber on both screens when stale
    var w = load("weather"), stale = !!(w && w.at) && wxStale(w);
    var m = document.getElementById("mWxAt"), h = document.getElementById("wStale");
    m.textContent = wxStamp(w); m.classList.toggle("stale", stale);
    h.textContent = stale ? wxStamp(w) : ""; h.classList.toggle("on", stale);
  }
  setInterval(renderFresh, 60000);
  function weather() {
    if (!LOC || LOC.unsupported) return;
    getJson(LOC.hourly + (units() === "celsius" ? "?units=si" : "")).then(function (j) {
      var ps = j.properties.periods, p = ps[0], o = wxOutlook(ps);
      var w = { temp: p.temperature, text: p.shortForecast, day: p.isDaytime, hi: o.hi, lo: o.lo, hlLabel: o.hlLabel, next: o.next, at: Date.now() };
      save("weather", w);
      showWeather(w);
      OUTDOOR = outdoor(ps); renderOutdoor();
      every("weather", weather, 30 * 60000);
    }).catch(function () {
      var c = load("weather"); if (c) showWeather(c);    // the last forecast stays, marked with its time
      every("weather", weather, 5 * 60000);              // and the next try comes sooner
    });
  }

  // Walking and running conditions (Settings > Screensaver): each of the next 14 hours of the same NWS hourly forecast
  // is scored from temperature, dew point (how muggy it feels), rain chance, storms, wind and darkness, so the screen
  // can say how it is now, why, and the best hour coming up. Scoring is done in °F whatever the display units.
  // Air quality: the EPA's AirNow measurements for the nearest reporting area (the app downloads and picks it; the
  // computer preview reads the same file through serve_preview's proxy). Every 30 minutes.
  var AIR = null, OUTDOOR_P = null;
  var AIR_COLOR = { "Good": "#30d158", "Moderate": "#ffd60a", "Unhealthy for Sensitive Groups": "#ff9f0a", "Unhealthy": "#ff453a", "Very Unhealthy": "#bf5af2", "Hazardous": "#a2453d" };
  function air() {
    if (!LOC || LOC.unsupported) return;
    if (app && app.airQuality) app.airQuality(LOC.lat, LOC.lon);
    else if (location.hostname === "localhost") getText("https://files.airnowtech.org/airnow/today/reportingarea.dat").then(function (t) {
      var best = 80, pick = null, k = Math.cos(LOC.lat * Math.PI / 180);
      t.split("\n").forEach(function (line) {
        var f = line.split("|");
        if (f.length < 17 || f[5] !== "O" || f[6] !== "Y" || !f[12]) return;
        var km = Math.sqrt(Math.pow((+f[9] - LOC.lat) * 111.2, 2) + Math.pow((+f[10] - LOC.lon) * 111.2 * k, 2));
        if (km < best) { best = km; pick = f; }
      });
      window.guestAir(JSON.stringify(pick ? { area: pick[7] + ", " + pick[8], aqi: +pick[12], cat: pick[13], param: pick[11], time: pick[2] + " " + pick[3], agency: pick[16], km: Math.round(best) } : {}));
    }, function () { });
    every("air", air, 30 * 60000);
  }
  window.guestAir = function (json) {
    try { var a = JSON.parse(json); AIR = a && a.aqi != null ? a : null; } catch (e) { AIR = null; }
    renderAir();
    if (OUTDOOR_P) { OUTDOOR = outdoor(OUTDOOR_P); renderOutdoor(); }
  };
  function renderAir() {
    var el = document.getElementById("wAir"), m = document.getElementById("mAir"), a = AIR;
    el.classList.toggle("on", !!a);
    if (!a) { el.textContent = ""; m.textContent = ""; return; }
    var pol = { "PM2.5": "fine particles", "PM10": "particles", "OZONE": "ozone", "O3": "ozone" }[a.param] || a.param.toLowerCase();
    var dot = function () { var i = document.createElement("i"); i.style.background = own(AIR_COLOR, a.cat) || "#8e8e93"; return i; };
    el.textContent = ""; el.appendChild(dot()); el.appendChild(document.createTextNode(T("Air") + " " + a.aqi + " · " + T(a.cat)));
    m.textContent = ""; m.appendChild(dot()); m.appendChild(document.createTextNode(T("Air quality") + " " + a.aqi + " · " + T(a.cat) + " · " + pol));
  }
  var OUTDOOR = null;
  function outdoor(periods) {
    OUTDOOR_P = periods;
    var celsius = units() === "celsius";
    function f(v) { return celsius ? v * 9 / 5 + 32 : v; }
    var hours = (periods || []).slice(0, 14).map(function (p) {
      var t = f(p.temperature), dewC = p.dewpoint && p.dewpoint.value, d = dewC == null ? null : dewC * 9 / 5 + 32;
      var pop = (p.probabilityOfPrecipitation || {}).value || 0, wind = parseInt(p.windSpeed, 10) || 0;
      if (celsius) wind = Math.round(wind / 1.609);            // the forecast says km/h in metric
      var storm = /thunder|t-storm/i.test(p.shortForecast), why = [];
      var hot = t > 68 ? (t - 68) * 2.5 : 0, cold = t < 38 ? (38 - t) * 2 : 0, muggy = d != null && d > 58 ? (d - 58) * 3 : 0;
      var wet = pop * .6 + (storm ? 60 : 0), windy = wind > 14 ? (wind - 14) * 2 : 0, dark = p.isDaytime ? 0 : 8;
      var smog = AIR && AIR.aqi > 100 ? (AIR.aqi - 100) * .6 + 15 : 0;           // poor air: AirNow's current reading
      why.push([hot, "hot"], [cold, "cold"], [muggy, "muggy"], [wet, storm ? "storms" : "rain likely"], [windy, "windy"], [dark, "dark"], [smog, "poor air"]);
      why.sort(function (a, b) { return b[0] - a[0]; });
      var score = 100 - hot - cold - muggy - wet - windy - dark - smog;
      return { t: Date.parse(p.startTime), score: score, why: why[0][0] >= 10 ? why[0][1] : "", temp: p.temperature, dew: d, wind: wind };
    });
    if (!hours.length) return null;
    var best = hours.slice(1).reduce(function (a, b) { return b.score > a.score + 5 ? b : a; }, hours[0]);
    return { now: hours[0], best: best };
  }
  function outdoorWord(s) { return s >= 75 ? "Great" : s >= 55 ? "Good" : s >= 35 ? "Fair" : "Tough"; }
  function renderOutdoor() {
    var el = document.getElementById("mOut"), o = OUTDOOR;
    el.textContent = "";
    if (!o) return;
    var n = o.now, deg = "°", detail = n.why === "muggy" && n.dew != null ? T("muggy") + ", " + T("dew point") + " " + Math.round(units() === "celsius" ? (n.dew - 32) * 5 / 9 : n.dew) + deg
      : n.why === "windy" ? T("windy") + ", " + n.wind + " mph" : n.why ? T(n.why) : "";
    var line = T("Walk or run") + ": " + T(outdoorWord(n.score)) + (detail ? " · " + detail : "");
    if (o.best !== n && outdoorWord(o.best.score) !== outdoorWord(n.score))
      line += " · " + T("better at") + " " + new Date(o.best.t).toLocaleTimeString(locale(), tzOpts({ hour: "numeric" })) + " (" + T(outdoorWord(o.best.score)).toLowerCase() + ")";
    el.textContent = line;
  }

  // The week ahead (OK on the weather glass): the National Weather Service's 7-day forecast, day and night periods paired
  // into one column per day. Fetched when opened, kept for an hour.
  var wxFocus = false, weekOpen = false;
  // One request at a time however many views ask (clock panel, screensaver, week view); offline, the last forecast
  // stays up and the next try waits 10 minutes.
  var weekFlight = null, weekFailAt = 0;
  function weekly() {
    if (!LOC || LOC.unsupported) return Promise.reject(new Error("no location"));
    var key = LOC.hourly + units(), c = load("week"), have = c && c.key === key ? c.days : null;
    if (have && (Date.now() - c.t < 3600000 || Date.now() - weekFailAt < 600000)) return Promise.resolve(have);
    if (!have && Date.now() - weekFailAt < 600000) return Promise.reject(new Error("offline"));
    if (weekFlight) return weekFlight;
    weekFlight = getJson(LOC.hourly.replace(/\/hourly$/, "") + (units() === "celsius" ? "?units=si" : "")).then(function (j) {
      var days = [], today = new Date().toDateString();
      j.properties.periods.forEach(function (p) {
        var pop = (p.probabilityOfPrecipitation || {}).value || 0, d = new Date(p.startTime);
        if (p.isDaytime || !days.length) {
          days.push({ t: d.getTime(), tonight: !p.isDaytime, today: d.toDateString() === today,
                      hi: p.isDaytime ? p.temperature : null, lo: p.isDaytime ? null : p.temperature, text: p.shortForecast, day: p.isDaytime, pop: pop });
        } else {
          var last = days[days.length - 1];
          if (last.lo == null) last.lo = p.temperature;
          last.pop = Math.max(last.pop, pop);
        }
      });
      days = days.slice(0, 7);
      save("week", { t: Date.now(), key: key, days: days });
      weekFlight = null;
      return days;
    }, function (e) { weekFlight = null; weekFailAt = Date.now(); if (have) return have; throw e; });
    return weekFlight;
  }
  function openWeek() {
    weekOpen = true;
    document.getElementById("weekTitle").textContent = T("This week") + (LOC && LOC.name ? T(" in ") + LOC.name : "");
    var box = document.getElementById("wdays");
    box.innerHTML = '<div class="msg">' + T("Loading the forecast…") + "</div>";
    document.getElementById("week").classList.add("open");
    document.getElementById("sysdim").classList.add("open");
    weekly().then(function (days) {
      box.innerHTML = days.map(function (d) {
        var ic = nwsLook(d.text, d.day);
        return '<div class="wd"><div class="dn">' + (d.tonight ? T("Tonight") : d.today ? T("Today") : dayText(d.t, { weekday: "short" })) + "</div>" + ic[0] +
          '<div class="hi">' + (d.hi != null ? Math.round(d.hi) + "°" : "") + '</div><div class="lo">' + (d.lo != null ? Math.round(d.lo) + "°" : "") +
          '</div><div class="pp">' + (+d.pop >= 20 ? Math.round(+d.pop) + "% " + T("rain") : "") + '</div><div class="tx">' + T(ic[1]) + "</div>" +
          '<div class="evs" data-t="' + d.t + '"></div></div>';
      }).join("");
      [].forEach.call(box.querySelectorAll(".evs"), function (slot) {     // the day's events (text from calendars: never markup)
        var evs = eventsOn(new Date(+slot.getAttribute("data-t")));
        evs.slice(0, 3).forEach(function (e) {
          var line = document.createElement("div"), dot = document.createElement("i");
          line.className = "wev"; dot.style.background = e.color;
          var label = document.createElement("span"); label.textContent = (e.allDay ? "" : hm(e.t) + " ") + e.title;
          line.appendChild(dot); line.appendChild(label);
          slot.appendChild(line);
        });
        if (evs.length > 3) { var more = document.createElement("div"); more.className = "wev"; more.textContent = "+" + (evs.length - 3) + " " + T("more"); slot.appendChild(more); }
      });
    }, function () { box.innerHTML = '<div class="msg">The forecast isn\'t available right now</div>'; });
  }
  function closeWeek() {
    weekOpen = false;
    document.getElementById("week").classList.remove("open");
    document.getElementById("sysdim").classList.remove("open");
  }

