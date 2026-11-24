(function () {
  "use strict";

  // Location comes from Settings > Location, tv.json or an automatic guess (see "Location and official data").
  // Preview: index.html?zip=10001
  var CONFIG = { units: "fahrenheit" };           // temperature unit default; tv.json "weather.units" can change it

  // Settings (the panel behind the status box): saved on this TV. Temperature defaults to tv.json's units.
  // A to Z (owner's choice), with Restore defaults and Save settings last.
  var PREF_ROWS = [
    { key: "ambient", label: "Start after", opts: [[300, "5 minutes"], [900, "15 minutes"], [1800, "30 minutes"], [0, "Off"]] },
    { key: "ssStyle", label: "Style", opts: [["mirror", "Smart mirror"], ["photo", "Over the photo"]] },
    { key: "ssCal", label: "Week calendar", opts: [["wx", "With weather"], ["days", "Days only"], ["off", "Off"]] },
    { key: "ssNews", label: "News", opts: [["both", "On"], ["off", "Off"]] },
    { key: "ssNewsPick", label: "News topics & sources", link: "ssNewsPick" },
    { key: "ssStocks", label: "Stocks", link: "ssStocks" },
    { key: "ssCrypto", label: "Crypto", link: "ssCrypto" },
    { key: "ssLayout", label: "Layout", link: "ssLayout" },
    { key: "sleep", label: "Sleep sounds", link: "sleep" },
    { key: "ssSize", label: "Text size", opts: [["normal", "Comfortable"], ["large", "Large"]] },
    { key: "theme", label: "Light or dark", opts: [["dark", "Dark"], ["light", "Light"], ["auto", "Automatic"]] },
    { key: "font", label: "Font", opts: [["system", "Modern"], ["light", "Light"], ["condensed", "Condensed"], ["serif", "Classic serif"]] },
    { key: "accent", label: "Accent color", opts: [["blue", "Blue"], ["teal", "Teal"], ["green", "Green"], ["orange", "Orange"], ["pink", "Pink"],
                                                     ["purple", "Purple"], ["gold", "Gold"], ["red", "Red"]] },
    // Look options (owner, 23 November 2026), all done in CSS classes on <body>, so they
    // cost nothing while the home sits still.
    { key: "glass", label: "Glass", opts: [["frosted", "Frosted"], ["clear", "Clear"], ["smoky", "Smoky"], ["solid", "Solid (fastest)"]] },
    { key: "tileShape", label: "App tile corners", opts: [["round", "Rounded"], ["soft", "Extra round"], ["crisp", "Crisp"]] },
    { key: "tileDim", label: "Tiles not highlighted", opts: [["dim", "Dimmed"], ["bright", "Bright"]] },
    { key: "focusFx", label: "Highlight motion", opts: [["lift", "Lift and shine"], ["gentle", "Gentle lift"], ["glow", "Glow, no movement"]] },
    { key: "lite", label: "Lighter home", opts: [["auto", "Automatic"], ["on", "On"], ["off", "Off"]] },
    { key: "wxFx", label: "Weather on the background", opts: [["on", "When it's raining, snowing or foggy"], ["off", "Off"]] },
    { key: "npFull", label: "Full-screen Now playing", opts: [["button", "From the music card"], ["auto", "By itself after a minute"], ["off", "Off"]] },
    { key: "motion", label: "Motion", opts: [["full", "Full"], ["reduced", "Reduced"]] },
    { key: "tint", label: "Glass tint", opts: [["clear", "Clear"], ["accent", "Accent color"]] },
    { key: "focusStyle", label: "Highlight", opts: [["white", "White"], ["accent", "Accent color"]] },
    { key: "bg", label: "Backgrounds", link: "bg",       // beach sets below, then downloaded categories and searches
      opts: [["time", "Follow time of day"], ["golden", "Sunsets"], ["day", "Tropical beaches"], ["night", "Evening & night"], ["all", "All beach photos"]] },
    { key: "beach", label: "Beach conditions", opts: [["show", "Show"], ["hide", "Hide"]] },
    { key: "homeLayout", label: "Layout", link: "homeLayout" },
    { key: "homeClock", label: "Clock & weather panel", opts: [["show", "Top right"], ["left", "Top left"], ["hide", "Off"]] },
    { key: "homeWeek", label: "Week under the clock", opts: [["show", "Show"], ["hide", "Hide"]] },
    { key: "homeAir", label: "Air quality", opts: [["show", "Show"], ["hide", "Hide"]] },
    { key: "homeInfo", label: "Beach & scores row", opts: [["left", "Top left"], ["right", "Top right"]] },
    { key: "kw", label: "Keep watching", opts: [["media", "What you watch"], ["all", "Every app you open"], ["off", "Off"]] },
    { key: "cards", label: "Your cards", link: "cards" },
    { key: "plex", label: "Plex account", link: "plex" },
    { key: "foxRead", label: "Fox One show names", opts: [["off", "Off"], ["on", "Read from Fox One's screen"]] },
    { key: "kwWhere", label: "Shows up", opts: [["app", "Over each app"], ["row", "All in one row"]] },
    { key: "homeClockStyle", label: "Clock style", opts: [["panel", "Glass panel"], ["big", "Big clock"]] },
    { key: "homeClockSize", label: "Clock panel size", opts: [[1, "Medium"], [1.15, "Large"], [1.3, "Extra large"], [0.85, "Small"]] },
    { key: "homeInfoSize", label: "Beach & scores size", opts: [[1, "Medium"], [1.15, "Large"], [1.3, "Extra large"], [0.85, "Small"]] },
    { key: "homeHero", label: "App name above the tiles", opts: [["show", "Show"], ["hide", "Hide"]] },
    { key: "edges", label: "Screen edges", opts: [["normal", "Normal"], ["wide", "Extra margin"]] },
    { key: "homeBar", label: "Bottom bar", opts: [["auto", "Names and icons"], ["icons", "Icons only"]] },
    { key: "homeHint", label: "Remote help line", opts: [["show", "Show"], ["hide", "Hide"]] },
    { key: "speed", label: "Change photo every", opts: [[30, "30 seconds"], [45, "45 seconds"], [120, "2 minutes"], [300, "5 minutes"]] },
    { key: "clock", label: "Clock format", opts: [["12", "12-hour"], ["12s", "12-hour with seconds"], ["24", "24-hour (military)"], ["24s", "24-hour with seconds"]] },
    { key: "teams", label: "Favorite teams", link: "teams" },
    { key: "lang", label: "Language", opts: [["en", "English"], ["es", "Español"], ["fr", "Français"]] },
    { key: "leagues", label: "Leagues & events", link: "leagues" },
    { key: "location", label: "Location", link: "location" },
    { key: "share", label: "Receive from phones", opts: [["off", "Off"], ["on", "On · you accept on the TV"], ["pin", "On · code on the TV + accept"]] },
    { key: "room", label: "Room", link: "room", opts: [["Living room", "Living room"], ["Bedroom", "Bedroom"], ["Guest room", "Guest room"], ["Kitchen", "Kitchen"],
      ["Office", "Office"], ["Den", "Den"], ["Kids' room", "Kids' room"], ["Patio", "Patio"], ["Other", "Other"]] },
    { key: "sports", label: "Sports scores", opts: [["off", "Off"], ["mine", "On"], ["all", "On + all live games"]] },
    { key: "units", label: "Temperature", opts: [["fahrenheit", "Fahrenheit (°F)"], ["celsius", "Celsius (°C)"]] },
    { key: "tz", label: "Time zone", opts: [["auto", "Automatic (this TV)"], ["America/New_York", "Eastern"], ["America/Chicago", "Central"],
      ["America/Denver", "Mountain"], ["America/Phoenix", "Arizona"], ["America/Los_Angeles", "Pacific"], ["America/Anchorage", "Alaska"],
      ["Pacific/Honolulu", "Hawaii"], ["America/Puerto_Rico", "Atlantic (Puerto Rico)"], ["UTC", "UTC"]] },
    { key: "sounds", label: "Interface sounds", opts: [["soft", "Soft"], ["crisp", "Crisp"], ["glass", "Glass"], ["wood", "Wood"], ["custom", "Your sounds"], ["off", "Off"]] },
    { key: "notifySound", label: "Notification sound", opts: [["chime", "Chime"], ["glass", "Glass"], ["bell", "Bell"], ["custom", "Your sound"], ["off", "Off"]] },
    { key: "soundFind", label: "Find sounds online", live: true },
    { key: "soundMine", label: "Your sounds", live: true },
    { key: "delrecv", label: "Delete received files", action: true },
    { key: "music", label: "Music controls", live: true },
    { key: "artLookup", label: "Album covers", opts: [["on", "From Apple's music catalogue"], ["off", "From the music app only"]] },
    { key: "bluetooth", label: "Bluetooth devices", live: true },
    { key: "adb", label: "Developer access (ADB)", live: true },
    { key: "alertsOn", label: "Weather & emergency alerts", opts: [["on", "Show"], ["off", "Off"]] },
    { key: "alertSound", label: "Emergency alert sound", opts: [["tone", "Alert tone"], ["chime", "Chime"], ["bell", "Bell"], ["glass", "Glass"], ["off", "Off"]] },
    { key: "gameNotices", label: "Game start and final", opts: [["on", "Tell me"], ["off", "Off"]] },
    { key: "notifPos", label: "Pop-up position", opts: [["tc", "Top center"], ["tr", "Top right"], ["tl", "Top left"], ["bc", "Bottom center"], ["br", "Bottom right"], ["bl", "Bottom left"]] },
    { key: "pauseN", label: "Pause notifications", live: true },
    { key: "updNotices", label: "App and system updates", opts: [["quiet", "Tell me quietly"], ["off", "Off"]] },
    { key: "tileAuto", label: "New app tiles", opts: [["on", "Added automatically"], ["off", "Off"]] },
    { key: "tileOrder", label: "App order", opts: [["used", "Most used first, then A to Z"], ["az", "A to Z"], ["custom", "Your order"]] },
    { key: "soundOut", label: "Sound output", live: true },
    { key: "mirror", label: "Screen mirroring", live: true },
    { key: "netSettings", label: "Wi-Fi & network", live: true },
    { key: "fireSettings", label: "Fire Settings", live: true, icon: "trash" },
    { key: "fireHome", label: "Fire TV Home", live: true, icon: "trash" },
    { key: "tidy", label: "Tidy up Fire TV", link: "tidy", icon: "trash" },
    { key: "speedTest", label: "Speed test", link: "speed" },
    { key: "hiddenTiles", label: "Hidden tiles", live: true },
    { key: "nasFolder", label: "Network folder (NAS)", live: true },
    { key: "storage", label: "Storage & downloads", link: "storage" },
    { key: "filesOpen", label: "Files", live: true },
    { key: "custPin", label: "Settings PIN", live: true },
    { key: "perms", label: "Permissions & setup", link: "perms" },
    { key: "updMode", label: "Check for updates", opts: [["notify", "Automatically, and tell me"], ["off", "Only when I ask"]] },
    { key: "updFreq", label: "Check how often", opts: [["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"]] },
    { key: "updHour", label: "Check time", opts: [[3, "3 AM"], [5, "5 AM"], [12, "Noon"], [18, "6 PM"], [21, "9 PM"], [0, "Any time"]] },
    { key: "updNow", label: "Check now", live: true },
    // Updates & about, made simple (owner): Offshore's own update first (OK checks, or installs one that's ready), one
    // schedule row, and everything else (apps, Fire OS, Kodi, check time) one level down.
    { key: "updOffshore", label: "Offshore", live: true },
    { key: "updAuto", label: "Check automatically", live: true, adj: true },
    { key: "updother", label: "Apps, Fire OS & Kodi updates", link: "updother" },
    { key: "about", label: "About Offshore", link: "about" },
    { key: "whatsnew", label: "What's new", link: "whatsnew" },
    { key: "setupReplay", label: "Replay setup & tour", live: true },
    { key: "verGuest", label: "Offshore version", live: true },
    { key: "verKodi", label: "Kodi version", live: true },
    { key: "verApps", label: "Other app versions", live: true },
    { key: "verFire", label: "Fire TV version", live: true },
    { key: "webhook", label: "Smart home webhook", live: true },
    { key: "reset", label: "Restore defaults", action: true },
    { key: "save", label: "Save settings", action: true }
  ];
  var PREF_DEFAULTS = { theme: "dark", bg: "time", speed: 45, clock: "12", beach: "show", ambient: 900, ssStyle: "mirror", ssSize: "normal", homeClockSize: 1, homeInfoSize: 1, edges: "normal", homeWeek: "show", homeClock: "show", homeInfo: "left", homeHero: "show", homeBar: "auto", homeHint: "show", ssNews: "both", ssNewsSrc: "npr", stocks: ["SPY:etf", "DIA:etf", "COMP:index"], crypto: ["BTC", "ETH"], ssCal: "wx", ssMusic: "show", ssScores: "show",sports: "off", leagues: ["nfl", "nba"], teams: [], sounds: "soft", notifySound: "chime",
                        lang: "en", tz: "auto", share: "off", artLookup: "on", updMode: "notify", updFreq: "weekly", updHour: 3,
                        alertsOn: "on", alertSound: "tone", bgMatch: "on", gameNotices: "on", notifPos: "tc", tileAuto: "on", tileOrder: "used", custPin: "", updNotices: "quiet",
                        font: "system", accent: "blue", tint: "clear", focusStyle: "white", glass: "frosted", tileShape: "round", tileDim: "dim", focusFx: "lift", motion: "full", lite: "auto", wxFx: "on", kw: "media", kwWhere: "app", foxRead: "off", npFull: "button", homeClockStyle: "panel", vidQuality: "auto", vidKeep: "stream", vidClip: "", bgPhoto: "" };
  var PREFS = Object.assign(JSON.parse(JSON.stringify(PREF_DEFAULTS)), load("prefs") || {});

  // Settings > Language: dates and times in that language (the browser's own formats), plus the home screen's words
  // and the Settings labels. Text from the data sources (forecast wording, team names) stays as they send it.
  var I18N = {
    es: { "Choose": "Elegir", "Open": "Abrir", "Come back here": "Volver aquí", "Settings": "Ajustes", "Fire TV Home": "Inicio de Fire TV",
      "Wi-Fi, sound, display and remote.": "Wi-Fi, sonido, pantalla y control remoto.",
      "The original Fire TV home screen, with every app.": "La pantalla de inicio original de Fire TV, con todas las apps.",
      "Notifications & System": "Notificaciones y sistema", "Water": "Agua", "Waves": "Olas", "High tide": "Marea alta", "Low tide": "Marea baja",
      "Sunset": "Atardecer", "Sunrise": "Amanecer", "Low": "Bajo", "Moderate": "Moderado", "High": "Alto", "Very high": "Muy alto", "Extreme": "Extremo",
      "Sunny": "Soleado", "Clear": "Despejado", "Partly cloudy": "Parcialmente nublado", "Cloudy": "Nublado", "Rain": "Lluvia", "Drizzle": "Llovizna",
      "Storms": "Tormentas", "Snow": "Nieve", "Fog": "Niebla", "Haze": "Bruma", "Offline": "Sin conexión", "VPN on": "VPN activada",
      "VPN off": "VPN desactivada", "Paused": "En pausa", "new": "nuevas", "No alerts": "Sin alertas", "Weather": "Clima", "The week ahead": "La semana",
      "This week": "Esta semana", " in ": " en ", "Today": "Hoy", "Tonight": "Esta noche", "rain": "lluvia", "Loading the forecast…": "Cargando el pronóstico…",
      "National Weather Service forecast · OK or Back to close": "Pronóstico del Servicio Meteorológico Nacional · OK o Atrás para cerrar",
      "Fire Settings": "Ajustes de Fire TV", "Ambient mode": "Modo ambiente", "Appearance": "Apariencia", "Backgrounds": "Fondos", "Beach conditions": "Condiciones de playa",
      "Change photo every": "Cambiar foto cada", "Clock": "Reloj", "Clock format": "Formato de hora", "Start after": "Empezar tras", "Favorite teams": "Equipos favoritos", "Language": "Idioma",
      "Leagues & events": "Ligas y eventos", "Location": "Ubicación", "Room": "Habitación", "Sports scores": "Marcadores deportivos",
      "Temperature": "Temperatura", "Time zone": "Zona horaria", "UI sounds": "Sonidos", "Restore defaults": "Restablecer valores",
      "Save settings": "Guardar ajustes", "Music": "Música", "Share": "Compartir", "Mirror": "Duplicar", "Sleep": "Apagar", "Next": "Próximo", "Season over": "Temporada terminada", "unsaved changes": "cambios sin guardar", "Settings saved": "Ajustes guardados" },
    fr: { "Choose": "Choisir", "Open": "Ouvrir", "Come back here": "Revenir ici", "Settings": "Paramètres", "Fire TV Home": "Accueil Fire TV",
      "Wi-Fi, sound, display and remote.": "Wi-Fi, son, affichage et télécommande.",
      "The original Fire TV home screen, with every app.": "L'écran d'accueil Fire TV d'origine, avec toutes les applis.",
      "Notifications & System": "Notifications et système", "Water": "Eau", "Waves": "Vagues", "High tide": "Marée haute", "Low tide": "Marée basse",
      "Sunset": "Coucher", "Sunrise": "Lever", "Low": "Faible", "Moderate": "Modéré", "High": "Élevé", "Very high": "Très élevé", "Extreme": "Extrême",
      "Sunny": "Ensoleillé", "Clear": "Dégagé", "Partly cloudy": "Partiellement nuageux", "Cloudy": "Nuageux", "Rain": "Pluie", "Drizzle": "Bruine",
      "Storms": "Orages", "Snow": "Neige", "Fog": "Brouillard", "Haze": "Brume", "Offline": "Hors ligne", "VPN on": "VPN activé",
      "VPN off": "VPN désactivé", "Paused": "En pause", "new": "nouvelles", "No alerts": "Aucune alerte", "Weather": "Météo", "The week ahead": "La semaine à venir",
      "This week": "Cette semaine", " in ": " à ", "Today": "Aujourd'hui", "Tonight": "Ce soir", "rain": "pluie", "Loading the forecast…": "Chargement des prévisions…",
      "National Weather Service forecast · OK or Back to close": "Prévisions du National Weather Service · OK ou Retour pour fermer",
      "Fire Settings": "Paramètres Fire TV", "Ambient mode": "Mode ambiant", "Appearance": "Apparence", "Backgrounds": "Fonds d'écran", "Beach conditions": "Conditions de plage",
      "Change photo every": "Changer de photo toutes les", "Clock": "Horloge", "Clock format": "Format de l'heure", "Start after": "Démarrer après", "Favorite teams": "Équipes favorites", "Language": "Langue",
      "Leagues & events": "Ligues et événements", "Location": "Emplacement", "Room": "Pièce", "Sports scores": "Scores sportifs",
      "Temperature": "Température", "Time zone": "Fuseau horaire", "UI sounds": "Sons de l'interface", "Restore defaults": "Valeurs par défaut",
      "Save settings": "Enregistrer", "Music": "Musique", "Share": "Partager", "Mirror": "Recopie", "Sleep": "Veille", "Next": "Prochain", "Season over": "Saison terminée", "unsaved changes": "modifications non enregistrées", "Settings saved": "Paramètres enregistrés" }
  };
  function T(s) { var d = I18N[PREFS.lang]; return (d && d[s]) || s; }
  function locale() { return { es: "es-US", fr: "fr-CA" }[PREFS.lang] || "en-US"; }
  // Settings > Time zone: every time and date on screen follows it ("auto" = the TV's own).
  function tzOpts(o) { if (PREFS.tz && PREFS.tz !== "auto") o.timeZone = PREFS.tz; return o; }
  function translateStatic() {                          // fixed words in the page (data-t holds the English)
    [].forEach.call(document.querySelectorAll("[data-t]"), function (el) { el.textContent = T(el.getAttribute("data-t")); });
    document.documentElement.lang = PREFS.lang || "en";
  }
  translateStatic();
  function units() { return PREFS.units || CONFIG.units; }
  // Room: Settings > Room, else tv.json's "room" ("Guest Room" -> "Guest room"), else Living room.
  var TV_ROOM = "";
  function room() {
    if (PREFS.room) return PREFS.room;
    var r = (TV_ROOM || "").toLowerCase();
    var hit = PREF_ROWS.filter(function (x) { return x.key === "room"; })[0].opts.filter(function (o) { return o[0].toLowerCase() === r; })[0];
    return hit ? hit[0] : TV_ROOM || "Living room";
  }

  var ICON = {
    gear:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    home:   '<svg viewBox="0 0 24 24"><path d="M3.5 10.5L12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-6h4v6"/></svg>',
    stop:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    sweep:  '<svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>'
  };

