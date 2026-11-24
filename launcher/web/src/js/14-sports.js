  // ---- Sports scores (Settings > Sports scores, Leagues, Favorite teams) ---------------------------------
  // Sources: the leagues' own official feeds where they exist (MLB Stats API, NHL API); ESPN's public scoreboard, a
  // league broadcast partner, for NFL, NBA, college and soccer (labelled as ESPN in Settings > Leagues). Today's games
  // come from each scoreboard; your teams' next games from their schedules (looked up every 30 min). Your teams first:
  // live, then upcoming (7 days), then finals from the last 20 h; "My teams + live games" adds other live games. Up to
  // three, in a row under the beach conditions (or at the top when those are off). Notices when your team's game
  // starts and ends. Refresh: 1 min while anything is live, else 10 min.
  // A to Z. UFC is an event (fight card), not teams: its cards show whenever it's on; numbered events are PPV.
  var LEAGUES = [
    { id: "cbb", name: "College Basketball", short: "NCAAB", src: "espn", path: "basketball/mens-college-basketball", q: "?groups=50" },
    { id: "cfb", name: "College Football", short: "NCAAF", src: "espn", path: "football/college-football", q: "?groups=80" },
    { id: "mlb", name: "MLB", src: "mlb" },
    { id: "mls", name: "MLS", src: "espn", path: "soccer/usa.1" },
    { id: "nba", name: "NBA", src: "espn", path: "basketball/nba" },
    { id: "nfl", name: "NFL", src: "espn", path: "football/nfl" },
    { id: "nhl", name: "NHL", src: "nhl" },
    { id: "epl", name: "Premier League", short: "EPL", src: "espn", path: "soccer/eng.1" },
    { id: "ufc", name: "UFC (incl. PPV)", short: "UFC", src: "espn", path: "mma/ufc", event: true }
  ];
  var SRC_NAME = { espn: "ESPN", mlb: "MLB official", nhl: "NHL official" };
  var TEAMS = {}, GAMES = [], gameState = {}, scoresTimer = 0, scoresFirst = true, favNext = {}, favNextAt = 0, favNextKey = "", scoresFailed = false;
  function leagueOf(id) { for (var i = 0; i < LEAGUES.length; i++) if (LEAGUES[i].id === id) return LEAGUES[i]; return null; }
  function isFav(lg, teamId) { return PREFS.teams.indexOf(lg + ":" + teamId) >= 0; }
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  // Team lists for the picker, cached on the TV for 30 days. ESPN's list comes through the app (not page-readable).
  function loadTeams() {
    PREFS.leagues.forEach(function (lg) {
      if (TEAMS[lg] || (leagueOf(lg) || {}).event) return;
      var c = load("teams2:" + lg);                      // "teams2": lists from before 2.16 may use other ids
      if (c && Date.now() - c.t < 30 * 86400000 && c.list.length) { TEAMS[lg] = c.list; return; }
      if (lg === "mlb") {
        fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1").then(function (r) { return r.json(); }).then(function (j) {
          guestTeams(lg, j.teams.map(function (t) { return { id: String(t.id), abbr: t.abbreviation, name: t.name, logo: "https://www.mlbstatic.com/team-logos/" + t.id + ".svg" }; }));
        }).catch(function () { guestTeams(lg, []); });
      } else if (lg === "nhl") {
        getJson("https://api-web.nhle.com/v1/standings/now").then(function (j) {
          guestTeams(lg, j.standings.map(function (t) { return { id: t.teamAbbrev.default, abbr: t.teamAbbrev.default, name: t.teamName.default, logo: t.teamLogo }; }));
        }).catch(function () { guestTeams(lg, []); });
      } else if (app && app.fetchTeams) app.fetchTeams(lg);
      else teamsFromScoreboard(lg);                      // computer preview: teams in the current scoreboard
    });
  }
  window.guestTeams = function (lg, list) {
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    TEAMS[lg] = list;
    if (list.length) save("teams2:" + lg,{ t: Date.now(), list: list });
    if (custOpen) renderCustom();
    renderScores();
  };
  function teamsFromScoreboard(lg) {
    var l = leagueOf(lg);
    fetch("https://site.api.espn.com/apis/site/v2/sports/" + l.path + "/scoreboard" + (l.q || "")).then(function (r) { return r.json(); }).then(function (j) {
      var seen = {}, list = [];
      (j.events || []).forEach(function (e) { e.competitions[0].competitors.forEach(function (c) {
        if (!seen[c.team.id]) { seen[c.team.id] = 1; list.push({ id: c.team.id, abbr: c.team.abbreviation, name: c.team.displayName, logo: c.team.logo }); }
      }); });
      guestTeams(lg, list);
    }).catch(function () { guestTeams(lg, []); });
  }

  function scores() {
    clearTimeout(scoresTimer);
    if (PREFS.sports === "off" || !PREFS.leagues.length) { GAMES = []; renderScores(); scoresTimer = setTimeout(scores, 600000); return; }
    var leagues = PREFS.leagues.map(leagueOf).filter(function (l) { return l; });
    if (PREFS.teams.length) loadTeams();                  // names and logos for the team cards (cached 30 days)
    var favKey = PREFS.leagues.join() + "|" + PREFS.teams.join();     // new teams: look them up now, not in 30 min
    var refreshFav = Date.now() - favNextAt > 30 * 60000 || favKey !== favNextKey;
    favNextKey = favKey;
    Promise.all(leagues.map(function (l) {
      return Promise.all([todaysGames(l).catch(function () { return null; }), refreshFav ? nextGames(l).catch(function () { return []; }) : null]);
    })).then(function (res) {
      if (res.every(function (r) { return r[0] === null; })) {                     // offline: keep old
        console.info("sports: couldn't reach the score sources");
        scoresFailed = true; renderScores();
        scoresTimer = setTimeout(scores, 120000); return;
      }
      scoresFailed = false;
      if (refreshFav) { favNext = {}; favNextAt = Date.now(); res.forEach(function (r) { (r[1] || []).forEach(function (g) { favNext[g.id] = g; }); }); }
      var byId = {};
      Object.keys(favNext).forEach(function (id) { byId[id] = favNext[id]; });
      res.forEach(function (r) { (r[0] || []).forEach(function (g) { byId[g.id] = g; }); });   // today's scoreboard wins (fresher)
      GAMES = Object.keys(byId).map(function (id) { return byId[id]; });
      gameNotices();
      renderScores();
      console.info("sports: " + PREFS.sports + ", leagues " + PREFS.leagues.join("/") + ", teams " + PREFS.teams.length +
        ", games found " + GAMES.length + ", shown " + shownCount());   // appears in the TV's log (tag Offshore)
      var live = GAMES.some(function (g) { return g.state === "in"; });
      scoresTimer = setTimeout(scores, live ? 60000 : 600000);
    });
  }
  function game(l, id, state, detail, date, away, home) {
    away.fav = isFav(l.id, away.id); home.fav = isFav(l.id, home.id);
    return { id: l.id + ":" + id, league: l, state: state, detail: detail, date: date, away: away, home: home, fav: away.fav || home.fav };
  }
  function todaysGames(l) {
    if (l.src === "mlb") {
      return fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=team,linescore&date=" + ymd(new Date()))
        .then(function (r) { return r.json(); }).then(function (j) { return [].concat.apply([], (j.dates || []).map(function (d) { return d.games.map(function (g) { return mlbGame(l, g); }); })); });
    }
    if (l.src === "nhl") {
      return getJson("https://api-web.nhle.com/v1/score/now").then(function (j) { return (j.games || []).map(function (g) { return nhlGame(l, g); }); });
    }
    if (l.event) {                                       // UFC: this week's card plus the next card from the calendar
      return fetch("https://site.api.espn.com/apis/site/v2/sports/" + l.path + "/scoreboard").then(function (r) { return r.json(); }).then(function (j) {
        var cards = (j.events || []).map(function (e) { return fightCard(l, e.id, e.name, e.status.type.state, e.status.type.shortDetail, new Date(e.date).getTime()); });
        var cal = ((j.leagues || [])[0] || {}).calendar || [];
        cal.filter(function (c) { return new Date(c.startDate).getTime() > Date.now() && !cards.some(function (k) { return k.title === c.label; }); })
          .slice(0, 1).forEach(function (c) { cards.push(fightCard(l, "cal" + c.startDate, c.label, "pre", "", new Date(c.startDate).getTime())); });
        return cards;
      });
    }
    return fetch("https://site.api.espn.com/apis/site/v2/sports/" + l.path + "/scoreboard" + (l.q || ""))
      .then(function (r) { return r.json(); }).then(function (j) { return (j.events || []).map(function (e) { return espnGame(l, e); }); });
  }
  // "UFC 334: Gane vs. Hokit" -> tag "UFC 334" (numbered = pay-per-view), main event "Gane vs. Hokit".
  function fightCard(l, id, name, state, detail, date) {
    var m = /^([^:]+):\s*(.+)$/.exec(name || "");
    var tag = m ? m[1].trim() : "UFC", main = m ? m[2].trim() : name;
    return { id: l.id + ":" + id, league: l, kind: "card", tag: tag, main: main, title: name, ppv: /^UFC \d+$/.test(tag),
             state: state, detail: detail, date: date, fav: true };
  }
  // Each favourite team's season schedule, trimmed to what its card shows: a game in progress, the last result and the
  // next game. Also the team's record and standing (TEAMINFO), from the same official / ESPN sources.
  var TEAMINFO = {};
  function ordinal(n) { return n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"); }
  function nextGames(l) {
    var mine = PREFS.teams.filter(function (t) { return t.indexOf(l.id + ":") === 0; }).map(function (t) { return t.slice(l.id.length + 1); });
    if (!mine.length || l.event) return Promise.resolve([]);
    var trim = function (list) {
      var post = list.filter(function (g) { return g.state === "post"; }).sort(function (a, b) { return b.date - a.date; }).slice(0, 1);
      var pre = list.filter(function (g) { return g.state === "pre" && g.date > Date.now() - 3 * 3600000; }).sort(function (a, b) { return a.date - b.date; }).slice(0, 1);
      return list.filter(function (g) { return g.state === "in"; }).concat(post, pre);
    };
    var standings = l.src !== "nhl" ? Promise.resolve() : getJson("https://api-web.nhle.com/v1/standings/now").then(function (j) {
      j.standings.forEach(function (t) {
        TEAMINFO["nhl:" + t.teamAbbrev.default] = { record: t.wins + "-" + t.losses + "-" + t.otLosses, standing: ordinal(t.divisionSequence) + " in " + t.divisionName };
      });
    }).catch(function () {});
    return standings.then(function () { return Promise.all(mine.map(function (team) {
      if (l.src === "mlb") {                            // in season: last 10 days and next 30 (MLB's feed is heavy)
        var from = new Date(), end = new Date(); from.setDate(from.getDate() - 10); end.setDate(end.getDate() + 30);
        return fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=team,linescore&teamId=" + team + "&startDate=" + ymd(from) + "&endDate=" + ymd(end))
          .then(function (r) { return r.json(); }).then(function (j) {
            var raw = [].concat.apply([], (j.dates || []).map(function (d) { return d.games; }));
            var done = raw.filter(function (g) { return g.status.abstractGameState === "Final"; }).pop();
            if (done) {
              var s = String(done.teams.away.team.id) === team ? done.teams.away : done.teams.home, r = s.leagueRecord || {};
              if (r.wins != null) TEAMINFO["mlb:" + team] = { record: r.wins + "-" + r.losses };
            }
            return trim(raw.map(function (g) { return mlbGame(l, g); }));
          });
      }
      if (l.src === "nhl") {
        return getJson("https://api-web.nhle.com/v1/club-schedule-season/" + team + "/now").then(function (j) { return trim((j.games || []).map(function (g) { return nhlGame(l, g); })); });
      }
      return getJson("https://site.api.espn.com/apis/site/v2/sports/" + l.path + "/teams/" + team + "/schedule").then(function (j) {
        var t = j.team || {};
        TEAMINFO[l.id + ":" + team] = { abbr: t.abbreviation, name: t.displayName, logo: t.logo, record: t.recordSummary || "", standing: t.standingSummary || "" };
        return trim((j.events || []).map(function (e) { return espnGame(l, e); }));
      });
    }).map(function (p) { return p.catch(function () { return []; }); })); }).then(function (lists) { return [].concat.apply([], lists); });
  }
  function espnGame(l, e) {                            // scoreboard events and team-schedule events differ slightly
    var c = e.competitions[0], st = (e.status || c.status).type;
    var side = function (ha) {
      var t = c.competitors.filter(function (x) { return x.homeAway === ha; })[0] || c.competitors[ha === "home" ? 0 : 1];
      var score = t.score && typeof t.score === "object" ? t.score.displayValue : t.score;
      return { id: String(t.team.id), abbr: t.team.abbreviation, logo: t.team.logo || (t.team.logos && t.team.logos[0] && t.team.logos[0].href), score: score };
    };
    return game(l, e.id, st.state, st.shortDetail, new Date(e.date).getTime(), side("away"), side("home"));
  }
  function mlbGame(l, g) {
    var s = g.status.abstractGameState, ls = g.linescore || {};
    var state = s === "Live" ? "in" : s === "Final" ? "post" : "pre";
    var detail = state === "in" ? (ls.inningState || "") + " " + (ls.currentInningOrdinal || "") : g.status.detailedState;
    var side = function (t) { return { id: String(t.team.id), abbr: t.team.abbreviation, logo: "https://www.mlbstatic.com/team-logos/" + t.team.id + ".svg", score: t.score }; };
    return game(l, g.gamePk, state, detail.trim(), new Date(g.gameDate).getTime(), side(g.teams.away), side(g.teams.home));
  }
  function nhlGame(l, g) {
    var s = g.gameState, state = s === "LIVE" || s === "CRIT" ? "in" : s === "FINAL" || s === "OFF" ? "post" : "pre";
    var pd = g.periodDescriptor || {}, clock = g.clock || {};
    var per = pd.periodType === "OT" ? "OT" : pd.periodType === "SO" ? "SO" : "P" + (pd.number || "");
    var detail = state === "in" ? (clock.inIntermission ? "Int " : "") + per + " " + (clock.timeRemaining || "") : "";
    var side = function (t) { return { id: t.abbrev, abbr: t.abbrev, logo: t.logo, score: t.score }; };
    return game(l, g.id, state, detail.trim(), new Date(g.startTimeUTC).getTime(), side(g.awayTeam), side(g.homeTeam));
  }
  // One card per favourite team (owner: "follow the team without showing too much"): record and standing, then the
  // live score during a game, otherwise the last result and the next game, whenever it is. Live teams first.
  function myTeams() {
    return PREFS.teams.filter(function (k) {
      var lg = k.split(":")[0], l = leagueOf(lg), id = k.slice(lg.length + 1);
      if (!l || l.event || PREFS.leagues.indexOf(lg) < 0) return false;
      // A team saved from an older team list (another id scheme) isn't in today's list: leave it out.
      return !(TEAMS[lg] && TEAMS[lg].length) || TEAMS[lg].some(function (t) { return t.id === id; });
    });
  }
  function teamCards() {
    var now = Date.now();
    return myTeams().map(function (key) {
      var lg = key.split(":")[0], id = key.slice(lg.length + 1);
      var mine = GAMES.filter(function (g) { return g.league.id === lg && g.kind !== "card" && (g.away.id === id || g.home.id === id); });
      var pick = function (st, newest) {
        return mine.filter(function (g) { return g.state === st && (st !== "pre" || g.date > now - 3 * 3600000); })
          .sort(function (a, b) { return newest ? b.date - a.date : a.date - b.date; })[0];
      };
      var info = TEAMINFO[key] || {}, listed = (TEAMS[lg] || []).filter(function (t) { return t.id === id; })[0] || {};
      var side = mine.length ? (mine[0].away.id === id ? mine[0].away : mine[0].home) : {};
      return { league: leagueOf(lg), id: id, abbr: info.abbr || listed.abbr || side.abbr || id, logo: info.logo || listed.logo || side.logo,
               record: info.record || "", standing: info.standing || "", live: pick("in"), last: pick("post", true), next: pick("pre") };
    }).sort(function (a, b) {
      return (a.live ? 0 : 1) - (b.live ? 0 : 1) || ((a.next || {}).date || 9e15) - ((b.next || {}).date || 9e15);
    });
  }
  function cards() { return GAMES.filter(function (g) { return g.kind === "card" && g.state !== "post" && g.date - Date.now() < 14 * 86400000; }); }
  // No favourite teams in the chosen leagues: those leagues' games instead (live, soonest, latest finals).
  function pickGames() {
    var now = Date.now(), rank = { "in": 0, pre: 1, post: 2 };
    return GAMES.filter(function (g) {
      return g.kind !== "card" && (g.state === "in" || (g.state === "pre" && g.date - now < 7 * 86400000) || (g.state === "post" && now - g.date < 20 * 3600000));
    }).sort(function (a, b) { return rank[a.state] - rank[b.state] || (a.state === "post" ? b.date - a.date : a.date - b.date); }).slice(0, 3);
  }
  function whenText(g) {
    if (g.state === "in") return g.detail;
    if (g.state === "post") return "Final";
    var d = new Date(g.date), today = new Date().toDateString() === d.toDateString(), far = g.date - Date.now() > 6 * 86400000;
    return (today ? T("Today") : dayText(d, far ? { month: "short", day: "numeric" } : { weekday: "short" })) + " " + hm(g.date);
  }
  // "W 27–20 vs ATL" / "L 3–5 @ NYY", from the favourite team's side.
  function resultText(g, id) {
    var us = g.away.id === id ? g.away : g.home, them = us === g.away ? g.home : g.away, a = +us.score, b = +them.score;
    var tie = /^soccer/.test(g.league.path || "") ? "D " : "T ";
    return (a > b ? "W " : a < b ? "L " : tie) + a + "–" + b + " " + oppText(g, id);
  }
  function oppText(g, id) { return g.home.id === id ? "vs " + g.away.abbr : "@ " + g.home.abbr; }
  function shownCount() { return PREFS.sports === "off" ? 0 : myTeams().length ? Math.min(3, teamCards().length + cards().length) : Math.min(3, pickGames().length + cards().length); }
  // Screensaver "Your teams": logo, then "TB · NFL · 3-5 · 2nd in NFC South" over the score or last result and next game.
  function mirrorTeam(c, line, live) {
    var row = document.createElement("div"), txt = document.createElement("div"), tn = document.createElement("div"), ts = document.createElement("div");
    row.className = "mt";
    if (c.logo) { var i = document.createElement("img"); i.src = c.logo; i.alt = ""; row.appendChild(i); } else row.appendChild(document.createElement("span"));
    tn.className = "tn"; tn.textContent = [c.abbr, c.league.short || c.league.name, c.record, c.standing].filter(Boolean).join(" · ");
    ts.className = "ts";
    if (live) { var dot = document.createElement("span"); dot.className = "live"; ts.appendChild(dot); }
    ts.appendChild(document.createTextNode(line));
    txt.appendChild(tn); txt.appendChild(ts); row.appendChild(txt);
    return row;
  }
  function renderScores() {
    var teams = PREFS.sports === "off" ? [] : teamCards();
    var games = PREFS.sports === "off" ? [] : !myTeams().length ? pickGames()
      : PREFS.sports === "all" ? GAMES.filter(function (g) { return g.kind !== "card" && g.state === "in" && !g.fav; }) : [];
    var list = teams.map(function (c) { return { team: c }; }).concat(games, PREFS.sports === "off" ? [] : cards()).slice(0, 3);
    // Built off-screen and swapped in only when something changed (it runs every minute; logos needn't be redrawn).
    var realEl = document.getElementById("scores"), realMirror = document.getElementById("mScores");
    var el = document.createElement("div"), mirror = document.createElement("div");
    if (list.length) {
      var mh = document.createElement("div");
      mh.className = "mh"; mh.textContent = T(teams.length ? "Your teams" : "Scores");
      mirror.appendChild(mh);
    }
    var team = function (t) {
      var s = document.createElement("span");
      if (t.fav) { var f = document.createElement("span"); f.className = "fav"; f.textContent = "★"; s.appendChild(f); }
      if (t.logo) { var i = document.createElement("img"); i.src = t.logo; i.alt = ""; s.appendChild(i); }
      s.appendChild(document.createTextNode(" " + t.abbr));
      s.style.display = "flex"; s.style.alignItems = "center"; s.style.gap = "8px";
      return s;
    };
    var score = function (g) {
      var mid = document.createElement("span");
      if (g.state === "pre") { mid.className = "vs"; mid.textContent = "@"; }
      else { mid.innerHTML = "<b></b><span class='vs'>–</span><b></b>"; mid.children[0].textContent = g.away.score; mid.children[2].textContent = g.home.score; }
      var v = document.createElement("div");
      v.className = "val";
      v.appendChild(team(g.away)); v.appendChild(mid); v.appendChild(team(g.home));
      return v;
    };
    list.forEach(function (g) {
      var cx = document.createElement("div"), lbl = document.createElement("div"), val = document.createElement("div");
      cx.className = "cx sc";
      lbl.className = "lbl";
      lbl.innerHTML = (g.state === "in" || (g.team && g.team.live) ? '<span class="live"></span>' : "");
      val.className = "val";
      var m = document.createElement("div");
      m.className = "msc";
      if (g.team) {                                      // NFL · 3-5 · 2nd in NFC South, then score or last + next
        var c = g.team, head = [c.league.short || c.league.name, c.record, c.standing].filter(Boolean).join(" · ");
        if (c.live) {
          lbl.appendChild(document.createTextNode(head + " · " + whenText(c.live)));
          cx.appendChild(lbl); cx.appendChild(score(c.live));
          m = mirrorTeam(c, resultText(c.live, c.id).replace(/^[WLTD] /, "") + " · " + whenText(c.live), true);
        } else {
          lbl.appendChild(document.createTextNode(head));
          val.appendChild(team({ fav: true, logo: c.logo, abbr: c.abbr }));
          if (c.last) { var r = document.createElement("small"); r.textContent = resultText(c.last, c.id); val.appendChild(r); }
          var nx = document.createElement("div");
          nx.className = "nx";
          nx.textContent = c.next ? T("Next") + " · " + whenText(c.next) + " " + oppText(c.next, c.id) : T("Season over");
          cx.appendChild(lbl); cx.appendChild(val); cx.appendChild(nx);
          m = mirrorTeam(c, [c.last ? resultText(c.last, c.id) : "", c.next ? T("Next") + " " + whenText(c.next) + " " + oppText(c.next, c.id) : T("Season over")]
            .filter(Boolean).join("  ·  "), false);
        }
        el.appendChild(cx); mirror.appendChild(m);
        return;
      }
      if (g.kind === "card") {                           // UFC: "UFC 334 · PPV · Sat 8:00 PM" over "Gane vs. Hokit"
        lbl.appendChild(document.createTextNode(g.tag + (g.ppv ? " · PPV" : "") + " · " + (g.state === "in" ? "Live" : g.state === "post" ? "Ended" : whenText(g))));
        val.textContent = g.main;
        cx.appendChild(lbl); cx.appendChild(val); el.appendChild(cx);
        m.textContent = g.tag + ": " + g.main + " · " + (g.state === "in" ? "Live" : whenText(g));
        mirror.appendChild(m);
        return;
      }
      lbl.appendChild(document.createTextNode((g.league.short || g.league.name) + " · " + whenText(g)));
      cx.appendChild(lbl); cx.appendChild(score(g));
      el.appendChild(cx);
      m.textContent = g.state === "pre" ? g.away.abbr + " @ " + g.home.abbr + " · " + whenText(g)
                                        : g.away.abbr + " " + g.away.score + " – " + g.home.score + " " + g.home.abbr + " · " + whenText(g);
      mirror.appendChild(m);
    });
    if (!list.length && PREFS.sports !== "off") {        // sports is on: say why nothing is showing instead of hiding
      var cx0 = document.createElement("div"), l0 = document.createElement("div"), v0 = document.createElement("div");
      cx0.className = "cx sc"; l0.className = "lbl"; v0.className = "val";
      l0.textContent = "Sports";
      v0.textContent = scoresFailed ? "Scores unavailable right now" : !PREFS.leagues.length ? "Choose leagues in Settings"
        : myTeams().length ? "Looking up your teams…" : "No games in the next 7 days";
      cx0.appendChild(l0); cx0.appendChild(v0); el.appendChild(cx0);
    }
    var on = PREFS.sports !== "off", same = realEl.classList.contains("on") === on &&
      el.innerHTML === realEl.innerHTML && mirror.innerHTML === realMirror.innerHTML;
    if (same) return;
    realEl.innerHTML = ""; while (el.firstChild) realEl.appendChild(el.firstChild);
    realMirror.innerHTML = ""; while (mirror.firstChild) realMirror.appendChild(mirror.firstChild);
    realEl.classList.toggle("on", on);
    applyTop();
  }
  // Game on / Final notices for your teams (not on the first load).
  function gameNotices() {
    GAMES.forEach(function (g) {
      var was = gameState[g.id];
      gameState[g.id] = g.state;
      if (scoresFirst || !g.fav || was === g.state || PREFS.gameNotices === "off") return;   // Notifications > Game start and final
      if (g.kind === "card") {
        if (was === "pre" && g.state === "in") guestNotice({ title: "Live now: " + g.title, message: g.ppv ? "Pay-per-view event" : "", level: "info", source: "UFC" });
        return;
      }
      if (was === "pre" && g.state === "in") guestNotice({ title: "Game on: " + g.away.abbr + " @ " + g.home.abbr, message: "", level: "info", source: g.league.short || g.league.name });
      if (was === "in" && g.state === "post") guestNotice({ title: "Final: " + g.away.abbr + " " + g.away.score + ", " + g.home.abbr + " " + g.home.score, message: "", level: "info", source: g.league.short || g.league.name });
    });
    scoresFirst = false;
    if (Object.keys(gameState).length > 400) {         // keep only today's games once a season's worth has built up
      var keep = {}; GAMES.forEach(function (g) { keep[g.id] = gameState[g.id]; }); gameState = keep;
    }
  }
  // Beach conditions stay at the top; scores sit in a row under them, or move up when beach conditions are off.
  function applyTop() {
    var b = document.getElementById("beach"), s = document.getElementById("scores");
    var hasB = b.classList.contains("on") && PREFS.beach !== "hide";
    b.classList.remove("off");
    s.classList.remove("off");
    s.classList.toggle("below", hasB);
    fitSoon(); fitSaverSoon();                       // new scores or beach items change the rows' sizes
  }

