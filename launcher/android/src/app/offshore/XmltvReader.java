package app.offshore;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.zip.GZIPInputStream;

/**
 * Live TV's programme guide: reads an XMLTV file (the guide IPTV services publish next to their playlist, often gzipped)
 * as a stream, keeping only the owner's channels and the hours asked for, so a 100 MB guide never sits in memory.
 * Plain Java (no Android parts), so it can be tested on a computer. Channels are found by the playlist's tvg-id, or by
 * name when a playlist has none (the guide's <channel> display names, which come before the programmes).
 */
final class XmltvReader {
    static final class Show { long start, stop; String title, desc, cat; }

    final Map<String, List<Show>> shows = new HashMap<>();  // guide channel id -> shows, in time order
    final Map<String, String> byName = new HashMap<>();      // lower-case channel name -> guide channel id
    final Map<String, Map<String, Integer>> cats = new HashMap<>();   // guide channel id -> programme category -> count
    int kept;

    private final Set<String> ids, names;
    private final long from, to;
    private final int perChannel;
    private final long maxChars;

    /** ids: the playlist's tvg-ids; names: lower-case channel names (for channels without one). */
    XmltvReader(Set<String> ids, Set<String> names, long from, long to, int perChannel, long maxChars) {
        this.ids = new HashSet<>(ids); this.names = names; this.from = from; this.to = to; this.perChannel = perChannel; this.maxChars = maxChars;
    }

    /** Reads the whole stream (plain or gzipped). Throws when it's larger than maxChars. */
    void read(InputStream raw) throws IOException {
        BufferedInputStream b = new BufferedInputStream(raw, 65536);
        b.mark(2);
        int x = b.read(), y = b.read();
        b.reset();
        InputStream in = x == 0x1f && y == 0x8b ? new GZIPInputStream(b, 65536) : b;
        Reader r = new InputStreamReader(in, StandardCharsets.UTF_8);
        char[] buf = new char[65536];
        StringBuilder tag = new StringBuilder(), text = new StringBuilder();
        boolean inTag = false;
        String textFor = null, chanId = null;
        Show cur = null; String curChan = null;
        long total = 0;
        for (int n; (n = r.read(buf)) > 0; ) {
            total += n;
            if (total > maxChars) throw new IOException("guide too big");
            for (int i = 0; i < n; i++) {
                char ch = buf[i];
                if (inTag) {
                    if (ch == '>') {
                        inTag = false;
                        String t = tag.toString();
                        tag.setLength(0);
                        // The tag just closed.
                        if (t.startsWith("programme")) {
                            String c = attr(t, "channel");
                            long s = time(attr(t, "start")), e = time(attr(t, "stop"));
                            cur = null; curChan = null;
                            if (c != null && ids.contains(c) && s > 0 && e > from && s < to) { cur = new Show(); cur.start = s; cur.stop = e; curChan = c; }
                        } else if (t.startsWith("/programme")) {
                            if (cur != null && cur.title != null) keep(curChan, cur);
                            cur = null; curChan = null;
                        } else if (t.startsWith("channel ") || t.equals("channel")) {
                            chanId = attr(t, "id");
                        } else if (t.startsWith("/channel")) {
                            chanId = null;
                        } else if ((t.startsWith("title") && cur != null) || (t.startsWith("desc") && cur != null) || (t.startsWith("category") && cur != null) || (t.startsWith("display-name") && chanId != null)) {
                            if (!t.endsWith("/")) { textFor = t.startsWith("title") ? "title" : t.startsWith("desc") ? "desc" : t.startsWith("category") ? "cat" : "name"; text.setLength(0); }
                        } else if (t.startsWith("/title") || t.startsWith("/desc") || t.startsWith("/category") || t.startsWith("/display-name")) {
                            if (textFor != null) {
                                String v = decode(text.toString().trim());
                                if (textFor.equals("title") && cur != null && cur.title == null) cur.title = clip(v, 90);
                                else if (textFor.equals("desc") && cur != null && cur.desc == null) cur.desc = clip(v, 220);
                                else if (textFor.equals("cat") && cur != null && cur.cat == null && !v.isEmpty()) cur.cat = clip(v, 40).toLowerCase(Locale.US);
                                else if (textFor.equals("name") && chanId != null) {
                                    String low = v.toLowerCase(Locale.US);
                                    if (names.contains(low) && !byName.containsKey(low)) { byName.put(low, chanId); ids.add(chanId); }
                                }
                            }
                            textFor = null;
                        }
                    } else if (tag.length() < 4096) tag.append(ch);
                } else if (ch == '<') {
                    inTag = true;
                } else if (textFor != null && text.length() < 1000) {
                    text.append(ch);
                }
            }
        }
        java.util.Comparator<Show> byStart = new java.util.Comparator<Show>() {
            @Override public int compare(Show p, Show q) { return p.start < q.start ? -1 : p.start > q.start ? 1 : 0; }
        };
        for (List<Show> l : shows.values()) java.util.Collections.sort(l, byStart);
    }

