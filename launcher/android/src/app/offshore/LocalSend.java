package app.offshore;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.MulticastSocket;
import java.net.ServerSocket;
import java.net.Socket;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;

/**
 * "Receive from phones" (Customize): the TV appears in the LocalSend app (open source, iPhone / Android / Mac / Windows /
 * Linux) as e.g. "Living room TV" and can receive photos, videos, music and documents. LocalSend protocol v2 (receive
 * only), https://github.com/localsend/protocol.
 * Security: encrypted (TLS) with the TV's own certificate, whose private key stays in Android's keystore; nothing is
 * saved until someone accepts on the TV (declined after 60 s); optional code shown on the TV that the sender must type;
 * home network only (private addresses); app installers and scripts refused; size and free space checked; one transfer at
 * a time; requests rate-limited. Off unless turned on. Files go to the app's private storage (files/received).
 */
final class LocalSend {
    private static final String TAG = "Offshore";
    static final int PORT = 53317;
    private static final String GROUP = "224.0.0.167", KEY = "offshore-localsend";
    private static final long MAX_BYTES = 4L << 30;
    private static final String BLOCKED = "(?i).*\\.(apk|apks|xapk|aab|dex|jar|sh|bat|cmd|exe|msi|com|scr|ps1|vbs|js|so)$";

    interface Ui {
        /** Ask on the TV; answer later with answer(id, ok). */
        void ask(String id, JSONObject request);
        /** Show the code the sender has to type. */
        void showPin(String pin, String from);
        void done(String id, JSONObject result);
        void message(String text);
    }

    private final Context ctx;
    private final Ui ui;
    private volatile boolean running;
    private volatile String alias = "Offshore";
    private volatile boolean pinMode;
    private String fingerprint = "";
    private ServerSocket server;
    private MulticastSocket mcast;
    private WifiManager.MulticastLock lock;
    private final SecureRandom rnd = new SecureRandom();

    // The one transfer in progress.
    private final Object sync = new Object();
    private String sessionId, sender, senderIp, pin;
    private long pinUntil;
    private int pinMisses;
    private final Map<String, String[]> files = new HashMap<>();   // fileId -> {token, name, sha256 or ""}
    private final Map<String, Boolean> answers = new HashMap<>();
    private int received;
    private org.json.JSONArray saved = new org.json.JSONArray();
    private final Map<String, long[]> hits = new HashMap<>();     // ip -> {window start, count}

    LocalSend(Context ctx, Ui ui) { this.ctx = ctx.getApplicationContext(); this.ui = ui; }

    synchronized void configure(boolean on, boolean usePin, String name) {
        alias = name == null || name.trim().isEmpty() ? "Offshore" : name.trim();
        if (pinMode != usePin) synchronized (sync) { pin = null; }   // a fresh code each time Code is switched on
        pinMode = usePin;
        if (on && !running) start();
        else if (!on && running) stop();
        else if (on) announce(true);
    }

    /** The code senders type, shown on the Share card before anyone sends. Lasts 30 minutes; 5 wrong tries make a new one. */
    String currentPin() {
        synchronized (sync) {
            if (!pinMode) return "";
            if (pin == null || System.currentTimeMillis() > pinUntil) {
                pin = String.format(Locale.US, "%06d", rnd.nextInt(1000000));
                pinUntil = System.currentTimeMillis() + 30 * 60000;
                pinMisses = 0;
            }
            return pin;
        }
    }

    void answer(String id, boolean ok) {
        synchronized (sync) { answers.put(id, ok); sync.notifyAll(); }
    }

    // ---- Start / stop ----------------------------------------------------------------------------------------------

