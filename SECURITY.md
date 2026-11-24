# Security

Please report security problems privately (contact details to come when the repository is public) rather than in a
public issue.

## How the app is built to be safe

- The interface is a local page in a WebView that never navigates anywhere else; the Java bridge it talks to is only
  reachable from that page. Text from the internet is inserted as text, never as markup.
- Every host the app contacts is on a fixed list in the code. Updates come only from official sources and stable
  releases (see Settings > Updates & about).
- Receiving from phones (LocalSend) is encrypted, uses a key that never leaves the TV's keystore, needs approval on the
  TV for every transfer, refuses app installers and scripts, and only answers on the home network.
- The NAS password is encrypted with a key in the Android keystore. NFS shares are read-only for the TV.
- The smart home webhook is off unless turned on, and needs a token.
- Powerful permissions (developer access switch, music access, location for Bluetooth/Wi-Fi scanning) are never granted
  automatically; the person who owns the TV grants them.
- Bluetooth is never switched off and the Fire TV remote can't be unpaired from inside the app.
- "Add a calendar from your phone" serves a one-page form only while that screen is open (at most 10 minutes), only to
  devices on the home network, behind a fresh 4-digit code (five wrong tries end it), and accepts links from known
  calendar services only. Calendar links and other settings are kept on the TV.
- Files (0.10) only reads and changes files inside its places (the TV's shared storage, USB drives, files from
  phones, the network folder), checked on the real path, so ".." and links can't reach the app's private files.
  Renaming, deleting, copying and moving need a real press of OK, and deleting always asks first. Another app gets a
  file only when you open it, read-only, one file at a time, through a provider other apps can't call on their own.
  App installers are never opened. Reading the TV's storage needs Android's storage permission, asked with its own
  prompt.