    private void keep(String chan, Show s) {
        if (s.cat != null) {                               // what kind of channel this is, by its shows' categories
            Map<String, Integer> m = cats.get(chan);
            if (m == null) { m = new HashMap<>(); cats.put(chan, m); }
            Integer was = m.get(s.cat); m.put(s.cat, was == null ? 1 : was + 1);
        }
        List<Show> l = shows.get(chan);
        if (l == null) { l = new ArrayList<>(); shows.put(chan, l); }
        if (l.size() >= perChannel) {                        // full: keep the earliest (what's on now and next), drop the latest
            int drop = 0; for (int k = 1; k < l.size(); k++) if (l.get(k).start > l.get(drop).start) drop = k;
            if (s.start >= l.get(drop).start) return;
            l.remove(drop); kept--;
        }
        l.add(s); kept++;
    }

    /** The category most of a channel's shows have, or null. */
    String topCategory(String chan) {
        Map<String, Integer> m = cats.get(chan);
        if (m == null) return null;
        String best = null; int n = 0;
        for (Map.Entry<String, Integer> e : m.entrySet()) if (e.getValue() > n) { n = e.getValue(); best = e.getKey(); }
        return best;
    }

    static String attr(String tag, String key) {
        int i = tag.indexOf(key + "=\"");
        char q = '"';
        if (i < 0) { i = tag.indexOf(key + "='"); q = '\''; }
        if (i < 0) return null;
        int s = i + key.length() + 2, e = tag.indexOf(q, s);
        return e >= s ? decode(tag.substring(s, e)) : null;
    }

    /** "20261114183000 +0000" (XMLTV) -> epoch ms; 0 when it can't be read. */
    static long time(String v) {
        if (v == null || v.length() < 12) return 0;
        try {
            Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US);
            c.clear();
            c.set(Integer.parseInt(v.substring(0, 4)), Integer.parseInt(v.substring(4, 6)) - 1, Integer.parseInt(v.substring(6, 8)),
                  Integer.parseInt(v.substring(8, 10)), Integer.parseInt(v.substring(10, 12)), v.length() >= 14 && Character.isDigit(v.charAt(13)) ? Integer.parseInt(v.substring(12, 14)) : 0);
            long t = c.getTimeInMillis();
            int p = v.indexOf('+', 12), m = v.indexOf('-', 12), o = p >= 0 ? p : m;
            if (o >= 0 && v.length() >= o + 5) {
                int hh = Integer.parseInt(v.substring(o + 1, o + 3)), mm = Integer.parseInt(v.substring(o + 3, o + 5));
                t -= (p >= 0 ? 1 : -1) * (hh * 3600000L + mm * 60000L);
            }
            return t;
        } catch (Exception e) { return 0; }
    }

    static String decode(String s) {
        if (s.indexOf('&') < 0) return s;
        StringBuilder o = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            int semi = c == '&' ? s.indexOf(';', i) : -1;
            if (semi > i && semi - i <= 10) {
                String e = s.substring(i + 1, semi);
                String r = e.equals("amp") ? "&" : e.equals("lt") ? "<" : e.equals("gt") ? ">" : e.equals("quot") ? "\"" : e.equals("apos") ? "'" : null;
                if (r == null && e.startsWith("#")) {
                    try { r = new String(Character.toChars(e.startsWith("#x") ? Integer.parseInt(e.substring(2), 16) : Integer.parseInt(e.substring(1)))); }
                    catch (Exception ignored) { }
                }
                if (r != null) { o.append(r); i = semi; continue; }
            }
            o.append(c);
        }
        return o.toString();
    }

    private static String clip(String s, int n) { s = s.replaceAll("\\s+", " ").trim(); return s.length() > n ? s.substring(0, n - 1).trim() + "…" : s; }
}
