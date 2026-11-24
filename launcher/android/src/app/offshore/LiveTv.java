package app.offshore;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Live TV: the user's own IPTV playlists (M3U), played in VLC. Offshore ships no channels, no example playlists and no
 * way to find any: it only reads links the user adds from their phone (CalendarLink in playlist mode), after they
 * confirm they have the right to watch them. Rule: user's own links only; player only (no
 * recording, downloading or sharing of streams).
 *
 * Playlist links and stream addresses often hold the provider's username and password, so they stay in this app's
 * private storage (getFilesDir: never the shared folder, never the settings backup) and never reach the page: the page
 * gets channel names and groups, and plays a channel by its list and position.
 *
 * Light on purpose: a playlist is read once (and again when the user refreshes it, or when it's a day old and Live TV
 * opens), on a low-priority thread, capped at 30 MB and 20,000 channels; nothing runs while Live TV is closed.
 */
final class LiveTv {
    static final String VLC = "org.videolan.vlc";
    private static final String TAG = "Offshore-tv";
    private static final int MAX_BYTES = 30 * 1024 * 1024, MAX_CH = 20000;
    private static final Object LOCK = new Object();

    interface Done { void done(String id, String error, int count); }

    private static File index(Context c) { return new File(c.getFilesDir(), "livetv.json"); }
    private static File chFile(Context c, String id) { return new File(c.getFilesDir(), "livetv-" + id.replaceAll("[^a-z0-9]", "") + ".json"); }
    private static File guideFile(Context c, String id) { return new File(c.getFilesDir(), "livetv-guide-" + id.replaceAll("[^a-z0-9]", "") + ".json"); }

    static JSONObject readIndex(Context c) {
        synchronized (LOCK) {
            try { return new JSONObject(read(index(c))); } catch (Exception e) { return new JSONObject(); }
        }
    }
    private static void writeIndex(Context c, JSONObject j) throws Exception { synchronized (LOCK) { write(index(c), j.toString()); } }

    /** {lists: [{id, name, count, at, error}], vlc}: no addresses. */
    static String state(Context c) {
        try {
            JSONArray lists = readIndex(c).optJSONArray("lists"), out = new JSONArray();
            if (lists != null) for (int i = 0; i < lists.length(); i++) {
                JSONObject l = lists.getJSONObject(i);
                out.put(new JSONObject().put("id", l.optString("id")).put("name", l.optString("name")).put("count", l.optInt("count"))
                        .put("at", l.optLong("at")).put("error", l.optString("error", ""))
                        .put("guide", !guideUrl(l).isEmpty()).put("guideAt", l.optLong("guideAt")).put("guideError", l.optString("guideError", "")));
            }
            boolean vlc;
            try { c.getPackageManager().getPackageInfo(VLC, 0); vlc = true; } catch (Exception e) { vlc = false; }
            return new JSONObject().put("lists", out).put("vlc", vlc).toString();
        } catch (Exception e) { return "{\"lists\":[]}"; }
    }

    /** [[name, group, listId, position, country], ...] for every playlist, in order: no addresses. */
    static String channels(Context c) {
        JSONArray out = new JSONArray();
        try {
            JSONArray lists = readIndex(c).optJSONArray("lists");
            if (lists != null) for (int i = 0; i < lists.length(); i++) {
                String id = lists.getJSONObject(i).optString("id");
                JSONArray ch = new JSONArray(read(chFile(c, id)));
                for (int k = 0; k < ch.length(); k++) {
                    JSONArray x = ch.getJSONArray(k);
                    out.put(new JSONArray().put(x.optString(0)).put(x.optString(1)).put(id).put(k).put(x.optString(3)));
                }
            }
        } catch (Exception e) { /* no list read yet */ }
        return out.toString();
    }

    /** The stream address for a channel, or null (only used to hand it to VLC). */
    static String streamUrl(Context c, String id, int pos) {
        try { return new JSONArray(read(chFile(c, id))).getJSONArray(pos).optString(2, null); } catch (Exception e) { return null; }
    }