    private void start() {
        try {
            SSLContext tls = SSLContext.getInstance("TLS");
            KeyStore ks = keyStore();
            KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            kmf.init(ks, null);
            tls.init(kmf.getKeyManagers(), null, rnd);
            SSLServerSocket s = (SSLServerSocket) tls.getServerSocketFactory().createServerSocket(PORT, 16);
            s.setEnabledProtocols(new String[]{"TLSv1.2"});        // TLS 1.2 is the newest on Android 9
            server = s;
        } catch (Exception e) {
            Log.w(TAG, "localsend: couldn't start: " + e);
            ui.message("Receiving from phones couldn't start");
            return;
        }
        running = true;
        thread("ls-accept", new Runnable() { @Override public void run() { acceptLoop(); } });
        thread("ls-discover", new Runnable() { @Override public void run() { discoverLoop(); } });
        Log.i(TAG, "localsend: receiving as \"" + alias + "\"");
    }

    private void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        try { if (mcast != null) mcast.close(); } catch (Exception ignored) { }
        if (lock != null && lock.isHeld()) lock.release();
        synchronized (sync) { sessionId = null; files.clear(); sync.notifyAll(); }
        Log.i(TAG, "localsend: off");
    }

    private static void thread(String name, Runnable r) { Thread t = new Thread(r, name); t.setDaemon(true); t.start(); }

    /** The TV's certificate: an EC P-256 key made in Android's keystore (the private key never leaves it). */
    private KeyStore keyStore() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(KEY)) {
            java.security.KeyPairGenerator g = java.security.KeyPairGenerator.getInstance("EC", "AndroidKeyStore");
            long now = System.currentTimeMillis();
            g.initialize(new android.security.keystore.KeyGenParameterSpec.Builder(KEY,
                    android.security.keystore.KeyProperties.PURPOSE_SIGN | android.security.keystore.KeyProperties.PURPOSE_VERIFY)
                    .setAlgorithmParameterSpec(new java.security.spec.ECGenParameterSpec("secp256r1"))
                    .setDigests(android.security.keystore.KeyProperties.DIGEST_NONE, android.security.keystore.KeyProperties.DIGEST_SHA256,
                            android.security.keystore.KeyProperties.DIGEST_SHA384, android.security.keystore.KeyProperties.DIGEST_SHA512)
                    .setCertificateSubject(new javax.security.auth.x500.X500Principal("CN=Offshore"))
                    .setCertificateSerialNumber(java.math.BigInteger.valueOf(Math.abs(rnd.nextLong())))
                    .setCertificateNotBefore(new java.util.Date(now - 86400000L))
                    .setCertificateNotAfter(new java.util.Date(now + 10L * 365 * 86400000L))
                    .build());
            g.generateKeyPair();
        }
        byte[] der = ks.getCertificate(KEY).getEncoded();
        StringBuilder hex = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(der)) hex.append(String.format(Locale.US, "%02x", b));
        fingerprint = hex.toString();                           // as the LocalSend apps compute it
        return ks;
    }

    private JSONObject info(boolean withNet) {
        JSONObject o = new JSONObject();
        try {
            o.put("alias", alias).put("version", "2.1").put("deviceModel", "Fire TV").put("deviceType", "desktop")
             .put("fingerprint", fingerprint).put("download", false);
            if (withNet) o.put("port", PORT).put("protocol", "https");
        } catch (Exception ignored) { }
        return o;
    }

    // ---- Discovery (UDP multicast) ---------------------------------------------------------------------------------

    private void discoverLoop() {
        try {
            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            lock = wm.createMulticastLock("offshore-localsend");
            lock.setReferenceCounted(false);
            lock.acquire();
            mcast = new MulticastSocket(PORT);
            mcast.joinGroup(InetAddress.getByName(GROUP));
            announce(true);
            byte[] buf = new byte[4096];
            while (running) {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                mcast.receive(p);
                if (!homeNetwork(p.getAddress())) continue;
                JSONObject o;
                try { o = new JSONObject(new String(p.getData(), 0, p.getLength(), "UTF-8")); } catch (Exception e) { continue; }
                if (fingerprint.equals(o.optString("fingerprint")) || !o.optBoolean("announce")) continue;
                if (!replyAllowed(p.getAddress().getHostAddress())) continue;   // floods (UDP can be forged) get no answers
                reply(p.getAddress(), o);                       // a phone opened LocalSend: tell it we're here
            }
        } catch (Exception e) {
            if (running) Log.w(TAG, "localsend discovery: " + e);
        }
    }

    private void announce(final boolean ask) {
        thread("ls-announce", new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject o = info(true).put("announce", ask);
                    byte[] b = o.toString().getBytes("UTF-8");
                    MulticastSocket m = mcast;
                    if (m != null) m.send(new DatagramPacket(b, b.length, InetAddress.getByName(GROUP), PORT));
                } catch (Exception e) {
                    Log.w(TAG, "localsend announce: " + e);
                }
            }
        });
    }

    private final Map<String, Long> replied = new HashMap<>();
    private long replyWindow;
    private int repliesInWindow;

    /** One answer per address every 5 s, and at most 10 a second in all. */
    private boolean replyAllowed(String ip) {
        long now = System.currentTimeMillis();
        if (now - replyWindow > 1000) { replyWindow = now; repliesInWindow = 0; }
        if (++repliesInWindow > 10) return false;
        Long last = replied.get(ip);
        if (last != null && now - last < 5000) return false;
        if (replied.size() > 500) replied.clear();
        replied.put(ip, now);
        return true;
    }

    /** Answer an announcement: POST /register to the phone (it can't be verified yet, and we only send our name), else multicast. */
    private void reply(final InetAddress to, final JSONObject from) {
        thread("ls-reply", new Runnable() {
            @Override
            public void run() {
                try {
                    String proto = "http".equals(from.optString("protocol")) ? "http" : "https";
                    int port = from.optInt("port", PORT);
                    if (port < 1024 || port > 65535) port = PORT;
                    java.net.URL u = new java.net.URL(proto + "://" + to.getHostAddress() + ":" + port + "/api/localsend/v2/register");
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) u.openConnection();
                    if (c instanceof javax.net.ssl.HttpsURLConnection) trustSelfSigned((javax.net.ssl.HttpsURLConnection) c);
                    c.setConnectTimeout(3000);
                    c.setReadTimeout(3000);
                    c.setDoOutput(true);
                    c.setRequestMethod("POST");
                    c.setRequestProperty("Content-Type", "application/json");
                    OutputStream o = c.getOutputStream();
                    o.write(info(true).toString().getBytes("UTF-8"));
                    o.close();
                    c.getResponseCode();
                    c.disconnect();
                } catch (Exception e) {
                    announce(false);
                }
            }
        });
    }

    /** LocalSend devices use self-signed certificates; only used to send our own name in reply to an announcement. */
    private static void trustSelfSigned(javax.net.ssl.HttpsURLConnection c) throws Exception {
        javax.net.ssl.TrustManager[] all = {new javax.net.ssl.X509TrustManager() {
            @Override public void checkClientTrusted(java.security.cert.X509Certificate[] x, String a) { }
            @Override public void checkServerTrusted(java.security.cert.X509Certificate[] x, String a) { }
            @Override public java.security.cert.X509Certificate[] getAcceptedIssuers() { return new java.security.cert.X509Certificate[0]; }
        }};
        SSLContext s = SSLContext.getInstance("TLS");
        s.init(null, all, null);
        c.setSSLSocketFactory(s.getSocketFactory());
        c.setHostnameVerifier(new javax.net.ssl.HostnameVerifier() {
            @Override public boolean verify(String h, javax.net.ssl.SSLSession ss) { return true; }
        });
    }

    /** Private (home network) addresses only: 10/8, 172.16/12, 192.168/16, link-local. */
    private static boolean homeNetwork(InetAddress a) {
        return a.isSiteLocalAddress() || a.isLinkLocalAddress() || a.isLoopbackAddress();
    }

    // ---- HTTPS server --------------------------------------------------------------------------------------------

    private void acceptLoop() {
        while (running) {
            try {
                final Socket s = server.accept();
                if (!homeNetwork(s.getInetAddress()) || limited(s.getInetAddress().getHostAddress()) || open.get() >= 16) { s.close(); continue; }
                open.incrementAndGet();
                thread("ls-conn", new Runnable() { @Override public void run() { try { serve(s); } finally { open.decrementAndGet(); } } });
            } catch (IOException e) {
                if (running) Log.w(TAG, "localsend accept: " + e);
            }
        }
    }

    /** At most 120 requests a minute from one address (uploads are one request per file). */
    private final java.util.concurrent.atomic.AtomicInteger open = new java.util.concurrent.atomic.AtomicInteger();   // connections at once

    private boolean limited(String ip) {
        synchronized (hits) {
            long now = System.currentTimeMillis();
            if (hits.size() > 500) hits.clear();
            long[] h = hits.get(ip);
            if (h == null || now - h[0] > 60000) { hits.put(ip, new long[]{now, 1}); return false; }
            return ++h[1] > 120;
        }
    }

    private void serve(Socket s) {
        try {
            s.setSoTimeout(30000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            String ip = s.getInetAddress().getHostAddress();
            while (running) {
                String line = readLine(in);
                if (line == null || line.isEmpty()) break;
                String[] rq = line.split(" ");
                if (rq.length < 2) break;
                Map<String, String> h = new HashMap<>();
                for (String l; (l = readLine(in)) != null && !l.isEmpty(); ) {
                    if (h.size() >= 64) return;                       // no real client sends this many headers
                    int c = l.indexOf(':');
                    if (c > 0) h.put(l.substring(0, c).trim().toLowerCase(Locale.US), l.substring(c + 1).trim());
                }
                InputStream body = body(in, h);
                String path = rq[1], query = "";
                int q = path.indexOf('?');
                if (q >= 0) { query = path.substring(q + 1); path = path.substring(0, q); }
                Map<String, String> qs = query(query);
                int[] status = {200};
                String resp = route(rq[0], path, qs, body, ip, status);
                drain(body);
                byte[] b = resp == null ? new byte[0] : resp.getBytes("UTF-8");
                out.write(("HTTP/1.1 " + status[0] + " " + (status[0] < 300 ? "OK" : "Error") + "\r\nContent-Type: application/json\r\nContent-Length: "
                        + b.length + "\r\nConnection: keep-alive\r\n\r\n").getBytes("UTF-8"));
                out.write(b);
                out.flush();
                if ("close".equalsIgnoreCase(h.get("connection"))) break;
            }
        } catch (Exception e) {
            // closed or timed out
        } finally {
            try { s.close(); } catch (IOException ignored) { }
        }
    }

    private String route(String method, String path, Map<String, String> qs, InputStream body, String ip, int[] status) throws Exception {
        switch (path) {
            case "/api/localsend/v2/register":
            case "/api/localsend/v2/info":
                return info(false).toString();
            case "/api/localsend/v2/prepare-upload":
                return prepare(qs, readSmall(body), ip, status);
            case "/api/localsend/v2/upload":
                upload(qs, body, ip, status);
                return null;
            case "/api/localsend/v2/cancel":
                synchronized (sync) {
                    if (qs.get("sessionId") != null && qs.get("sessionId").equals(sessionId) && ip.equals(senderIp)) finish(true);
                }
                return null;
            default:
                status[0] = 404;
                return "{\"message\":\"Not found\"}";
        }
    }

    private String prepare(Map<String, String> qs, String json, String ip, int[] status) throws Exception {
        JSONObject req;
        try { req = new JSONObject(json); } catch (Exception e) { status[0] = 400; return "{\"message\":\"Invalid body\"}"; }
        String from = req.optJSONObject("info") == null ? "A device" : req.getJSONObject("info").optString("alias", "A device");
        synchronized (sync) {
            if (sessionId != null) { status[0] = 409; return "{\"message\":\"Busy with another transfer\"}"; }
            if (pinMode) {                                       // the code shown on the TV
                String got = qs.get("pin");
                if (!currentPin().equals(got)) {
                    if (got != null && ++pinMisses >= 5) pin = null;         // guessing: the next code is new
                    ui.showPin(currentPin(), from);
                    status[0] = 401;
                    return "{\"message\":\"Enter the code shown on the TV\"}";
                }
            }
        }
        // Files: refuse installers and scripts, check sizes and free space.
        JSONObject fs = req.optJSONObject("files");
        if (fs == null || fs.length() == 0) { status[0] = 400; return "{\"message\":\"No files\"}"; }
        JSONObject ok = new JSONObject();
        long total = 0;
        int refused = 0, photos = 0, videos = 0;
        org.json.JSONArray names = new org.json.JSONArray();
        for (Iterator<String> it = fs.keys(); it.hasNext(); ) {
            String id = it.next();
            JSONObject f = fs.getJSONObject(id);
            String name = safeName(f.optString("fileName"));
            long size = f.optLong("size");
            if (name.matches(BLOCKED) || size < 0) { refused++; continue; }
            ok.put(id, f);
            total += size;
            String type = f.optString("fileType");
            if (type.startsWith("image/")) photos++; else if (type.startsWith("video/")) videos++;
            if (names.length() < 3) names.put(name);
        }
        if (ok.length() == 0) { status[0] = 403; ui.message("Declined: that kind of file can't be sent to the TV"); return "{\"message\":\"File type not allowed\"}"; }
        File dir = new File(ctx.getFilesDir(), "received");
        dir.mkdirs();
        if (total > MAX_BYTES || total > dir.getUsableSpace() - (500L << 20)) {
            status[0] = 403;
            ui.message("Declined: not enough space on the TV for " + (total >> 20) + " MB");
            return "{\"message\":\"Not enough space\"}";
        }
        // Ask on the TV and wait (the sender's app waits too).
        String ask = Long.toHexString(rnd.nextLong());
        JSONObject r = new JSONObject().put("from", from).put("count", ok.length()).put("bytes", total).put("photos", photos)
                .put("videos", videos).put("refused", refused).put("names", names)
                .put("model", req.optJSONObject("info") == null ? "" : req.getJSONObject("info").optString("deviceModel"));
        ui.ask(ask, r);
        Boolean yes;
        synchronized (sync) {
            long end = System.currentTimeMillis() + 60000;
            while ((yes = answers.remove(ask)) == null && running && System.currentTimeMillis() < end) sync.wait(1000);
            if (yes == null || !yes) { status[0] = 403; return "{\"message\":\"Declined\"}"; }
            if (sessionId != null) { status[0] = 409; return "{\"message\":\"Busy with another transfer\"}"; }
            sessionId = Long.toHexString(rnd.nextLong()) + Long.toHexString(rnd.nextLong());
            sender = from;
            senderIp = ip;
            received = 0;
            saved = new org.json.JSONArray();
            files.clear();
            JSONObject tokens = new JSONObject();
            for (Iterator<String> it = ok.keys(); it.hasNext(); ) {
                String id = it.next();
                JSONObject f = ok.getJSONObject(id);
                String token = Long.toHexString(rnd.nextLong()) + Long.toHexString(rnd.nextLong());
                files.put(id, new String[]{token, safeName(f.optString("fileName")), f.optString("sha256", ""), f.optString("fileType"), String.valueOf(Math.max(0, f.optLong("size")))});
                tokens.put(id, token);
            }
            return new JSONObject().put("sessionId", sessionId).put("files", tokens).toString();
        }
    }

    private void upload(Map<String, String> qs, InputStream body, String ip, int[] status) throws Exception {
        String[] f;
        String sid;
        synchronized (sync) {
            sid = sessionId;
            f = sid != null && sid.equals(qs.get("sessionId")) && ip.equals(senderIp) ? files.get(qs.get("fileId")) : null;
            if (f == null || !f[0].equals(qs.get("token"))) { status[0] = sid == null ? 409 : 403; return; }
            files.remove(qs.get("fileId"));                       // each token works once
        }
        File dir = new File(ctx.getFilesDir(), "received/" + sid.substring(0, 8));
        dir.mkdirs();
        File out = unique(dir, f[1]);
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        long n = 0, declared = Long.parseLong(f[4]);              // the size the TV accepted, not a byte more
        try (FileOutputStream o = new FileOutputStream(out)) {
            byte[] buf = new byte[65536];
            for (int r; (r = body.read(buf)) > 0; ) {
                n += r;
                if (n > MAX_BYTES || n > declared) throw new IOException("too large");
                o.write(buf, 0, r);
                sha.update(buf, 0, r);
            }
        } catch (IOException e) {
            out.delete();
            throw e;
        }
        if (!f[2].isEmpty()) {
            StringBuilder hex = new StringBuilder();
            for (byte b : sha.digest()) hex.append(String.format(Locale.US, "%02x", b));
            if (!hex.toString().equalsIgnoreCase(f[2])) { out.delete(); status[0] = 422; return; }
        }
        // iPhone photos (HEIC/HEIF) can't be shown by the page; Android 9 can decode them, so keep a JPEG copy to view.
        File view = out;
        String type = f[3];
        if (out.getName().toLowerCase(Locale.US).matches(".+\\.(heic|heif)$")) {
            try {
                android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                android.graphics.BitmapFactory.decodeFile(out.getPath(), o);
                o.inJustDecodeBounds = false;
                o.inSampleSize = 1;
                while (o.outWidth / (o.inSampleSize * 2) >= 1920 || o.outHeight / (o.inSampleSize * 2) >= 1920) o.inSampleSize *= 2;
                android.graphics.Bitmap b = android.graphics.BitmapFactory.decodeFile(out.getPath(), o);
                if (b != null) {
                    view = new File(dir, out.getName().replaceAll("(?i)\\.hei[cf]$", "") + " (view).jpg");
                    try (FileOutputStream o2 = new FileOutputStream(view)) { b.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, o2); }
                    b.recycle();
                    type = "image/jpeg";
                }
            } catch (Throwable e) {
                Log.w(TAG, "localsend: couldn't make a viewable copy of " + out.getName() + ": " + e);
            }
        }
        // Received photos also become backgrounds ("Shared photos" in Customize > Backgrounds): cropped and shaded like
        // the others, kept with the downloaded categories (bg/c-shared).
        String bgUrl = "";
        if (type.startsWith("image/")) {
            try {
                byte[] img = java.nio.file.Files.readAllBytes(view.toPath());
                File bgDir = new File(ctx.getFilesDir(), "bg/c-shared");
                bgDir.mkdirs();
                File bg = new File(bgDir, Long.toHexString(rnd.nextLong()) + ".jpg");
                try (FileOutputStream o2 = new FileOutputStream(bg)) { o2.write(Home.backdrop(img)); }
                bgUrl = android.net.Uri.fromFile(bg).toString();
            } catch (Throwable e) {
                Log.w(TAG, "localsend: couldn't make a background from " + out.getName() + ": " + e);
            }
        }
        // Storage > Network folder: received files go to the NAS (Offshore/Received); a photo keeps a copy in the cache to view.
        Nas nas = Nas.load(ctx);
        if (nas != null && nas.store) {
            try {
                nas.writeFile("Offshore/Received/" + out.getName(), out);
                if (type.startsWith("image/")) {
                    File cache = new File(ctx.getCacheDir(), "received-view");
                    cache.mkdirs();
                    File moved = new File(cache, view.getName());
                    if (view.renameTo(moved)) view = moved;
                }
                if (!out.equals(view)) out.delete();
                if (!type.startsWith("image/") && view.equals(out)) out.delete();
            } catch (Exception e) {
                Log.w(TAG, "localsend: couldn't copy " + out.getName() + " to the network folder, kept on the TV: " + e);
            }
        }
        synchronized (sync) {
            if (!sid.equals(sessionId)) { out.delete(); view.delete(); return; }
            saved.put(new JSONObject().put("name", out.getName()).put("url", android.net.Uri.fromFile(view).toString()).put("type", type).put("bytes", n)
                    .put("bg", bgUrl));
            received++;
            if (files.isEmpty()) finish(false);
        }
    }

    /** Ends the transfer (inside sync). */
    private void finish(boolean cancelled) {
        try {
            ui.done(sessionId, new JSONObject().put("from", sender).put("files", saved).put("cancelled", cancelled));
        } catch (Exception ignored) { }
        sessionId = null;
        files.clear();
    }

    // ---- Small HTTP helpers --------------------------------------------------------------------------------------

    private static String safeName(String n) {
        n = n == null ? "" : n.replace('\\', '/');
        n = n.substring(n.lastIndexOf('/') + 1).replaceAll("[\\x00-\\x1f:*?\"<>|]", "_").trim();
        if (n.startsWith(".")) n = "_" + n;
        if (n.isEmpty()) n = "file";
        return n.length() > 120 ? n.substring(n.length() - 120) : n;
    }

    private static File unique(File dir, String name) {
        File f = new File(dir, name);
        int dot = name.lastIndexOf('.');
        for (int i = 2; f.exists(); i++) f = new File(dir, dot > 0 ? name.substring(0, dot) + " (" + i + ")" + name.substring(dot) : name + " (" + i + ")");
        return f;
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder b = new StringBuilder();
        for (int c; (c = in.read()) != -1; ) {
            if (c == '\n') return b.toString().replace("\r", "");
            if (b.length() > 8192) throw new IOException("line too long");
            b.append((char) c);
        }
        return b.length() == 0 ? null : b.toString();
    }

    private static InputStream body(final InputStream in, Map<String, String> h) {
        if ("chunked".equalsIgnoreCase(h.get("transfer-encoding"))) {
            return new InputStream() {
                long left = 0;
                boolean end;
                @Override public int read() throws IOException { byte[] b = new byte[1]; return read(b, 0, 1) < 0 ? -1 : b[0] & 0xff; }
                @Override public int read(byte[] b, int off, int len) throws IOException {
                    if (end) return -1;
                    if (left == 0) {
                        String size = readLine(in);
                        if (size == null) { end = true; return -1; }
                        if (size.isEmpty()) size = readLine(in);
                        left = Long.parseLong(size.split(";")[0].trim(), 16);
                        if (left == 0) { readLine(in); end = true; return -1; }
                    }
                    int r = in.read(b, off, (int) Math.min(len, left));
                    if (r < 0) { end = true; return -1; }
                    left -= r;
                    if (left == 0) readLine(in);
                    return r;
                }
            };
        }
        final long len = h.get("content-length") == null ? 0 : Long.parseLong(h.get("content-length"));
        return new InputStream() {
            long left = len;
            @Override public int read() throws IOException { if (left <= 0) return -1; left--; return in.read(); }
            @Override public int read(byte[] b, int off, int n) throws IOException {
                if (left <= 0) return -1;
                int r = in.read(b, off, (int) Math.min(n, left));
                if (r > 0) left -= r;
                return r;
            }
        };
    }

    private static String readSmall(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int r; (r = in.read(buf)) > 0; ) {
            b.write(buf, 0, r);
            if (b.size() > 2 << 20) throw new IOException("request too large");   // prepare-upload is a small JSON
        }
        return b.toString("UTF-8");
    }

    private static void drain(InputStream in) throws IOException { byte[] buf = new byte[65536]; while (in.read(buf) > 0) { } }

    private static Map<String, String> query(String q) {
        Map<String, String> m = new HashMap<>();
        for (String kv : q.split("&")) {
            int e = kv.indexOf('=');
            if (e <= 0) continue;
            try { m.put(java.net.URLDecoder.decode(kv.substring(0, e), "UTF-8"), java.net.URLDecoder.decode(kv.substring(e + 1), "UTF-8")); } catch (Exception ignored) { }
        }
        return m;
    }

    /** Received files (Customize > Receive from phones > Delete received files). */
    static void deleteReceived(Context c) {
        deleteTree(new File(c.getFilesDir(), "received"));
        deleteTree(new File(c.getCacheDir(), "received-view"));
    }

    static long size(File f) {
        File[] k = f.listFiles();
        if (k == null) return f.isFile() ? f.length() : 0;
        long n = 0;
        for (File x : k) n += size(x);
        return n;
    }

    private static void deleteTree(File f) {
        File[] k = f.listFiles();
        if (k != null) for (File x : k) deleteTree(x);
        f.delete();
    }
}
