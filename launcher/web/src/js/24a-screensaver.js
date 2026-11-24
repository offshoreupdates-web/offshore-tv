  // ---- Screensaver and calendar -------------------------------------------------------------------------------
  // The week in the clock panel, the screensaver's news, markets and week, its layout (zones, presets) and the home
  // screen layout switches. wake() in 08-navigation starts it (renderCal, feedsStart) when the screen goes quiet.
  // The week in the clock panel on the home screen: day, date, and (when there's a forecast) icon and high.
  var weekKey = "";
  function renderWeekPanel() {
    var box = document.getElementById("cWeek"), on = PREFS.homeWeek !== "hide";
    box.classList.toggle("on", on);
    if (!on) { weekKey = ""; return; }
    var now = new Date(), key = now.toDateString() + now.getHours() + units() + PREFS.lang + (LOC ? LOC.name : "");
    if (key === weekKey) return;
    weekKey = key;
    function draw(fc) {
      var byDay = {}, html = "";
      (fc || []).forEach(function (d) { byDay[new Date(d.t).toDateString()] = d; });
      for (var i = 0; i < 7; i++) {
        var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12), w = byDay[day.toDateString()], evd = eventsOn(day);
        html += '<div class="c' + (i ? "" : " today") + '"><div class="n">' + dayText(day.getTime(), { weekday: "short" }).slice(0, 2) +
          '</div><div class="d">' + dayText(day.getTime(), { day: "numeric" }) + "</div>" +
          (w ? nwsLook(w.text, w.day)[0] + '<div class="h">' + (w.hi != null ? Math.round(w.hi) : Math.round(w.lo)) + "°</div>" : "") +
          (evd.length ? '<i class="evd" style="background:' + safeColor(evd[0].color) + '"></i>' : "") + "</div>";
      }
      box.innerHTML = html;
    }
    if (LOC && !LOC.unsupported) weekly().then(draw, function () { draw(null); weekKey = ""; });
    else draw(null);
  }

  // ---- Calendar (Settings > Calendar) ------------------------------------------------------------------------------
  // Calendars people already use, through the iCal (ICS) link every major service offers (Google, Apple iCloud,
  // Outlook / Microsoft 365, Proton, Yahoo, Fastmail, school and team calendars), added from a phone (the TV serves a
  // small form while that screen is open: Home.Bridge.calPhoneStart), plus holidays and events typed in on the TV.
  // Read only: events are changed in the calendar app. Links are fetched every 30 minutes by the app (only from known
  // calendar services) and the next two weeks are worked out here, repeats included.
  var CAL_COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#bf5af2", "#ff375f", "#64d2ff"];
  var EVENTS = (load("calcache") || {}).ev || [], NEWEV = null, CALPHONE = null;
  function calList() { return load("calendars") || []; }
  function myEvents() { return load("myevents") || []; }
  var WIN_TZ = { "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago", "Mountain Standard Time": "America/Denver",
    "US Mountain Standard Time": "America/Phoenix", "Pacific Standard Time": "America/Los_Angeles", "Alaskan Standard Time": "America/Anchorage",
    "Hawaiian Standard Time": "Pacific/Honolulu", "Atlantic Standard Time": "America/Halifax", "GMT Standard Time": "Europe/London",
    "W. Europe Standard Time": "Europe/Berlin", "Romance Standard Time": "Europe/Paris", "Central Europe Standard Time": "Europe/Budapest",
    "AUS Eastern Standard Time": "Australia/Sydney", "Tokyo Standard Time": "Asia/Tokyo", "India Standard Time": "Asia/Kolkata",
    "China Standard Time": "Asia/Shanghai", "UTC": "UTC", "Coordinated Universal Time": "UTC" };
  function tzOffset(t, tz) {                         // how far a time zone is from UTC at moment t (ms)
    var p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t;
  }
  function icsTime(v, params) {                      // 20261103 (all day), 20261103T150000Z (UTC), or wall time in TZID
    var m = (v || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    if (!m[4]) return { t: new Date(+m[1], m[2] - 1, +m[3]).getTime(), allDay: true };
    var y = +m[1], mo = m[2] - 1, d = +m[3], h = +m[4], mi = +m[5], s = +(m[6] || 0);
    if (m[7]) return { t: Date.UTC(y, mo, d, h, mi, s) };
    var tz = ((params || "").match(/TZID=("?)([^";:]+)\1/) || [])[2];
    if (tz) {
      tz = WIN_TZ[tz] || tz;
      try { var g = Date.UTC(y, mo, d, h, mi, s), t1 = g - tzOffset(g, tz); return { t: g - tzOffset(t1, tz) }; } catch (e) { }
    }
    return { t: new Date(y, mo, d, h, mi, s).getTime() };   // floating time: the TV's own clock
  }
  function icsDur(v) {
    var m = (v || "").match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
    return m ? (((+m[1] || 0) * 7 + (+m[2] || 0)) * 86400 + (+m[3] || 0) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0)) * 1000 : 0;
  }
  function daysIn(y, mo) { return new Date(y, mo + 1, 0).getDate(); }
  function nthDays(y, mo, dw, ord) {                 // the days of a month on weekday dw; ord 2 = second, -1 = last, 0 = all
    var first = new Date(y, mo, 1), list = [], yy = first.getFullYear(), mm = first.getMonth();
    for (var d = 1; d <= daysIn(yy, mm); d++) if (new Date(yy, mm, d).getDay() === dw) list.push(d);
    return ord > 0 ? [list[ord - 1]] : ord < 0 ? [list[list.length + ord]] : list;
  }
  // Start times of a (possibly repeating) event that fall in [from, to]. Covers DAILY, WEEKLY (with BYDAY), MONTHLY
  // (same day, BYMONTHDAY, or "2TU" / "-1FR") and YEARLY, with INTERVAL, COUNT and UNTIL.
  function occurrences(start, rrule, from, to) {
    if (!rrule) return start <= to && start >= from ? [start] : [];   // one-off: only if in the window (not years of history)
    var r = {};
    rrule.split(";").forEach(function (kv) { var p = kv.split("="); r[p[0]] = p[1]; });
    var iv = +(r.INTERVAL || 1), count = r.COUNT ? +r.COUNT : 1e9, until = r.UNTIL ? ((icsTime(r.UNTIL, "") || {}).t || Infinity) : Infinity;
    var DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }, days = r.BYDAY ? r.BYDAY.split(",") : null;
    var b = new Date(start), out = [], n = 0, guard = 0;
    var at = function (y, mo, d) { return new Date(y, mo, d, b.getHours(), b.getMinutes(), b.getSeconds()).getTime(); };
    var take = function (t) { if (t < start) return true; if (t > to || t > until || n >= count) return false; n++; if (t >= from) out.push(t); return true; };
    var go = true;
    if (r.FREQ === "DAILY") {
      var k0 = 0;                                    // no COUNT: jump straight to the window instead of walking years of days
      if (!r.COUNT && from > start) k0 = Math.max(0, Math.floor((from - start) / 86400000 / iv) - 1) * iv;
      for (var k = k0; go && guard++ < 6000; k += iv) go = take(at(b.getFullYear(), b.getMonth(), b.getDate() + k));
    }
    else if (r.FREQ === "WEEKLY") {
      var wd = (days ? days.map(function (x) { return DOW[x.slice(-2)]; }) : [b.getDay()]).sort(), w0 = b.getDate() - b.getDay();
      for (var w = 0; go && guard++ < 4000; w += iv) wd.forEach(function (dw) { if (go) go = take(at(b.getFullYear(), b.getMonth(), w0 + w * 7 + dw)); });
    } else if (r.FREQ === "MONTHLY") {
      for (var mm = 0; go && guard++ < 1500; mm += iv) {
        var y = b.getFullYear(), mo = b.getMonth() + mm, list = [];
        var dim = daysIn(new Date(y, mo, 1).getFullYear(), new Date(y, mo, 1).getMonth());
        if (days) days.forEach(function (x) { list = list.concat(nthDays(y, mo, DOW[x.slice(-2)], parseInt(x, 10) || 0)); });
        else if (r.BYMONTHDAY) list = r.BYMONTHDAY.split(",").map(function (v) { v = +v; return v < 0 ? dim + 1 + v : v; });   // -1 = last day
        else list = [b.getDate()];
        list.filter(function (d) { return d >= 1 && d <= dim; })
          .sort(function (a, c) { return a - c; }).forEach(function (d) { if (go) go = take(at(y, mo, d)); });
      }
    } else if (r.FREQ === "YEARLY") for (var yy = 0; go && guard++ < 300; yy += iv) go = take(at(b.getFullYear() + yy, b.getMonth(), b.getDate()));
    else if (start >= from && start <= to) out.push(start);
    return out;
  }
  function icsText(v) { return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim(); }
  function parseIcs(text, cal) {
    var lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/), evs = [], cur = null, inAlarm = false;
    lines.forEach(function (line) {
      if (line === "BEGIN:VEVENT") cur = { ex: [] };
      else if (line === "END:VEVENT") { if (cur) evs.push(cur); cur = null; }
      else if (line === "BEGIN:VALARM") inAlarm = true;                 // a reminder's own UID / SUMMARY aren't the event's
      else if (line === "END:VALARM") inAlarm = false;
      else if (cur && !inAlarm) {
        var i = line.indexOf(":"); if (i < 0) return;
        var head = line.slice(0, i), val = line.slice(i + 1), name = head.split(";")[0], params = head.slice(name.length);
        if (name === "DTSTART") cur.start = icsTime(val, params);
        else if (name === "DTEND") cur.end = icsTime(val, params);
        else if (name === "DURATION") cur.dur = icsDur(val);
        else if (name === "SUMMARY") cur.title = icsText(val);
        else if (name === "LOCATION") cur.loc = icsText(val);
        else if (name === "RRULE") cur.rrule = val;
        else if (name === "EXDATE") val.split(",").forEach(function (v) { var x = icsTime(v, params); if (x) cur.ex.push(x.t); });
        else if (name === "RECURRENCE-ID") cur.rid = icsTime(val, params);
        else if (name === "UID") cur.uid = val;
        else if (name === "STATUS") cur.status = val;
      }
    });
    var moved = {}, from = Date.now() - 86400000, to = Date.now() + 15 * 86400000, out = [];
    evs.forEach(function (e) { if (e.rid) moved[e.uid + "|" + e.rid.t] = 1; });       // single occurrences changed or cancelled
    evs.forEach(function (e) {
      if (!e.start || e.status === "CANCELLED") return;
      var len = e.end ? e.end.t - e.start.t : e.dur || (e.start.allDay ? 86400000 : 3600000);
      occurrences(e.start.t, e.rid ? "" : e.rrule, from - len, to).forEach(function (t) {
        if (e.ex.indexOf(t) >= 0 || (!e.rid && e.rrule && moved[e.uid + "|" + t])) return;
        out.push({ t: t, end: t + len, allDay: !!e.start.allDay, title: e.title || "Busy", loc: e.loc || "", cal: cal.name, color: cal.color });
      });
    });
    return out;
  }
  function holidays(y) {                             // US holidays and well-known days, worked out on the TV
    var nth = function (mo, dw, ord) { return nthDays(y, mo, dw, ord)[0]; };
    return [["New Year's Day", 0, 1], ["Martin Luther King Jr. Day", 0, nth(0, 1, 3)], ["Valentine's Day", 1, 14], ["Presidents' Day", 1, nth(1, 1, 3)],
            ["Mother's Day", 4, nth(4, 0, 2)], ["Memorial Day", 4, nth(4, 1, -1)], ["Father's Day", 5, nth(5, 0, 3)], ["Juneteenth", 5, 19],
            ["Independence Day", 6, 4], ["Labor Day", 8, nth(8, 1, 1)], ["Columbus Day", 9, nth(9, 1, 2)], ["Halloween", 9, 31],
            ["Veterans Day", 10, 11], ["Thanksgiving", 10, nth(10, 4, 4)], ["Christmas Eve", 11, 24], ["Christmas Day", 11, 25], ["New Year's Eve", 11, 31]]
      .map(function (h) { return { t: new Date(y, h[1], h[2]).getTime(), end: new Date(y, h[1], h[2] + 1).getTime(), allDay: true, title: h[0], cal: "Holidays", color: "#8e8e93" }; });
  }
  function localEvents() {                           // events typed in on the TV
    var from = Date.now() - 86400000, to = Date.now() + 15 * 86400000, out = [];
    myEvents().forEach(function (e) {
      var rule = { week: "FREQ=WEEKLY", year: "FREQ=YEARLY", day: "FREQ=DAILY" }[e.repeat] || "";
      occurrences(e.t, rule, from, to).forEach(function (t) {
        var d = new Date(t);                       // all day ends at the next midnight (a DST day isn't 24 h)
        out.push({ t: t, end: e.allDay ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() : t + 3600000, allDay: e.allDay, title: e.title, cal: "On this TV", color: "#64d2ff" });
      });
    });
    return out;
  }
  function getCal(url) {
    url = url.replace(/^webcal:\/\//i, "https://");
    if (app && app.fetchCalendar) return new Promise(function (res, rej) { var id = "f" + (++fetchSeq); pendingFetch[id] = [res, rej]; app.fetchCalendar(id, url); });
    if (location.hostname === "localhost") return fetch("/proxy?u=" + encodeURIComponent(url)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); });
    return Promise.reject(new Error("calendars load on the TV"));
  }
  function calRebuild(remote) {
    var y = new Date().getFullYear(), from = Date.now() - 86400000, to = Date.now() + 15 * 86400000;
    var mine = myEvents(), kept = mine.filter(function (e) { return e.repeat !== "none" || e.t > from; });   // one-offs that are over go
    if (kept.length !== mine.length) save("myevents", kept);
    var hol = PREFS.calHolidays === "off" ? [] : holidays(y).concat(holidays(y + 1)).filter(function (e) { return e.end > from && e.t < to; });
    var seen = {};                                   // the same all-day event from two calendars (holidays) shows once
    EVENTS = (remote || []).concat(hol, localEvents()).sort(function (a, b) { return a.t - b.t; }).filter(function (e) {
      if (!e.allDay) return true;
      var k = new Date(e.t).toDateString() + "|" + e.title.toLowerCase().replace(/[^a-z]/g, "").replace(/observed$/, "");
      if (seen[k]) return false; seen[k] = 1; return true;
    });
    weekKey = ""; calKey = ""; renderWeekPanel(); renderNextUp();
    if (ambient) renderCal();
  }
  var calRemote = (load("calcache") || {}).remote || [], calSeq = 0;
  // Only the newest load counts, and it's applied to the calendars as they are now, so a slow refresh can't undo a
  // calendar added or removed meanwhile. A calendar that fails keeps its last events.
  function loadCalendars() {
    var seq = ++calSeq, cals = calList();
    Promise.all(cals.map(function (c) {
      return getCal(c.url).then(function (t) { return { id: c.id, ok: true, ev: parseIcs(t, c) }; },
                                function () { return { id: c.id, ok: false, ev: calRemote.filter(function (e) { return e.cal === c.name; }) }; });
    })).then(function (res) {
      if (seq !== calSeq) return;
      var now = calList(), byId = {}, changed = false;
      res.forEach(function (r) { byId[r.id] = r; });
      now.forEach(function (c) { var r = byId[c.id]; if (r && c.ok !== r.ok) { c.ok = r.ok; changed = true; } });
      if (changed) save("calendars", now);
      calRemote = [].concat.apply([], now.map(function (c) { return byId[c.id] ? byId[c.id].ev : calRemote.filter(function (e) { return e.cal === c.name; }); }));
      save("calcache", { t: Date.now(), remote: calRemote });
      calRebuild(calRemote);
      if (custOpen && custMode === "cal") renderCustom();
    });
    every("cal", loadCalendars, 30 * 60000);
  }
  function eventsOn(day) {                           // events touching a local day (Date at any time that day)
    var a = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(), b = a + 86400000;
    return EVENTS.filter(function (e) { return e.t < b && e.end > a; });
  }
  function evWhen(e, withDay) {
    var d = new Date(e.t), today = new Date(), tm = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    var day = d.toDateString() === today.toDateString() ? T("Today") : d.toDateString() === tm.toDateString() ? T("Tomorrow") : dayText(e.t, { weekday: "short" });
    return (withDay ? day + " · " : "") + (e.allDay ? T("All day") : hm(e.t));
  }
  // The next thing coming up: in the clock panel ("Next · Dentist · Tue 3:00 PM") and the screensaver's Up next.
  function renderNextUp() {
    var now = Date.now(), soon = EVENTS.filter(function (e) { return e.end > now && e.t < now + 7 * 86400000; });
    var next = soon.filter(function (e) { return !e.allDay; })[0] || soon[0], el = document.getElementById("wNext");
    el.textContent = "";
    el.classList.toggle("on", !!next && PREFS.homeNext !== "hide");
    if (next) {
      var dot = document.createElement("i"), txt = document.createElement("span"), isToday = new Date(next.t).toDateString() === new Date().toDateString();
      dot.style.background = next.color; el.appendChild(dot);
      txt.textContent = (next.t <= now ? T("Now") : evWhen(next, !isToday)) + " · " + next.title;   // today's: just the time
      el.appendChild(txt);
    }
    var box = document.getElementById("mAgenda");
    box.textContent = "";
    if (!soon.length) return;
    var h = document.createElement("div"); h.className = "mh"; h.textContent = T("Up next"); box.appendChild(h);
    soon.slice(0, 4).forEach(function (e) {
      var row = document.createElement("div"), dot = document.createElement("i"), when = document.createElement("span"), what = document.createElement("span");
      row.className = "ag"; dot.style.background = e.color; when.className = "w"; what.className = "t";
      when.textContent = e.t <= now && !e.allDay ? T("Now") : evWhen(e, true); what.textContent = e.title;
      row.appendChild(dot); row.appendChild(when); row.appendChild(what); box.appendChild(row);
    });
  }
  window.guestCalAdd = function (name, url) {
    var cals = calList();
    if (cals.some(function (c) { return c.url === url; })) { toast(name + " is already on this TV"); return; }
    cals.push({ id: "c" + Date.now().toString(36), name: name, url: url, color: CAL_COLORS[cals.length % CAL_COLORS.length] });
    save("calendars", cals);
    toast("Added " + name + " · loading its events…");
    if (app && app.calPhoneStop) app.calPhoneStop();
    CALPHONE = null;
    if (custOpen && custMode === "calphone") { custMode = "cal"; custRow = 0; renderCustom(); }
    loadCalendars();
  };
  window.guestCalEnded = function () { if (custOpen && custMode === "calphone") { CALPHONE = null; custMode = "cal"; custRow = 0; renderCustom(); toast("Phone link closed"); } };

  // ---- Screensaver news and markets (Settings > Screensaver, smart mirror style) ------------------------------
  // Local news: Google News' local section for this TV's location (the same place the weather uses). National news:
  // the publisher's own feed (NPR or BBC). Crypto: Coinbase's public market data (change over 24 hours). Stocks and
  // funds: Nasdaq's quote service (S&P 500 and the Dow through the SPY and DIA funds, labelled so). Fetched only while
  // the screensaver is up: markets every 5 minutes, news every 15. Text is inserted as text, never markup.
  var CRYPTO = [["BTC", "Bitcoin"], ["ETH", "Ethereum"], ["SOL", "Solana"], ["XRP", "XRP"], ["DOGE", "Dogecoin"], ["ADA", "Cardano"], ["LTC", "Litecoin"]];
  var STOCKS = [["SPY:etf", "S&P 500 (SPY)"], ["DIA:etf", "Dow (DIA)"], ["COMP:index", "Nasdaq"], ["NDX:index", "Nasdaq-100"],
                ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "Nvidia"], ["AMZN", "Amazon"], ["GOOGL", "Alphabet"], ["TSLA", "Tesla"], ["META", "Meta"]];
  // News sources by topic (Settings > Screensaver > News sources). Official sources are the agencies' own feeds;
  // the rest are long-standing newsrooms. Each can be switched on or off, or a whole topic at once.
  var NEWS_TOPICS = [["local", "Local", "Local"], ["national", "National", "National"], ["world", "World", "World"], ["gov", "Government (official)", "Official"],
                     ["cyber", "Cybersecurity", "Cyber"], ["tech", "Technology", "Tech"], ["science", "Space & science", "Space"]];
  var NEWS_SRC = [
    ["local", "local", "Local news for this TV's location (Google News)", ""],
    ["npr", "national", "NPR", "https://feeds.npr.org/1003/rss.xml"],
    ["pbs", "national", "PBS NewsHour", "https://www.pbs.org/newshour/feeds/rss/nation"],
    ["bbc", "national", "BBC News (US)", "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml"],
    ["bbcworld", "world", "BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"],
    ["nprworld", "world", "NPR World", "https://feeds.npr.org/1004/rss.xml"],
    ["pbsworld", "world", "PBS NewsHour World", "https://www.pbs.org/newshour/feeds/rss/world"],
    ["wh", "gov", "The White House", "https://www.whitehouse.gov/news/feed/"],
    ["war", "gov", "Department of War", "https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10"],
    ["fbi", "gov", "FBI", "https://www.fbi.gov/feeds/national-press-releases/rss.xml"],
    ["doj", "gov", "Justice Department", "https://www.justice.gov/news/rss?m=1"],
    ["cisa", "cyber", "CISA (official)", "https://www.cisa.gov/news.xml"],
    ["cisaadv", "cyber", "CISA advisories (official)", "https://www.cisa.gov/cybersecurity-advisories/all.xml"],
    ["kev", "cyber", "Exploited CVEs, CISA (official)", "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"],
    ["hibp", "cyber", "Have I Been Pwned (data breaches)", "https://feeds.feedburner.com/HaveIBeenPwnedLatestBreaches"],
    ["krebs", "cyber", "Krebs on Security", "https://krebsonsecurity.com/feed/"],
    ["bleeping", "cyber", "BleepingComputer", "https://www.bleepingcomputer.com/feed/"],
    ["thn", "cyber", "The Hacker News", "https://feeds.feedburner.com/TheHackersNews"],
    ["record", "cyber", "The Record", "https://therecord.media/feed"],
    ["secweek", "cyber", "SecurityWeek", "https://www.securityweek.com/feed/"],
    ["ars", "tech", "Ars Technica", "https://feeds.arstechnica.com/arstechnica/index"],
    ["verge", "tech", "The Verge", "https://www.theverge.com/rss/index.xml"],
    ["wired", "tech", "Wired", "https://www.wired.com/feed/rss"],
    ["nasa", "science", "NASA", "https://www.nasa.gov/news-release/feed/"]
  ];
  var NEWS_HOSTS = NEWS_SRC.map(function (s) { return (s[3].match(/^https:\/\/([^\/]+)\//) || [])[1]; }).filter(Boolean).concat(["news.google.com"]);
  var NEWS_DEFAULT = ["local", "npr", "bbcworld", "wh", "war", "fbi", "cisa", "kev", "hibp", "krebs", "bleeping", "ars", "verge"];
  function newsOn() {
    if (Array.isArray(PREFS.newsSrc) && !PREFS.newsSrc262) {   // exploited CVEs and data breaches came later: on for everyone once
      PREFS.newsSrc = PREFS.newsSrc.concat(["kev", "hibp"].filter(function (k) { return PREFS.newsSrc.indexOf(k) < 0; }));
      PREFS.newsSrc262 = 1;
    }
    return Array.isArray(PREFS.newsSrc) ? PREFS.newsSrc : NEWS_DEFAULT;
  }
  var MARKETS = [], NEWS = [], mktAt = 0, newsAt = 0, newsIdx = 0, mktPage = 0, feedTimer = 0;
  function symName(s) {
    var known = STOCKS.concat(CRYPTO).filter(function (x) { return x[0] === s; })[0];
    return known ? known[1] : s.split(":")[0];
  }
  function money(v) {
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: v < 1 ? 4 : 2, maximumFractionDigits: v < 1 ? 4 : 2 });
  }
  function loadMarkets() {
    mktAt = Date.now();                              // counted from the start, so a slow answer can't start another load
    var jobs = (PREFS.crypto || []).map(function (c) {
      return getJson("https://api.exchange.coinbase.com/products/" + c + "-USD/stats").then(function (j) {
        var last = +j.last, open = +j.open;
        return { name: symName(c), price: money(last), pct: open ? (last - open) / open * 100 : 0, note: "24h" };
      });
    }).concat((PREFS.stocks || []).map(function (s) {
      var p = s.split(":"), sym = p[0], cls = p[1] || "stocks";
      return getJson("https://api.nasdaq.com/api/quote/" + encodeURIComponent(sym) + "/info?assetclass=" + cls).then(function (j) {
        var d = j && j.data && j.data.primaryData;
        if (!d || !d.lastSalePrice) throw new Error("no quote");
        var status = (j.data.marketStatus || "").toLowerCase();
        var px = parseFloat(String(d.lastSalePrice).replace(/[$,]/g, "")) || 0;
        return { name: symName(s), price: cls === "index" ? px.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : money(px), stock: true,
                 pct: parseFloat(String(d.percentageChange).replace(/[+%,]/g, "")) || 0,
                 note: /after|pre/.test(status) ? (/pre/.test(status) ? "pre-market" : "after hours") : /closed/.test(status) ? "closed" : "" };
      });
    }));
    return Promise.all(jobs.map(function (p) { return p.then(function (x) { return x; }, function () { return null; }); }))
      .then(function (list) { MARKETS = list.filter(Boolean); renderMarkets(); });
  }
  // RSS (<item>) and Atom (<entry>) feeds alike: title, source and time.
  function rssItems(xml, max) {
    var doc = new DOMParser().parseFromString(xml, "text/xml"), out = [];
    var items = doc.querySelectorAll("item");
    if (!items.length) items = doc.getElementsByTagName("entry");
    [].slice.call(items, 0, max).forEach(function (it) {
      var get = function (n) { var e = it.getElementsByTagName(n)[0]; return e ? e.textContent.trim() : ""; };
      var title = get("title").replace(/\s+/g, " "), src = get("source");
      if (src && title.slice(-(src.length + 3)) === " - " + src) title = title.slice(0, -(src.length + 3));   // Google adds " - Source"
      var t = Date.parse(get("pubDate") || get("published") || get("updated") || get("dc:date")) || 0;
      if (title) out.push({ title: title, src: src, t: t });
    });
    return out;
  }
  // CISA's Known Exploited Vulnerabilities: CVEs attackers are using now (the app passes on only the newest ten).
  // "CVE-2026-1234 · Fortinet FortiOS: Out-of-Bounds Write". A catalogue date has no time, so it counts from noon.
  function kevItems(text, max) {
    var v = (JSON.parse(text).vulnerabilities || []).slice().sort(function (a, b) { return a.dateAdded < b.dateAdded ? 1 : -1; });
    return v.slice(0, max).map(function (k) {
      var name = String(k.vulnerabilityName || ((k.vendorProject || "") + " " + (k.product || ""))).replace(/\s+Vulnerability$/i, "");
      return { title: k.cveID + " · " + name, t: Date.parse(k.dateAdded + "T12:00:00") || 0 };
    });
  }
  // Each chosen source gives its newest few stories; topics take turns so no single feed fills the screen. Newsrooms
  // count as fresh for two days, official sources (which post less often) for a week.
  function loadNews() {
    newsAt = Date.now();                             // same: one load at a time
    var on = newsOn(), jobs = [];
    NEWS_SRC.forEach(function (s) {
      if (on.indexOf(s[0]) < 0) return;
      var tag = (NEWS_TOPICS.filter(function (t) { return t[0] === s[1]; })[0] || [])[2] || "";
      var url = s[0] === "local" ? (LOC && LOC.name ? "https://news.google.com/rss/headlines/section/geo/" + encodeURIComponent(LOC.name) + "?hl=en-US&gl=US&ceid=US:en" : "") : s[3];
      if (!url) return;
      jobs.push(getText(url).then(function (x) {
        if (s[0] === "kev") return kevItems(x, 4).map(function (n) { n.src = "CISA · actively exploited"; n.tag = tag; n.topic = s[1]; n.week = true; return n; });
        if (s[0] === "hibp") return rssItems(x, 3).map(function (n) {   // "Harvard - 850,537 breached accounts"
          n.title = "Data breach: " + n.title.replace(/ - ([\d,]+) breached accounts$/, " · $1 accounts");
          n.src = "Have I Been Pwned"; n.tag = tag; n.topic = s[1]; n.week = true; return n;
        });
        return rssItems(x, 4).map(function (n) { n.src = s[0] === "local" ? n.src || "Local" : s[2].replace(/ \(official\)$/, ""); n.tag = tag; n.topic = s[1]; return n; });
      }));
    });
    return Promise.all(jobs.map(function (p) { return p.catch(function () { return []; }); })).then(function (lists) {
      var now = Date.now(), byTopic = {};
      lists.forEach(function (l) {
        l.filter(function (n) { return !n.t || n.t > now - (n.topic === "gov" || n.topic === "science" || n.week ? 7 : 2) * 86400000; })
         .forEach(function (n) { (byTopic[n.topic] = byTopic[n.topic] || []).push(n); });
      });
      var topics = Object.keys(byTopic), mixed = [];
      topics.forEach(function (k) { byTopic[k].sort(function (a, b) { return b.t - a.t; }); });
      for (var i = 0; i < 12; i++) topics.forEach(function (k) { if (byTopic[k][i]) mixed.push(byTopic[k][i]); });
      NEWS = mixed; newsIdx = 0; renderNews(true);
    });
  }
  function ago(t) {
    if (!t) return "";
    var m = Math.max(1, Math.round((Date.now() - t) / 60000));
    return m < 60 ? m + " min ago" : Math.round(m / 60) + " hr ago";
  }
  function renderNews(now) {
    var box = document.getElementById("mNews"), n = NEWS[newsIdx % Math.max(1, NEWS.length)];
    box.classList.toggle("on", PREFS.ssNews !== "off" && !!n);
    if (!n) return;
    function put() {
      box.querySelector(".src").textContent = (n.tag ? T(n.tag) + " · " : "") + n.src + (n.t ? " · " + ago(n.t) : "");
      box.querySelector(".hd").textContent = n.title;
      box.classList.remove("swap");
      fitSaverSoon();                                // a longer headline can take another line
    }
    if (now) put(); else { box.classList.add("swap"); setTimeout(put, 700); }
  }
  function renderMarkets() {
    var box = document.getElementById("mMkt"), on = MARKETS.length > 0;
    box.classList.toggle("on", on);
    fitSaverSoon();                                  // a markets list appearing changes its corner's height
    if (!on) return;
    var pages = Math.ceil(MARKETS.length / 5), page = MARKETS.slice((mktPage % pages) * 5, (mktPage % pages) * 5 + 5);
    box.innerHTML = '<div class="mh"></div>' + page.map(function () {
      return '<div class="mr"><span class="nm"></span><span class="pr"></span><span class="ch"></span></div>';
    }).join("");
    // Notes once in the heading, not on every row: crypto changes are over 24 hours; stocks may be after hours or closed.
    var stockNote = (MARKETS.filter(function (m) { return m.stock && m.note; })[0] || {}).note, notes = [];
    if (MARKETS.some(function (m) { return !m.stock; })) notes.push(T("crypto 24h"));
    if (stockNote) notes.push(T("stocks " + stockNote));
    box.querySelector(".mh").textContent = T("Markets") + (notes.length ? "  ·  " + notes.join(" · ") : "") + (pages > 1 ? "   " + (mktPage % pages + 1) + "/" + pages : "");
    [].forEach.call(box.querySelectorAll(".mr"), function (r, i) {
      var m = page[i];
      r.querySelector(".nm").textContent = m.name;
      r.querySelector(".pr").textContent = m.price;
      var ch = r.querySelector(".ch");
      ch.textContent = (m.pct >= 0 ? "▲ " : "▼ ") + Math.abs(m.pct).toFixed(2) + "%";
      ch.className = "ch " + (m.pct >= 0 ? "up" : "down");
    });
  }
  // Started and stopped with the screensaver. Every 20 s the next headline (and the next page of markets) fades in.
  function feedsStart() {
    clearInterval(feedTimer);
    if (PREFS.ssStyle === "photo") return;
    var wantMkt = (PREFS.crypto || []).length + (PREFS.stocks || []).length > 0;
    if (!wantMkt) { MARKETS = []; renderMarkets(); }
    if (wantMkt && Date.now() - mktAt > 5 * 60000) loadMarkets(); else renderMarkets();
    if (PREFS.ssNews === "off") { NEWS = []; renderNews(true); }
    else if (Date.now() - newsAt > 15 * 60000) loadNews(); else renderNews(true);
    feedTimer = setInterval(function () {
      if (wantMkt && Date.now() - mktAt > 5 * 60000) loadMarkets();
      if (PREFS.ssNews !== "off" && Date.now() - newsAt > 15 * 60000) loadNews();
      if (NEWS.length > 1) { newsIdx++; renderNews(false); }
      if (MARKETS.length > 5) { mktPage++; renderMarkets(); }
    }, 20000);
  }
  function feedsStop() { clearInterval(feedTimer); }

  // ---- Screensaver layout (Settings > Screensaver > Layout) ------------------------------------------------------
  // Each module goes in a zone (top left / top right / bottom left / bottom right / centre) or is off; within a zone they
  // stack in PREFS.ssOrder. The built-in layouts are starting points; changing anything makes it "Custom".
  var MODULES = [["clock", "Clock & date"], ["weather", "Weather now"], ["outdoor", "Walk or run"], ["teams", "Your teams"],
                 ["music", "Now playing"], ["week", "Week ahead"], ["markets", "Markets"], ["news", "News"], ["agenda", "Up next (calendar)"], ["beach", "Beach conditions"], ["greeting", "Greeting"]];
  var PLACES = [["tl", "Top left"], ["tr", "Top right"], ["bl", "Bottom left"], ["br", "Bottom right"], ["c", "Centre"], ["off", "Off"]];
  var LAYOUTS = [
    ["mirror", "Smart mirror", { clock: "tl", weather: "tl", outdoor: "tl", teams: "tl", music: "tl", week: "tr", markets: "tr", news: "br", agenda: "bl", beach: "bl", greeting: "c" }],
    ["minimal", "Minimal", { clock: "bl", weather: "bl", outdoor: "off", teams: "off", music: "bl", week: "off", markets: "off", news: "off", agenda: "off", beach: "off", greeting: "off" }],
    ["sports", "Sports fan", { clock: "tl", weather: "tl", outdoor: "off", teams: "tr", music: "bl", week: "off", markets: "off", news: "br", agenda: "off", beach: "off", greeting: "off" }],
    ["markets", "Market watcher", { clock: "tl", weather: "tl", outdoor: "off", teams: "off", music: "off", week: "bl", markets: "tr", news: "br", agenda: "off", beach: "off", greeting: "off" }],
    ["outdoors", "Beach day", { clock: "tl", weather: "tl", outdoor: "tl", teams: "off", music: "off", week: "tr", markets: "off", news: "off", agenda: "off", beach: "bl", greeting: "c" }],
    ["family", "Family planner", { clock: "tl", weather: "tl", outdoor: "off", teams: "off", music: "off", week: "tr", markets: "off", news: "off", agenda: "bl", beach: "off", greeting: "c" }]
  ];
  var MOD_ORDER = MODULES.map(function (m) { return m[0]; });
  function placeOf(id) { var p = PREFS.ssPlace || {}; return p[id] || LAYOUTS[0][2][id]; }
  function orderOf() {
    var o = (PREFS.ssOrder || []).filter(function (id) { return MOD_ORDER.indexOf(id) >= 0; });
    return o.concat(MOD_ORDER.filter(function (id) { return o.indexOf(id) < 0; }));
  }
  function layoutName() {
    var hit = LAYOUTS.filter(function (l) { return MOD_ORDER.every(function (id) { return placeOf(id) === l[2][id]; }); })[0];
    return hit ? hit[1] : "Custom";
  }
  function useLayout(i) {
    var l = LAYOUTS[(i + LAYOUTS.length) % LAYOUTS.length];
    PREFS.ssPlace = JSON.parse(JSON.stringify(l[2])); PREFS.ssOrder = MOD_ORDER.slice();
    applyPrefs("ssPlace");
  }
  function applyLayout() {
    var mirror = PREFS.ssStyle !== "photo", zone = { tl: "zTL", tr: "zTR", bl: "zBL", br: "zBR", c: "zC" };
    var mod = function (id) { return document.querySelector('.mod[data-m="' + id + '"]'); };
    orderOf().forEach(function (id) {
      var el = mod(id), pl = placeOf(id);
      if (!el) return;
      el.classList.toggle("off", pl === "off");
      if (mirror && pl !== "off") document.getElementById(zone[pl]).appendChild(el);
      var t = modTune(id);                   // the item's own size and nudge (smart mirror only)
      el.style.zoom = mirror && t.size !== 1 ? t.size : "";
      el.style.transform = mirror && (t.dx || t.dy) ? "translate(" + t.dx + "px," + t.dy + "px)" : "";
    });
    if (!mirror) {                       // "Over the photo": every module back in its original spot and order
      ["clock", "weather", "outdoor", "music", "teams", "agenda"].forEach(function (id) { document.getElementById("mLeft").appendChild(mod(id)); });
      ["week", "markets"].forEach(function (id) { document.getElementById("mRight").appendChild(mod(id)); });
      var frame = document.getElementById("frame"), first = document.getElementById("zTL");
      ["greeting", "news", "beach"].forEach(function (id) { frame.insertBefore(mod(id), first); });
    }
    document.body.classList.toggle("ss-large", PREFS.ssSize === "large");
    fitSaverSoon();
  }
  // Screensaver auto-fit (smart mirror): the corners keep a 30 px gap from each other and the screen edge. A corner that
  // would meet the one above or below it (or run off the screen) shrinks a step at a time, down to 70 %, the fuller
  // one first. Re-run when the layout, the markets or the week change.
  var saverFitTimer = 0;
  function fitSaverSoon() { clearTimeout(saverFitTimer); saverFitTimer = setTimeout(fitSaver, 80); }
  function fitSaver() {
    if (PREFS.ssStyle === "photo" || !document.body.classList.contains("ambient") || document.hidden) return;   // fitted when it shows
    var z = {}, el = {};
    ["zTL", "zTR", "zBL", "zBR", "zC"].forEach(function (id) { el[id] = document.getElementById(id); z[id] = 1; el[id].style.zoom = ""; });
    function box(id) { return el[id].offsetHeight ? onStage(el[id]) : null; }
    function shrink(id) { if (z[id] <= 0.7) return false; z[id] = Math.round((z[id] - 0.05) * 100) / 100; el[id].style.zoom = z[id]; return true; }
    for (var pass = 0; pass < 12; pass++) {
      var moved = false;
      [["zTL", "zBL"], ["zTR", "zBR"]].forEach(function (p) {
        var a = box(p[0]), b = box(p[1]);
        if (a && b && a.b > b.t - 30) moved = shrink(a.h >= b.h ? p[0] : p[1]) || shrink(a.h >= b.h ? p[1] : p[0]) || moved;
        else if (a && !b && a.b > 1040) moved = shrink(p[0]) || moved;
        else if (b && !a && b.t < 40) moved = shrink(p[1]) || moved;
      });
      var c = box("zC");
      if (c) ["zTL", "zTR", "zBL", "zBR"].forEach(function (id) {                 // the centre greeting gives way first
        var k = box(id);
        if (k && k.r > c.l && k.l < c.r && k.b > c.t && k.t < c.b) moved = shrink("zC") || moved;
      });
      if (!moved) break;
    }
  }
  // The beach module is a copy of the home screen's beach row, refreshed while the screensaver is up.
  function copyBeach() { var b = document.getElementById("beach"), m = document.getElementById("mBeach"); if (b && m) m.innerHTML = b.innerHTML; }

  function saverClasses() {
    document.body.classList.toggle("ss-mirror", PREFS.ssStyle !== "photo");
    document.body.classList.toggle("no-clock", PREFS.homeClock === "hide");
    document.body.classList.toggle("clock-left", PREFS.homeClock === "left");
    // The beach & scores row takes the other side when the clock panel is on its side.
    var infoRight = PREFS.homeInfo === "right";
    if (PREFS.homeClock !== "hide" && infoRight === (PREFS.homeClock !== "left")) infoRight = !infoRight;
    document.body.classList.toggle("info-right", infoRight);
    document.body.classList.toggle("no-hero", PREFS.homeHero === "hide");
    document.body.classList.toggle("bar-icons", PREFS.homeBar === "icons");
    document.body.classList.toggle("edge-wide", PREFS.edges === "wide");
    document.body.classList.toggle("no-air", PREFS.homeAir === "hide");
    if (typeof fitBar === "function") fitBar();                                  // panel sizes: fitHome (below)
    document.body.classList.toggle("no-hint", PREFS.homeHint === "hide");
    document.body.classList.toggle("ss-noscores", placeOf("teams") === "off");    // also hides the top scores row on the screensaver
    applyLayout();
    fitSoon();
  }
  // Auto-fit: whatever the layout and sizes, nothing on the home screen overlaps. Measured on screen (getBoundingClientRect
  // includes zoom; offsets don't): the clock panel shrinks a step at a time until it clears the tiles, the beach & scores
  // row until it clears the clock and the app name, and the app name narrows (or moves past a left-hand clock to a tile
  // edge). FIT.shrunk lists what had to give, for Settings to mention.
  var FIT = { shrunk: [] }, fitTimer = 0;
  function fitSoon() { clearTimeout(fitTimer); fitTimer = setTimeout(fitHome, 60); }
  function onStage(el) {
    var s = document.getElementById("stage").getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / 1920 || 1;
    return { l: (r.left - s.left) / k, t: (r.top - s.top) / k, r: (r.right - s.left) / k, b: (r.bottom - s.top) / k, h: r.height / k };
  }
  function fitHome() {
    if (ambient || document.body.classList.contains("laying")) return;   // the screensaver moves things; fit the home screen only
    if (!homeVisible) { fitLater = true; return; }                       // nobody sees it: fit once it's back
    var clock = document.querySelector("#ui .clock"), tiles = document.getElementById("tiles"), hero = document.querySelector(".hero");
    var rows = [].filter.call(document.querySelectorAll(".toprow"), function (e) { return e.offsetHeight > 0; });
    var GAP = 30, wantC = +PREFS.homeClockSize || 1, wantI = +PREFS.homeInfoSize || 1, z = wantC, iz = wantI;
    FIT.shrunk = [];
    hero.style.left = ""; hero.style.width = "";
    var clockOn = PREFS.homeClock !== "hide" && clock.offsetHeight > 0, cb = null;
    if (clockOn) {
      var shelfBox = document.getElementById("shelf"), tTop = shelfBox && shelfBox.offsetHeight && document.body.classList.contains("kw-any") ? onStage(shelfBox).t : onStage(tiles).t;
      // A weather alert sits just under the clock panel, so the two shrink together to stay clear of the tiles.
      var alertEl = document.getElementById("alert"), alertH = alertEl.classList.contains("on") ? onStage(alertEl).h + 16 : 0;
      clock.style.zoom = z !== 1 ? z : "";
      while (z > 0.8 && onStage(clock).b + alertH > tTop - GAP) { z = Math.round((z - 0.05) * 100) / 100; clock.style.zoom = z; }
      if (z < wantC) FIT.shrunk.push("clock");
      cb = onStage(clock);
      if (alertH) {
        var fb = onStage(document.getElementById("frame"));
        alertEl.style.top = Math.round(cb.b + 16 - fb.t) + "px";
        alertEl.style.right = Math.round(fb.r - cb.r) + "px"; alertEl.style.left = "auto";
        cb = { l: Math.min(cb.l, onStage(alertEl).l), t: cb.t, r: cb.r, b: cb.b + alertH, h: cb.h + alertH };   // the hero keeps clear of both
      }
      var hb = onStage(hero), toUi = hb.l - hero.offsetLeft;               // stage x → the hero's own coordinates
      if (PREFS.homeClock === "left") {
        var edges = [].map.call(document.querySelectorAll("#grid .tile"), function (t) { return onStage(t).l; })
          .filter(function (x) { return x >= cb.r + 60; });
        var at = edges.length ? Math.min.apply(null, edges) : cb.r + 90;
        hero.style.left = (at - toUi) + "px"; hero.style.width = Math.min(1150, 1800 - at) + "px";
      } else if (hb.b > cb.t) hero.style.width = Math.max(600, Math.min(1150, cb.l - hb.l - 70)) + "px";
    } else { clock.style.zoom = ""; document.getElementById("alert").style.top = ""; document.getElementById("alert").style.right = ""; document.getElementById("alert").style.left = ""; }
    // The beach & scores row: clear of the clock panel beside it and of the app name below it.
    function rowsBad() {
      return rows.some(function (e) {
        var b = onStage(e);
        if (cb && b.t < cb.b && b.r > cb.l - GAP && b.l < cb.r + GAP) return true;
        return PREFS.homeHero !== "hide" && b.b > onStage(hero).t - 20;
      });
    }
    rows.forEach(function (e) { e.style.zoom = iz !== 1 ? iz : ""; });
    while (iz > 0.8 && rowsBad()) { iz = Math.round((iz - 0.05) * 100) / 100; rows.forEach(function (e) { e.style.zoom = iz; }); }
    if (iz < wantI) FIT.shrunk.push("info");
    var said = FIT.shrunk.join() + wantC + wantI;                        // say so once per change, while customizing
    if (custOpen && FIT.shrunk.length && said !== FIT.said)
      toast(FIT.shrunk.indexOf("clock") >= 0 ? "Clock panel: as large as fits above the apps" : "Beach & scores: as large as fits");
    FIT.said = said;
  }
  window.addEventListener("resize", fitSoon);
  // The clock panel grows when the forecast, air quality or calendar lines arrive: fit again then (and the alert under it moves too).
  if (window.ResizeObserver) { var lastClockH = 0; new ResizeObserver(function () { var h = document.querySelector("#ui .clock").offsetHeight; if (Math.abs(h - lastClockH) > 4) { lastClockH = h; fitSoon(); } }).observe(document.querySelector("#ui .clock")); }
  // Week calendar on the screensaver: today and the next six days, each with the forecast's icon and high / low when
  // "With weather" is chosen (the same 7-day forecast as the weather glass, kept for an hour). Without a forecast the
  // days still show. Redrawn when the screensaver starts and on the hour while it's up (renderClock).
  var calKey = "";
  function renderCal() {
    var h = new Date().getHours();
    fitSaverSoon();
    copyBeach();
    document.getElementById("mGreet").textContent = T(h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Good night");
    var box = document.getElementById("mCal"), mode = PREFS.ssCal;
    box.classList.toggle("on", mode !== "off");
    if (mode === "off") { calKey = ""; return; }
    var now = new Date(), key = mode + now.toDateString() + now.getHours() + units() + PREFS.lang;
    if (key === calKey) return;
    calKey = key;
    function draw(fc) {
      var byDay = {};
      (fc || []).forEach(function (d) { byDay[new Date(d.t).toDateString()] = d; });
      var html = "";
      for (var i = 0; i < 7; i++) {
        var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12), w = byDay[day.toDateString()];
        var evs = eventsOn(day);
        html += '<div class="cd' + (i ? "" : " today") + '"><div class="dn">' + (i ? dayText(day.getTime(), { weekday: "short" }) : T("Today")) +
          (evs.length ? '<i class="evd" style="background:' + safeColor(evs[0].color) + '"></i>' : "") + '</div><div class="dd">' + dayText(day.getTime(), { day: "numeric" }) + "</div>";
        if (mode === "wx" && w) {
          html += nwsLook(w.text, w.day)[0] + '<div class="hl">' + (w.hi != null ? Math.round(w.hi) + "°" : "") +
            (w.lo != null ? "<small>" + Math.round(w.lo) + "°</small>" : "") + "</div>";
        }
        html += "</div>";
      }
      box.innerHTML = html;
    }
    if (mode === "wx") weekly().then(draw, function () { draw(null); calKey = ""; });
    else draw(null);
  }