    static String add(Context c, String name, String url, Done done) { return add(c, name, url, "", done, null); }

    static String add(Context c, String name, String url, String guide, Done done, Done guideDone) {
        String id = Long.toString(System.currentTimeMillis(), 36);
        try {
            JSONObject j = readIndex(c);
            JSONArray lists = j.optJSONArray("lists");
            if (lists == null) lists = new JSONArray();
            if (lists.length() >= 5) { done.done(id, "Five playlists at most. Remove one first.", 0); return id; }
            lists.put(new JSONObject().put("id", id).put("name", name).put("url", url).put("at", 0).put("count", 0).put("epg", guide == null ? "" : guide));
            j.put("lists", lists);
            writeIndex(c, j);
        } catch (Exception e) { done.done(id, "Couldn't keep the playlist on this TV", 0); return id; }
        refresh(c, id, done, guideDone);
        return id;
    }

    static void remove(Context c, String id) {
        try {
            JSONObject j = readIndex(c);
            JSONArray lists = j.optJSONArray("lists"), keep = new JSONArray();
            if (lists != null) for (int i = 0; i < lists.length(); i++) if (!id.equals(lists.getJSONObject(i).optString("id"))) keep.put(lists.get(i));
            j.put("lists", keep);
            writeIndex(c, j);
            //noinspection ResultOfMethodCallIgnored
            chFile(c, id).delete();
            //noinspection ResultOfMethodCallIgnored
            guideFile(c, id).delete();
        } catch (Exception e) { Log.w(TAG, "remove: " + e); }
    }

    /** Read the playlist again (in the background); `done` hears how it went. */
    static void refresh(final Context c, final String id, final Done done) { refresh(c, id, done, null); }

