  function boot(tv) {
    if (backupRestore()) { location.reload(); return; }        // settings came back from the backup file: start again with them
    if (syncApply()) { location.reload(); return; }            // the main TV's settings arrived (sync_tvs.ps1)
    // This TV's own beach, hand-picked from Commons, listed in its tv.json so no place is written into the app:
    // "homePhotos": { "name": "...", "files": ["File name.jpg", ...] }. It leads Backgrounds > Photos > Beach & ocean.
    var hp = tv.homePhotos;
    if (hp && typeof hp.name === "string" && Array.isArray(hp.files) && !BG_TOPICS.some(function (c) { return c.id === "home"; }))
      BG_TOPICS.unshift({ id: "home", name: hp.name.slice(0, 40), group: "Beach & ocean",
                          files: hp.files.filter(function (f) { return typeof f === "string"; }).slice(0, 30) });
    setTimeout(liveSync, 1500);                                  // a live background, once the first photo is up
    setTimeout(backupNow, 45000);                                // and keep the file current (after start-up has settled)
    applyTheme();
    document.body.classList.toggle("hide-beach", PREFS.beach === "hide");
    saverClasses();
    calRebuild(calRemote); setTimeout(loadCalendars, 12000);     // last copy of the calendars at once, fresh ones once start-up is done
    if (tv.weather && tv.weather.units) CONFIG.units = tv.weather.units;
    TV_ROOM = tv.room || "";
    UPDATE_REPO = /^[\w.-]+\/[\w.-]+$/.test(tv.updates || "") ? tv.updates : "";   // "owner/repo" on GitHub (public build)
    CITIES = tv.alertPlaces || [];
    AREA = tv.alertArea || "";
    build(tv);
    render();
    tick();
    initLocation(tv);
    scores();
    if (q.get("alerts") === "demo" || q.get("alerts") === "emergency") {   // preview: ?alerts=demo, ?alerts=emergency
      ALERTS = [{ event: "Tropical Storm Warning", sev: 1, ends: Date.now() + 6 * 3600000, sent: Date.now() - 1800000, cities: ["Your area"],
                  instr: "Secure loose outdoor objects now. Stay away from windows during the storm. Have a plan if power goes out, and check on neighbors." },
                { event: "Rip Current Statement", sev: 2, ends: Date.now() + 9 * 3600000, cities: ["Your area"], instr: "" }];
      if (q.get("alerts") === "emergency") ALERTS.unshift({ event: "Tornado Warning", sev: 0, ends: Date.now() + 45 * 60000, sent: Date.now() - 4 * 60000,
        cities: ["Your area"], instr: "TAKE COVER NOW! Move to a basement or an interior room on the lowest floor of a sturdy building. Avoid windows. If you are outdoors, in a mobile home, or in a vehicle, move to the closest substantial shelter and protect yourself from flying debris." });
      ALERTS_AT = Date.now();
      renderAlert();
    }
    if (app && app.setNotifyPause) app.setNotifyPause(String(pauseUntil));   // the app's copy matches after a reload
    renderStatus();
    if (q.get("notices") === "demo") {                      // preview: ?notices=demo
      guestNet({ type: "wifi", online: true, bars: 3, vpn: true }, true);
      guestNotice({ title: "Front door opened", message: "Motion at the front door camera.", level: "important", source: "Home Assistant" });
      guestNotice({ title: "Washer finished", message: "The laundry is done.", level: "info", source: "ntfy" });
    }
    wake();
    if (suNeeded()) suOpen();                                    // first run: welcome, a few choices and a tour
    setTimeout(homeBtnNote, q.get("homebtn") ? 3000 : 30000);   // Home button not connected yet: say how to fix it
  }

  // This TV's settings: from the Android app (tv.json pushed by tools/push_config.ps1).
  // In the computer preview: ?tv=<name> loads config\<name>.json (e.g. ?tv=example), or ?demo=<number of apps>.
  var q = new URLSearchParams(location.search), fromApp = null;
  if (app) { try { fromApp = JSON.parse(app.config() || "null"); } catch (e) { fromApp = null; } }
  if (fromApp && fromApp.apps) boot(fromApp);
  else if (!app && q.get("tv")) {
    fetch("tv/" + encodeURIComponent(q.get("tv")) + ".json").then(function (r) { return r.json(); })
      .then(boot, function () { boot(DEFAULT_TV); });
  } else if (!app && q.get("demo")) {
    var keys = Object.keys(CATALOG), demo = [];
    for (var n = 0; n < +q.get("demo"); n++) demo.push(n < keys.length ? keys[n] : "demo.app.App " + (n + 1));
    boot({ apps: demo });
  } else boot(DEFAULT_TV);
})();
