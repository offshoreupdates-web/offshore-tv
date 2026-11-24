  // ---- Live TV categories, like cable. Every channel lands in one category, decided by the strongest signal it has:
  //   1. Local: a TV station near this TV (FCC list, see ltLocalMatch). Only that: a playlist's "Locals" group is often
  //      stations from other cities ("New York 1 News" isn't local in Pennsylvania).
  //   2. the channel itself: well-known channel names (ESPN, HBO, Nickelodeon, HGTV, Univision ...)
  //   3. the playlist's group ("US | Sports", "Kids", "Latino" ...)
  //   4. the guide: the category most of its upcoming shows have ("Sports event", "Movie", "Children" ...)
  //   5. words in its name ("... News", "... Movies")
  // and gets a cable-style number: Local from 2, then a block per category (News 100s, Sports 200s ...; blocks of 1,000
  // when a category has more than 98 channels). Only names are matched: nothing is added to the user's playlist.
  var LT_CATS = [
    { id: "local", name: "Local", icon: "⌂" }, { id: "news", name: "News", icon: "◉" }, { id: "sports", name: "Sports", icon: "◆" },
    { id: "ent", name: "Entertainment", icon: "✦" }, { id: "movies", name: "Movies", icon: "▶" }, { id: "kids", name: "Cartoons & Kids", icon: "☺" },
    { id: "music", name: "Music", icon: "♪" }, { id: "docs", name: "Documentary", icon: "◐" }, { id: "life", name: "Lifestyle", icon: "❖" },
    { id: "spanish", name: "Spanish", icon: "ñ" }, { id: "faith", name: "Faith", icon: "✚" }, { id: "shop", name: "Shopping", icon: "◇" },
    { id: "other", name: "More channels", icon: "…" }
  ];
  function ltCatOf(id) { return LT_CATS.filter(function (k) { return k.id === id; })[0] || LT_CATS[LT_CATS.length - 1]; }
  // 2. Channel names (US cable and broadcast networks), checked in this order: Spanish-language first, then the
  // specific ones (news, sports, kids, movies ...) before the general networks.
  var LT_BRANDS = [
    ["spanish", /\b(univision|unim[aá]s|telemundo|galavisi[oó]n|estrella tv|azteca|tudn|en espa[nñ]ol|deportes|cine ?latino|pasiones|universo|v-?me|wapa|nuestra tele)\b/],
    ["news", /\b(cnn|hln|fox news|fox business|fox weather|livenow|msnbc|ms now|cnbc|bloomberg|newsnation|newsmax|abc news|cbs news|nbc news|c-?span|weather channel|scripps news|court tv|cheddar|newsy|reuters|pbs news|bbc news|bbc world|sky news|al jazeera|france 24|euronews|cgtn|nhk world|i24)\b/],
    ["sports", /\b(espn\w*|sec network|acc network|big ten|btn|pac-?12|fs1|fs2|fox sports|nfl|nba|mlb|nhl|golf|tennis|cbs sports|bein|bally|fanduel sports|nbc sports|masn|yes network|sny|nesn|marquee|altitude|root sports|spectrum sportsnet|stadium|olympic|outdoor channel|sportsman|dazn|tnt sports|willow|motortrend|redzone|wwe|ufc|pga|nascar|sportsnet|tsn|sky sports|eurosport)\b/],
    ["kids", /\b(disney(?!\s*\+)|nick ?jr|nicktoons|teennick|nickelodeon|nick(?! at nite)|cartoon network|cartoonito|boomerang|pbs kids|universal kids|baby ?tv|discovery family|duck ?tv)\b/],
    ["movies", /\b(hbo|cinemax|showtime|starz|encore|mgm\+?|epix|the movie channel|tcm|turner classic|fxm|fx movie|sundance|ifc|lmn|lifetime movies|hallmark movies|flix|movieplex|sony movies|amc)\b/],
    ["music", /\b(mtv\d?|vh1|cmt|bet jams|bet soul|revolt|axs|music choice|stingray|vevo|fuse)\b/],
    ["docs", /\b(discovery|science channel|nat ?geo|national geographic|history|smithsonian|animal planet|american heroes|destination america|curiosity|love nature|magellan)\b/],
    ["life", /\b(hgtv|food network|cooking channel|travel channel|tlc|bravo|lifetime|own network|oprah|magnolia|diy network|we ?tv|oxygen|tastemade|fyi)\b/],
    ["faith", /\b(ewtn|tbn|daystar|cbn|hillsong|god ?tv|3abn|word network|inspiration|insp|byutv)\b/],
    ["shop", /\b(qvc|hsn|shop ?hq|jewelry ?tv|shop ?lc)\b/],
    ["ent", /\b(abc|cbs|nbc|fox|the cw|cw|pbs|ion|mynetwork|a ?& ?e|bbc america|bet|comedy central|fxx?|freeform|paramount network|pop tv|syfy|tbs|tnt|trutv|usa network|reelz|gsn|logo|tv land|nick at nite|hallmark|ovation|comet|charge|metv|antenna tv|cozi|laff|grit|bounce|start ?tv|decades|get ?tv|up ?tv|heroes ?(&|and) ?icons)\b|(^|\s)e!(\s|$)/]
  ];
  // 3. and 5. Words in a playlist group or a channel name.
  var LT_WORDS = [
    ["spanish", /\b(latino|latin|latinos|spanish|espa[nñ]ol|hispan\w*)\b/],
    ["news", /\bnews\b/],
    ["sports", /\b(sports?|football|soccer|nfl|nba|mlb|nhl|ncaa|ufc|boxing|wwe|racing|golf|tennis|ppv|events?)\b/],
    ["kids", /\b(kids?|children|cartoons?|toons?|junior|animation|family)\b/],
    ["movies", /\b(movies?|cinema|films?)\b/],
    ["music", /\b(music|concerts?|hits)\b/],
    ["docs", /\b(documentar\w*|docs?|nature|science|history|educational)\b/],
    ["life", /\b(lifestyle|food|cooking|home|travel|reality)\b/],
    ["faith", /\b(religio\w*|faith|christian|gospel|church)\b/],
    ["shop", /\bshop\w*\b/],
    ["ent", /\b(entertainment|general|variety|series|comedy|drama|classic tv)\b/]
  ];
  // 4. The guide's programme categories (XMLTV), as most of a channel's shows have them.
  var LT_GUIDE_CATS = [
    ["sports", /sport|football|basketball|baseball|hockey|soccer|golf|tennis|boxing|wrestling|racing|mma|olympic/],
    ["news", /news|weather|public affairs|business|politic/],
    ["movies", /movie|film|feature/],
    ["kids", /child|kids|animat|cartoon/],
    ["music", /music|concert/],
    ["docs", /documentar|nature|science|history|biograph|animal/],
    ["life", /cooking|food|home|travel|reality|lifestyle|fashion|garden|house/],
    ["faith", /religio/],
    ["shop", /shopping|consumer/],
    ["ent", /drama|comedy|sitcom|talk|game show|series|entertainment|crime|soap|variety/]
  ];
  function ltFirst(list, text) { for (var i = 0; i < list.length; i++) if (list[i][1].test(text)) return list[i][0]; return ""; }
  function ltCategorize(c, guideCat) {
    if (c.local) return "local";
    var name = c.n.toLowerCase(), grp = (c.g || "").toLowerCase();
    return ltFirst(LT_BRANDS, name) || ltFirst(LT_WORDS, grp) || (guideCat ? ltFirst(LT_GUIDE_CATS, guideCat) : "") || ltFirst(LT_WORDS, name) || "other";
  }
  // Countries for channels a playlist doesn't mark: well-known broadcasters elsewhere (so a US TV can leave them out).
  var LT_FOREIGN = [
    ["GB", /\b(bbc (one|two|three|four|alba|scotland|wales)|itv\d?|itvbe|channel 4|e4|more4|film4|channel 5|sky (one|atlantic|cinema|max|showcase|witness|comedy|arts|crime)|u ?& ?dave|dave|alibi|gb news|sky news|sky sports|bt sport|tnt sports uk|premier sports|talk ?tv)\b/],
    ["CA", /\b(cbc|ctv|global tv|citytv|tva|crave|super ?channel|w network|yes tv|tsn ?\d?|sportsnet|rds|ytv|teletoon)\b/],
    ["DE", /\b(das erste|ard|zdf|rtl(?! ?\+)|sat\.? ?1|pro ?7|prosieben|vox|kabel ?eins|n-tv)\b/],
    ["FR", /\b(tf1|france [2345]|m6|canal\+|bfm|tmc france|c8|w9)\b/],
    ["IT", /\b(rai ?\d|rai (news|sport)|canale 5|italia ?1|rete ?4)\b/],
    ["ES", /\b(tve|la 1|antena 3|cuatro|telecinco|la ?sexta|movistar)\b/],
    ["IN", /\b(star plus|zee tv|zee cinema|sony sab|colors tv|aaj tak|ndtv|star bharat)\b/],
    ["MX", /\b(las estrellas|canal de las estrellas|tv azteca|imagen tv)\b/]
  ];
  function ltForeign(c) { return ltFirst(LT_FOREIGN, c.n.toLowerCase()); }
  function ltLooksUs(c) { return !!(c.local || ltFirst(LT_BRANDS, c.n.toLowerCase())); }
