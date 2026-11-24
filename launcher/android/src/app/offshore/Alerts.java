package app.offshore;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/**
 * Alerts from anything, turned into one format (title, message, level, optional picture) for the home screen.
 *
 * Inputs (both off unless tv.json's "alerts" section turns them on):
 * - Local webhook on port 7979: POST /notify with a token (?token=, "Authorization: Bearer", or "X-Token").
 *   JSON {title, message, level: info|important|urgent, image, source} or the PiPup format (title, message,
 *   media.image.uri), or a plain form. Home Assistant, Homebridge, Node-RED, Hubitat, scripts...
 * - ntfy topic (ntfy.sh or a self-hosted server), for IFTTT, Zapier, phones and cloud services.
 *
 * tv.json: "alerts": { "token": "...", "ntfy": { "server": "https://ntfy.sh", "topic": "..." } }
 */
final class Alerts {
    static final String TAG = "Offshore-alerts";
    static final int PORT = 7979;
    static final int MAX_PER_MINUTE = 20;

    private static Alerts instance;

    private final Context app;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final String token, ntfyServer, ntfyTopic;
    private final ArrayDeque<Long> recent = new ArrayDeque<>();
    private volatile boolean running = true;
    private volatile ServerSocket server;
    private volatile HttpURLConnection ntfyConn;

    /** (Re)start the receivers from the current tv.json. */
    static synchronized void restart(Context c) {
        if (instance != null) instance.stop();
        instance = new Alerts(c.getApplicationContext());
        instance.start();
    }

    static synchronized void stopAll() {
        if (instance != null) instance.stop();
        instance = null;
    }

    private Alerts(Context app) {
        this.app = app;
        String t = "", server = "https://ntfy.sh", topic = "";
        try {
            String cfg = MainActivity.readConfig(app);
            JSONObject a = cfg == null ? null : new JSONObject(cfg).optJSONObject("alerts");
            if (a != null) {
                t = a.optString("token", "");
                JSONObject n = a.optJSONObject("ntfy");
                if (n != null) { server = n.optString("server", server); topic = n.optString("topic", ""); }
            }
        } catch (Exception e) {
            Log.w(TAG, "bad alerts config", e);
        }
        token = t;
        ntfyServer = server.replaceAll("/+$", "");
        ntfyTopic = topic;
    }

    /** Customize > Smart home webhook: the port only opens when it's on (off by default; ntfy needs no open port). */
    static boolean webhookOn(Context c) { return c.getSharedPreferences("security", Context.MODE_PRIVATE).getBoolean("webhook", false); }

    static void setWebhook(Context c, boolean on) {
        c.getSharedPreferences("security", Context.MODE_PRIVATE).edit().putBoolean("webhook", on).apply();
        restart(c);
    }

    private void start() {
        if (!webhookOn(app)) Log.i(TAG, "webhook off (Customize > Smart home webhook)");
        else if (token.length() >= 12) thread("webhook", new Runnable() { public void run() { serve(); } });
        else if (!token.isEmpty()) Log.w(TAG, "webhook off: token must be at least 12 characters");
        if (!ntfyTopic.isEmpty()) thread("ntfy", new Runnable() { public void run() { ntfyLoop(); } });
    }

