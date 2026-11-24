# Security

## Reporting a problem

Please report security problems privately through this repository's **Security** tab (**Report a vulnerability**),
not in a public issue. Include the version (Settings › Updates & about) and the steps to reproduce. You'll get a reply
within a week.

Only the latest release gets security fixes.

## Release integrity

- Releases are signed with the project's key, which is never stored in this repository or in a synced folder.
- The app updates only from its release feed over HTTPS. A download installs only if its SHA-256 matches the feed,
  it's signed with the same key as the installed app, and its version is newer. Android checks the signature again,
  and a person has to press Install on the TV.
- Builds use libraries from Maven Central, each checked against its published hash (`tools/setup_toolchain.ps1`).

## The interface

- The interface is one local page in a WebView. It never navigates elsewhere, scripts have no file access, and mixed
  content is blocked.
- A Content-Security-Policy allows only the page's own script: no outside scripts, inline event handlers, frames,
  plugins, forms or `<base>`.
- Text from the internet is inserted as text, never as markup. Where it has to go into an attribute, quotes are
  escaped too. Colours, icons and image addresses from outside are checked against an allowed form before use.
- Bridge calls that change something important (installing updates, developer access, linking accounts, opening
  links, renaming or deleting files, closing apps) only work right after a real OK press on the remote.

## Network

- Web requests go over HTTPS to the services listed in the code and in [CREDITS.md](CREDITS.md), plus the calendars,
  playlists and network folders the user adds. Background photos and videos come only from `upload.wikimedia.org`,
  `images-assets.nasa.gov`, `images.metmuseum.org`, `www.artic.edu` and `tile.loc.gov`.
- Downloads are size-capped, run on a small fixed pool, and are refused if they redirect off the allowed host.
- Cleartext is allowed only to `127.0.0.1`. Radio stations that only stream over HTTP are fetched by `RadioRelay` and
  passed on at `http://127.0.0.1:<port>/<random token>`: one station at a time, at most 5 redirects, and never to an
  address on the TV or the home network (private IPv4 and IPv6 ranges, `100.64.0.0/10`, `0.0.0.0/8` and IPv4-mapped
  addresses are refused after the name is resolved).

### Listeners

Each runs only while needed. The first three answer on the home network only; the relay answers on the TV itself.

| Listener | Purpose | Protection |
|---|---|---|
| LocalSend | receive files from phones | TLS with a key in the Android keystore, approval on the TV for every transfer, no app installers or scripts, 16 connections, size limits |
| Phone form | add a calendar or Live TV playlist | open only while its screen is shown (10 minutes max), fresh 4-digit code, five wrong tries end it, known calendar services only |
| Webhook | smart-home alerts | token required, whole-request time limit, one-minute pause after 10 wrong tokens |
| Radio relay | unencrypted radio | loopback only, random token per station |

## Accounts and stored data

- **Plex**: linked with Plex's code sign-in (plex.tv/link), so the password never touches the TV. The token is kept in
  the app's private storage, never given to the page, and used only over HTTPS without following redirects.
- **Live TV**: playlist and guide links often contain the provider's username and password, so they're kept in the
  app's private storage, never in the page or the backup, and sent only to the playlist's own server. The page gets
  channel names and programme titles only.
- **Network folder**: the password is encrypted with a key in the Android keystore and dropped if the host, share or
  user changes. NFS shares are read-only.
- **Keep watching** reads what video apps report as playing (title, picture, position) and keeps it on the TV.
- **Fox One show names** (off by default): when turned on, the accessibility service reads Fox One's window every
  30 seconds while it's in front and keeps one line that looks like a show name. The name alone is looked up on
  TVmaze to show the channel. Turning it off forgets every name it read.

## Permissions

- Permissions that change security settings (developer access, music access, app usage, the Home button) are never
  granted automatically. The user grants them from a computer with `tools/setup_tv.ps1`, which `-Undo` reverses.
- The Home button uses an accessibility service. It only watches for the Amazon home screen and opens Offshore. If
  Fire OS drops it, the app re-adds its own entry only, and only while the user-granted `WRITE_SECURE_SETTINGS` holds.
- `ConfigDrop`, which lets a computer give the TV its config on Fire OS 8, is guarded by `android.permission.DUMP`
  (held only by adb and the system) and accepts three file names.
- Tidy up Fire TV never switches apps off itself. It saves the user's choice; `setup_tv.ps1` applies it, only for
  packages in `launcher/web/debloat.json`, never for its protected list, and never uninstalls.
- Uninstalling an app goes through Fire OS's own confirmation. Bluetooth can't be switched off and the remote can't be
  unpaired from inside the app.

## Known limits

- The settings backup (`backup.json`) is on shared storage so it survives a reinstall. On Android 9, other apps with
  storage permission can read it, and it includes calendar links and the Settings PIN. It leaves out viewing and
  listening history.
- The Settings PIN keeps guests out of Settings. It isn't encryption.
- Netty 3, used only for NFS, is end-of-life. Replacing it or making NFS optional is planned before 1.0.
- Some antivirus engines flag new, self-signed apps that use an accessibility service. VirusTotal found 1 generic
  detection in 66 engines for an early version; ClamAV finds none.
