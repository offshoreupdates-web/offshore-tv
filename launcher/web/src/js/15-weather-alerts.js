  // ---- Severe weather alerts (National Weather Service, free, no key) ------------------------------------
  // Active alerts for this TV's location, checked every 5 minutes. tv.json can list more places ("alertPlaces":
  // [[name, lat, lon], ...]) and a name for all of them together ("alertArea"). One glass notice shows the most
  // serious; several take turns. Preview: ?alerts=demo.
  var CITIES = [], AREA = "";
  function alertPlaces() {
    return CITIES.length ? CITIES : LOC && !LOC.unsupported ? [[LOC.name.split(",")[0], LOC.lat, LOC.lon]] : [];
  }
  var ALERTS = [], alertIdx = 0, ALERTS_AT = 0;
  (function () { var k = load("alertsKept"); if (k && k.list) { ALERTS = k.list; ALERTS_AT = k.at || 0; } })();
  // The NWS "what to do" text, tidied: one paragraph, at most max characters, cut at a sentence end.
  function cleanInstr(t) { return String(t || "").replace(/\s+/g, " ").trim().slice(0, 700); }
  function instrShort(t, max) {
    if (!t || t.length <= max) return t || "";
    var cut = t.slice(0, max), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
    return end > max * .4 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
  }
  function alertsStamp() {
    if (!ALERTS_AT) return "";
    var stale = !NET.online || Date.now() - ALERTS_AT > 20 * 60000;
    return { text: (stale ? (NET.online ? "Not confirmed since " : "Offline · last confirmed ") : "National Weather Service · confirmed ") + hm(ALERTS_AT), stale: stale };
  }
  var ALERT_COLOR = { Warning: "#ff453a", Watch: "#ff9f0a", Advisory: "#ffd60a", Statement: "#0a84ff" };
  var SEV = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
  function alerts() {
    every("alerts", alerts, 5 * 60000);
    if (PREFS.alertsOn === "off") { ALERTS = []; renderAlert(); return; }   // Settings > Notifications > Weather alerts
    var places = alertPlaces();
    if (!places.length || /^(demo|emergency)$/.test(q.get("alerts") || "")) return;
    Promise.all(places.map(function (c) {
      return fetch("https://api.weather.gov/alerts/active?point=" + c[1] + "," + c[2])
        .then(function (r) { return r.json(); })
        .then(function (j) { return { city: c[0], f: j.features || [] }; }, function () { return null; });
    })).then(function (res) {
      if (res.some(function (r) { return r === null; })) return;     // offline: keep what we have until it expires
      var byId = {};
      res.forEach(function (r) {
        r.f.forEach(function (f) {
          var p = f.properties;
          if (p.status !== "Actual" || p.messageType === "Cancel" || /test/i.test(p.event)) return;
          var a = byId[p.id] || (byId[p.id] = { id: p.id, event: p.event, sev: SEV[p.severity] != null ? SEV[p.severity] : 4,
            ends: new Date(p.ends || p.expires).getTime(), sent: Date.parse(p.sent) || 0, instr: cleanInstr(p.instruction),
            // An AMBER Alert's who/what/vehicle is in its description; it often has no instruction at all.
            desc: /Child Abduction|Civil|Law Enforcement|Local Area/.test(p.event) ? cleanInstr(p.description) : "", cities: [] });
          if (a.cities.indexOf(r.city) < 0) a.cities.push(r.city);
        });
      });
      var test = null;                                         // a practice warning pushed from a computer (alertTest)
      try { test = app && app.alertTest ? JSON.parse(app.alertTest() || "null") : null; } catch (e) { test = null; }
      if (test && test.event) {
        var tid = "test-" + Date.now();
        byId[tid] = { id: tid, event: "TEST: " + String(test.event).slice(0, 60), sev: 0, ends: Date.now() + 10 * 60000, sent: Date.now(),
          instr: "This is only a test of Offshore's weather warnings. No action is needed.", cities: [places[0][0]] };
      }
      ALERTS = Object.keys(byId).map(function (k) { return byId[k]; })
        .sort(function (a, b) { return a.sev - b.sev || b.cities.length - a.cities.length; });
      ALERTS_AT = Date.now();
      save("alertsKept", { at: ALERTS_AT, list: ALERTS });     // survives a restart while the internet is down
      renderAlert();
      urgentWeather();
    });
  }
  function renderAlert() {
    var now = Date.now(), list = ALERTS.filter(function (a) { return !a.ends || a.ends > now; }), el = document.getElementById("alert");
    if (el.classList.contains("on") !== list.length > 0 && typeof fitSoon === "function") setTimeout(fitSoon, 0);   // the clock makes room under it
    el.classList.toggle("on", list.length > 0);
    if (!list.length) { renderSsAlert(list); return; }
    var a = list[alertIdx % list.length], kind = URGENT_WX.test(a.event) ? "Warning" : (a.event.match(/Warning|Watch|Advisory|Statement/) || ["Statement"])[0];   // AMBER etc. in red
    var where = AREA && a.cities.length > 1 && a.cities.length === alertPlaces().length ? AREA : a.cities.join(" · ");
    var until = a.ends ? " · until " + (new Date(a.ends).toDateString() === new Date().toDateString() ? "" :
      dayText(a.ends, { weekday: "short" }) + " ") + hm(a.ends) : "";
    document.getElementById("aIc").style.background = ALERT_COLOR[kind];
    document.getElementById("aEv").textContent = a.event + (list.length > 1 ? "  ·  " + (alertIdx % list.length + 1) + " of " + list.length : "");
    document.getElementById("aSub").textContent = where + until;
    document.getElementById("aDo").textContent = kind === "Warning" ? instrShort(a.instr, 140) : "";
    renderSsAlert(list, where, until);
  }
  // On the screensaver: the most serious alert in the middle of the smart mirror (watches and advisories small, warnings
  // with what to do), and for life-threatening warnings a full-screen view in plain words. Never rotates those away.
  function renderSsAlert(list, where0, until0) {
    var box = document.getElementById("ssAlert"), em = document.getElementById("wxEmergency");
    var top = list[0], urgent = list.filter(function (a) { return URGENT_WX.test(a.event); })[0];
    document.body.classList.toggle("has-alert", !!top);
    box.classList.toggle("on", !!top && !urgent);
    em.classList.toggle("on", !!urgent);
    var st = alertsStamp();
    function whereOf(a) { return AREA && a.cities.length > 1 && a.cities.length === alertPlaces().length ? AREA : a.cities.join(" · "); }
    function untilOf(a) { return a.ends ? "Until " + (new Date(a.ends).toDateString() === new Date().toDateString() ? "" : dayText(a.ends, { weekday: "long" }) + " ") + hm(a.ends) : ""; }
    if (urgent) {
      document.getElementById("weEv").textContent = urgent.event;
      document.getElementById("weDo").textContent = instrShort(urgent.instr, 420) || "Follow the instructions of local officials.";
      document.getElementById("weSub").textContent = [whereOf(urgent), untilOf(urgent)].filter(Boolean).join("  ·  ");
      document.getElementById("weAt").textContent = (urgent.sent ? "Issued " + hm(urgent.sent) + "  ·  " : "") + (st ? st.text : "");
      document.getElementById("weAt").classList.toggle("stale", !!(st && st.stale));
      return;
    }
    if (!top) return;
    var kind = (top.event.match(/Warning|Watch|Advisory|Statement/) || ["Statement"])[0];
    box.classList.toggle("minor", kind !== "Warning");
    document.body.classList.toggle("minor-alert", kind !== "Warning");
    document.getElementById("ssaBar").style.background = ALERT_COLOR[kind];
    document.getElementById("ssaK").textContent = kind === "Warning" ? "Weather warning" : "Weather " + kind.toLowerCase();
    document.getElementById("ssaEv").textContent = top.event + (list.length > 1 ? "  +" + (list.length - 1) + " more" : "");
    document.getElementById("ssaSub").textContent = [whereOf(top), untilOf(top)].filter(Boolean).join("  ·  ");
    document.getElementById("ssaDo").textContent = kind === "Warning" ? instrShort(top.instr, 240) : "";
    document.getElementById("ssaAt").textContent = st ? st.text : "";
    document.getElementById("ssaAt").classList.toggle("stale", !!(st && st.stale));
  }
  setInterval(function () { if (ALERTS.length > 1) { alertIdx++; renderAlert(); } }, 8000);

  // Life-threatening warnings also appear over a movie, with a sound (the app shows them only if the home screen isn't
  // on screen). Besides weather, the National Weather Service relays what local officials send through it: AMBER
  // Alerts (Child Abduction Emergency), evacuations, shelter in place, civil and law-enforcement emergencies, hazardous
  // materials and nuclear/radiological warnings. (Phones also get FEMA's alerts, whose live feed needs FEMA's approval.)
  var URGENT_WX = new RegExp("Tornado Warning|Hurricane Warning|Extreme Wind Warning|Storm Surge Warning|Tsunami Warning|Flash Flood Emergency|" +
    "Child Abduction Emergency|Evacuation Immediate|Shelter In Place Warning|Civil Danger Warning|Civil Emergency Message|" +
    "Law Enforcement Warning|Hazardous Materials Warning|Nuclear Power Plant Warning|Radiological Hazard Warning|Fire Warning|Local Area Emergency");
  var urgentSeen = {};
  function urgentWeather() {
    ALERTS.forEach(function (a) {
      if (!URGENT_WX.test(a.event) || urgentSeen[a.id]) return;
      urgentSeen[a.id] = true;
      var where = AREA && a.cities.length > 1 && a.cities.length === alertPlaces().length ? AREA : a.cities.join(", ");
      var what = a.instr || a.desc;
      if (app && app.urgent) app.urgent(a.event, where + (a.ends ? " · until " + hm(a.ends) : "") + (what ? " · " + instrShort(what, 200) : ""));
    });
  }