    private void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (Exception ignored) { }
        try { if (ntfyConn != null) ntfyConn.disconnect(); } catch (Exception ignored) { }
    }

    private static void thread(String name, Runnable r) {
        Thread t = new Thread(r, "alerts-" + name);
        t.setDaemon(true);
        t.start();
    }

    // ---- One alert, whatever its source ---------------------------------------------------------

    private void deliver(String title, String message, String level, String image, String source) {
        long now = SystemClock.uptimeMillis();
        synchronized (recent) {                            // a misbehaving sensor can't flood the screen
            while (!recent.isEmpty() && now - recent.peekFirst() > 60000) recent.pollFirst();
            if (recent.size() >= MAX_PER_MINUTE) { Log.w(TAG, "rate limited: " + title); return; }
            recent.addLast(now);
        }
        if (!"important".equals(level) && !"urgent".equals(level)) level = "info";
        final JSONObject n = new JSONObject();
        try {
            n.put("title", clip(title, 80));
            n.put("message", clip(message, 240));
            n.put("level", level);
            n.put("source", clip(source, 40));
            if (image != null && safeImage(image)) n.put("image", image);
        } catch (Exception ignored) { }
        Log.i(TAG, level + " alert from " + source + ": " + title);
        main.post(new Runnable() {
            @Override
            public void run() { Home.notice(app, n); }
        });
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max - 1) + "…" : s;
    }

    /** Pictures only from secure web addresses or the home network. */
    static boolean safeImage(String u) {
        try {
            Uri uri = Uri.parse(u);
            String host = uri.getHost() == null ? "" : uri.getHost();
            if ("https".equals(uri.getScheme())) return true;
            return "http".equals(uri.getScheme()) && (host.startsWith("10.") || host.startsWith("192.168.")
                || host.matches("^172\\.(1[6-9]|2\\d|3[01])\\..*") || host.endsWith(".local"));
        } catch (Exception e) {
            return false;
        }
    }

    static String levelFromPriority(int p) { return p >= 5 ? "urgent" : p == 4 ? "important" : "info"; }

    // ---- Local webhook ----------------------------------------------------------------------------

    private void serve() {
        try (ServerSocket ss = new ServerSocket(PORT)) {
            server = ss;
            Log.i(TAG, "webhook listening on port " + PORT);
            while (running) {
                Socket s = ss.accept();
                java.net.InetAddress ip = s.getInetAddress();
                boolean home = ip.isSiteLocalAddress() || ip.isLoopbackAddress() || ip.isLinkLocalAddress()
                        || (ip instanceof java.net.Inet6Address && (ip.getAddress()[0] & 0xfe) == 0xfc);   // home network only
                long now = System.currentTimeMillis();
                if (now - missWindow > 60000) { missWindow = now; misses = 0; }
                if (!home || misses >= 10) { try { s.close(); } catch (Exception ignored) { } continue; }   // 10 wrong tokens: a minute off
                try { handle(s); } catch (Exception e) { Log.w(TAG, "webhook request failed", e); }
                finally { try { s.close(); } catch (Exception ignored) { } }
            }
        } catch (Exception e) {
            if (running) Log.w(TAG, "webhook stopped", e);
        }
    }

    private long missWindow;
    private int misses;

    private void handle(Socket s) throws Exception {
        s.setSoTimeout(3000);
        long until = System.currentTimeMillis() + 8000;               // the whole request, so a slow sender can't hold the port
        InputStream in = s.getInputStream();
        String head = readHead(in, until);
        if (head == null) { reply(s, 400, "bad request"); return; }
        String[] lines = head.split("\r\n");
        String[] req = lines[0].split(" ");
        if (req.length < 2) { reply(s, 400, "bad request"); return; }
        Map<String, String> h = new HashMap<>();
        for (int i = 1; i < lines.length; i++) {
            int c = lines[i].indexOf(':');
            if (c > 0) h.put(lines[i].substring(0, c).trim().toLowerCase(), lines[i].substring(c + 1).trim());
        }
        Uri target = Uri.parse("http://tv" + req[1]);
        String path = target.getPath() == null ? "/" : target.getPath();
        if (!"POST".equals(req[0]) || !(path.equals("/notify") || path.equals("/"))) { reply(s, 404, "use POST /notify"); return; }

        String given = target.getQueryParameter("token");
        String auth = h.get("authorization");
        if (given == null && auth != null && auth.startsWith("Bearer ")) given = auth.substring(7).trim();
        if (given == null) given = h.get("x-token");
        if (given == null || !same(given, token)) { misses++; reply(s, 401, "wrong or missing token"); return; }

        int len = 0;
        try { len = Integer.parseInt(h.get("content-length")); } catch (Exception ignored) { }
        if (len < 0 || len > 65536) { reply(s, 413, "too large"); return; }
        byte[] body = new byte[len];
        for (int off = 0; off < len; ) {
            if (System.currentTimeMillis() > until) { reply(s, 408, "too slow"); return; }
            int r = in.read(body, off, len - off); if (r < 0) break; off += r;
        }
        String text = new String(body, "UTF-8");

        String type = h.get("content-type") == null ? "" : h.get("content-type");
        String title = "", message = "", level = "info", image = null, source = "Home";
        if (type.contains("json") || text.trim().startsWith("{")) {
            JSONObject j = new JSONObject(text);
            title = j.optString("title", "");
            message = j.optString("message", j.optString("body", ""));
            level = j.has("priority") ? levelFromPriority(j.optInt("priority", 3)) : j.optString("level", "info");
            image = j.optString("image", null);
            JSONObject media = j.optJSONObject("media");           // PiPup format
            if (image == null && media != null && media.optJSONObject("image") != null) image = media.optJSONObject("image").optString("uri", null);
            source = j.optString("source", source);
        } else {
            Map<String, String> f = new HashMap<>();
            for (String kv : text.split("&")) {
                int e = kv.indexOf('=');
                if (e > 0) f.put(URLDecoder.decode(kv.substring(0, e), "UTF-8"), URLDecoder.decode(kv.substring(e + 1), "UTF-8"));
            }
            title = f.containsKey("title") ? f.get("title") : "";
            message = f.containsKey("message") ? f.get("message") : text.contains("=") ? "" : text;
            if (f.containsKey("level")) level = f.get("level");
            image = f.get("image");
            if (f.containsKey("source")) source = f.get("source");
        }
        if (title.isEmpty() && message.isEmpty()) { reply(s, 400, "need a title or message"); return; }
        deliver(title.isEmpty() ? message : title, title.isEmpty() ? "" : message, level, image, source);
        reply(s, 200, "ok");
    }

    /** One line of the ntfy stream; a line longer than max is skipped (returned as "") instead of filling memory. */
    private static String lineUpTo(BufferedReader r, int max) throws Exception {
        StringBuilder b = new StringBuilder();
        boolean over = false;
        for (int c; (c = r.read()) >= 0; ) {
            if (c == '\n') return over ? "" : b.toString();
            if (c == '\r') continue;
            if (b.length() < max) b.append((char) c); else over = true;
        }
        return b.length() > 0 && !over ? b.toString() : null;
    }

    private static String readHead(InputStream in, long until) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c, n = 0;
        while ((c = in.read()) >= 0) {
            if (System.currentTimeMillis() > until) return null;
            b.write(c);
            if (b.size() > 8192) return null;
            n = (c == '\r' || c == '\n') ? n + 1 : 0;
            if (n == 4) return b.toString("ISO-8859-1").trim();
        }
        return null;
    }

    private static void reply(Socket s, int code, String msg) throws Exception {
        byte[] body = (msg + "\n").getBytes("UTF-8");
        OutputStream out = s.getOutputStream();
        out.write(("HTTP/1.1 " + code + " " + (code == 200 ? "OK" : "Error") + "\r\nContent-Type: text/plain\r\nContent-Length: "
            + body.length + "\r\nConnection: close\r\n\r\n").getBytes("ISO-8859-1"));
        out.write(body);
        out.flush();
    }

    /** Constant-time comparison, so the token can't be guessed by timing. */
    private static boolean same(String a, String b) {
        if (a.length() != b.length()) return false;
        int d = 0;
        for (int i = 0; i < a.length(); i++) d |= a.charAt(i) ^ b.charAt(i);
        return d == 0;
    }

    // ---- ntfy -------------------------------------------------------------------------------------

    private void ntfyLoop() {
        long backoff = 2000;
        while (running) {
            try {
                URL u = new URL(ntfyServer + "/" + Uri.encode(ntfyTopic) + "/json");
                HttpURLConnection c = (HttpURLConnection) u.openConnection();
                ntfyConn = c;
                c.setConnectTimeout(15000);
                c.setReadTimeout(120000);                 // ntfy sends a keepalive about every 45 s
                c.setRequestProperty("User-Agent", "Offshore");
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
                Log.i(TAG, "ntfy connected");
                backoff = 2000;
                for (String line; running && (line = lineUpTo(r, 65536)) != null; ) {
                    if (line.isEmpty()) continue;                    // keepalive, or a line too long to be a message
                    JSONObject j = new JSONObject(line);
                    if (!"message".equals(j.optString("event"))) continue;
                    JSONObject att = j.optJSONObject("attachment");
                    deliver(j.optString("title", ""), j.optString("message", ""), levelFromPriority(j.optInt("priority", 3)),
                        att == null ? null : att.optString("url", null), "ntfy");
                }
            } catch (Exception e) {
                if (running) Log.w(TAG, "ntfy reconnecting in " + backoff / 1000 + " s: " + e);
            }
            if (!running) break;
            SystemClock.sleep(backoff);
            backoff = Math.min(backoff * 2, 60000);
        }
    }
}
