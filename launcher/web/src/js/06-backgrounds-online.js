  // ---- Background categories (Settings > Backgrounds) -------------------------------------------------------
  // Photos from Wikimedia Commons, which only hosts freely licensed work (many are NASA's). Landscape only. Up to 20 per
  // set, downloaded only when a set is chosen and kept on the TV (the app crops them to 1920x1080 and adds the
  // readability shading; about 8 MB per set), so nothing streams while you watch. The author and licence show in the
  // corner, as the licences ask. Your own searches become sets of their own.
  // Owner: "a variety, everything we can think of, quality, premium". Every set was checked by eye on a contact sheet
  // of what it downloads. Sources, best first:
  //   files  hand-picked photos by exact name (where searches can't be trusted, like stadiums)
  //   each   a list of subjects, the top 2 reviewed photos of each (landmarks: one search alone gave 20 of one castle)
  //   cats   Commons' Featured pictures of the subject (the community's best, each one voted on)
  //   q      a search inside Featured pictures and Quality images only; built-in sets never fall back to "any photo"
  //   skip   file names to leave out, found on the contact sheets (a coati, parasols, a Galaxy phone...)
  // Ids of the first sets are kept from earlier versions (saved choices and downloads still match). Sports teams' own
  // logos and photos aren't freely licensed, so Sports is their stadiums and ballparks.
  var BG_GROUPS = ["Beach & ocean", "Nature", "Sky & space", "Cities & landmarks", "Art & museums", "Around 1900 in colour", "Holidays & seasons", "Cars & boats", "Sports"];
  var BG_TOPICS = [
    { id: "coasts", name: "Coasts & beaches", group: "Beach & ocean", cats: ["Featured_pictures_of_coasts"], q: "beach sea -people -crowd" },
    { id: "sunsets", name: "Sunsets worldwide", group: "Beach & ocean", q: "sunset sea" },
    { id: "islands", name: "Islands", group: "Beach & ocean", cats: ["Featured_pictures_of_islands"], q: "tropical island" },
    { id: "tropical", name: "Tropical shores", group: "Beach & ocean", q: "tropical beach", skip: /Parasols|Senecio|coati|Rügen/ },
    { id: "forests", name: "Forests", group: "Nature", cats: ["Featured_pictures_of_forests"], q: "forest" },
    { id: "mountains", name: "Mountains", group: "Nature", cats: ["Featured_pictures_of_mountains"], q: "mountains landscape" },
    { id: "lakes", name: "Lakes & rivers", group: "Nature", cats: ["Featured_pictures_of_bodies_of_water"], q: "lake reflection mountains", skip: /Salinas|Yellow leaves floating/ },
    { id: "waterfalls", name: "Waterfalls", group: "Nature", q: "waterfall" },
    { id: "autumn", name: "Autumn colors", group: "Nature", q: "autumn foliage landscape -people" },
    { id: "flowers", name: "Flower fields", group: "Nature", q: "flower field", skip: /girl|posing/i },
    { id: "countryside", name: "Countryside & farms", group: "Nature", cats: ["Featured_pictures_of_agriculture"], q: "countryside landscape fields" },
    { id: "deserts", name: "Deserts", group: "Nature", q: "desert dunes", skip: /Berber|Desert Exploration/ },
    { id: "volcanoes", name: "Volcanoes", group: "Nature", cats: ["Featured_pictures_of_volcanoes"] },
    { id: "snow", name: "Snow & winter", group: "Nature", q: "snow winter landscape" },
    { id: "gardens", name: "Gardens & parks", group: "Nature", cats: ["Featured_pictures_of_gardens", "Featured_pictures_of_parks"], skip: /Baumwurzel/ },
    { id: "space", name: "Space", group: "Sky & space", cats: ["Featured_pictures_of_galaxies"], q: "nebula OR galaxy", featured: true, skip: /Galaxies Gone Wild/ },
    { id: "aurora", name: "Northern lights", group: "Sky & space", cats: ["Featured_pictures_of_aurora"], q: "aurora" },
    { id: "stars", name: "Starry skies", group: "Sky & space", q: "Milky Way", skip: /Ultra Galaxy|Milky Chance|Ford Galaxy|Samsung|Blue Galaxy|ferry|ship|crane|harbou?r/i },
    { id: "skylines", name: "Skylines", group: "Cities & landmarks", cats: ["Featured_pictures_of_skylines"], q: "skyline panorama" },
    { id: "cities", name: "Cities at night", group: "Cities & landmarks", q: "city skyline night" },
    { id: "bridges", name: "Bridges", group: "Cities & landmarks", cats: ["Featured_pictures_of_bridges"] },
    { id: "landmarks", name: "World landmarks", group: "Cities & landmarks", each: ["Eiffel Tower", "Taj Mahal", "Colosseum Rome", "Golden Gate Bridge",
      "Statue of Liberty", "Machu Picchu", "Sydney Opera House", "Neuschwanstein", "Mont-Saint-Michel", "Sagrada Familia"] },
    { id: "villages", name: "Villages & old towns", group: "Cities & landmarks", cats: ["Featured_pictures_of_villages"], q: "old town village" },
    { id: "christmas", name: "Christmas markets", group: "Holidays & seasons", q: "\"Christmas market\" night" },
    { id: "fireworks", name: "Fireworks", group: "Holidays & seasons", q: "\"fireworks\" -wheel -ferris -carousel -ride",
      skip: /collage|Whippets|Hubble|Illustration/ },
    { id: "spring", name: "Cherry blossoms", group: "Holidays & seasons", q: "\"cherry blossom\" park OR \"cherry blossoms\" trees" },
    { id: "cars", name: "Sports cars", group: "Cars & boats", q: "\"sports car\"" },
    { id: "classiccars", name: "Classic cars", group: "Cars & boats", q: "oldtimer", skip: /Schaufenster|am Stand|Motor Show|Rallye/ },
    { id: "roads", name: "Scenic roads", group: "Cars & boats", cats: ["Featured_pictures_of_roads"], q: "scenic road landscape" },
    { id: "boats", name: "Boats & sailing", group: "Cars & boats", q: "sailboat" },
    { id: "stadiums", name: "Stadiums & ballparks", group: "Sports", files: ["Yankee Stadium upper deck 2010.jpg", "Yankee Stadium aerial from Blackhawk.jpg",
      "Dodger Stadium.jpg", "Dodger Stadium and DTLA.jpg", "2014. Camp Nou. Més que un club. Barcelona B40.jpg", "Allianz-Arena-München.jpg",
      "Santiagobernabeupanoramav45.JPG", "Tropicana Field Playing Field Opening Day 2010.JPG", "Raymond James Stadium02.JPG",
      "Estadi Olímpic Lluís Companys - Barcelona, Spain - Jan 2007.jpg", "RUS-2016-Aerial-SPB-Krestovsky Stadium 01.jpg", "Yokohama Stadium.jpg",
      "Petrovskiy football stadium in SPB.jpg", "Varsity Stadium, Toronto.jpg"] },
    { id: "skiing", name: "Ski slopes", group: "Sports", q: "ski slope mountains" },
    // From the other free sources (see srcName below): NASA's own pictures, two museums' public-domain paintings, and
    // the Library of Congress's Photochrom prints (colour travel views from around 1900).
    { id: "nasa-earth", name: "Earth from the space station", group: "Sky & space", src: "nasa", q: "earth observation from the international space station" },
    { id: "nasa-deep", name: "Nebulae and galaxies (Hubble & Webb)", group: "Sky & space", src: "nasa", q: "hubble nebula" },
    { id: "met-land", name: "Landscape paintings (The Met)", group: "Art & museums", src: "met", q: "landscape" },
    { id: "met-sea", name: "Seascapes (The Met)", group: "Art & museums", src: "met", q: "seascape" },
    { id: "aic-impr", name: "Impressionists (Art Institute of Chicago)", group: "Art & museums", src: "aic", q: "impressionism landscape" },
    { id: "aic-japan", name: "Japanese woodblock prints (Art Institute)", group: "Art & museums", src: "aic", q: "hiroshige landscape" },
    { id: "loc-coast", name: "Coasts around 1900", group: "Around 1900 in colour", src: "loc", q: "coast" },
    { id: "loc-mount", name: "Mountains and lakes around 1900", group: "Around 1900 in colour", src: "loc", q: "lake mountains" },
    { id: "loc-city", name: "Cities around 1900", group: "Around 1900 in colour", src: "loc", q: "city view" }
  ];
  var BG_PER = 20, bgJobs = {}, bgSeq = 0, pendingBg = {};
  function myCats() { return load("bgcats") || []; }                // searches you saved: [{id, name, q}]
  function allCats() {                                   // + "Shared photos", made from photos phones sent (Receive from phones)
    return BG_TOPICS.concat(myCats(), catPhotos("shared") ? [{ id: "shared", name: "Shared photos", local: true }] : []);
  }
  function catOf(id) { return allCats().filter(function (c) { return c.id === id; })[0]; }
  function catPhotos(id) { var s = load("bgset:" + id); return s && s.photos.length ? s.photos : null; }
  var COMMONS_INFO = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    "&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1920&iiextmetadatafilter=Artist|LicenseShortName";
  function commonsPhotos(url, skip) {                    // a Commons query -> [{url, a: author, l: licence}], landscape only
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var pages = j.query && j.query.pages ? Object.keys(j.query.pages).map(function (k) { return j.query.pages[k]; }) : [];
      pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });          // search relevance
      return pages.map(function (p) {
        var i = p.imageinfo && p.imageinfo[0], m = (i && i.extmetadata) || {};
        if (!i || !i.thumburl || i.width / i.height < 1.3 || i.width / i.height > 2.1) return null;
        if (skip && skip.test(p.title || "")) return null;
        // The author field is HTML written by uploaders: read its text with DOMParser, which never runs scripts or
        // loads images (an innerHTML element would, even unattached).
        var artist = new DOMParser().parseFromString((m.Artist && m.Artist.value) || "", "text/html").body.textContent;
        return { url: i.thumburl, t: p.title || "", a: artist.replace(/\s+/g, " ").trim().slice(0, 60) || "Unknown",
                 l: (m.LicenseShortName && m.LicenseShortName.value) || "" };
      }).filter(Boolean);
    });
  }
  // Which part of the day a photo belongs to ("golden" sunrise/sunset, "day" or "night"), so any set can follow the
  // time of day like the beach photos. Its name first ("Sunset over...", "...at night"), else its light, read
  // from a tiny copy: dark and cool is night; golden when the picture, its sky or its brightest tenth (the sun's glow)
  // is warm and the sky isn't plainly blue (so midday deserts and sand stay day); a dark sky over a dark picture is
  // night (blue hour); the rest day. Checked on contact sheets of beaches, sunsets, deserts and cities at night.
  function photoTag(p) {
    var name = (p.t || "").toLowerCase();
    if (/sunset|sunrise|dusk|dawn|golden hour|twilight|evening|sundown/.test(name)) return Promise.resolve("golden");
    if (/night|nocturn|milky way|aurora|stars|starry|fireworks|illuminat/.test(name)) return Promise.resolve("night");
    return new Promise(function (res) {
      var img = new Image();
      img.crossOrigin = "anonymous";                                 // Commons allows it, so the pixels can be read
      img.onload = function () {
        try {
          var c = document.createElement("canvas"); c.width = 32; c.height = 18;
          var x = c.getContext("2d"); x.drawImage(img, 0, 0, 32, 18);
          var d = x.getImageData(0, 0, 32, 18).data, L = 0, W = 0, top = 0, topL = 0, n = d.length / 4, px = [];
          for (var i = 0; i < d.length; i += 4) {
            var l = .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
            L += l; W += d[i] - d[i + 2]; px.push([l, d[i] - d[i + 2]]);
            if (i / 4 < 32 * 6) { top += d[i] - d[i + 2]; topL += l; }   // the sky: the top third
          }
          L /= n; W /= n; top /= 32 * 6; topL /= 32 * 6;
          px.sort(function (a, b) { return b[0] - a[0]; });
          var k = Math.ceil(n / 10), bw = 0;
          for (var j = 0; j < k; j++) bw += px[j][1];
          bw /= k;
          res(L < 55 && W < 25 ? "night" : (bw >= 40 || W >= 20 || top >= 30) && top > -15 ? "golden"
            : topL < 85 && L < 90 ? "night" : "day");
        } catch (e) { res(""); }
      };
      img.onerror = function () { res(""); };
      img.src = String(p.url).replace(/\/\d+px-/, "/120px-");
    });
  }
  function commonsSearch(cat) {
    var q = cat.q || "", featured = cat.featured, builtIn = BG_TOPICS.indexOf(cat) >= 0;
    var api = function (extra, min, words, limit) {
      return commonsPhotos(COMMONS_INFO + "&generator=search&gsrnamespace=6&gsrlimit=" + (limit || 50) + "&gsrsearch=" +
        encodeURIComponent((words === undefined ? q : words) + " filetype:bitmap filew:>" + min + " " + extra), cat.skip);
    };
    var got = [];
    var add = function (list) { list.forEach(function (p) { if (got.length < BG_PER && !got.some(function (g) { return g.url === p.url; })) got.push(p); }); };
    var chain = Promise.resolve();
    if (cat.files) chain = chain.then(function () {               // hand-picked, in the listed order
      return commonsPhotos(COMMONS_INFO + "&titles=" + encodeURIComponent(cat.files.map(function (f) { return "File:" + f; }).join("|"))).then(add);
    });
    (cat.each || []).forEach(function (w) {                        // two of each subject
      chain = chain.then(function () { return api("incategory:Quality_images", 2400, w, 10).then(function (l) { add(l.slice(0, 2)); }); });
    });
    (cat.cats || []).forEach(function (c) {                        // the subject's Featured pictures
      chain = chain.then(function () { return got.length < BG_PER ? api("incategory:" + c, 1919, "").then(add) : null; });
    });
    if (!q) return chain.then(function () { return got; });
    return chain
      .then(function () { return got.length < BG_PER ? api(featured ? "incategory:Featured_pictures_on_Wikimedia_Commons" : "incategory:Quality_images", featured ? 1919 : 2400).then(add) : null; })
      .then(function () { return got.length < BG_PER ? api(featured ? "incategory:Quality_images" : "incategory:Featured_pictures_on_Wikimedia_Commons", 1919).then(add) : null; })
      .then(function () { return got.length < 8 && !builtIn ? api("", 1919).then(add) : null; })   // only your own searches
      .then(function () { return got; });
  }
  window.guestBgSaved = function (id, ok, url) { var p = pendingBg[id]; delete pendingBg[id]; if (p) (ok ? p[0] : p[1])(url); };
  function savePhoto(url, dir, name) {
    if (!app || !app.saveBg) return Promise.resolve(url);         // computer preview: straight from Commons
    return new Promise(function (res, rej) { var id = "b" + (++bgSeq); pendingBg[id] = [res, rej]; app.saveBg(id, url, dir, name); });
  }
  function downloadCat(cat) {
    if (bgJobs[cat.id]) return;
    bgJobs[cat.id] = { done: 0, total: 0 };
    catSearch(cat).then(function (list) {
      if (!list.length) { delete bgJobs[cat.id]; toast("No photos found for “" + cat.name + "”"); if (custOpen) renderCustom(); return; }
      var set = { t: Date.now(), photos: [] };
      bgJobs[cat.id].total = list.length;
      list.forEach(function (p, i) {
        var tag = "";
        photoTag(p).then(function (t) { tag = t; return savePhoto(p.url, "c-" + cat.id, "p" + i); }).then(function (u) {
          set.photos.push({ u: u, f: (p.t || "").replace(/^File:/, ""), a: p.a, l: p.l, p: tag, s: p.s || "" });   // f: the Commons file name, for its name in the list         // p: golden / day / night (time-of-day matching)
          save("bgset:" + cat.id, set);
          if (set.photos.length === 1 && PREFS.bg === "cat:" + cat.id) { shownSet = ""; nextPhoto(); }   // first one shows at once
        }, function () {}).then(function () {
          var j = bgJobs[cat.id];
          if (++j.done === j.total) { delete bgJobs[cat.id]; toast(cat.name + ": " + set.photos.length + " photos ready"); }
          if (custOpen) renderCustom();
        });
      });
      if (custOpen) renderCustom();
    }).catch(function () { delete bgJobs[cat.id]; toast("Couldn't reach " + (cat.src && cat.src !== "all" ? srcName({ s: cat.src }) : (cat.src === "all" ? "the photo sources" : "Wikimedia Commons"))); if (custOpen) renderCustom(); });
  }
  function deleteCat(id) {
    if (app && app.deleteBg) app.deleteBg("c-" + id);
    try { localStorage.removeItem("bgset:" + id); } catch (e) {}
    var mine = myCats().filter(function (c) { return c.id !== id; });
    save("bgcats", mine);
    if (PREFS.bg === "cat:" + id) { shownSet = ""; nextPhoto(); }  // falls back to the time of day
  }
  // ---- More free sources ----------------
  // Every source here is free to use with no account or key, and only work that's free of copyright comes through:
  //   nasa  NASA Image and Video Library: NASA's own photos and videos (public domain)
  //   met   The Met's Open Access (its v1.1 search; v1 was retired in October 2026): public-domain works only
  //   aic   Art Institute of Chicago: public-domain works only, pictures from its own IIIF image server
  //   loc   Library of Congress, Photochrom prints (c. 1890-1910 colour travel views, "no known restrictions")
  // Each gives the same [{url, t, a, l, s}] as commonsPhotos; landscape pictures only, checked on a small copy first.
  // srcName runs while the page starts (05-photos credits the first photo before this part has run), so it keeps its
  // own list instead of reading a variable that isn't set yet. 0.19 read SOURCES here and stopped at start-up whenever
  // the photo on screen came from NASA, The Met, the Art Institute or the Library of Congress.
  function srcName(x) {
    var names = { commons: "Wikimedia Commons", nasa: "NASA", met: "The Met", aic: "Art Institute of Chicago", loc: "Library of Congress", yt: "YouTube" };
    return names[(x && x.s) || "commons"] || "";
  }
  function wideEnough(url) {                             // a small copy's shape: landscape (1.3 to 2.1 wide), or not
    return new Promise(function (res) {
      var i = new Image(), done = false, end = function (v) { if (!done) { done = true; res(v); } };
      i.onload = function () { var r = i.naturalWidth / i.naturalHeight; end(r >= 1.3 && r <= 2.1); };
      i.onerror = function () { end(false); };
      setTimeout(function () { end(false); }, 15000);
      i.src = url;
    });
  }
  function keepWide(list, want) {                         // [{check, p}] -> the wide ones, in order, at most `want`
    return Promise.all(list.map(function (x) { return x.check ? wideEnough(x.check) : Promise.resolve(true); }))
      .then(function (ok) { return list.filter(function (x, i) { return ok[i]; }).map(function (x) { return x.p; }).slice(0, want); });
  }
  var https = function (u) { return String(u || "").replace(/^http:\/\//, "https://"); };
  function nasaPhotos(q, want) {
    return getJson("https://images-api.nasa.gov/search?media_type=image&page_size=60&q=" + encodeURIComponent(q)).then(function (j) {
      var items = (j.collection && j.collection.items) || [];
      return keepWide(items.map(function (it) {
        var d = (it.data || [])[0] || {}, id = d.nasa_id || "", th = ((it.links || [])[0] || {}).href || "";
        if (!/^[\w .,()'&-]{1,120}$/.test(id) || !th) return null;
        var base = "https://images-assets.nasa.gov/image/" + encodeURIComponent(id) + "/" + encodeURIComponent(id);
        return { check: https(th), p: { url: base + "~large.jpg", t: d.title || id, a: (d.photographer || d.center || "NASA").slice(0, 60), l: "Public domain", s: "nasa" } };
      }).filter(Boolean), want);
    });
  }
  function metPhotos(q, want) {
    return getJson("https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&isPublicDomain=true&limit=60&q=" + encodeURIComponent(q))
      .then(function (j) {
        var ids = (j.objectIDs || []).slice(0, 45);
        return Promise.all(ids.map(function (id) {
          return getJson("https://collectionapi.metmuseum.org/public/collection/v1/objects/" + (+id)).catch(function () { return null; });
        }));
      }).then(function (objs) {
        return keepWide(objs.filter(function (o) { return o && o.isPublicDomain && /^https:\/\/images\.metmuseum\.org\//.test(o.primaryImageSmall || ""); }).map(function (o) {
          return { check: o.primaryImageSmall, p: { url: o.primaryImageSmall, t: o.title || "", a: (o.artistDisplayName || "The Met").slice(0, 60), l: "Public domain", s: "met" } };
        }), want);
      });
  }
  function aicPhotos(q, want) {
    return getJson("https://api.artic.edu/api/v1/artworks/search?limit=60&fields=id,title,image_id,artist_title,thumbnail,is_public_domain&q=" + encodeURIComponent(q))
      .then(function (j) {
        return (j.data || []).filter(function (a) {
          var t = a.thumbnail || {}, r = t.width && t.height ? t.width / t.height : 0;
          return a.is_public_domain && /^[0-9a-f-]{36}$/.test(a.image_id || "") && r >= 1.3 && r <= 2.1;
        }).slice(0, want).map(function (a) {
          return { url: "https://www.artic.edu/iiif/2/" + a.image_id + "/full/1686,/0/default.jpg", t: a.title || "", a: (a.artist_title || "Art Institute of Chicago").slice(0, 60), l: "Public domain (CC0)", s: "aic" };
        });
      });
  }
  function locPhotos(q, want) {
    return getJson("https://www.loc.gov/pictures/search/?co=pgz&fo=json&c=60&q=" + encodeURIComponent(q)).then(function (j) {
      return keepWide((j.results || []).map(function (x) {
        var r = (x.image || {}).full || "";
        if (!/^https:\/\/tile\.loc\.gov\/.+r\.jpg$/.test(r)) return null;
        return { check: r, p: { url: r.replace(/r\.jpg$/, "v.jpg"), t: x.title || "", a: (x.creator || "Detroit Publishing Co.").slice(0, 60), l: "No known restrictions", s: "loc" } };
      }).filter(Boolean), want);
    });
  }
  var SRC_PHOTOS = { nasa: nasaPhotos, met: metPhotos, aic: aicPhotos, loc: locPhotos };
  // A set's photos: from its own source, or, for your searches, from every source at once, taking turns so the set
  // mixes them (a source that fails or finds nothing just adds none).
  function catSearch(cat) {
    if (cat.src && SRC_PHOTOS[cat.src]) return SRC_PHOTOS[cat.src](cat.q, BG_PER);
    if (cat.src !== "all") return commonsSearch(cat);
    var each = Math.ceil(BG_PER / 3);
    var jobs = [commonsSearch(cat)].concat(Object.keys(SRC_PHOTOS).map(function (k) { return SRC_PHOTOS[k](cat.q, each); }))
      .map(function (pr) { return pr.catch(function () { return []; }); });
    return Promise.all(jobs).then(function (lists) {
      var out = [];
      for (var i = 0; out.length < BG_PER && lists.some(function (l) { return l.length > i; }); i++)
        lists.forEach(function (l) { if (l[i] && out.length < BG_PER) out.push(l[i]); });
      return out;
    });
  }
  // NASA's videos for live backgrounds: its MP4 copies, public domain. Each video's file list (collection.json) says
  // which copies exist: the large one (about 1080p), or the medium one (about 720p) when there's no large. Many
  // searches turn up videos with neither (aurora: most of them), so they're dropped here rather than failing to play.
  // The page can't read that list itself (no CORS), so it goes through the app (or the preview's proxy).
  function nasaVideos(cat) {
    var clip = function (url, id, title, center) {
      return { url: url, f: title || id.replace(/_/g, " "), u4: "", mb4: 0, h: 1080,
               a: center ? "NASA " + center : cat.name || "NASA", l: "Public domain", s: "nasa" };
    };
    var guess = function (id) { var e = encodeURIComponent(id); return "https://images-assets.nasa.gov/video/" + e + "/" + e + "~large.mp4"; };
    if (cat.ids) return Promise.resolve(cat.ids.map(function (id) { return clip(guess(id), id); }));
    var best = function (id) {
      var e = encodeURIComponent(id);
      return getJson("https://images-assets.nasa.gov/video/" + e + "/collection.json").then(function (files) {
        var have = (files || []).map(function (f) { return https(f); });     // listed as plain http, spaces unencoded
        var pick = function (size) {
          return have.indexOf("https://images-assets.nasa.gov/video/" + id + "/" + id + "~" + size + ".mp4") >= 0 ? guess(id).replace(/~large\.mp4$/, "~" + size + ".mp4") : null;
        };
        return pick("large") || pick("medium") || null;
      }).catch(function () { return null; });
    };
    return getJson("https://images-api.nasa.gov/search?media_type=video&page_size=40&q=" + encodeURIComponent(cat.q)).then(function (j) {
      var items = ((j.collection && j.collection.items) || []).map(function (it) { return (it.data || [])[0] || {}; })
        .filter(function (d) { return d.nasa_id && /^[\w .,()-]{3,120}$/.test(d.nasa_id); }).slice(0, 24);
      return Promise.all(items.map(function (d) { return best(d.nasa_id); })).then(function (urls) {
        return items.map(function (d, i) { return urls[i] ? clip(urls[i], d.nasa_id, d.title, d.center) : null; }).filter(Boolean).slice(0, VID_PER);
      });
    });
  }
  // ---- Live backgrounds (Settings > Backgrounds, under "Live backgrounds") ----------------------------------
  // A silent video behind the home screen and the screensaver: free clips from Wikimedia Commons (its own 1080p or 720p
  // WebM copies, at most 6 per topic, downloaded once and kept on the TV) or videos phones sent. One <video> only (the
  // Cube decodes one stream in hardware). A clip loops until it has run at least the photo time, then fades to the next.
  // Paused whenever an app covers the home screen. A clip that won't play is skipped; if none will, photos come back.
  // The built-in sets, grouped for Settings in this order. Each clip was checked by eye, from frames across its first
  // minutes (no on-screen text, logos, people talking to the camera, ordinary streets or murky shots):
  //  - yt: Creative Commons (CC BY) YouTube videos, [video id, channel (credited on screen), clip name]. Saved on the
  //    TV, the first 2½ minutes of each, in 1080p (or 4K when chosen). Checked again for the licence when saved.
  //  - files: Wikimedia Commons clips by file name (so they never drift to news footage a search can turn up),
  //    streamed. The first plays at once while the YouTube clips download; all of them carry the set on their own
  //    when YouTube can't be reached.
  //  - ids / q: NASA's own videos. auto: a set that picks one of the others (the holiday, or today's weather);
  //    src "near": Creative Commons videos of the TV's town, found by search.
  var VID_TOPICS = [
    // Beaches & tropical
    { id: "waves", name: "Beach waves", group: "Beaches & tropical",
      yt: [["L86kPEAuiUI","Background Calm","Waves on a pebble beach"],
           ["G3JD0ytt_cs","Visual Walk","Waves on black rocks"],
           ["jxprJsRoT04","LocalEyes","Viña del Mar, Chile"],
           ["bL7raobFj0w","Free Stock Footage","Waves at sunset"],
           ["KBPavXDw8lw","Free HD Footage","Blue ocean waves"]],
      files: ["Ocean waves at Lækjavik beach, Iceland.webm",
        "Pequeño oleaje sobre Rivera Brava, junto a Faja dos Padres (Madeira, Portugal).webm",
        "Aerial view of sand beach. Top view sea waves. Drone footage.webm",
        "Waves-1013354, Dingle Peninsula, Co. Kerry, Ireland.webm",
        "Rocks and Waves-103779, Dingle Peninsula, Co. Kerry, Ireland.webm"] },
    { id: "tropical", name: "Tropical islands", group: "Beaches & tropical",
      yt: [["lDfOA6K2myA","Stocks Shares","Jungle coast from above"],
           ["DXFZEru9080","Video Library - Copyright Free Video Foo","Reef island from above"],
           ["NQPjnZDA-Xc","Dronestock Library","Turquoise coast"],
           ["obz9eM0jDpw","Den Sep","Honolulu beaches"],
           ["0veY2s8GMbg","ORANGE 4K","Maldives resort"]],
      files: ["USVI MVI 5244 - Stone-walled garden with palm trees overlooks the turquoise sea and distant islands under a cloudy sky.webm",
        "Waves waving at Apollo Beach (Canaveral National Seashore, Florida, GEDC7077).webm",
        "Puerto Rico - Drone Vieques - Caribbean Island Off the Shore of Puerto Rico.webm",
        "DJI 0357 - Aerial view of a coastal town nestled among lush green islands with turquoise waters and white buildings under a partly cloudy sky.webm",
        "Cocoa Beach (May 2023) and Pier.webm"] },
    { id: "sunset", name: "Sunset by the sea", group: "Beaches & tropical",
      yt: [["xiK4KqZkXbY","The Collection","Waves in the sunset"],
           ["WMhM9rexNi8","All About Background","Golden sun on the sea"],
           ["vuNT_PU8Tv4","2160p 60fps","Sunset clouds"],
           ["BCmhdAFYcGU","Johnny MashUp","Sunset over islands"],
           ["9MkWWjGNbNc","Beauty of Nature - Nature Gallery","Sunset over the hills"]],
      files: ["2022-08-06, Pacific Ocean sunset (Ocean Shores, Washington), 01.webm",
        "Free video clip - Sunset through Palm Tree.webm",
        "2022-08-06, Pacific Ocean sunset (Ocean Shores, Washington), 03.webm",
        "Sunset 2011 ( HD ).webm",
        "Sunset at the sea of Azov.webm",
        "Aerial views of the seafront at sunset, Bexhill.webm",
        "Sunset timelapse on the beach in Libreville, Gabon.webm",
        "Sunset in Pantai Kukup.webm"] },
    { id: "coast", name: "Coasts from above", group: "Beaches & tropical",
      yt: [["lRVLSJuVc2o","Lens of SEA _ Camera, Drone, Cinematogra","Crete's coast"],
           ["6IXth-PSe9k","IFDC","Australian coast"],
           ["benWX0ECZqQ","IFDC","Coast at dusk"],
           ["MuiJ5h2SJGI","Free Stock Footage","Waves on cliffs"]],
      files: ["Drone Flying over Beach in Luquillo, Puerto Rico.webm",
        "Oregon Coast Odyssey- FPV Drone Captures Stunning Ocean Views.webm",
        "Drone Flight- Cape Kiwanda, Pacific City, Oregon.webm",
        "Aerial view of sand beach. Top view sea waves. Drone footage.webm"] },
    { id: "hawaii", name: "Hawaii from above", group: "Beaches & tropical",
      files: ["Hawaii Drone Video, 2023.webm",
        "Halona Blowhole, Oahu, Hawaii 4K footage.webm",
        "North Shore Hawaii filmed with a drone.webm",
        "‘Āina (Hawaii).webm"] },
    // Underwater & sea life
    { id: "reef", name: "Coral reef", group: "Underwater & sea life",
      yt: [["9PjLy9UZX7g","Alpine Visions 4K","Coral reef"],
           ["zKMcLgVIhRY","The Keeper","Reef aquarium"],
           ["bn1zG31Zlb8","Relaxing Nature Videos","Underwater life"],
           ["eY0OSRJ5zy4","Simon's travel channel","Coral fish aquarium"]],
      files: ["First records of the species Paracanthurus hepatus at the Chesterfield-Bellona reef complex in the Coral Sea Marine Park (Ifremer 00675-78698).webm",
        "First record of the species Forcipiger longirostris at the Chesterfield-Bellona reef complex in the Coral Sea Marine Park (Ifremer 00675-78691).webm",
        "First record of the species Balistoides viridescens at the Chesterfield-Bellona reef complex in the Coral Sea Marine Park (Ifremer 00675-78687).webm",
        "First record of the species Chilomycterus reticulatus at the Chesterfield-Bellona reef complex in the Coral Sea Marine Park (Ifremer 00675-78690).webm"] },
    { id: "jelly", name: "Jellyfish", group: "Underwater & sea life",
      files: ["Jellyfish at Monterey Bay Aquarium 5 2017-11-21.webm",
        "Jellyfish at Monterey Bay Aquarium 13 2017-11-21.webm",
        "Jellyfish at Monterey Bay Aquarium 11 2017-11-21.webm",
        "Jellyfish at Monterey Bay Aquarium 1 2017-11-21.webm",
        "Jellyfish at Monterey Bay Aquarium 4 2017-11-21.webm",
        "Jellyfish at Monterey Bay Aquarium 6 2024-01-11.webm",
        "Jellyfish at Monterey Bay Aquarium 8 2024-01-11.webm",
        "Jellyfish at Monterey Bay Aquarium 1 2024-01-11.webm"] },
    { id: "aquarium", name: "Aquarium", group: "Underwater & sea life",
      files: ["Exhibits at Monterey Bay Aquarium 12 2017-11-21.webm",
        "Fish at Monterey Bay Aquarium 1 2024-01-11.webm",
        "Exhibits at Monterey Bay Aquarium 7 2017-11-21.webm",
        "Fish at Monterey Bay Aquarium 3 2024-01-11.webm",
        "Exhibits at Monterey Bay Aquarium 16 2017-11-21.webm",
        "Sardines reacting to tuna - MBA.webm",
        "Fish at Monterey Bay Aquarium 4 2024-01-11.webm"] },
    { id: "turtles", name: "Sea turtles", group: "Underwater & sea life",
      files: ["Green sea turtles (Chelonia mydas) in Hawaii.webm",
        "Aerial view of a green sea turtle (Chelonia mydas) swimming in the reef at Lady Musgrave Island, Queensland, Australia.webm"] },
    { id: "dolphins", name: "Dolphins & whales", group: "Underwater & sea life",
      yt: [["-GuGPLfhX9g","Aaron Lynton","Humpback whales, Mo'orea"]],
      files: ["053 Pod of Spinner dolphins swimming in the Indian ocean Video by Giles Laurent.webm",
        "Spinner dolphins in Hawaii.webm",
        "Humpback whale Tail Sailing behaviour.webm",
        "032 Humpback whale lobtailing in slow motion Video by Giles Laurent.webm",
        "Aerial view of a humpback whale near Gordon's Bay, Sydney, Australia at 24 August 2020.webm",
        "Antarctic Blue Whales.webm"] },
    { id: "underwater", name: "Underwater", group: "Underwater & sea life",
      files: ["Black sea underwater life at Sinemorets coast.webm",
        "School of fish in Myanmar.webm",
        "Brycon hilarii piraputanga rio prata 01.webm",
        "Blacktail butterflyfish (Chaetodon austriacus) school, Чернохвостая рыба-бабочка, парочка.DSCF1215.webm",
        "Meeräschen (Mugilidae) DSCF1748.webm",
        "Blue Holes auf den Bahamas (CC BY 4.0).webm"] },
    // Wildlife & animals
    { id: "safari", name: "African safari", group: "Wildlife & animals",
      yt: [["VsoACNCVuMw","Jukka Lämsä","Giraffes in the Masai Mara"],
           ["pGTTzWQKIFQ","FOCUS ON FOCUS","Lions, hippos and elephants"],
           ["EbyEJLle9co","4k Nature relaxation video","African wildlife"]] },
    { id: "birds", name: "Birds & forest animals", group: "Wildlife & animals",
      yt: [["MNGWtVPGckg","Birds of a Midwest Paradise","Sparrows at a bird bath"],
           ["VgSTxAW5QBI","MicrophonicFool","Hummingbirds"],
           ["uP5KiwoFJG4","Lennart Hessel","Imperial eagle"],
           ["v0H2MksobyQ","Kevin Russell","Birds at a feeder"],
           ["Ua-P45vOltw","Krogmann","Squirrels in the forest"]] },
    // Nature
    { id: "mountains", name: "Mountains", group: "Nature",
      yt: [["vhpOhHEhVOg","HikingFex","Snowy peaks"],
           ["QJULJ9neZsI","Joeys Journeys","Interlaken, Switzerland"],
           ["NrIgWB2TPuM","Zen view","Mount Parnon, Greece"],
           ["ynrv5BhUD0k","Free Stock Footage","Misty green mountains"]] },
    { id: "lake", name: "Mountain lakes", group: "Nature",
      yt: [["UZ7BDrL2n5g","DRONE EXPLORER - Relaxing sound & Aerial","Fog over a Swedish lake"],
           ["vg5PXhbryg4","Joeys Journeys","Lake Brienz, Switzerland"],
           ["FkoqkxoisOo","Andrei Ceban","Mirror lake at sunrise"],
           ["ygNifgRhLQc","Travel Kevin BKH","Mirror Lake, Utah"]],
      files: ["Half Way Bay on Lake Okanagan during Golden Hour in Winter.webm",
        "View of Lake Okanagan from Knox Mountain Park in Winter.webm",
        "Lala Lake, Romania - 4K Aerial.webm",
        "Chopaka Lake (28054947691).webm"] },
    { id: "forest", name: "Forests", group: "Nature",
      yt: [["1ejsQR_eARU","4K4FREE","Forests from above"],
           ["4UQAPzpl-Ic","IFDC","Australian forest from above"],
           ["MJ_s8ARJC8A","4K Drone Footage HD","Endless pine forest"],
           ["swtkgALrYRc","Royalty free Clips","Forest road from above"],
           ["fjgGz6Bugew","2022 Royalty Free Music for Free","Green forest"]] },
    { id: "falls", name: "Waterfalls", group: "Nature",
      yt: [["XRIxpKKz7uI","Video Library - Copyright Free Video Foo","Mossy waterfall"],
           ["MAN2OIeP9TA","Free Stock Footage","Waterfall with a rainbow"],
           ["ukdY3dQMaeU","PureSpore","Seljalandsfoss in ice, Iceland"],
           ["xhrZGS4BZ-c","Nature Sounds","Waterfall in the forest"]],
      files: ["Wasserfall der Laussa kurz vor der Mündung in die Enns.ogv",
        "Waterfall Bluff.ogv",
        "Phe Phe falls.webm",
        "Kullaojan putous 7.webm"] },
    { id: "autumn", name: "Autumn colours", group: "Nature",
      yt: [["ybmlkZ-3FPY","Pure Adirondacks","Adirondack fall colours"],
           ["XOVaCUzYnQ8","Freestocks","Autumn treetops"],
           ["AN_KMk8CIP0","Russell West Productions | RWP","Algonquin Park, Ontario"],
           ["HOZbwRo72o4","Dronestock Library","New England meadow"],
           ["zXhNEwtZQ3Y","Dronestock Library","New England hills"]],
      files: ["Falling autumn leaves.webm",
        "Autumnleavesfalling-kanagawa-2022Dec5.webm",
        "4K Drone Flight over Ephraim Harbor to see the Fall Colors - Door County, WI Oct 2024.webm"] },
    { id: "flowers", name: "Flowers & blossoms", group: "Nature",
      yt: [["uljF0Pg6cLM","No Copyright Videos","Cherry blossoms"],
           ["76vJQmZuE_s","NoCopyright Video Lib","Rapeseed field"],
           ["_xpZcO79u0U","Free Clips 4k","Spring garden"],
           ["7EqDPLmSCc8","Free Stock Footage","Blue wildflowers"]],
      files: ["Cherry Blossoms Tidal Basin Washington DC 2024-03-24 18-13-40 1.webm",
        "Time-lapse of opening red rose isolated on black background.Blooming red roses flower buds.webm",
        "Park with cherry blossoms, Paris.webm"] },
    // Weather
    { id: "weather", name: "Today's weather", group: "Weather", auto: "wx" },
    { id: "storm", name: "Thunderstorms", group: "Weather",
      yt: [["XpWBMmutQ4Q","Jim Vajda","Storms at sunset"],
           ["zKaIrk437Xs","Jim Vajda","Sunset into lightning"],
           ["xkhrgkp6dd4","Watching Nature — Relaxing & Free Stock ","Thunder clouds over a forest"],
           ["lfDDC29nf-s","Harborside Photography","Lightning over Fort Myers"]],
      files: ["Thunderstorm in Onex - 20062013 - The street.webm",
        "Début d'un Orage dans les monts d'Ambazac.webm"] },
    { id: "rainfall", name: "Rain", group: "Weather",
      yt: [["TatD16J7f2I","Montreal Walking Tours","Rain on tropical leaves"],
           ["t7P1PDjNCy8","AllInOne Relax Videos","Costa Rican rainforest"],
           ["PlLkMISegAE","Relaxing music for you","Rain on grass"],
           ["q0aAYAX6FOc","في رحاب المزرعة","Tropical rain"]] },
    { id: "snowfall", name: "Snowfall", group: "Weather",
      yt: [["glo6I_qCkC8","Watching Nature — Relaxing & Free Stock ","Heavy snowfall"],
           ["ga1_J72Na4k","Watching Nature — Relaxing & Free Stock ","Snow on spruce trees"],
           ["KveB4uN5URE","HikingFex","Snowy mountains"],
           ["GbAb1LFRd8Y","Deep Nature Sounds","Snowy forest path"]],
      files: ["Snow falling in Tuntorp.webm",
        "Snow on Myrstigen.webm",
        "Snow timelapse 2014.webm"] },
    { id: "fog", name: "Fog & mist", group: "Weather",
      yt: [["PkvpzP77cKQ","The Collection","Mist in the valley"],
           ["y81chIEHq2w","DroneWorldHD","Fog over the mountains"],
           ["etU1i111V4Q","Earth Explorer","Fog over a river"],
           ["i0yoA6C_nvc","The Collection","Hoarfrost in fog"]] },
    { id: "clouds", name: "Drifting clouds", group: "Weather",
      yt: [["ZJjYB-hWxMc","fireflyjack","Sunny day clouds"],
           ["iQCIjiZJNzs","Video Library - Copyright Free Video Foo","Clouds and sun rays"],
           ["wNsGrCiuhyY","Mateusz Ptak","White clouds drifting"]],
      files: ["Timelapse of Clouds over Bellevue Canyon.webm",
        "Morgen Wolken Zeitraffer - Morning Clouds Timelapse (Royalty Free) (Kostenlos) 4096x2304p 100FPS.webm",
        "Timelapse-nuages-petit-croix.ogv",
        "All4sounds - Cloud Time lapse.webm",
        "Dying Light on Okanagan Mountain.webm"] },
    { id: "snowpeaks", name: "Snowy mountains", group: "Weather",
      yt: [["vhpOhHEhVOg","HikingFex","Snowy peaks"],
           ["w8LpbxcI6Bw","anotherview","Frozen Norway"],
           ["xLHhNwXiTo4","Free Stock Videos 4K","Swiss Alps in winter"]] },
    // Sky & space
    { id: "aurora", name: "Northern lights", group: "Sky & space",
      yt: [["oenDo3mh59E","Eladio Arvelo","Northern lights, Iceland"],
           ["RdD1NgAwfLg","Terje Nesthus","Northern lights, Voss"],
           ["djt_-LkF38A","Terje Nesthus","Northern lights over town"],
           ["VQw4lQWsti8","Terje Nesthus","Northern lights over the valley"]],
      files: ["Aurora borealis timelapse.webm",
        "Aurora Borealis over Spruce Woods, Manitoba.webm",
        "Aurora Borealis in the steppes of Kazakhstan. October 10, 2024.webm",
        "Polarlichter Aurora Borealis - Berlin Deutschland.webm"] },
    { id: "stars", name: "Starry nights", group: "Sky & space",
      yt: [["1zA9pC3ULwQ","Nature Clips Free","Milky Way over a lone tree"],
           ["36cMQEoOoqQ","Okan Bozat","Milky Way, New Zealand"],
           ["fkNFIuzjqpI","Mihail-Gabriel Barbuta","Milky Way, Retezat mountains"]] },
    { id: "nasa-iss", name: "Earth from the space station", group: "Sky & space", src: "nasa", q: "earth views",
      ids: ["NHQ_2020_1221_Earth Views","Earth Views from the International Space Station","jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_ 2021_210422-4KMP4"] },
    { id: "nasa-sun", name: "The Sun up close", group: "Sky & space", src: "nasa", q: "solar dynamics observatory",
      ids: ["GSFC_20170211_SDO_m12500_Year7","GSFC_20160212_SDO_m12144_Year6","GSFC_20160624_SDO_m12292_TwistingSolarMaterial"] },
    // Cities
    { id: "near", name: "Near you", group: "Cities", src: "near" },
    { id: "city", name: "Cities at night", group: "Cities",
      yt: [["FiA5Puf7ZKw","AJChimaera","Storm over Sydney Harbour"],
           ["DSs7yNgDuDo","Shifar's Earth Vibes","Night traffic"],
           ["jTFAseOjFEs","The Collection","Highway lights at night"],
           ["sLOfqC8cxRY","101GreenLight TV","City lights"]],
      files: ["Chicago River time lapse.webm",
        "Time-lapse and tilt-shift views of Osaka from the observation deck of Umeda Sky Building, Osaka, Japan.webm",
        "Time-lapse and tilt-shift views of Osaka from the observation deck of Abeno Harukas, Osaka, Japan.webm"] },
    { id: "skylines", name: "City skylines", group: "Cities",
      yt: [["zpN05qWxhqU","SkyWave Free Footage","Chicago from above"],
           ["pycz54en1FQ","SkyWave Free Footage","Sydney Harbour"],
           ["2OJYVKDRxyU","XplorerFilms","Seattle skyline"],
           ["guCR0znBFXE","Our Planet By Drone","City towers"]],
      files: ["Chicago Day and Night.webm",
        "Chicago Skyline from Museum Campus.webm",
        "Shanghai Bund, Lujiazui Skyline Timelapse.webm",
        "San Francisco vue aerienne.ogv",
        "Eiffel Tower Drone 4k-Qx c1X3zfEc-313-251.webm"] },
    { id: "nyc", name: "New York from above", group: "Cities",
      files: ["Aerial views of Midtown Manhattan, New York City, USA.webm",
        "Aerial views of Central Park Tower, 220 Central Park South (Billionaires Row) and Upper West Side Manhattan, New York City, USA.webm",
        "Aerial views of Hells Kitchen and East Midtown Manhattan in New York City, USA at night.webm"] },
    { id: "vegas", name: "Las Vegas at night", group: "Cities",
      files: ["Aerial views of Las Vegas, Nevada, USA at sunset including The Bellagio Fountain Hotel and Casino, Flamingo, High Roller Observation Wheel and Treasure Island.webm",
        "Aerial views of Las Vegas Strip, Nevada, USA at twilight including The Bellagio Casino Hotel and Resort fountain and light show.webm",
        "Aerial views of Las Vegas Strip, Nevada, USA at night including The Bellagio, The Flamingo, MGM Grand Hotel, Caesars Palace, The Cosmopolitan, Mirage Hotel and Casino and the Venetian Palazzo Resort Casino.webm"] },
    // Aerial world tour
    { id: "world", name: "Around the world", group: "Aerial world tour",
      yt: [["ATpLB-3bofA","Baschir Zekar","Japan from above"],
           ["2X0g_1ptYmQ","LuciannFilm","Krka, Croatia"],
           ["3MWNkt-1ch8","Footage123","Glacier river, New Zealand"],
           ["v5Zyp9cD0ms","Ryabik OFF","Lviv, Ukraine"],
           ["-vY7bnEowxA","Zen view","Nuremberg, Germany"],
           ["M7F0legVyYw","Nikolaos Sakellaris","Bucharest, Romania"]],
      files: ["2018-09-25 Santa Maria della Salute (Venice) Grand Canal.webm",
        "Machu-Pichu (video 2011).webm",
        "Aerial imagery of fjords and rivers in Arctic Norway.webm",
        "Canal Grande MVI 0675.webm",
        "Time-lapse of Patagonia, Argentina.webm",
        "Montoj apud Maĉupikĉuo.webm"] },
    { id: "iceland", name: "Iceland", group: "Aerial world tour",
      yt: [["P1OirtBmZlE","Great Lakes Yachting","Iceland's canyons"],
           ["mi8ZnBOAZ1A","Artur Tomal","Iceland from above"],
           ["5L17g5IzRkk","The Conscious Dreamers","Iceland's black beaches"],
           ["Awr06wxG77Q","Skorcio","Iceland's coast"]],
      files: ["Goðafoss waterfall in Northern Iceland.webm",
        "Dettifoss waterfall in Northern Iceland.webm",
        "Glanni waterfalls in northern Iceland.webm",
        "Gullfoss waterfall in Iceland.webm",
        "Sveinsstekksfoss waterfall in Eastern Iceland.webm",
        "Waterfall in Kolugljúfur canyon in Northern Iceland.webm"] },
    { id: "alps", name: "Swiss Alps", group: "Aerial world tour",
      yt: [["-y11clnPWVY","Free Clips 4k","Engelberg"],
           ["THBv1oZ3S2E","Free Clips 4k","Furka Pass"],
           ["fG6MMSiVXa8","Greenwood Wandering","Swiss valleys"]],
      files: ["Aerial views of the Swiss Alps.webm",
        "Timelapse of Swiss mountains.webm",
        "Aerial views of Fronalpstock, Schwyzer Alps, Switzerland.webm",
        "Italy and Switzerland by Drone.webm"] },
    { id: "norway", name: "Norway's fjords", group: "Aerial world tour",
      yt: [["YgAoxhk5jMk","Drone Videos","Fjord from above"],
           ["fjeiHS3i6xE","Alfarnes","Fjord ferry"],
           ["fPuny4rZHSg","CaptainsVoyage by Captain Bank","Cruise ship in a fjord"],
           ["H46z30F9Cbs","Lucco","Norway's fjords"]] },
    { id: "japan", name: "Japan", group: "Aerial world tour",
      yt: [["ATpLB-3bofA","Baschir Zekar","Japan from above"],
           ["HHfqcpwS0Cs","JCCR (Japanese Camp Gear Review)","Japan's coast"],
           ["6MyP5c9qUKA","One Eight Film","Japanese islands"]] },
    // National parks & wonders
    { id: "niagara", name: "Niagara Falls", group: "National parks & wonders",
      files: ["Niagara Falls Time Lapse.webm",
        "Rainbow over Niagara Falls in Canada.webm",
        "Niagara waterfalls with rainbow 2015.webm",
        "Video of Niagara Falls in Spring 2026.webm",
        "From the base of Niagara Falls, Spring 2026.webm"] },
    { id: "canyon", name: "Grand Canyon & desert", group: "National parks & wonders",
      files: ["Grand Canyon Clouds time lapse VP8.webm",
        "Delicate Arch Sunset.webm",
        "Pan of the Grand Canyon.webm",
        "Time lapse of Monument Valley, Navajo Tribal Park 1080p.webm",
        "UTAH 4K (DJI MAVIC PRO).webm",
        "Mittens Time Lapse.webm"] },
    { id: "yellowstone", name: "Yellowstone", group: "National parks & wonders",
      files: ["Opal Pool (Midway Geyser Basin, Yellowstone National Park) 2021-08-10.webm",
        "Lower Geyser Basin, Yellowstone National Park.webm",
        "Canary Spring (Mammoth Hot Springs, Yellowstone National Park) 2021-08-09.webm"] },
    { id: "yosemite", name: "Yosemite", group: "National parks & wonders",
      files: ["Sunset on Halfdome timelapse Yosemite CA 2023-07-15 20-11-06 1.webm",
        "Yosemite Upper Falls high flow Yosemite CA 2023-07-13 14-42-17 1.webm",
        "Bridalveil Falls from Valley View Yosemite CA 2023-07-13 18-05-30 1.webm"] },
    { id: "glaciers", name: "Glaciers & mountains", group: "National parks & wonders",
      files: ["Lamplugh Glacier timelapse.webm",
        "Time-lapse of Mount Rainier, Washington, USA.webm",
        "Reid Glacier in Alaska.webm"] },
    // Scenic drives & trains
    { id: "drive", name: "Scenic drives", group: "Scenic drives & trains",
      yt: [["k-2oddL7SOg","Vandrownik · Norway Scenic Drives","Voss Valley, Norway"],
           ["cA4NxKDLZuk","Open Road Vistas","Central California"],
           ["6gaVjVC3Ngk","Pure Drive ASMR","Country roads, Poland"]] },
    { id: "train", name: "Train windows", group: "Scenic drives & trains",
      yt: [["zLy2zmNOkLU","Maverick","Train through farmland"],
           ["HJFRnDrhmvE","4K Nature HD","Train through green fields"],
           ["7rD_gL-1JAo","4K Japan","Train in Japan"]] },
    { id: "flight", name: "Above the clouds", group: "Scenic drives & trains",
      yt: [["RZ6PiOmlSOY","Ambient Video Backdrops","Wing above the clouds"],
           ["AQteClZ68C8","Freestocks","Clouds from a plane"],
           ["ILGHJWvSbOM","No Copyright Videos","Sea of clouds"],
           ["HYXjdNHAbmE","[Culture Snap]","Sunset from a plane"]] },
    // Sports
    { id: "surf", name: "Surf", group: "Sports",
      yt: [["cnt7DbQDttQ","Aaron Lynton","Big waves at Jaws, Maui"],
           ["kHAr_3l8o_Q","Copyright Free Videos","Surfer on a wave"],
           ["amFHxh55-BE","Kohelix Cam","Surfing from above"],
           ["P2bL4MyxJQw","MonteCarlo Elegance","Broken Head, Australia"]],
      files: ["Surfing-1012624, Dingle Peninsula, Co. Kerry, Ireland.webm",
        "Surfing-1012628, Dingle Peninsula, Co. Kerry, Ireland.webm"] },
    { id: "stadium", name: "Stadiums", group: "Sports",
      yt: [["T-Tc4kx25SE","Chris Cafiero","Ohio Stadium"],
           ["Z-z08Gcck8Q","Kevin Lomprez","Stade de France"],
           ["wn3DEfpUn7s","flyviz","Kuala Lumpur stadium"]] },
    { id: "ski", name: "Ski slopes", group: "Sports",
      yt: [["8nCUy9fr3xM","BHF AKA Storm Chaser Bowser","Heavenly ski run"],
           ["_WsmDCTjPno","Denis Trofimov","Snowcat skiing"],
           ["_2sNwPR3__U","Szabolcs Veres-Lakos","Kopaonik slopes"]] },
    { id: "golf", name: "Golf courses", group: "Sports",
      yt: [["2gOyV-wZjfw","FlyOverGreen","Estoril, Portugal"],
           ["P9L4HVHrVB4","FlyOverGreen","Cannes, France"],
           ["QYIG6EMlh7g","FlyOverGreen","Penha Longa, Portugal"],
           ["14okFZFO5Lo","FlyOverGreen","Laguna course"]] },
    // Cozy
    { id: "fire", name: "Cozy fireplace", group: "Cozy",
      yt: [["LGNZteltw94","Dope Gameplays","Log fire"],
           ["VWEw-eNsrqg","Cozy Woods","Birchwood fire"],
           ["e3ko08o8rxU","Fireplace for You","Brick fireplace"],
           ["u6ChWgQo5Wc","Relaxing & Satisfying","Fire close up"]],
      files: ["Fantastic-fireplace-fire-chimney-hearth- background - texture - motion graphics - free video library.webm",
        "Fireplace 1 2021-02-14.webm",
        "Outdoor fireplaces 1 2014-04-23.ogv",
        "Outdoor fireplaces 2 2014-04-23.ogv"] },
    { id: "rain", name: "Rain on the window", group: "Cozy",
      yt: [["8SJta2DfemI","Rain Channel","Rain streaks on a window"],
           ["WPYnqU0SwUA","storybyphil","Rain at night"],
           ["yyRYBXSWFC8","Dreamscapes","Rain on a window"],
           ["K5lViGxvYAU","No Copyright 4K Footage","Raindrops"],
           ["vHJrCtvGOsY","Best Relaxing Vibes","Rain by the window"]],
      files: ["Radevormwald - Raindrops on a window 07 (1) ies.webm",
        "Radevormwald - Raindrops on a window 08 (1) ies.webm",
        "Radevormwald - Raindrops on a window 09 (1) ies.webm",
        "Radevormwald - Raindrops on a window 10 (1) ies.webm",
        "Radevormwald - Raindrops on a window 11 (1) ies.webm"] },
    // Abstract & art
    { id: "abstract", name: "Flowing colour", group: "Abstract & art",
      yt: [["htXe0ybca1U","MOODY RAW SCREENS","Liquid gold"],
           ["TwOiSwTcyBw","ALIVE SCREENS - Motion Backgrounds and V","Golden spiral"],
           ["ppp03Rj4fXM","Free Dream Vault","Silk waves"],
           ["N7qBXaGSYF4","Free Dream Vault","Neon waves"]] },
    { id: "ink", name: "Ink in water", group: "Abstract & art",
      yt: [["Vk10zNYBCUg","No Copyright Everything","Pink ink"],
           ["f1W8dNtwjpo","VAVDO","Yellow ink"],
           ["Zf03tvr5X4I","VAVDO","Blue ink"],
           ["JYdvwp211kI","Free Stock Footage","Ink around a rose"]] },
    { id: "tvart", name: "Framed paintings", group: "Abstract & art",
      yt: [["fxtFTmHDGQQ","Leaf Avenue Art","Spring flowers painting"],
           ["RjUGI3J5CZY","Leaf Avenue Art","Flower garden painting"],
           ["_8zGyda5jAc","TV Art by Leaf Avenue – Scenic Gallery 4","Moonlit winter forest"],
           ["1WVSCk0qfIQ","TV Art by Leaf Avenue – Scenic Gallery 4","Cherry blossom path"],
           ["67AaiLGOkg4","TV Art by Leaf Avenue – Scenic Gallery 4","Cherry tree painting"]] },
    // Holidays & seasons
    { id: "seasonal", name: "Holidays & seasons", group: "Holidays & seasons", auto: true },
    { id: "xmas", name: "Christmas lights", group: "Holidays & seasons",
      yt: [["3ipwxMZUnI0","Silver Serpent5","Christmas lights"],
           ["GTwU5h48e8Q","Free Dream Vault","Christmas tree lights"]],
      files: ["Christmas lights - December 2023 - Sarah Stierch.webm",
        "Rotary Lights La Crosse.webm",
        "Christmas in Ohio Wonderlights by drone.webm"] },
    { id: "fireworks", name: "Fireworks", group: "Holidays & seasons",
      yt: [["lBCvs-uzt3A","VFX Library","Colourful fireworks"],
           ["rqHXZ1rhvdk","ORANGE 4K","Red fireworks"],
           ["nLrLUFb_vDg","Mário J.R. Matos","Curtain of sparks"]],
      files: ["Fireworks Naperville 2022.webm",
        "Pittsburgh July 4th 2024 firework celebration aerial view.webm",
        "Fireworks show.webm",
        "Fireworks at the Danube.ogv",
        "Close-up fireworks during Lunar New Year celebration in Zhongshan, China, 2026.webm",
        "Fogo de artifício do fim do ano no Funchal 2020-2021 - MVI 1263.webm"] },
    { id: "halloween", name: "Halloween", group: "Holidays & seasons",
      yt: [["3yH08xUDMxo","ALIVE SCREENS - Motion Backgrounds and V","Jack-o'-lantern"],
           ["8zB4B_DG09Q","Clip Craft Media","Pumpkins in a graveyard"],
           ["ZkMYBe9RnPI","Clip Craft Media","Haunted house"],
           ["MSdQV-9c_AE","ALIVE SCREENS - Motion Backgrounds and V","Full moon in fog"],
           ["Knuei3C4IDY","To The Moon Filmworks","Pumpkin patch"]],
      files: ["Début d'un Orage dans les monts d'Ambazac.webm",
        "Falling autumn leaves.webm",
        "Autumnleavesfalling-kanagawa-2022Dec5.webm"] },
    { id: "spring", name: "Spring blossoms (Easter)", group: "Holidays & seasons",
      yt: [["YQBy3M2r4Go","Free Stock Footage 4K","Cherry blossoms opening"],
           ["uljF0Pg6cLM","No Copyright Videos","Cherry blossoms"]],
      files: ["Cherry Blossoms Tidal Basin Washington DC 2024-03-24 18-13-40 1.webm",
        "Park with cherry blossoms, Paris.webm"] },
    { id: "valentine", name: "Valentine's Day", group: "Holidays & seasons",
      files: ["Time-lapse of opening red rose isolated on black background.Blooming red roses flower buds.webm",
        "Free video clip - Sunset through Palm Tree.webm",
        "2022-08-06, Pacific Ocean sunset (Ocean Shores, Washington), 01.webm"] },
    { id: "stpat", name: "St. Patrick's Day (Irish coast)", group: "Holidays & seasons",
      files: ["Waves-1013354, Dingle Peninsula, Co. Kerry, Ireland.webm",
        "Rocks and Waves-103779, Dingle Peninsula, Co. Kerry, Ireland.webm",
        "Surfing-1012624, Dingle Peninsula, Co. Kerry, Ireland.webm"] },
    { id: "honor", name: "Flags of honor (Memorial & Veterans Day)", group: "Holidays & seasons",
      files: ["Washington Monument flags 2022-03-28 18-48-12 1.webm",
        "Washington Monument base sunrise 2023-05-07 06-09-51 1.webm"] },
    { id: "july4", name: "4th of July", group: "Holidays & seasons",
      yt: [["lBCvs-uzt3A","VFX Library","Colourful fireworks"]],
      files: ["Independence Day Fireworks, Washington DC (20210704-OC-LSC-0053).webm",
        "Pittsburgh July 4th 2024 firework celebration aerial view.webm",
        "Statue Of Liberty 4k Drone.webm",
        "Fireworks Naperville 2022.webm"] }
  ];
  var VID_GROUPS = ["Beaches & tropical", "Underwater & sea life", "Wildlife & animals", "Nature", "Weather", "Sky & space", "Cities", "Aerial world tour", "National parks & wonders", "Scenic drives & trains", "Sports", "Cozy", "Abstract & art", "Holidays & seasons"];   // the order in Settings
  var VID_PER = 8, vidJobs = {}, vidSeq = 0, pendingVid = {};
  function vidList(id) { var s = load("vidset:" + id); return s && s.videos && s.videos.length ? s.videos : null; }
  function myVidCats() { return load("vidcats") || []; }  // live video searches you saved: [{id, name, q, src: "mix"}], YouTube sets: [{id, name, src: "yt", vids}]
  function vidCats() { return VID_TOPICS.concat(myVidCats(), vidList("shared") ? [{ id: "shared", name: "Videos from phones", local: true }] : []); }
  // Settings shows the sets by group: the built-in groups, then "Your videos" (searches, YouTube, videos from phones).
  function vidGroupOf(c) { return !c ? "" : VID_GROUPS.indexOf(c.group) >= 0 ? c.group : "Your videos"; }
  function vidGroups() { return VID_GROUPS.concat(vidCats().some(function (c) { return vidGroupOf(c) === "Your videos"; }) ? ["Your videos"] : []); }
  function vidCatOf(id) { return vidCats().filter(function (c) { return c.id === id; })[0]; }
  function commonsVideos(cat) {                         // a preset's own files by name, or a search for the rest
    return fetch("https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
      "&prop=videoinfo&viprop=url|size|mime|derivatives|extmetadata&viextmetadatafilter=Artist|LicenseShortName" +
      (cat.files ? "&titles=" + encodeURIComponent(cat.files.map(function (f) { return "File:" + f; }).join("|"))
                 : "&generator=search&gsrnamespace=6&gsrlimit=40&gsrsearch=" + encodeURIComponent(cat.q + " filetype:video")))
      .then(function (r) { return r.json(); }).then(function (j) {
        var pages = j.query ? Object.keys(j.query.pages).map(function (k) { return j.query.pages[k]; }) : [];
        var order = function (p) { return cat.files ? cat.files.indexOf(p.title.replace(/^File:/, "")) : p.index; };
        pages.sort(function (a, b) { return order(a) - order(b); });          // the preset's order, or search relevance
        return pages.map(function (p) {
          var i = p.videoinfo && p.videoinfo[0], m = (i && i.extmetadata) || {};
          if (!i || !i.width || !i.height || i.width / i.height < 1.3 || (i.duration && (i.duration < 8 || i.duration > 600))) return null;
          var d = (i.derivatives || []).filter(function (x) { return /\.webm$/.test(x.src || "") && x.height >= 480 && x.height <= 1080; })
            .sort(function (a, b) { return b.height - a.height; })[0];             // the largest copy up to 1080p
          if (!d || !/^https:\/\/upload\.wikimedia\.org\//.test(d.src)) return null;
          var artist = new DOMParser().parseFromString((m.Artist && m.Artist.value) || "", "text/html").body.textContent;
          // The 4K original too, when there is one a TV can stream: 2160p (not 8K), WebM, at most 45 Mbit/s.
          var mb4 = i.duration ? i.size * 8 / i.duration / 1e6 : 999;
          var u4 = i.height >= 2160 && i.height <= 2400 && mb4 <= 45 && /webm/.test(i.mime || "") && /^https:\/\/upload\.wikimedia\.org\//.test(i.url || "") ? i.url : "";
          return { url: d.src, f: p.title.replace(/^File:/, ""), u4: u4, mb4: u4 ? Math.round(mb4) : 0, h: d.height, a: artist.replace(/\s+/g, " ").trim().slice(0, 60) || "Unknown", l: (m.LicenseShortName && m.LicenseShortName.value) || "" };
        }).filter(Boolean);
      }).then(function (all) {                                        // 1080p whenever a topic has enough; 720p only if not
        var full = all.filter(function (v) { return v.h >= 1080; }), hd = all.filter(function (v) { return v.h >= 720; });
        return (full.length >= 3 ? full : hd.length >= 3 ? hd : all).slice(0, VID_PER);
      });
  }
  // snd: a YouTube clip that was saved with its sound track (the TV keeps it only when asked, and when it can).
  var vidSnd = {};
  window.guestVidSaved = function (id, ok, url, snd) { var p = pendingVid[id]; delete pendingVid[id]; if (ok && snd) vidSnd[url] = true; if (p) (ok ? p[0] : p[1])(url); };
  // ---- YouTube (the app's YouTube.java, NewPipe Extractor) ----------------------------------------------------
  // Search finds up to 20 videos ([{id, t, a, d, th}]); a link or a video id finds that one. Saving keeps part of it on
  // the TV: at most 30 minutes in 1080p, or 10 minutes in 4K when Settings › Live video › Video quality says 4K and the
  // TV is sending 4K, from a chosen start point, with the sound only when asked. Stream addresses expire, so nothing
  // is streamed.
  var YT_PER = 5;                                         // clips in a set made from a search (they take room on the TV)
  var ytAvail = function () { return !!(app && app.youtubeSearch && app.youtubeSave); };
  function ytSearch(q) {
    if (!ytAvail()) return Promise.reject(new Error("YouTube backgrounds work on the TV"));
    return new Promise(function (res, rej) { var id = "f" + (++fetchSeq); pendingFetch[id] = [res, rej]; app.youtubeSearch(id, q); })
      .then(function (t) { var l = JSON.parse(t); return Array.isArray(l) ? l : []; });
  }
  // cc: the video must still be Creative Commons (the built-in sets); sec: the clip's length (0: the longest, 30 / 10
  // minutes); st: seconds to skip at the start (an intro, a title card), up to 10 minutes; snd: keep the sound too.
  var YT_MAX_START = 600;
  function ytSave(yt, dir, name, cc, sec, st, snd) {
    if (!ytAvail()) return Promise.reject("YouTube backgrounds work on the TV");
    st = Math.max(0, Math.min(YT_MAX_START, Math.round(st || 0)));
    var q = (PREFS.vidQuality === "4k" ? "4k" : "1080") + (cc ? ",cc" : "") + (sec ? "," + Math.max(20, Math.min(1800, Math.round(sec))) : "") + (st ? ",s" + st : "") + (snd ? ",snd" : "");
    return new Promise(function (res, rej) { var id = "v" + (++vidSeq); pendingVid[id] = [res, rej]; app.youtubeSave(id, yt, q, dir, name); });
  }
  // The built-in sets' YouTube clips: up to 2½ minutes each (they loop, and the set moves on every minute or so), about
  // 30-80 MB in 1080p. Only the eight built-in sets played last keep theirs; an older one fetches them again if chosen.
  var YT_PRESET_SEC = 150, YT_PRESET_KEEP = 8;
  // A set made from the top results of a search: 5 minutes of each (one video added on its own picks its length).
  var YT_SET_SEC = 300;
  function ytPrune(keep) {
    var sets = VID_TOPICS.filter(function (t) { var l = t.yt && vidList(t.id); return l && l.some(function (v) { return v.yt; }); })
      .map(function (t) { return { id: t.id, p: (load("vidset:" + t.id) || {}).p || 0 }; })
      .sort(function (a, b) { return b.p - a.p; });
    var now = liveTopic();
    sets.filter(function (x) { return x.id !== keep && x.id !== now; }).slice(YT_PRESET_KEEP - 1).forEach(function (x) { deleteVid(x.id); });
  }
  // "Near you": Creative Commons YouTube videos of the TV's town (Settings › Location), found by search, so they
  // aren't checked by hand. Fetched again when the location changes.
  function nearPlace() { return LOC && LOC.name ? LOC.name.replace(/\s*\(.*\)$/, "") : ""; }
  function nearVideos() {
    var place = nearPlace();
    if (!place) return Promise.reject(new Error("no location"));
    var junk = /#shorts|vlog|review|tutorial|unbox|crash|news|accident|fail|music video|walking tour|walk\b|driving tour|prank|interview|trailer|lyrics|reaction|real estate|for sale|tour of (my|our)|home tour/i;
    var get = function (q) { return ytSearch("cc:" + q).catch(function () { return []; }); };
    return get(place + " drone 4k").then(function (l) { return l.length >= 6 ? l : get(place + " drone").then(function (m) { return l.concat(m); }); }).then(function (l) {
      var seen = {};
      return l.filter(function (v) { if (seen[v.id] || junk.test(v.t || "") || v.d < 20 || v.d > 3600) return false; seen[v.id] = 1; return true; })
        .slice(0, 4).map(function (v) { return { yt: v.id, url: "", f: v.t || v.id, u4: "", mb4: 0, a: (v.a || "YouTube").slice(0, 60), l: "CC BY", s: "yt", cc: true }; });
    });
  }
  // "Today's weather": the set for what the forecast says now (rain, snow, storms, fog, clouds; clear skies: the
  // stars at night, otherwise the season's sunny set).
  function weatherTopic() {
    var w = load("weather") || {}, t = (w.text || "").toLowerCase(), mo = new Date().getMonth();
    if (/thunder|t-storm|storm/.test(t)) return "storm";
    if (/snow|flurr|sleet|blizzard|ice/.test(t)) return "snowfall";
    if (/rain|shower|drizzle/.test(t)) return "rain";
    if (/fog|haze|smoke|mist/.test(t)) return "fog";
    if (/cloud|overcast/.test(t) && !/partly|mostly sunny|mostly clear/.test(t)) return "clouds";
    if (w.day === false) return "stars";
    return mo <= 1 || mo === 11 ? "snowpeaks" : mo <= 4 ? "flowers" : mo <= 8 ? "tropical" : "autumn";
  }
  function vidPlayed(id) { var s = load("vidset:" + id); if (s && Date.now() - (s.p || 0) > 3600000) { s.p = Date.now(); save("vidset:" + id, s); } }
  function ytTime(s) { s = Math.max(0, Math.round(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x; }
  function saveVideo(url, dir, name) {
    if (!app || !app.saveVideo) return Promise.resolve(url);       // computer preview: straight from Commons
    return new Promise(function (res, rej) { var id = "v" + (++vidSeq); pendingVid[id] = [res, rej]; app.saveVideo(id, url, dir, name); });
  }
  function downloadVid(cat, light) {           // light: only the streamed clips for now (setup's quick look)
    if (cat && cat.auto) cat = vidCatOf(autoTopic(cat));   // "Holidays & seasons" and "Today's weather" fetch today's set
    if (!cat || vidJobs[cat.id] || (!cat.files && !cat.q && !cat.yt && cat.src !== "near" && cat.src !== "yt")) return;
    vidJobs[cat.id] = { done: 0, total: 0 };
    // YouTube sets: the videos picked are in the set itself; ones already saved are kept, not fetched again.
    var had = {}, why = "";
    if (cat.src === "yt") (vidList(cat.id) || []).forEach(function (v) { if (v.yt) had[v.yt] = v; });
    // Built-in sets: their hand-picked Creative Commons YouTube clips first (saved on the TV), then the Commons or NASA
    // clips (streamed), which also carry the set when YouTube can't be reached. "Near you" searches YouTube for CC
    // videos of the TV's town.
    var ytPre = ytAvail() && cat.yt && !light ? cat.yt.map(function (y) { return { yt: y[0], url: "", f: y[2] || y[0], u4: "", mb4: 0, a: y[1], l: "CC BY", s: "yt", cc: true }; }) : [];
    var backup = function (p) { return ytPre.length ? p.catch(function () { return []; }).then(function (l) { return l.slice(0, 1).concat(ytPre, l.slice(1)).slice(0, VID_PER); }) : p; };   // a streamed one first: it plays at once
    var found = cat.src === "yt" ? Promise.resolve((cat.vids || []).map(function (v) { return { yt: v.id, url: "", f: v.t || v.id, u4: "", mb4: 0, a: (v.a || "YouTube").slice(0, 60), l: v.cc ? "CC BY" : "", s: "yt", cc: !!v.cc, st: v.st || 0, len: v.len || YT_SET_SEC, snd: !!v.snd }; }))
      : cat.src === "near" ? nearVideos()
      : !cat.files && !cat.q && !cat.ids ? Promise.resolve(ytPre)
      : cat.src === "nasa" ? backup(nasaVideos(cat)) : cat.src !== "mix" ? backup(commonsVideos(cat))
      : Promise.all([commonsVideos(cat).catch(function () { return []; }), nasaVideos(cat).catch(function () { return []; })]).then(function (l) {
          var out = [];                                          // your searches: Commons and NASA, taking turns
          for (var i = 0; out.length < VID_PER && (l[0][i] || l[1][i]); i++) { if (l[0][i]) out.push(l[0][i]); if (l[1][i] && out.length < VID_PER) out.push(l[1][i]); }
          return out;
        });
    found.then(function (list) {
      if (!list.length) { delete vidJobs[cat.id]; toast(cat.yt && !ytAvail() ? cat.name + " plays on the TV (its clips come from YouTube)" : "No videos found for “" + cat.name + "”"); if (custOpen) renderCustom(); return; }
      var set = { t: Date.now(), p: Date.now(), place: cat.src === "near" ? nearPlace() : undefined, light: light && ytAvail() && cat.yt ? true : undefined, videos: [], kept: cat.src === "yt" || cat.src === "near" || PREFS.vidKeep === "keep" };
      if (cat.yt) ytPrune(cat.id);                                   // room for these: the oldest built-in sets' clips go
      vidJobs[cat.id].total = list.length;
      list.reduce(function (chain, v, i) {                           // one after another: they're big
        return chain.then(function () {
          // Streamed by default: only the links are kept (no storage); "Keep videos on the TV" downloads them.
          var get = v.yt ? (had[v.yt] ? Promise.resolve(had[v.yt].u) : ytSave(v.yt, "v-" + cat.id, "y" + Date.now().toString(36) + i, v.cc, cat.src === "yt" ? v.len : YT_PRESET_SEC, v.st, v.snd))
                    : set.kept ? saveVideo(v.url, "v-" + cat.id, "v" + i) : Promise.resolve(v.url);
          return get.then(function (u) {
            var snd = v.yt && (vidSnd[u] || (had[v.yt] && had[v.yt].snd));
            set.videos.push({ u: u, f: v.f, u4: v.u4, mb4: v.mb4, a: v.a, l: v.l, s: v.s || "", yt: v.yt || undefined, cc: v.cc || undefined, snd: snd || undefined });   // 4K from Commons is always streamed, never kept; f: the file or video name
            save("vidset:" + cat.id, set);
            if (set.videos.length === 1 && PREFS.bg.indexOf("vid:") === 0 && liveTopic() === cat.id) liveSync();   // the first one plays at once
            if (set.videos.length === 1 && previewing && custOpen) {                 // or in the preview, if it's still highlighted
              var hr = custRows()[custRow]; if (hr && hr.vcat && liveTopic(hr.bg) === cat.id) previewBg(hr);
            }
          }, function (e) { if (typeof e === "string" && e) why = e; }).then(function () { vidJobs[cat.id].done++; if (custOpen) renderCustom(); });
        });
      }, Promise.resolve()).then(function () {
        delete vidJobs[cat.id];
        if (!SU.open) toast(set.videos.length ? cat.name + ": " + set.videos.length + " videos ready" + (why && set.videos.length < list.length ? " (" + why + " for some)" : "")
                                              : "Couldn't download " + cat.name + " videos" + (why ? ": " + why : ""));   // setup stays quiet
        if (custOpen) renderCustom();
      });
      if (custOpen) renderCustom();
    }).catch(function () {
      delete vidJobs[cat.id];
      toast(cat.src === "near" && !nearPlace() ? "Set the TV's location first (Settings › Location)" : cat.src === "near" && !ytAvail() ? "Near you works on the TV"
            : "Couldn't reach " + (cat.src === "nasa" ? "NASA" : cat.src === "yt" || cat.src === "near" ? "YouTube" : "Wikimedia Commons"));
      if (custOpen) renderCustom();
    });
  }
  function deleteVid(id) {
    if (app && app.deleteBg) app.deleteBg("v-" + id);
    try { localStorage.removeItem("vidset:" + id); } catch (e) {}
    save("vidcats", myVidCats().filter(function (c) { return c.id !== id; }));     // a search of yours goes with its videos
    if (PREFS.bg === "vid:" + id || liveSet === "vid:" + id) liveSync();
  }
  var vidEl = document.getElementById("bgVid"), liveSet = "", liveIdx = 0, liveStart = 0, liveFails = 0;
  // "Holidays & seasons" picks today's set: around each holiday people celebrate (New Year's, Valentine's, St. Patrick's,
  // Easter, Mother's and Father's Day, Memorial Day, the 4th of July, Halloween, Veterans Day, Thanksgiving, Christmas)
  // its own clips, otherwise the season's. Other observance days are left out.
  function easter(y) {                                  // Gregorian Easter Sunday (the anonymous algorithm)
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1).getTime();
  }
  function seasonalTopic(now) {
    now = now || new Date();
    var y = now.getFullYear(), day = new Date(y, now.getMonth(), now.getDate()).getTime(), D = 86400000, H = {};
    holidays(y).forEach(function (h) { H[h.title] = h.t; });
    function near(t, before, after) { return day >= t - before * D && day <= t + after * D; }
    if (near(H["New Year's Eve"], 0, 0) || near(H["New Year's Day"], 0, 0)) return "fireworks";
    if (near(H["Independence Day"], 6, 1)) return "july4";
    if (near(H["Christmas Day"], 24, 4)) return "xmas";
    if (near(H["Valentine's Day"], 6, 0)) return "valentine";
    if (near(new Date(y, 2, 17).getTime(), 6, 0)) return "stpat";
    if (near(easter(y), 7, 1)) return "spring";
    if (near(H["Mother's Day"], 2, 0)) return "flowers";
    if (near(H["Father's Day"], 2, 0)) return "coast";
    if (near(H["Memorial Day"], 2, 0) || near(H["Veterans Day"], 1, 0)) return "honor";
    if (near(H["Halloween"], 14, 0)) return "halloween";
    if (near(H["Thanksgiving"], 6, 3)) return "autumn";
    var mo = now.getMonth();
    return mo <= 1 || mo === 11 ? "snowfall" : mo <= 4 ? "spring" : mo <= 7 ? "waves" : "autumn";
  }
  function autoTopic(c) { return c.auto === "wx" ? weatherTopic() : seasonalTopic(); }
  function liveTopic(bg) { var id = (bg || PREFS.bg).slice(4); return id === "seasonal" ? seasonalTopic() : id === "weather" ? weatherTopic() : id; }
  setInterval(function () { if (PREFS.bg === "vid:seasonal" || PREFS.bg === "vid:weather") liveSync(); }, 3600000);   // the holiday or the weather turns over by itself
  // One clip instead of the whole set (Settings › Backgrounds › Live video › a set › a clip): PREFS.vidClip is
  // "<set>|<file name>" ("#<n>" for sets fetched before file names were kept). "" plays the whole set, a new clip every
  // minute or so (the photo speed, at least a minute). A chosen clip loops with no transition.
  function clipKey(v, i) { return v.f || "#" + i; }
  function clipName(v, i) {
    var n = v.f || "";
    if (!n && /^https:/.test(v.u || "")) { try { n = decodeURIComponent(v.u.split("/").pop()); } catch (e) { n = ""; } }
    n = n.replace(/(\.\d+p)?(\.vp9)?\.webm$/i, "").replace(/\.(webm|ogv|mp4)$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    if (!n || /^v\d+$/.test(n)) return "Clip " + (i + 1);
    if (n.length <= 46) return n;
    // One line in the list, keeping the start and the end (clips of one shoot often differ only in their last words).
    var w = n.split(" "), head = "", tail = "";
    while (w.length && (tail + " " + w[w.length - 1]).length <= 16) tail = (w.pop() + " " + tail).trim();
    while (w.length && (head + " " + w[0]).length <= 28) head = (head + " " + w.shift()).trim();
    return (head || n.slice(0, 28)).replace(/[\s,.(-]+$/, "") + " … " + (tail || n.slice(-14));
  }
  function pinnedClip(setId) {                            // the chosen clip's place in its set, or -1 (the whole set)
    var p = PREFS.vidClip || "", list = vidList(setId);
    if (!list || p.indexOf(setId + "|") !== 0) return -1;
    var k = p.slice(setId.length + 1);
    for (var i = 0; i < list.length; i++) if (clipKey(list[i], i) === k) return i;
    return -1;
  }
  function liveEvery() { return Math.max(60, +PREFS.speed || 45); }   // seconds between clips when playing a whole set
  function liveEveryText() { var s = liveEvery(); return s < 120 ? "minute" : Math.round(s / 60) + " minutes"; }
  function liveOn() { return PREFS.bg.indexOf("vid:") === 0 && !!vidList(liveTopic()); }
  function liveCanPlay() { return homeVisible && !document.hidden; }
  function liveStop() {
    nativeOff();
    liveSet = ""; vidEl.pause(); vidEl.classList.remove("on");
    vidEl.removeAttribute("src"); try { vidEl.load(); } catch (e) {}               // frees the decoder
    document.body.classList.remove("live-bg");
  }
  function liveSync() {                                   // PREFS.bg decides: a video set that has videos, or photos
    var ns = liveTopic() === "near" && load("vidset:near");
    if (ns && ns.place !== nearPlace() && nearPlace() && !vidJobs.near) deleteVid("near");   // moved: the new town's videos
    var ls = PREFS.bg.indexOf("vid:") === 0 && !SU.open && load("vidset:" + liveTopic());
    if (ls && ls.light && !vidJobs[liveTopic()] && vidCatOf(liveTopic())) downloadVid(vidCatOf(liveTopic()));   // setup's quick look: now the whole set
    if (PREFS.bg.indexOf("vid:") === 0 && !vidList(liveTopic())) {                   // no list yet (first time, a restored backup)
      var vc = vidCatOf(liveTopic());
      if (vc && !vc.local && !vidJobs[vc.id]) downloadVid(vc);
    }
    if (!liveOn()) { if (liveSet) { liveStop(); shownSet = ""; nextPhoto(); } return; }
    document.body.classList.add("live-bg");
    var want = "vid:" + liveTopic(), pin = pinnedClip(liveTopic());   // liveSet is the set actually playing ("seasonal" resolved)
    if (liveSet !== want || (pin >= 0 && liveIdx !== pin)) { liveSet = want; liveIdx = pin >= 0 ? pin : 0; liveFails = 0; livePlay(); }
    else if (liveResume) { liveResume = false; livePlay(); }          // the 4K player was let go while an app was open
    else if (!nativeOn && vidEl.paused && liveCanPlay()) vidEl.play().catch(function () {});
  }
  // A set goes back to photos only once every clip in it has failed in a row (at least 3 tries).
  function liveGiveUp() { var l = liveSet && vidList(liveSet.slice(4)); return Math.max(3, l ? l.length : 0); }
  function livePlay() {
    var list = vidList(liveSet.slice(4));
    if (!list) { liveSync(); return; }
    var v = list[liveIdx % list.length];
    vidEl.classList.remove("on");
    setTimeout(function () {                              // after the fade out, so the cut never shows
      if (!liveSet) return;
      liveStart = Date.now(); liveClip = v; vidPlayed(liveSet.slice(4));
      var four = want4k(v) && liveCanPlay();
      document.getElementById("credit").textContent = v.shared ? "Video shared from " + v.a : "Video: " + v.a + (v.l ? " · " + v.l : "") + " · " + srcName(v) + (four ? " · 4K" : "");
      // On the TV every clip plays in its own player, behind the page: Fire TV's web view won't play these WebM clips
      // (each failed at once, MEDIA_ERR_SRC_NOT_SUPPORTED-style), and the TV's player is lighter anyway.
      if (app && app.nativeVideo) {
        nativeOn = true; vidEl.pause(); vidEl.removeAttribute("src");
        liveClip.play = four ? v.u4 : v.u;
        app.nativeVideo(liveClip.play);
        liveVolSync();
        return;
      }
      if (four) { vidEl.src = v.u4; } else { nativeOff(); vidEl.src = v.u; }   // the preview has no app: 4K in the page
      if (liveCanPlay()) vidEl.play().catch(function () {});
    }, 700);
  }
  // Both players loop the clip themselves (no gap). Only if one ever stops at the end anyway, it's started again here.
  function liveNext() {
    if (nativeOn && liveClip) app.nativeVideo(liveClip.play); else { vidEl.currentTime = 0; vidEl.play().catch(function () {}); }
  }
  // A whole set moves on to its next clip on this timer (never for a chosen clip, a one-clip set, or while Settings
  // previews a set). Checked every 5 s; page timers are frozen while another app is on screen.
  setInterval(function () {
    if (!liveSet || previewing || !liveCanPlay() || Date.now() - liveStart < liveEvery() * 1000) return;
    var id = liveSet.slice(4), list = vidList(id);
    if (!list || list.length < 2 || pinnedClip(id) >= 0) return;
    liveIdx++; livePlay();
  }, 5000);
  vidEl.loop = true;
  vidEl.addEventListener("playing", function () { liveFails = 0; vidEl.classList.add("on"); });
  vidEl.addEventListener("ended", liveNext);
  // 4K: Android's player behind the page (Home.nativeVideoPlay). The page goes see-through while it plays; an error,
  // or no room for it (the Home-button overlay), plays that clip's 1080p copy in the page instead.
  var nativeOn = false, liveClip = null, liveResume = false, nativeRes = "", no4k = {};
  // A clip saved with its sound plays it quietly (Settings › Live video › Sound: on or off), and goes silent while music plays
  // in another app, Offshore's Radio or a sleep sound is on, or the home screen isn't in front (the app sees to that).
  // Only the TV's own player has sound; the page's video stays muted.
  var VID_VOL = 0.25;
  function liveVol() {
    if (!nativeOn || !liveClip || !liveClip.snd || PREFS.vidSound === "off") return 0;
    if (MUSIC.title && MUSIC.playing) return 0;
    if (typeof RD !== "undefined" && RD.now) return 0;
    if (typeof SLEEP !== "undefined" && SLEEP.on) return 0;
    return VID_VOL;
  }
  var liveVolNow = -1;
  function liveVolSync() {
    if (!app || !app.nativeVideoVolume) return;
    var v = liveVol();
    if (v !== liveVolNow) { liveVolNow = v; app.nativeVideoVolume(v); }
  }
  function nativeOff() {
    if (nativeOn && app && app.nativeVideo) app.nativeVideo("");
    nativeOn = false; document.body.classList.remove("native-vid"); document.documentElement.classList.remove("native-vid");
  }
  window.guestNativeVid = function (ev, w, h) {
    if (!nativeOn) return;
    if (ev === "playing") { liveFails = 0; nativeRes = w + "×" + h; liveVolSync(); document.body.classList.add("native-vid"); document.documentElement.classList.add("native-vid"); }
    else if (ev === "ended") liveNext();
    else {                                                // error / unavailable
      console.info("live background: TV player " + ev + " " + w + "/" + h + " for " + (liveClip && liveClip.play));
      if (liveClip && liveClip.play === liveClip.u4 && liveClip.u4) {   // 4K failed: the same clip in 1080p
        no4k[liveClip.u4] = true; liveClip.play = liveClip.u; app.nativeVideo(liveClip.u); return;
      }
      nativeOff();
      if (++liveFails >= liveGiveUp()) { liveStop(); shownSet = ""; nextPhoto(); return; }   // nothing plays: photos again
      liveIdx++; livePlay();
    }
  };
  // Settings › Backgrounds › Live video › Video quality: "1080" (the default) or "4k". 4K applies to YouTube clips
  // saved from then on (when the TV sends 4K), and to Commons clips that have a 4K original, streamed when the TV sends
  // 4K and the last speed test shows room for the clip, with margin.
  var LIVE_4K = false;     // Commons 4K streaming: off for now (the TV's video plane showed clips upside down)
  function want4k(v) {
    if (!LIVE_4K && app) return false;
    if (!v || !v.u4 || no4k[v.u4] || PREFS.vidQuality !== "4k") return false;
    if (!app) return true;
    if (!app.tvIs4k || !app.tvIs4k()) return false;
    var s = load("speedtest");
    if (!s || Date.now() - s.t > 7 * 86400000) { quickSpeed(); return false; }   // measure once; 1080p meanwhile
    return s.down >= v.mb4 * 1.6;
  }

  // ---- Speed test (Settings › Network & storage › Speed test) ------------------------------------------------
  // Open, official measurement services only: M-Lab's ndt7 (the nonprofit test Google's own speed check uses; nearest
  // server from its locate API, 10 s down then 10 s up over a WebSocket, ping from the server's TCP info), and if M-Lab
  // can't be reached, Cloudflare's public speed endpoints. Runs only when asked (it uses data), except one quick 10 MB
  // check the first time 4K Auto needs to know. The last result is kept ("speedtest") for 4K Auto and the Settings row.
  var SPD = { running: false, phase: "", live: 0 }, spdDrawAt = 0;
  function speedDraw() {
    if (!custOpen || custMode !== "speed" || Date.now() - spdDrawAt < 300) return;
    spdDrawAt = Date.now(); renderCustom();
  }
  function ndt7(url, up) {
    return new Promise(function (res, rej) {
      var ws = new WebSocket(url, "net.measurementlab.ndt.v7"), t0 = 0, n = 0, rtt = null, done = false, chunk = new Uint8Array(8192);
      ws.binaryType = "arraybuffer";
      function rate() { var s = (performance.now() - t0) / 1000; return s > 0 ? (up ? n - ws.bufferedAmount : n) * 8 / s / 1e6 : 0; }
      function finish() { if (done) return; done = true; var r = rate(); try { ws.close(); } catch (e) {} res({ mbps: r, rtt: rtt }); }
      function pump() {                                   // upload: keep a few chunks queued, growing them as it speeds up
        if (done) return;
        if (performance.now() - t0 > 10000) { finish(); return; }
        while (ws.bufferedAmount < 7 * chunk.length) { ws.send(chunk); n += chunk.length; }
        if (chunk.length < (1 << 20) && n >= 16 * chunk.length) chunk = new Uint8Array(chunk.length * 2);
        SPD.live = rate(); speedDraw();
        setTimeout(pump, 10);
      }
      ws.onopen = function () { t0 = performance.now(); if (up) pump(); else setTimeout(finish, 10000); };
      ws.onmessage = function (e) {
        if (typeof e.data === "string") {
          try { var m = JSON.parse(e.data); if (m.TCPInfo && m.TCPInfo.MinRTT) rtt = m.TCPInfo.MinRTT / 1000; } catch (x) {}
          if (!up) n += e.data.length;
        } else if (!up) n += e.data.byteLength;
        if (!up) { SPD.live = rate(); speedDraw(); }
      };
      ws.onerror = function () { if (!done) { done = true; rej(new Error("M-Lab")); } };
      ws.onclose = function () { if (t0) finish(); };
    });
  }
  function mlabTest(out) {
    return fetch("https://locate.measurementlab.net/v2/nearest/ndt/ndt7").then(function (r) { return r.json(); }).then(function (j) {
      var s = j.results && j.results[0];
      if (!s) throw new Error("no M-Lab server");
      SPD.phase = "Download"; SPD.live = 0;
      return ndt7(s.urls["wss:///ndt/v7/download"], false).then(function (d) {
        out.down = d.mbps; out.ping = d.rtt;
        SPD.phase = "Upload"; SPD.live = 0;
        return ndt7(s.urls["wss:///ndt/v7/upload"], true);
      }).then(function (u) {
        out.up = u.mbps; if (out.ping == null) out.ping = u.rtt;
        out.via = "M-Lab" + (s.location && s.location.city ? " · " + s.location.city : "");
      });
    });
  }
  function cfDown(bytes) {                                // Cloudflare: one download, timed as it streams in
    var t0 = performance.now();
    return fetch("https://speed.cloudflare.com/__down?bytes=" + bytes, { cache: "no-store" }).then(function (r) {
      var rd = r.body.getReader(), got = 0;
      function more() {
        return rd.read().then(function (x) {
          if (x.done) return got * 8 / ((performance.now() - t0) / 1000) / 1e6;
          got += x.value.length; SPD.live = got * 8 / ((performance.now() - t0) / 1000) / 1e6; speedDraw();
          return more();
        });
      }
      return more();
    });
  }
  function cloudflareTest(out) {
    var pings = [];
    var ping = function () { var t = performance.now(); return fetch("https://speed.cloudflare.com/__down?bytes=0", { cache: "no-store" }).then(function (r) { return r.arrayBuffer(); }).then(function () { pings.push(performance.now() - t); }); };
    SPD.phase = "Download"; SPD.live = 0;
    return ping().then(ping).then(ping).then(function () {
      out.ping = Math.min.apply(null, pings);
      return cfDown(25e6);
    }).then(function (d) {
      out.down = d; SPD.phase = "Upload"; SPD.live = 0;
      var t1 = performance.now();
      return fetch("https://speed.cloudflare.com/__up", { method: "POST", body: new Uint8Array(10e6) }).then(function () {
        out.up = 80 / ((performance.now() - t1) / 1000); out.via = "Cloudflare";
      });
    });
  }
  function runSpeed() {
    if (SPD.running) return;
    var out = {};
    SPD.running = true; SPD.phase = "Connecting"; SPD.live = 0; speedDraw();
    var tick = setInterval(function () { spdDrawAt = 0; speedDraw(); }, 300);   // the bar moves even between readings
    mlabTest(out).catch(function () { out = {}; return cloudflareTest(out); }).then(function () {
      out.t = Date.now();
      save("speedtest", out);
      toast("Speed test: " + Math.round(out.down) + " Mbps down, " + Math.round(out.up) + " up");
    }).catch(function () { toast("Couldn't run the speed test. Check the internet connection."); })
      .then(function () { clearInterval(tick); SPD.running = false; spdDrawAt = 0; speedDraw(); });
  }
  var quickAt = 0;
  function quickSpeed() {                                 // 4K Auto's one quick check (10 MB, Cloudflare), at most daily
    if (SPD.running || Date.now() - quickAt < 86400000) return;
    quickAt = Date.now();
    cfDown(10e6).then(function (d) { var s = load("speedtest"); if (!s || Date.now() - s.t > 7 * 86400000) save("speedtest", { down: d, t: Date.now(), via: "Cloudflare (quick check)" }); }, function () {});
  }
  function speedVerdict(d) {
    return d >= 60 ? "Great: room for 4K live backgrounds and 4K streaming" : d >= 25 ? "Good: 4K streaming in most apps"
         : d >= 10 ? "Fine for HD streaming" : "Slow: HD may buffer. A cable, or the router closer to the TV, helps";
  }
  function ago2(t) { var m = Math.round((Date.now() - t) / 60000); return m < 2 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; }
  // The card: while testing, one big live number with the phase and a 10-second bar; after, three tiles (download,
  // upload, ping), a coloured verdict and who measured it; one button. Numbers are ours; the server's city is escaped.
  function speedCard() {
    var s = load("speedtest"), el = document.createElement("div"), h = "";
    el.className = "spd";
    if (SPD.phase !== SPD.lastPhase) { SPD.lastPhase = SPD.phase; SPD.phaseAt = Date.now(); }
    if (SPD.running) {
      var pct = SPD.phase === "Connecting" ? 0 : Math.min(100, (Date.now() - SPD.phaseAt) / 100);
      h = '<div class="spd-live"><div class="spd-k">' + (SPD.phase === "Connecting" ? "Finding the nearest server" : SPD.phase) + "</div>" +
          '<div class="spd-big">' + (SPD.live ? Math.round(SPD.live) : "–") + "<small> Mbps</small></div>" +
          '<div class="spd-bar"><i style="width:' + pct + '%"></i></div></div>';
    } else if (s) {
      var col = s.down >= 60 ? "#30d158" : s.down >= 25 ? "#64d2ff" : s.down >= 10 ? "#ffd60a" : "#ff9f0a";
      h = '<div class="spd-tiles"><div class="spd-t"><span>Download</span><b>' + Math.round(s.down) + "</b><small>Mbps</small></div>" +
          '<div class="spd-t"><span>Upload</span><b>' + (s.up != null ? Math.round(s.up) : "–") + "</b><small>Mbps</small></div>" +
          '<div class="spd-t"><span>Ping</span><b>' + (s.ping != null ? Math.round(s.ping) : "–") + "</b><small>ms</small></div></div>" +
          '<div class="spd-verdict"><i style="background:' + col + '"></i>' + speedVerdict(s.down) + "</div>" +
          '<div class="spd-via">Measured by ' + esc(s.via || "") + " · " + ago2(s.t) + "</div>";
    } else {
      h = '<div class="spd-empty"><b>How fast is this TV\'s internet?</b><span>About 20 seconds. Fast connections use around 100 MB or more.</span></div>';
    }
    h += '<div class="spd-acts">' + (SPD.running ? "" : '<div class="sbtn glass focus">' + (s ? "Run it again" : "Run speed test") + "</div>") + "</div>" +
         '<div class="spd-note">Open test servers only: M-Lab (measurementlab.net), or Cloudflare if M-Lab can\'t be reached</div>';
    el.innerHTML = h;
    return el;
  }
  function speedRows() {
    var s = load("speedtest"), rows = [];
    if (SPD.running) {
      rows.push({ label: SPD.phase === "Connecting" ? "Finding the nearest test server…" : SPD.phase + " · measuring", value: SPD.live ? Math.round(SPD.live) + " Mbps" : "…", act: true, none: true });
    } else if (s) {
      rows.push({ label: "Download", value: Math.round(s.down) + " Mbps", act: true, none: true });
      if (s.up != null) rows.push({ label: "Upload", value: Math.round(s.up) + " Mbps", act: true, none: true });
      if (s.ping != null) rows.push({ label: "Ping", value: Math.round(s.ping) + " ms", act: true, none: true });
      rows.push({ label: speedVerdict(s.down), act: true, none: true });
      rows.push({ label: "Measured by " + s.via + " · " + ago2(s.t), act: true, none: true });
    } else rows.push({ label: "No test yet. It takes about 20 seconds and uses around 100 MB or more on fast connections.", act: true, none: true });
    rows.splice(0, 0, { label: SPD.running ? "Testing…" : s ? "Run it again" : "Run speed test", value: SPD.running ? "" : "›", act: true, id: "run" });
    rows.push({ label: "Open services only: M-Lab (measurementlab.net), or Cloudflare if M-Lab can't be reached", act: true, none: true });
    return rows;
  }
  vidEl.addEventListener("error", function () {
    if (!liveSet || !vidEl.getAttribute("src")) return;
    console.info("live background: page player error " + (vidEl.error ? vidEl.error.code + " " + (vidEl.error.message || "") : "?"));
    if (++liveFails >= liveGiveUp()) { console.info("live background: clips won't play, back to photos"); liveStop(); shownSet = ""; nextPhoto(); return; }
    liveIdx++; livePlay();
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) vidEl.pause(); else if (liveSet && liveCanPlay()) vidEl.play().catch(function () {}); });

