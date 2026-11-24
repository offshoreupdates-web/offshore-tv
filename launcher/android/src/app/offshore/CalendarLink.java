package app.offshore;

import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;

/**
 * "Add a calendar from your phone" (Customize > Calendar): typing a long calendar link with a remote is miserable, so
 * while that screen is open the TV serves a one-page form on port 8686. The person opens the address shown on the TV,
 * pastes the link from Google, iCloud, Outlook and so on, and types the 4-digit code from the screen.
 *
 * Kept small on purpose: only while the screen is open (and at most 10 minutes), only devices on the home network,
 * a fresh code each time (five wrong tries end it), small requests, and only links from known calendar services
 * (Calendars.allowed). The link goes to the page through Listener and is fetched like any other calendar.
 *
 * The same form adds a Live TV playlist (playlist mode, Settings > Live TV): an http(s) M3U link the user has the
 * right to watch (a box they must tick says so). The link goes to LiveTv, never to the page.
 */
final class CalendarLink {
    static final int PORT = 8686;
    private static final String TAG = "Offshore-cal";

    interface Listener { void added(String name, String url); void ended(); }

    private final Listener listener;
    private final String code;
    private volatile ServerSocket server;
    private volatile boolean running = true;
    private int misses = 0;
    private final boolean playlist;
    volatile String guide = "";                      // playlist mode: the optional guide (XMLTV) link

    CalendarLink(Listener l) { this(l, false); }

    CalendarLink(Listener l, boolean playlist) {
        this.playlist = playlist;
        listener = l;
        code = String.format(java.util.Locale.US, "%04d", new SecureRandom().nextInt(10000));
        new Thread(new Runnable() { @Override public void run() { serve(); } }, playlist ? "playlist-link" : "calendar-link").start();
    }

    String code() { return code; }

