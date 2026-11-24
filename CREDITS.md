# Credits

## Photos

The background photos come from Wikimedia Commons and are used under the licences listed, one line per photo, in
[launcher/web/img/CREDITS.txt](launcher/web/img/CREDITS.txt). They were downscaled, cropped to 1920x1080 and darkened
at the edges for readability (`tools/make_backgrounds.ps1`). Photos downloaded inside the app show their author and
licence on screen.

Backgrounds downloaded inside the app (Settings > Backgrounds) come from free sources, each credited on screen with its
author and licence:

| Source | What | Terms |
|---|---|---|
| Wikimedia Commons | photos and live videos | free licences (CC BY, CC BY-SA, CC0, public domain), shown per item |
| NASA Image and Video Library | photos and live videos (space, Earth from orbit, the Sun) | public domain (US government) |
| The Metropolitan Museum of Art (Open Access) | paintings | public domain (CC0) |
| Art Institute of Chicago (public API) | paintings and prints | public domain (CC0) |
| Library of Congress (Photochrom collection) | colour photos from around 1900 | no known restrictions |

## Sounds

The built-in interface and notification sounds were synthesized for this project (`tools/make_sounds.ps1`); no samples
are used. Sounds a user picks from Wikimedia Commons are credited in Settings > Music & sound > Your sounds.

## Libraries

Bundled into the app (downloaded by `tools/setup_toolchain.ps1`, see `tools/libs/README.txt`):

| Library | Used for | Licence |
|---|---|---|
| smbj 0.14.0 | SMB network folders | Apache 2.0 |
| asn-one 0.6.0 | used by smbj | Apache 2.0 |
| MBassador 1.3.2 | used by smbj | MIT |
| Bouncy Castle (bcprov) 1.80 | SMB sign-in, encryption | MIT-style (Bouncy Castle licence) |
| nfs-client 1.1.0 | NFS network folders | Apache 2.0 |
| Netty 3.10.6 | used by nfs-client | Apache 2.0 |
| Apache Commons Lang 3.12.0 | used by nfs-client | Apache 2.0 |
| SLF4J API 1.7.36 | logging interface | MIT |

## Data

- National Weather Service (forecast, alerts, place names), NOAA CO-OPS (tides, water temperature), NOAA NDBC (waves),
  US EPA (UV index): US government sources.
- US Census Bureau ZIP code centroids (`launcher/web/zips.txt`).
- MLB Stats API and the NHL API (official); ESPN's public scoreboard for other leagues (labelled in the app).
- Album covers: Apple's iTunes Search API (optional, can be turned off).
- Screensaver: crypto prices from Coinbase's public market data; stock and fund quotes from Nasdaq (S&P 500 and the
  Dow through the SPY and DIA funds). Each can be turned off.
- News (each source can be turned off): local news from Google News' local section for the TV's location; NPR, PBS
  NewsHour and BBC News (national and world); the White House, the Department of War, the FBI and the Justice
  Department (their own feeds); CISA, Krebs on Security, BleepingComputer, The Hacker News, The Record and
  SecurityWeek; Ars Technica, The Verge and Wired; NASA. Headlines are shown with their source and link nowhere else.
- Air quality: the US EPA's AirNow program (reporting-area data from files.airnowtech.org).
- Calendars: read from each person's own calendar service through its iCal link; holidays are worked out on the TV.
- Sleep sounds: the built-in ones are generated on the TV; sounds found online come from Wikimedia Commons, credited in
  Customize > Music & sound > Sleep sounds.
- Location guess before a ZIP is set: ipwho.is (labelled "estimated").

## Protocols

Receiving from phones uses the open [LocalSend](https://github.com/localsend/protocol) protocol (v2).

## Works with

Live TV streams can play in [VLC for Android](https://www.videolan.org/vlc/download-android.html) (VideoLAN, GPLv2+),
installed separately. Offshore only opens it; nothing from VLC is bundled.