    static void refresh(final Context c, final String id, final Done done, final Done guideDone) {
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                String url = null;
                JSONArray lists = readIndex(c).optJSONArray("lists");
                if (lists != null) for (int i = 0; i < lists.length(); i++) if (id.equals(lists.optJSONObject(i).optString("id"))) url = lists.optJSONObject(i).optString("url");
                if (url == null) { done.done(id, "That playlist is no longer on this TV", 0); return; }
                String error = "";
                String[] epg = { "" };
                int count = 0;
                try {
                    JSONArray ch = fetch(url, epg);
                    count = ch.length();
                    if (count == 0) error = "No channels in that playlist";
                    else { write(chFile(c, id), ch.toString()); forget(id); }
                } catch (Exception e) {
                    error = e.getMessage() != null && e.getMessage().startsWith("!") ? e.getMessage().substring(1) : "Couldn't read the playlist";
                    Log.w(TAG, "playlist: " + e);
                }
                try {
                    JSONObject j = readIndex(c);
                    JSONArray ls = j.optJSONArray("lists");
                    if (ls != null) for (int i = 0; i < ls.length(); i++) {
                        JSONObject l = ls.getJSONObject(i);
                        if (!id.equals(l.optString("id"))) continue;
                        l.put("error", error);
                        if (error.isEmpty()) l.put("count", count).put("at", System.currentTimeMillis()).put("epgAuto", epg[0]);
                    }
                    writeIndex(c, j);
                } catch (Exception e) { Log.w(TAG, "index: " + e); }
                Log.i(TAG, "playlist read: " + (error.isEmpty() ? count + " channels" : error));
                done.done(id, error, count);
                if (error.isEmpty() && guideDone != null) guideRead(c, id, guideDone);   // the guide too, on this thread
            }
        }, "livetv");
        t.setPriority(Thread.MIN_PRIORITY);
        t.start();
    }

    /** Download and read an M3U playlist: [[name, group, address, country], ...] (country: the playlist's tvg-country, or
     *  ""; the page also works it out from names like "US | Sports"). Errors starting with "!" are shown as they are. */
    private static JSONArray fetch(String address, String[] epg) throws Exception {
        URL u = new URL(address);
        if (!"http".equals(u.getProtocol()) && !"https".equals(u.getProtocol())) throw new Exception("!Only http and https playlist links work");
        HttpURLConnection h = (HttpURLConnection) u.openConnection();
        h.setConnectTimeout(15000); h.setReadTimeout(30000);
        h.setRequestProperty("User-Agent", "Offshore");
        int code = h.getResponseCode();
        if (code == 401 || code == 403) throw new Exception("!The playlist's server refused (check the link)");
        if (code >= 400) throw new Exception("!The playlist's server answered " + code);
        JSONArray out = new JSONArray();
        long total = 0;
        try (InputStream in = h.getInputStream(); BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8), 65536)) {
            String line, name = null, group = "", grp = "", country = "", tvgId = "";
            while ((line = r.readLine()) != null) {
                total += line.length() + 1;
                if (total > MAX_BYTES) throw new Exception("!That playlist is too big (over 30 MB)");
                line = line.trim();
                if (line.isEmpty()) continue;
                if (line.startsWith("#EXTM3U")) {               // the playlist's own guide link, if it names one
                    String g = attr(line, "x-tvg-url");
                    if (g.isEmpty()) g = attr(line, "url-tvg");
                    for (String one : g.split(",")) { one = one.trim(); if (one.startsWith("http://") || one.startsWith("https://")) { epg[0] = one; break; } }
                } else if (line.startsWith("#EXTINF")) {
                    tvgId = attr(line, "tvg-id");
                    group = attr(line, "group-title");
                    country = attr(line, "tvg-country");
                    name = title(line);
                } else if (line.startsWith("#EXTGRP:")) {
                    grp = line.substring(8).trim();
                } else if (!line.startsWith("#")) {
                    String low = line.toLowerCase(java.util.Locale.US);
                    if (low.startsWith("http://") || low.startsWith("https://") || low.startsWith("rtsp://") || low.startsWith("rtmp://") || low.startsWith("rtmps://")) {
                        String n = name == null || name.isEmpty() ? "Channel " + (out.length() + 1) : name;
                        String g = !group.isEmpty() ? group : grp;
                        out.put(new JSONArray().put(clip(n, 80)).put(clip(g, 40)).put(line).put(clip(country, 12)).put(clip(tvgId, 80)));
                        if (out.length() >= MAX_CH) break;
                    }
                    name = null; group = ""; grp = ""; country = ""; tvgId = "";
                }
            }
        } finally { h.disconnect(); }
        return out;
    }

    // ---- The programme guide (XMLTV, from the user's provider: the playlist's own link or one they added) -----------
    static String guideUrl(JSONObject l) { String u = l.optString("epg", ""); return u.isEmpty() ? l.optString("epgAuto", "") : u; }

    /** Read a playlist's guide in the background (when Live TV opens and the guide is over 6 hours old). */
    static void guideRefresh(final Context c, final String id, final Done done) {
        Thread t = new Thread(new Runnable() { @Override public void run() { guideRead(c, id, done); } }, "livetv-guide");
        t.setPriority(Thread.MIN_PRIORITY);
        t.start();
    }

    private static final Object GUIDE_LOCK = new Object();
    private static void guideRead(Context c, String id, Done done) {
        synchronized (GUIDE_LOCK) {                        // one guide at a time: they can be large
            JSONObject l = null;
            JSONArray lists = readIndex(c).optJSONArray("lists");
            if (lists != null) for (int i = 0; i < lists.length(); i++) if (id.equals(lists.optJSONObject(i).optString("id"))) l = lists.optJSONObject(i);
            if (l == null || guideUrl(l).isEmpty()) return;
            String error = "";
            int kept = 0;
            try {
                java.util.Set<String> ids = new java.util.HashSet<>(), names = new java.util.HashSet<>();
                JSONArray ch = new JSONArray(read(chFile(c, id)));
                for (int k = 0; k < ch.length(); k++) {
                    JSONArray x = ch.getJSONArray(k);
                    String tid = x.optString(4);
                    if (!tid.isEmpty()) ids.add(tid); else names.add(x.optString(0).toLowerCase(java.util.Locale.US));
                }
                long now = System.currentTimeMillis();
                XmltvReader r = new XmltvReader(ids, names, now - 3600000L, now + 12 * 3600000L, 8, 800L << 20);
                URL u = new URL(guideUrl(l));
                if (!"http".equals(u.getProtocol()) && !"https".equals(u.getProtocol())) throw new Exception("!Only http and https guide links work");
                HttpURLConnection h = (HttpURLConnection) u.openConnection();
                h.setConnectTimeout(15000); h.setReadTimeout(60000);
                h.setRequestProperty("User-Agent", "Offshore");
                int code = h.getResponseCode();
                if (code >= 400) throw new Exception("!The guide's server answered " + code);
                try (InputStream in = h.getInputStream()) { r.read(in); } finally { h.disconnect(); }
                JSONObject g = new JSONObject();                // guide channel id -> [[start min, stop min, title, desc], ...]
                for (java.util.Map.Entry<String, java.util.List<XmltvReader.Show>> e : r.shows.entrySet()) {
                    JSONArray a = new JSONArray();
                    for (XmltvReader.Show sh : e.getValue()) a.put(new JSONArray().put(sh.start / 60000).put(sh.stop / 60000).put(sh.title).put(sh.desc == null ? "" : sh.desc));
                    g.put(e.getKey(), a);
                }
                JSONObject byName = new JSONObject(), cats = new JSONObject();
                for (java.util.Map.Entry<String, String> e : r.byName.entrySet()) byName.put(e.getKey(), e.getValue());
                for (String ch2 : r.cats.keySet()) { String top = r.topCategory(ch2); if (top != null) cats.put(ch2, top); }
                write(guideFile(c, id), new JSONObject().put("at", now).put("g", g).put("n", byName).put("c", cats).toString());
                synchronized (GUIDES) { GUIDES.remove(id); }
                kept = r.shows.size();
            } catch (Exception e) {
                error = e.getMessage() != null && e.getMessage().startsWith("!") ? e.getMessage().substring(1) : "Couldn't read the guide";
                Log.w(TAG, "guide: " + e);
            }
            try {
                JSONObject j = readIndex(c);
                JSONArray ls = j.optJSONArray("lists");
                if (ls != null) for (int i = 0; i < ls.length(); i++) {
                    JSONObject x = ls.getJSONObject(i);
                    if (!id.equals(x.optString("id"))) continue;
                    x.put("guideError", error);
                    if (error.isEmpty()) x.put("guideAt", System.currentTimeMillis());
                }
                writeIndex(c, j);
            } catch (Exception e) { Log.w(TAG, "index: " + e); }
            Log.i(TAG, "guide read: " + (error.isEmpty() ? kept + " channels with listings" : error));
            if (done != null) done.done(id, error, kept);
        }
    }

    private static final java.util.Map<String, JSONObject> GUIDES = new java.util.HashMap<>();   // a playlist's guide, read once
    private static final java.util.Map<String, JSONArray> CHANNELS = new java.util.HashMap<>();

    /** What's on: {"position": [[start min, stop min, title, desc], ...]} for the channels asked for: what's on now and
     *  the shows starting in the next 2½ hours (6 at most), enough for the guide grid. */
    static String guide(Context c, String id, String positions) {
        JSONObject out = new JSONObject();
        try {
            JSONObject g;
            JSONArray ch;
            synchronized (GUIDES) {
                g = GUIDES.get(id);
                if (g == null) { File f = guideFile(c, id); if (!f.isFile()) return "{}"; g = new JSONObject(read(f)); GUIDES.put(id, g); }
                ch = CHANNELS.get(id);
                if (ch == null || ch.length() == 0) { ch = new JSONArray(read(chFile(c, id))); CHANNELS.put(id, ch); }
            }
            JSONObject shows = g.optJSONObject("g"), names = g.optJSONObject("n");
            if (shows == null) return "{}";
            long nowMin = System.currentTimeMillis() / 60000;
            for (String p : positions.split(",")) {
                int pos;
                try { pos = Integer.parseInt(p.trim()); } catch (Exception e) { continue; }
                JSONArray x = ch.optJSONArray(pos);
                if (x == null) continue;
                String tid = x.optString(4);
                if (tid.isEmpty() && names != null) tid = names.optString(x.optString(0).toLowerCase(java.util.Locale.US), "");
                JSONArray list = tid.isEmpty() ? null : shows.optJSONArray(tid);
                if (list == null) continue;
                JSONArray keep = new JSONArray();
                for (int k = 0; k < list.length() && keep.length() < 6; k++) {
                    JSONArray sh = list.getJSONArray(k);
                    if (sh.getLong(1) > nowMin && sh.getLong(0) < nowMin + 150) keep.put(sh);
                }
                if (keep.length() > 0) out.put(String.valueOf(pos), keep);
            }
        } catch (Exception e) { Log.w(TAG, "guide lookup: " + e); }
        return out.toString();
    }

    /** Each channel's main programme category from the guide ("sports event", "movie", "children"...): {"position": cat}.
     *  The page uses it to file a channel when its name and group don't say. */
    static String guideCategories(Context c, String id) {
        JSONObject out = new JSONObject();
        try {
            JSONObject g; JSONArray ch;
            synchronized (GUIDES) {
                g = GUIDES.get(id);
                if (g == null) { File f = guideFile(c, id); if (!f.isFile()) return "{}"; g = new JSONObject(read(f)); GUIDES.put(id, g); }
                ch = CHANNELS.get(id);
                if (ch == null || ch.length() == 0) { ch = new JSONArray(read(chFile(c, id))); CHANNELS.put(id, ch); }
            }
            JSONObject cats = g.optJSONObject("c"), names = g.optJSONObject("n");
            if (cats == null) return "{}";
            for (int k = 0; k < ch.length(); k++) {
                JSONArray x = ch.getJSONArray(k);
                String tid = x.optString(4);
                if (tid.isEmpty() && names != null) tid = names.optString(x.optString(0).toLowerCase(java.util.Locale.US), "");
                String cat = tid.isEmpty() ? "" : cats.optString(tid, "");
                if (!cat.isEmpty()) out.put(String.valueOf(k), cat);
            }
        } catch (Exception e) { Log.w(TAG, "guide categories: " + e); }
        return out.toString();
    }

    /** A playlist was read again: its channel list (and positions) may have changed. */
    static void forget(String id) { synchronized (GUIDES) { CHANNELS.remove(id); GUIDES.remove(id); } }

    private static String attr(String line, String key) {
        int i = line.indexOf(key + "=\"");
        if (i < 0) return "";
        int s = i + key.length() + 2, e = line.indexOf('"', s);
        return e > s ? line.substring(s, e).trim() : "";
    }

    private static String title(String line) {            // after the first comma that isn't inside quotes
        boolean q = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') q = !q;
            else if (ch == ',' && !q) return line.substring(i + 1).trim();
        }
        return "";
    }

    private static String clip(String s, int n) { s = s.replaceAll("[\\p{Cntrl}]", " ").trim(); return s.length() > n ? s.substring(0, n) : s; }

    private static String read(File f) throws Exception {
        try (FileInputStream in = new FileInputStream(f)) {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }

    private static void write(File f, String s) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(s.getBytes(StandardCharsets.UTF_8)); }
        if (!tmp.renameTo(f)) throw new Exception("rename failed");
    }
}