    void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (Exception ignored) { }
    }

    private void serve() {
        long until = System.currentTimeMillis() + 10 * 60000L;
        try (ServerSocket ss = new ServerSocket()) {
            ss.setReuseAddress(true);                 // reopening the screen right away must not find the port busy
            ss.bind(new java.net.InetSocketAddress(PORT));
            server = ss;
            if (!running) return;
            ss.setSoTimeout(5000);
            while (running && System.currentTimeMillis() < until) {
                Socket s;
                try { s = ss.accept(); } catch (java.net.SocketTimeoutException t) { continue; }
                try { handle(s); } catch (Exception e) { Log.w(TAG, "request failed: " + e); }
                finally { try { s.close(); } catch (Exception ignored) { } }
            }
        } catch (Exception e) {
            if (running) Log.w(TAG, "stopped: " + e);
        }
        running = false;
        listener.ended();
    }

    private void handle(Socket s) throws Exception {
        InetAddress from = s.getInetAddress();
        if (!(from.isSiteLocalAddress() || from.isLinkLocalAddress() || from.isLoopbackAddress())) return;   // home network only
        s.setSoTimeout(8000);
        InputStream in = s.getInputStream();
        String head = readHead(in);
        if (head == null) return;
        String[] lines = head.split("\r\n"), req = lines[0].split(" ");
        if (req.length < 2) return;
        int len = 0;
        for (String l : lines) if (l.toLowerCase(java.util.Locale.US).startsWith("content-length:")) try { len = Integer.parseInt(l.substring(15).trim()); } catch (Exception ignored) { }
        if ("GET".equals(req[0])) { page(s, null); return; }
        if (!"POST".equals(req[0]) || len <= 0 || len > 8192) { page(s, "Something went wrong. Try again."); return; }
        byte[] body = new byte[len];
        for (int off = 0; off < len; ) { int r = in.read(body, off, len - off); if (r < 0) break; off += r; }
        Map<String, String> f = new HashMap<>();
        for (String kv : new String(body, "UTF-8").split("&")) {
            int e = kv.indexOf('=');
            if (e > 0) f.put(URLDecoder.decode(kv.substring(0, e), "UTF-8"), URLDecoder.decode(kv.substring(e + 1), "UTF-8"));
        }
        String given = f.containsKey("code") ? f.get("code").trim() : "", url = f.containsKey("url") ? f.get("url").trim() : "";
        String name = f.containsKey("name") ? f.get("name").trim() : "";
        if (!code.equals(given)) {
            if (++misses >= 5) { page(s, "Too many wrong codes. Open Add from your phone on the TV again."); stop(); return; }
            page(s, "That code doesn't match the one on the TV."); return;
        }
        if (playlist) {
            String low = url.toLowerCase(java.util.Locale.US);
            if (!(low.startsWith("http://") || low.startsWith("https://")) || url.length() > 2048 || url.contains(" ")) { page(s, "That doesn't look like a playlist link. It should start with http:// or https://."); return; }
            if (!"on".equals(f.get("rights"))) { page(s, "Please confirm you have the right to watch these channels."); return; }
            String gl = f.containsKey("guide") ? f.get("guide").trim() : "", gll = gl.toLowerCase(java.util.Locale.US);
            if (!gl.isEmpty() && (!(gll.startsWith("http://") || gll.startsWith("https://")) || gl.length() > 2048 || gl.contains(" "))) { page(s, "The guide link should start with http:// or https://, or leave it empty."); return; }
            guide = gl;
            if (name.isEmpty()) name = "My channels";
        } else {
            if (url.startsWith("webcal://")) url = "https://" + url.substring(9);
            if (!Calendars.allowed(url)) { page(s, "That doesn't look like a calendar link from a calendar service. Copy the iCal (ICS) link and try again."); return; }
        }
        if (name.isEmpty()) name = "Calendar";
        if (name.length() > 40) name = name.substring(0, 40);
        listener.added(name, url);
        page(s, "OK");
    }

    private void page(Socket s, String message) throws Exception {
        if (playlist) { playlistPage(s, message); return; }
        boolean done = "OK".equals(message);
        String esc = message == null ? "" : message.replace("&", "&amp;").replace("<", "&lt;");
        String html = "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<title>Add a calendar</title><style>body{font:17px system-ui,-apple-system,sans-serif;margin:0;padding:24px;background:#0f1720;color:#f2f4f7}"
            + "h1{font-size:24px;margin:0 0 6px}p{color:#aab4c0;line-height:1.45}label{display:block;margin:18px 0 6px;font-weight:600}"
            + "input{width:100%;box-sizing:border-box;padding:13px;border-radius:12px;border:1px solid #33404d;background:#18222d;color:#fff;font-size:17px}"
            + "button{margin-top:22px;width:100%;padding:15px;border:0;border-radius:14px;background:#0a84ff;color:#fff;font-size:18px;font-weight:600}"
            + ".msg{background:#3a1f1f;color:#ffb4ab;padding:12px;border-radius:12px;margin-top:14px}.ok{background:#173a26;color:#9be7b5}"
            + "details{margin-top:22px;color:#aab4c0}summary{font-weight:600;color:#f2f4f7}li{margin:6px 0}</style></head><body>"
            + "<h1>Add a calendar to your TV</h1>"
            + (done ? "<div class='msg ok'>Added. It shows on the TV in a moment. You can close this page.</div></body></html>"
              : (esc.isEmpty() ? "" : "<div class=msg>" + esc + "</div>")
              + "<p>Paste the calendar's iCal (ICS) link and enter the code shown on the TV.</p>"
              + "<form method=post><label>Name</label><input name=name maxlength=40 placeholder='Family, Work, Soccer'>"
              + "<label>Calendar link</label><input name=url required placeholder='https://… or webcal://…' autocapitalize=off autocorrect=off>"
              + "<label>Code from the TV</label><input name=code required inputmode=numeric maxlength=4 pattern='[0-9]{4}'>"
              + "<button>Add to TV</button></form>"
              + "<details><summary>Where do I find the link?</summary><ul>"
              + "<li><b>Google Calendar</b> (on a computer): Settings, pick the calendar, Integrate calendar, copy <i>Secret address in iCal format</i>.</li>"
              + "<li><b>Apple iCloud</b>: Calendar app, tap the calendar's (i), turn on <i>Public Calendar</i>, Share Link.</li>"
              + "<li><b>Outlook / Microsoft 365</b>: Settings, Calendar, Shared calendars, Publish a calendar, copy the ICS link.</li>"
              + "<li><b>Proton, Yahoo, Fastmail, Zoho</b>: look for Share or Export and copy the iCal / ICS link.</li>"
              + "<li>School, team and event calendars often have a <i>Subscribe</i> or <i>iCal</i> link too.</li></ul>"
              + "<p>The link is kept only on the TV. Anyone with a secret link can read that calendar, so don't share it elsewhere.</p></details>"
              + "</body></html>");
        byte[] b = html.getBytes("UTF-8");
        OutputStream out = s.getOutputStream();
        out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + b.length
                + "\r\nCache-Control: no-store\r\nX-Frame-Options: DENY\r\nConnection: close\r\n\r\n").getBytes("ISO-8859-1"));
        out.write(b);
        out.flush();
    }

    // Live TV: the same calm form, worded for a playlist. Nothing here names or suggests a provider.
    private void playlistPage(Socket s, String message) throws Exception {
        boolean done = "OK".equals(message);
        String esc = message == null ? "" : message.replace("&", "&amp;").replace("<", "&lt;");
        String html = "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<title>Add your channels</title><style>body{font:17px system-ui,-apple-system,sans-serif;margin:0;padding:24px;background:#0f1720;color:#f2f4f7}"
            + "h1{font-size:24px;margin:0 0 6px}p{color:#aab4c0;line-height:1.45}label{display:block;margin:18px 0 6px;font-weight:600}"
            + "input{width:100%;box-sizing:border-box;padding:13px;border-radius:12px;border:1px solid #33404d;background:#18222d;color:#fff;font-size:17px}"
            + "label.tick{display:flex;gap:12px;align-items:flex-start;font-weight:400;color:#d6dde5;line-height:1.4}label.tick input{width:22px;height:22px;flex:none;margin:1px 0 0}"
            + "button{margin-top:22px;width:100%;padding:15px;border:0;border-radius:14px;background:#0a84ff;color:#fff;font-size:18px;font-weight:600}"
            + ".msg{background:#3a1f1f;color:#ffb4ab;padding:12px;border-radius:12px;margin-top:14px}.ok{background:#173a26;color:#9be7b5}</style></head><body>"
            + "<h1>Add your channels to the TV</h1>"
            + (done ? "<div class='msg ok'>Added. The TV is reading your channels now. You can close this page.</div></body></html>"
              : (esc.isEmpty() ? "" : "<div class=msg>" + esc + "</div>")
              + "<p>Paste the link to your playlist (M3U) and enter the code shown on the TV. Your TV provider or service gives you this link.</p>"
              + "<form method=post><label>Name</label><input name=name maxlength=40 placeholder='My channels'>"
              + "<label>Playlist link</label><input name=url required placeholder='https://…' autocapitalize=off autocorrect=off>"
              + "<label>Guide link (XMLTV), optional</label><input name=guide placeholder='Only if your service gives one separately' autocapitalize=off autocorrect=off>"
              + "<label>Code from the TV</label><input name=code required inputmode=numeric maxlength=4 pattern='[0-9]{4}'>"
              + "<label class=tick><input type=checkbox name=rights required> I have the right to watch these channels, for example from my TV provider or a free, legal service.</label>"
              + "<button>Add to TV</button></form>"
              + "<p>The link is kept only on this TV, out of its backups, and is never sent anywhere else. Channels play in VLC.</p>"
              + "</body></html>");
        byte[] b = html.getBytes("UTF-8");
        OutputStream out = s.getOutputStream();
        out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + b.length
                + "\r\nCache-Control: no-store\r\nX-Frame-Options: DENY\r\nConnection: close\r\n\r\n").getBytes("ISO-8859-1"));
        out.write(b);
        out.flush();
    }

    private static String readHead(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c, n = 0;
        while ((c = in.read()) >= 0) {
            b.write(c);
            if (b.size() > 8192) return null;
            n = (c == '\r' || c == '\n') ? n + 1 : 0;
            if (n == 4) return b.toString("ISO-8859-1").trim();
        }
        return null;
    }
}