- Radio (0.17) plays one station at a time: https first (an http link is tried over https), never an address on the
  TV or the home network, no name or password in the link. Station names and tags from the directory are shown as text
  only, and logos load as images from https only. A station that only streams unencrypted (owner's choice) is fetched
  by the app's RadioRelay and passed on at http://127.0.0.1:port/random-token: loopback only, one station at a time,
  the address checked again after the name is looked up (no TV or home-network address), at most 5 redirects. The
  app's network security config allows cleartext to 127.0.0.1 only; everything else stays https-only.
- Plex link (0.17): Plex's own code sign-in (plex.tv/link), so the password never touches the TV. The token Plex
  returns is kept in the app's private storage (backups off) and is never given to the page; only titles, progress
  and small pictures are. Requests go to plex.tv and the account's own servers over HTTPS only, without following
  redirects. Linking, unlinking and opening need a real OK press. Unlink forgets it on the TV; plex.tv › Authorized
  devices removes it from the account.
- Fox One show names (0.17, off by default): when turned on (needs a real OK press), the accessibility service
  reads text from Fox One's window every 30 s while Fox One is in front, keeps only the first line that looks like a
  show's name, and uses it on the Keep watching card. No other app's screen is read and nothing is logged. To show
  which channel it's on, that show name (only) is looked up once on TVmaze (api.tvmaze.com, HTTPS) and the answer is
  kept on the TV.
- Keep watching (0.17): reads what video apps report as playing (title, picture, position) through the same media
  session access as the Music card; it's kept in the page's own storage on the TV and never sent anywhere. An app's
  https picture link is loaded as an image only.
- Your cards (0.17): a web link card opens in the TV's browser only right after a real OK press, http(s) and a public
  host only. Your own tile pictures are files already on the TV, shown as images; nothing is downloaded.
- Downloads run on a small fixed pool, are size-capped (a cut-off download counts as failed) and only go to the hosts
  listed in the code.

## Security review (November 2026, version 0.6)

A full read of the page (every place text becomes markup) and of the Android side (the bridge, the three network
listeners, the manifest, downloads). No way for outside text to run as code was found. What changed:

- The page carries a Content-Security-Policy: no inline event handlers, plugins, frames, forms or `<base>`. A planted
  `onerror=` is blocked even if markup ever slipped in.
- Values from outside never pick a colour, icon or image unchecked (calendar colours must be `#hex`, notice icons and
  levels must be known names, notice images must be `https:`/`data:`). A restored backup only brings back valid,
  non-cache keys.
- Turning developer access (ADB) on, closing apps and turning the webhook on only work right after a real press of OK
  on the remote; a script can't press keys.
- A saved NAS password is dropped when the host, share, user or domain changes, so it can't be sent to another server.
- Webhook: home network only, a whole-request time limit, and a minute's pause after 10 wrong tokens.
- LocalSend: at most 16 connections at once, 64 headers, a 30 s read limit, discovery answers rate-limited, and an
  upload can't be larger than the size accepted on the TV.
- ntfy lines are capped; downloads that redirect off the allowed site are refused.
- Scanned with ClamAV 1.5.4 (3.6 million signatures): 0 detections, most recently offshore-0.11.apk
  (sha256 40cb2baa08b6a2f4a1ec57f3dbc8cd910f064803e486a328cd1152885101a91a).
- 0.11 adds ConfigDrop, a provider a computer uses to give the TV its tv.json on Fire OS 8 (where adb can't write the
  app's folder). It accepts only three file names and is guarded by android.permission.DUMP, which only the adb shell
  and the system hold, so other apps can't write through it.
- VirusTotal (offshore-0.6.apk, sha256 748fdad7bc3b4b4e50e00d6c992d44aa28cb15b3b51721e7466b0dd5c0c82dfd): 1 of 66.
  K7GW reports a generic "Trojan (0058e91d1)". The same vendor's K7AntiVirus engine, and the other 64 engines, find
  nothing, including Kaspersky, ESET, Bitdefender, Avast, Google and ClamAV. Generic labels like this are typical for new,
  self-signed apps that use an accessibility service and draw over other apps, which the Home button needs. Treated as a
  false positive; to be reported to K7.

- 0.14 keeps the Home button switched on once the owner has set it up: if it drops out of the TV's accessibility
  list, the app adds back its own entry only (other services are left alone), and only while it holds
  WRITE_SECURE_SETTINGS, which the owner grants with setup_tv.ps1 and which `-Undo` revokes first, so the owner can
  always turn it off. The new `Startup` receiver only reacts to BOOT_COMPLETED and MY_PACKAGE_REPLACED, which only
  the system can send.
- 0.15 Tidy up Fire TV: the app itself never switches other apps off (Fire OS doesn't allow it). It only saves the
  owner's choice (`tidy.json`, catalog packages only) and setup_tv.ps1, run by the owner from a computer, applies it with
  `pm disable-user` / `pm enable`. The script acts only on packages listed in `launcher/web/debloat.json`, refuses any
  matching its "never" list (Prime Video, the launcher, Settings, keyboard, remotes, Alexa, HDMI-CEC, Appstore, system
  updates, accounts, DRM, `android.*`), and never uninstalls. What it switched off is kept on the TV
  (`tidy_done.json`) so `-Undo` switches exactly those back on and nothing else. ConfigDrop now also accepts
  `tidy.json` and `tidy_done.json` (still DUMP-guarded: only adb and the system). The Amazon screensaver switch
  writes one secure setting (`screensaver_enabled`) and needs the owner-granted WRITE_SECURE_SETTINGS.

- 0.16 Live TV: only playlists the owner adds from their phone (the calendar form in playlist mode: home network only,
  4-digit code, 10 minutes, http(s) only, a "right to watch" box that must be ticked). Playlist links and stream
  addresses often hold the provider's username and password, so they're kept in the app's private storage
  (`livetv.json`, `livetv-<id>.json` in getFilesDir), never in the page, never in the settings backup on shared storage,
  never sent anywhere but the playlist's own server. The page gets channel names and groups only and plays by playlist
  and position; VLC gets the one stream address. Downloads are capped (30 MB, 20,000 channels), on a low-priority
  thread. No logos are fetched (monograms instead), so the page never loads images from playlist servers.
  The programme guide comes only from the owner's provider (the playlist's own guide link, or one they add from their
  phone), is read in Java like the playlist (http/https, 800 MB uncompressed at most, streamed, gzip allowed) and kept in
  private storage; the page only receives programme titles, times and short descriptions for the channels on screen.
  The Local group adds one host to the fixed list: `transition.fcc.gov` (the FCC's public TV station search, by the
  TV's location rounded to the second; only station call signs and cities come back, and only those are kept).

## Security review (24 November 2026, version 0.17)

A second full pass after 0.6: the manifest and everything other apps can reach, all 113 page bridge methods, the
four network listeners (phone sharing, calendar/playlist form, alerts webhook, radio relay), the updater, and every
place the page turns text into markup. Nothing let outside text run as code. Fixed:
- The page's text escaping (`esc`) now escapes quotes as well, so text inside an attribute can't break out of it. One
  place needed it: a radio station's logo address from the public station list (Radio Browser), which anyone can edit.
- The page policy now also refuses any script that isn't part of the page itself (`script-src 'unsafe-inline'`, no
  sources), on top of no inline event handlers, frames or plugins.
- The settings backup on shared storage no longer carries what you watched or listened to (Keep watching history,
  Plex's Continue watching, recent radio stations) or caches that refill by themselves.
- The radio relay also refuses IPv6 home addresses (fc00::/7), the carrier-shared range 100.64.0.0/10, 0.0.0.0/8 and
  IPv4 addresses written as IPv6, so a station's name can't point it into the home network.
- Fox One channel lookups: offline failures aren't remembered, the list is capped, and turning Fox One show names off
  forgets every show name it read.
Checked and fine as they are: no exported part of the app takes commands from other apps (the config drop needs adb's
DUMP permission; the boot receiver only hears system broadcasts); the WebView only ever shows the app's own page, with
no file access for scripts and no mixed content; risky bridge calls (updates, developer access, linking accounts,
opening links, renaming or deleting files, closing apps) need a real OK press on the remote; uninstalling goes through
Fire OS's own confirmation; updates must come from the update site over https, match its sha256 and carry the same
signing key; the listeners are off until turned on, home network only, behind a code or token with limits on tries.

## Known limits

- The backup (`backup.json`) sits in the app's folder on shared storage so it survives a reinstall. On Android 9 other
  apps with storage permission can read it, and it includes your calendar links. Restores are validated, but don't
  install untrusted apps with storage access if your calendar links are private. (Since 0.17 it leaves out viewing
  and listening history; the Settings PIN is in it, which is one more reason it isn't a lock.)
- Release signing: build your own key, keep it out of the repository and synced folders, and use a strong password.

- The Settings PIN keeps guests out of the settings; it isn't encryption.
- Netty 3 (used only for NFS) is end-of-life. Replacing it, or making NFS optional, is planned before a 1.0.
- The Home-button feature relies on an accessibility service, which is powerful by nature. It only watches for the
  Amazon home screen and opens Offshore.
