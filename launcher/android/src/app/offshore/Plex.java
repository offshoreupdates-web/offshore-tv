package app.offshore;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;

/**
 * Plex's Continue watching on the Keep watching row. The Plex app doesn't tell Fire TV what it plays, so Offshore asks the user's Plex servers instead.
 *
 * Linking is Plex's own TV sign-in: Offshore shows a short code, the user enters it at plex.tv/link on a phone and
 * signs in there. Offshore never sees the Plex password. The access token Plex hands back stays in this app's private
 * storage (backups are off, see the manifest); the page never gets it, only titles, progress and small pictures.
 * Every request is HTTPS (plex.tv, and the servers' plex.direct addresses, which carry real certificates); redirects
 * aren't followed. Unlink forgets the token and the servers here; Plex lists the TV under Authorized devices too.
 */
final class Plex {
    private static final String TAG = "Offshore";
    private static final String PRODUCT = "Offshore";

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("plex", Context.MODE_PRIVATE); }

    /** This TV's Plex client id: random, made once (Plex ties the link to it). */
    private static String clientId(Context c) {
        SharedPreferences p = prefs(c);
        String id = p.getString("cid", "");
        if (id.isEmpty()) { id = java.util.UUID.randomUUID().toString(); p.edit().putString("cid", id).apply(); }
        return id;
    }

    static boolean linked(Context c) { return !prefs(c).getString("token", "").isEmpty(); }

    /** One HTTPS request with Plex's headers. Returns the body, or null (not 2xx, too big, not https, or failed). */
    private static byte[] req(Context c, String method, String url, String token, int timeout, int cap) {
        if (!url.startsWith("https://")) return null;
        javax.net.ssl.HttpsURLConnection h = null;
        try {
            h = (javax.net.ssl.HttpsURLConnection) new java.net.URL(url).openConnection();
            h.setInstanceFollowRedirects(false);
            h.setConnectTimeout(timeout);
            h.setReadTimeout(timeout + 5000);
            h.setRequestMethod(method);
            h.setRequestProperty("Accept", "application/json");
            h.setRequestProperty("X-Plex-Product", PRODUCT);
            h.setRequestProperty("X-Plex-Version", "1");
            h.setRequestProperty("X-Plex-Client-Identifier", clientId(c));
            h.setRequestProperty("X-Plex-Platform", "Android");
            h.setRequestProperty("X-Plex-Device", "Fire TV");
            h.setRequestProperty("X-Plex-Device-Name", "Offshore on Fire TV");
            if (token != null) h.setRequestProperty("X-Plex-Token", token);
            if (method.equals("POST")) { h.setDoOutput(true); OutputStream o = h.getOutputStream(); o.close(); }
            int code = h.getResponseCode();
            if (code < 200 || code > 299) return null;
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            try (InputStream in = h.getInputStream()) {
                byte[] buf = new byte[16384];
                for (int n; (n = in.read(buf)) > 0; ) { b.write(buf, 0, n); if (b.size() > cap) return null; }
            }
            return b.toByteArray();
        } catch (Exception e) {
            Log.w(TAG, "plex: " + android.net.Uri.parse(url).getHost() + " " + e.getClass().getSimpleName());
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    private static org.json.JSONObject json(byte[] b) {
        try { return b == null ? null : new org.json.JSONObject(new String(b, "UTF-8")); } catch (Exception e) { return null; }
    }

    // ---- Linking ----

    /** Asks Plex for a code to enter at plex.tv/link: {code} or {} if Plex couldn't be reached. */
    static String startLink(Context c) {
        org.json.JSONObject r = json(req(c, "POST", "https://plex.tv/api/v2/pins?strong=false", null, 10000, 1 << 16));
        org.json.JSONObject out = new org.json.JSONObject();
        try {
            if (r != null && r.optLong("id") > 0 && r.optString("code").matches("[A-Za-z0-9]{4,12}")) {
                prefs(c).edit().putLong("pin", r.optLong("id")).putString("pinCode", r.optString("code"))
                        .putLong("pinUntil", System.currentTimeMillis() + 14 * 60000).apply();
                out.put("code", r.optString("code"));
            }
        } catch (Exception ignored) { }
        return out.toString();
    }

    /** "linked", "waiting" or "expired" (the code ran out, or wasn't asked for). */
    static String checkLink(Context c) {
        SharedPreferences p = prefs(c);
        long pin = p.getLong("pin", 0);
        if (linked(c)) return "linked";
        if (pin == 0 || System.currentTimeMillis() > p.getLong("pinUntil", 0)) return "expired";
        org.json.JSONObject r = json(req(c, "GET", "https://plex.tv/api/v2/pins/" + pin, null, 10000, 1 << 16));
        String tok = r == null ? "" : r.optString("authToken", "");
        if (tok.equals("null")) tok = "";
        if (tok.isEmpty()) return "waiting";
        p.edit().putString("token", tok).remove("pin").remove("pinCode").remove("pinUntil").remove("servers").apply();
        return "linked";
    }

    static void unlink(Context c) {
        String cid = prefs(c).getString("cid", "");
        prefs(c).edit().clear().putString("cid", cid).apply();
    }

    // ---- Continue watching ----

    /** The servers this account can use, each with its https addresses (local ones first) and its own token. */
    private static java.util.List<org.json.JSONObject> servers(Context c, String token) {
        java.util.List<org.json.JSONObject> out = new java.util.ArrayList<>();
        byte[] b = req(c, "GET", "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1", token, 10000, 4 << 20);
        if (b == null) return out;
        try {
            org.json.JSONArray a = new org.json.JSONArray(new String(b, "UTF-8"));
            for (int i = 0; i < a.length() && out.size() < 6; i++) {
                org.json.JSONObject r = a.getJSONObject(i);
                if (!r.optString("provides").contains("server")) continue;
                org.json.JSONArray cons = r.optJSONArray("connections"), uris = new org.json.JSONArray();
                for (int pass = 0; pass < 3 && cons != null; pass++)      // local, then remote, then Plex's relay
                    for (int j = 0; j < cons.length(); j++) {
                        org.json.JSONObject k = cons.getJSONObject(j);
                        boolean local = k.optBoolean("local"), relay = k.optBoolean("relay");
                        int kind = relay ? 2 : local ? 0 : 1;
                        String u = k.optString("uri");
                        if (kind == pass && u.startsWith("https://") && uris.length() < 6) uris.put(u);
                    }
                if (uris.length() == 0) continue;
                out.add(new org.json.JSONObject().put("id", r.optString("clientIdentifier")).put("name", r.optString("name"))
                        .put("token", r.optString("accessToken", token)).put("uris", uris));
            }
        } catch (Exception e) { Log.w(TAG, "plex resources: " + e); }
        return out;
    }

    /** What's on Plex's Continue watching, newest first, as the Keep watching row wants it: a JSON list. */
    static String continueWatching(Context c) {
        String token = prefs(c).getString("token", "");
        org.json.JSONArray out = new org.json.JSONArray();
        if (token.isEmpty()) return out.toString();
        java.util.List<org.json.JSONObject> list = servers(c, token);
        if (list.isEmpty()) return "error";
        String good = prefs(c).getString("good", "");             // the address that answered last time goes first
        for (org.json.JSONObject s : list) {
            try {
                org.json.JSONArray uris = s.getJSONArray("uris");
                java.util.List<String> order = new java.util.ArrayList<>();
                for (int i = 0; i < uris.length(); i++) { String u = uris.getString(i); if (good.equals(s.optString("id") + " " + u)) order.add(0, u); else order.add(u); }
                for (String base : order) {
                    String tk = s.optString("token");
                    byte[] b = req(c, "GET", base + "/hubs/continueWatching/items?X-Plex-Container-Size=12", tk, base.contains(".plex.direct") ? 4000 : 8000, 4 << 20);
                    if (b == null) b = req(c, "GET", base + "/library/onDeck?X-Plex-Container-Size=12", tk, 4000, 4 << 20);
                    if (b == null) continue;
                    prefs(c).edit().putString("good", s.optString("id") + " " + base).apply();
                    org.json.JSONObject mc = json(b);
                    org.json.JSONArray md = mc == null ? null : mc.optJSONObject("MediaContainer") == null ? null : mc.optJSONObject("MediaContainer").optJSONArray("Metadata");
                    for (int i = 0; md != null && i < md.length() && i < 12; i++) out.put(item(c, base, tk, s.optString("id"), md.getJSONObject(i)));
                    break;
                }
            } catch (Exception e) { Log.w(TAG, "plex deck: " + e); }
        }
        return out.toString();
    }

    private static org.json.JSONObject item(Context c, String base, String tk, String server, org.json.JSONObject m) throws Exception {
        boolean ep = "episode".equals(m.optString("type"));
        String title = ep ? m.optString("grandparentTitle") : m.optString("title");
        String sub = ep ? "S" + m.optInt("parentIndex") + " · E" + m.optInt("index") + " · " + m.optString("title")
                        : (m.optInt("year") > 0 ? String.valueOf(m.optInt("year")) : "");
        String pic = m.optString(ep ? "grandparentArt" : "art", "");
        if (pic.isEmpty()) pic = m.optString("art", "");
        if (pic.isEmpty()) pic = m.optString(ep ? "grandparentThumb" : "thumb", "");
        String art = "";
        if (pic.startsWith("/")) {                                 // a small picture, made by the server, passed on as data
            byte[] img = req(c, "GET", base + "/photo/:/transcode?width=384&height=216&minSize=1&upscale=1&url=" + URLEncoder.encode(pic, "UTF-8"), tk, 6000, 2 << 20);
            if (img != null) {
                Bitmap bm = BitmapFactory.decodeByteArray(img, 0, img.length);
                if (bm != null) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    bm.compress(Bitmap.CompressFormat.JPEG, 78, bo);
                    art = "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                }
            }
        }
        long seen = m.optLong("lastViewedAt", m.optLong("updatedAt", 0)) * 1000;
        return new org.json.JSONObject().put("server", server).put("key", m.optString("ratingKey")).put("title", title).put("sub", sub)
                .put("pos", m.optLong("viewOffset")).put("dur", m.optLong("duration")).put("t", seen).put("art", art);
    }

    /** A link that opens that title in the Plex app, or null if Plex doesn't take it (then the app just opens). */
    static android.content.Intent openIntent(Context c, String server, String key) {
        if (!server.matches("[A-Za-z0-9]{8,64}") || !key.matches("[0-9]{1,12}")) return null;
        android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW,
                android.net.Uri.parse("plex://watch/video?uri=" + android.net.Uri.encode("server://" + server + "/com.plexapp.plugins.library/library/metadata/" + key)));
        // Plex's TV app (2026.22) has a /watch/video?uri= screen taking Plex's server:// item address; plex:// is the
        // scheme it accepts (a bare plex://server://… reached Plex but it didn't know what to do with it).
        i.setPackage("com.plexapp.android");
        return i.resolveActivity(c.getPackageManager()) != null ? i : null;
    }
}
