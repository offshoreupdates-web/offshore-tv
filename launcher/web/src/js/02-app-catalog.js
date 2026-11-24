  // Weather icons (chosen from the National Weather Service's forecast wording, see nwsLook).
  var WX = {
    sun:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
    moon:  '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    part:  '<svg viewBox="0 0 24 24"><path d="M8 3.5v1.5M3.5 8H5M4.8 4.8l1 1M11.2 4.8l-1 1"/><path d="M5.6 10.4A3.2 3.2 0 0 1 10.9 7"/><path d="M7.5 20h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.6A3.3 3.3 0 0 0 7.5 20z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7 19h10.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.9A3.6 3.6 0 0 0 7 19z"/></svg>',
    fog:   '<svg viewBox="0 0 24 24"><path d="M4 9h16M3 13h18M5 17h14"/></svg>',
    rain:  '<svg viewBox="0 0 24 24"><path d="M7 15h10.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.9A3.6 3.6 0 0 0 7 15z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/></svg>',
    snow:  '<svg viewBox="0 0 24 24"><path d="M7 15h10.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.9A3.6 3.6 0 0 0 7 15z"/><path d="M8 19h.01M12 20h.01M16 19h.01" stroke-width="3"/></svg>',
    storm: '<svg viewBox="0 0 24 24"><path d="M7 15h10.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.9A3.6 3.6 0 0 0 7 15z"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/></svg>'
  };

  // Every app a TV might show. Each TV lists its tiles in tv.json (package names, in order); the Android app
  // opens them by package. On the TV the real app banners replace these preview wordmarks.
  var CATALOG = {
    "com.plexapp.android":           { name: "Plex",        line: "Movies and shows from your home library.",          cls: "b-plex",     art: "<span>ple<b>x</b></span>" },
    "com.spotify.tv.android":        { name: "Spotify",     line: "Music and podcasts. Your phone's Spotify can play to this TV too.", cls: "b-app", art: "<span>Spotify</span>" },
    "com.amazon.firebat":            { name: "Prime Video", line: "Movies, series and live sports from Amazon.",      cls: "b-prime",    art: "<span>prime video</span><i></i>" },
    "com.netflix.ninja":             { name: "Netflix",     line: "Series, films and documentaries.",                 cls: "b-netflix",  art: "<span>NETFLIX</span>" },
    "org.xbmc.kodi":                 { name: "Kodi",        line: "Plays videos and music from the home network.",    cls: "b-kodi",     art: "<span>KODI</span>" },
    "com.nordvpn.android":           { name: "NordVPN",     line: "Optional. Turn the VPN on only if you need it.",   cls: "b-nord",     art: "<span>NordVPN</span>" },
    "com.spectrum.stva.firetv":      { name: "Spectrum TV", line: "Live TV and On Demand from Spectrum.",             cls: "b-spectrum", art: "<span>Spectrum</span>" },
    "com.peacock.peacockfiretv":     { name: "Peacock",     line: "Shows, movies and live sports from NBCUniversal.", cls: "b-peacock",  art: "<span>peacock<b>.</b></span>" },
    "com.hulu.plus":                 { name: "Hulu",        line: "Series, films and Hulu Originals.",                cls: "b-hulu",     art: "<span>hulu</span>" },
    "com.amazon.firetv.youtube":     { name: "YouTube",     line: "Videos, music and creators.",                      cls: "b-youtube",  art: "<i></i><span>YouTube</span>" },
    "com.fox.foxone":                { name: "Fox One",     line: "Live FOX channels, news and sports.",              cls: "b-foxone",   art: "<span>FOX ONE</span>" },
    "com.disney.disneyplus":         { name: "Disney+",     line: "Disney, Pixar, Marvel and Star Wars.",             cls: "b-disney",   art: "<span>Disney+</span>" },
    "com.apple.atve.amazon.appletv": { name: "Apple TV",    line: "Apple TV+ originals, movies and shows.",           cls: "b-appletv",  art: "<span>Apple TV</span>" },
  };
  var KODI = "org.xbmc.kodi";

  // A TV without tv.json shows the big apps, plus every app installed on it (the Android side adds those).
  var DEFAULT_TV = { weather: CONFIG, first: "", apps: ["com.amazon.firebat", "com.netflix.ninja", "com.amazon.firetv.youtube"] };   // no tv.json: these + every installed app

  // Bottom buttons before the dock. Fire Settings and Fire TV Home moved into Settings > Fire TV (owner: more photo,
  // tiles lower), so none are left; the row is kept for any that come back. `id` is what the Android app acts on.
  var PILLS = [];
  // Maintenance, in the Notifications & System panel's second row (Close Kodi only where Kodi is a tile).
  var MAINT = [
    { id: "clear_cache", name: "Clear cache", hint: "If the TV feels slow", icon: "sweep", done: "Cache cleared" },
    { id: "kill_kodi",   name: "Close Kodi",  hint: "If it freezes",        icon: "stop",  done: "Kodi closed and its cache cleared" }
  ];
  var hasKodi = false;

  var stage = document.getElementById("stage"), tilesEl = document.getElementById("tiles"), gridEl = document.getElementById("grid");
  var dotsEl = document.getElementById("rowdots"), heroEl = document.querySelector(".hero");
  var ROWS = [], els = [];          // tile rows, then the pill row last
  var tileRows = 0, row = 0, col = 0, wantCol = 0, win = 0, step = 0, lastBigPill = 0;

  var app = window.Offshore && window.Offshore.installed ? window.Offshore : null;   // null in the computer preview
  // Live TV (24b-live-tv): a tile of Offshore's own, shown once a playlist has been added; it opens the guide.
  var LIVETV_ID = "offshore:livetv";
  CATALOG[LIVETV_ID] = { name: "Live TV", line: "Your own channels, like a cable box. Plays in VLC.", cls: "b-livetv", art: "<span><i></i>Live TV</span>" };
  function appItem(pkg) {
    var c = CATALOG[pkg];
    if (c) return { id: pkg, name: c.name, line: c.line, cls: c.cls, art: c.art };
    var name = app ? app.label(pkg) : pkg.split(".").pop();
    return { id: pkg, name: name, line: "Open " + name + ".", cls: "b-app" };
  }

