package app.offshore;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;
import org.schabi.newpipe.extractor.InfoItem;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.StreamingService;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.localization.ContentCountry;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper;
import org.schabi.newpipe.extractor.search.SearchInfo;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.AudioTrackType;
import org.schabi.newpipe.extractor.stream.DeliveryMethod;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.StreamInfoItem;
import org.schabi.newpipe.extractor.stream.VideoStream;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * YouTube videos as live backgrounds (Settings › Backgrounds › YouTube), through NewPipe Extractor (GPLv3, the library
 * NewPipe uses): search, and saving part of one video as a clip on the TV.
 * <p>
 * The picture comes from YouTube's video-only stream, at 1080p, or in 4K when asked and the TV is sending 4K; the
 * sound (AAC, in an MP4 file) only when asked. Stream addresses expire after a few hours, so clips are always
 * kept on the TV, never streamed. A long video is cut: only the part up to the clip's end is downloaded (in ranged
 * requests, the way YouTube's own players fetch it), and from the start point on it's copied into a clean file with
 * Android's own MediaExtractor and MediaMuxer, so the TV's player can loop it.
 * <p>
 * Every request the library makes goes through {@link Net}, which only talks HTTPS to YouTube's own hosts.
 */
final class YouTube {
    private static final String TAG = "Offshore";
    /** Longest clip kept: 30 minutes at 1080p (about 0.3-1.2 GB), 10 minutes in 4K (about 0.6-2 GB). */
    static final int MAX_SEC_1080 = 30 * 60, MAX_SEC_4K = 10 * 60;
    /** Latest start point: a clip may skip at most the first 10 minutes of a video. */
    static final int MAX_START = 10 * 60;
    /** Hard caps on what one clip may download, and the space that must stay free on the TV afterwards. */
    static final long CAP_1080 = 1600L << 20, CAP_4K = 2600L << 20, CAP_AUDIO = 80L << 20, KEEP_FREE = 1500L << 20;
    private static final long CHUNK = 8L << 20;          // YouTube answers ranged requests; larger ones get slowed down

    private static boolean ready;

    private YouTube() { }

    /** Hosts the library may reach: YouTube's pages and API, and the servers its video streams come from. */
    static boolean allowedHost(String host) {
        if (host == null) return false;
        host = host.toLowerCase(java.util.Locale.US);
        return host.equals("youtube.com") || host.endsWith(".youtube.com") || host.equals("youtubei.googleapis.com")
                || host.endsWith(".googlevideo.com") || host.equals("youtu.be");
    }

    /** NewPipe Extractor's way out to the internet: HTTPS only, YouTube's hosts only, size-capped answers. */
    static final class Net extends Downloader {
        @Override
        public Response execute(Request r) throws IOException {
            URL url = new URL(r.url());
            if (!"https".equals(url.getProtocol()) || !allowedHost(url.getHost())) {
                Log.w(TAG, "YouTube: refused request to " + url.getHost());
                throw new IOException("host not allowed");
            }
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestMethod(r.httpMethod());
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0");
            for (Map.Entry<String, List<String>> h : r.headers().entrySet())
                for (String v : h.getValue()) c.addRequestProperty(h.getKey(), v);
            byte[] body = r.dataToSend();
            if (body != null) {
                c.setDoOutput(true);
                try (OutputStream o = c.getOutputStream()) { o.write(body); }
            }
            try {
                int code = c.getResponseCode();
                String loc = c.getHeaderField("Location");
                if (code >= 300 && code < 400 && loc != null) {             // followed by hand, and only within YouTube
                    URL next = new URL(url, loc);
                    if (!"https".equals(next.getProtocol()) || !allowedHost(next.getHost())) throw new IOException("redirect off YouTube");
                }
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                String text = in == null ? "" : read(in, 8 << 20);
                return new Response(code, c.getResponseMessage(), c.getHeaderFields(), text, c.getURL().toString());
            } finally {
                c.disconnect();
            }
        }
    }

    private static String read(InputStream in, int cap) throws IOException {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        try {
            for (int n; (n = in.read(buf)) > 0; ) {
                if (b.size() + n > cap) throw new IOException("answer too large");
                b.write(buf, 0, n);
            }
        } finally { in.close(); }
        return b.toString("UTF-8");
    }

    private static synchronized StreamingService yt() {
        if (!ready) { NewPipe.init(new Net()); ready = true; }
        return ServiceList.YouTube;
    }

    /** An 11-character video id from a watch, share, shorts or embed link, or a bare id; "" if it isn't one. */
    static String videoId(String s) {
        s = s == null ? "" : s.trim();
        if (s.matches("[A-Za-z0-9_-]{11}")) return s;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(
                "^(?:https?://)?(?:(?:www|m|music)\\.)?(?:youtube\\.com/(?:watch\\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\\.be/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$").matcher(s);
        return m.matches() ? m.group(1) : "";
    }

    /**
     * Videos for a search (or the one video a link points to): [{id, t, a, d, th}] as JSON, at most 20. Live streams,
     * and videos shorter than 15 seconds, are left out.
     */
    static String search(String query) throws Exception { return search(query, false); }

    /**
     * The same, or with `ccOnly` only videos their uploaders licensed under Creative Commons (YouTube's own search
     * filter), as the built-in "Near you" set uses: the search goes straight to YouTube's API with that filter, since
     * the library's search has no licence filter.
     */
    static String search(String query, boolean ccOnly) throws Exception {
        StreamingService s = yt();
        if (ccOnly) {
            byte[] body = com.grack.nanojson.JsonWriter.string(YoutubeParsingHelper.prepareDesktopJsonBuilder(Localization.DEFAULT, ContentCountry.DEFAULT)
                    .value("query", query).value("params", "EgIwAQ==").done()).getBytes("UTF-8");   // filter: Creative Commons
            List<com.grack.nanojson.JsonObject> found = new ArrayList<>();
            renderers(YoutubeParsingHelper.getJsonPostResponse("search", body, Localization.DEFAULT), found, 0);
            JSONArray out = new JSONArray();
            for (com.grack.nanojson.JsonObject v : found) {
                String vid = v.getString("videoId", "");
                long sec = seconds(YoutubeParsingHelper.getTextFromObject(v.getObject("lengthText")));
                if (!vid.matches("[A-Za-z0-9_-]{11}") || sec < 15 || out.length() >= 20) continue;   // no length: live
                String by = YoutubeParsingHelper.getTextFromObject(v.getObject("ownerText"));
                out.put(item(vid, YoutubeParsingHelper.getTextFromObject(v.getObject("title")), by, sec, "https://i.ytimg.com/vi/" + vid + "/mqdefault.jpg"));
            }
            return out.toString();
        }
        JSONArray out = new JSONArray();
        String id = videoId(query);
        if (!id.isEmpty()) {
            StreamInfo i = StreamInfo.getInfo(s, "https://www.youtube.com/watch?v=" + id);
            if (i.getDuration() > 0) out.put(item(id, i.getName(), i.getUploaderName(), i.getDuration(), "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg"));
            return out.toString();
        }
        SearchInfo r = SearchInfo.getInfo(s, s.getSearchQHFactory().fromQuery(query, Collections.singletonList("videos"), ""));
        for (InfoItem it : r.getRelatedItems()) {
            if (!(it instanceof StreamInfoItem) || out.length() >= 20) continue;
            StreamInfoItem v = (StreamInfoItem) it;
            String vid = videoId(v.getUrl());
            if (vid.isEmpty() || v.getDuration() < 15) continue;                  // -1 for live streams
            out.put(item(vid, v.getName(), v.getUploaderName(), v.getDuration(), "https://i.ytimg.com/vi/" + vid + "/mqdefault.jpg"));
        }
        return out.toString();
    }

    /** Every videoRenderer in a search answer, in order. */
    private static void renderers(Object o, List<com.grack.nanojson.JsonObject> out, int depth) {
        if (depth > 40) return;
        if (o instanceof com.grack.nanojson.JsonObject) {
            com.grack.nanojson.JsonObject j = (com.grack.nanojson.JsonObject) o;
            if (j.has("videoRenderer")) { out.add(j.getObject("videoRenderer")); return; }
            for (Object v : j.values()) renderers(v, out, depth + 1);
        } else if (o instanceof com.grack.nanojson.JsonArray) {
            for (Object v : (com.grack.nanojson.JsonArray) o) renderers(v, out, depth + 1);
        }
    }

    /** "1:02:03" or "4:05" in seconds; -1 if it isn't a length. */
    private static long seconds(String t) {
        if (t == null || !t.matches("\\d{1,2}(:\\d{2}){1,2}")) return -1;
        long s = 0;
        for (String p : t.split(":")) s = s * 60 + Long.parseLong(p);
        return s;
    }

    private static JSONObject item(String id, String title, String by, long sec, String thumb) throws Exception {
        return new JSONObject().put("id", id).put("t", title == null ? "" : title).put("a", by == null ? "" : by).put("d", sec).put("th", thumb);
    }

    /** The video-only stream to save: 4K (VP9, 30 fps preferred) when wanted and there is one, else 1080p (H.264, then VP9), else the best below. */
    static VideoStream pick(List<VideoStream> all, boolean want4k) {
        int[] order = want4k ? new int[] { 313, 315, 271, 308, 137, 248, 299, 303, 136, 247 }
                             : new int[] { 137, 248, 299, 303, 136, 247, 298, 302 };
        for (int itag : order)
            for (VideoStream v : all)
                if (v.getItag() == itag && v.getDeliveryMethod() == DeliveryMethod.PROGRESSIVE_HTTP) return v;
        return null;
    }

    /**
     * Saves video `id` as a silent clip at `outBase` (+".mp4" or ".webm"). Returns the file, or throws with a short
     * reason the page can show.
     */
    static File save(String id, boolean want4k, File outBase) throws Exception { return save(id, want4k, outBase, 0, 0, false, false); }

    /**
     * With `seconds` > 0 the clip is at most that long (never longer than the caps above). With `ccOnly` the video
     * must still carry a Creative Commons licence when it's saved (the built-in sets are hand-picked CC videos; an
     * uploader can change the licence later).
     */
    static File save(String id, boolean want4k, File outBase, int seconds, boolean ccOnly) throws Exception {
        return save(id, want4k, outBase, seconds, 0, false, ccOnly);
    }
    /** Set by the last save: whether the clip kept its sound (the TV's muxer may not take it). */
    static volatile boolean lastHadSound;
    /**
     * Saves part of a video: {@code seconds} long (0 = the longest allowed) from {@code start} seconds in, with the
     * original sound track when {@code sound} is set and the TV can store it.
     */
    static File save(String id, boolean want4k, File outBase, int seconds, int start, boolean sound, boolean ccOnly) throws Exception {
        lastHadSound = false;
        if (videoId(id).isEmpty()) throw new IOException("not a YouTube video");
        StreamInfo info = StreamInfo.getInfo(yt(), "https://www.youtube.com/watch?v=" + id);
        if (info.getDuration() <= 0) throw new IOException("live streams can't be saved");
        if (ccOnly && (info.getLicence() == null || !info.getLicence().contains("Creative Commons"))) throw new IOException("no longer Creative Commons");
        VideoStream v = pick(info.getVideoOnlyStreams(), want4k);
        if (v == null) throw new IOException("no 1080p or 720p version");
        boolean four = v.getHeight() >= 2000 || v.getItag() == 313 || v.getItag() == 315;
        long dur = Math.max(1, info.getDuration());
        start = Math.max(0, Math.min(start, Math.min(MAX_START, (int) dur - 20)));
        int maxSec = four ? MAX_SEC_4K : MAX_SEC_1080;
        if (seconds > 0) maxSec = Math.min(maxSec, Math.max(20, seconds));
        long cap = four ? CAP_4K : CAP_1080;
        boolean webm = v.getFormat() != null && "webm".equalsIgnoreCase(v.getFormat().getSuffix());
        // Enough for the start point plus maxSec seconds, with room to spare (the bitrate isn't even across a video).
        double part = Math.min(1.0, (start + maxSec + 20.0) / dur);
        long want = share(v.getItagItem() != null ? v.getItagItem().getContentLength() : -1, part, cap);
        // Sound is always AAC. Android 9's muxers take neither Opus in WebM nor VP9 in MP4, so a WebM (VP9, 4K) picture
        // keeps its sound beside it, in "<name>.m4a", which the player loops along with the picture.
        AudioStream a = sound ? pickAudio(info.getAudioStreams(), false) : null;
        long wantA = a == null ? 0 : share(a.getItagItem() != null ? a.getItagItem().getContentLength() : -1, part, CAP_AUDIO);
        File folder = outBase.getParentFile();
        if (folder == null || (!folder.isDirectory() && !folder.mkdirs())) throw new IOException("no folder");
        if (folder.getUsableSpace() < (want + wantA) * 2 + KEEP_FREE) throw new IOException("not enough free space on the TV");
        File vPart = new File(folder, outBase.getName() + ".part");
        File aPart = new File(folder, outBase.getName() + ".apart");
        File out = new File(folder, outBase.getName() + (webm ? ".webm" : ".mp4"));
        File side = new File(folder, outBase.getName() + ".m4a");
        try {
            download(v.getContent(), vPart, want);
            if (a != null) {
                try { download(a.getContent(), aPart, wantA); }
                catch (IOException e) { Log.w(TAG, "YouTube: sound for " + id + " not saved: " + e); aPart.delete(); }
            }
            boolean withSound = a != null && aPart.length() > 0;
            side.delete();
            if (withSound && !webm) {
                try { remux(vPart, aPart, out, start * 1000000L, maxSec * 1000000L, false); }
                catch (Exception e) { Log.w(TAG, "YouTube: keeping " + id + " without sound: " + e); withSound = false; out.delete(); }
            }
            if (!withSound || webm) {
                long first = remux(vPart, null, out, start * 1000000L, maxSec * 1000000L, webm);
                if (withSound) {
                    try { remuxAudio(aPart, side, first, maxSec * 1000000L); }
                    catch (Exception e) { Log.w(TAG, "YouTube: keeping " + id + " without sound: " + e); withSound = false; side.delete(); }
                }
            }
            lastHadSound = withSound;
        } catch (Exception e) {
            out.delete();
            side.delete();
            throw e;
        } finally {
            vPart.delete();
            aPart.delete();
        }
        return out;
    }
    /** Bytes to fetch for the first {@code part} of a stream {@code len} bytes long, capped. */
    private static long share(long len, double part, long cap) {
        return Math.min(cap, len > 0 ? Math.min(len, (long) (len * part * 1.25) + (2L << 20)) : cap);
    }
    /** The original-language sound track for a container: AAC for MP4, Opus for WebM. */
    static AudioStream pickAudio(List<AudioStream> all, boolean webm) {
        int[] order = webm ? new int[] { 251, 250, 249 } : new int[] { 140, 139 };
        for (int itag : order)
            for (AudioStream a : all)
                if (a.getItag() == itag && a.getDeliveryMethod() == DeliveryMethod.PROGRESSIVE_HTTP
                        && (a.getAudioTrackType() == null || a.getAudioTrackType() == AudioTrackType.ORIGINAL)) return a;
        return null;
    }

    private static boolean videoHost(URL u) {
        return "https".equals(u.getProtocol()) && u.getHost().toLowerCase(java.util.Locale.US).endsWith(".googlevideo.com");
    }

    /**
     * The first `bytes` of a stream, in ranged requests, to `f`. Only googlevideo.com: YouTube's servers often hand a
     * stream on to another of theirs (a 302), which is followed, at most 5 times, and never anywhere else.
     */
    private static void download(String url, File f, long bytes) throws IOException {
        URL u = new URL(url);
        if (!videoHost(u)) throw new IOException("stream not on YouTube's servers");
        int hops = 0;
        try (FileOutputStream fo = new FileOutputStream(f)) {
            byte[] buf = new byte[65536];
            long got = 0;
            while (got < bytes) {
                long end = Math.min(bytes, got + CHUNK) - 1;
                HttpURLConnection c = (HttpURLConnection) u.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0");
                c.setRequestProperty("Range", "bytes=" + got + "-" + end);
                try {
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) {                              // another of YouTube's servers
                        String loc = c.getHeaderField("Location");
                        URL next = loc == null ? null : new URL(u, loc);
                        if (next == null || !videoHost(next) || ++hops > 5) throw new IOException("YouTube redirected the video elsewhere");
                        u = next;
                        continue;                                                 // the same range, from there
                    }
                    if (code == 416) break;                                       // the stream ended early
                    if (code != 206 && code != 200) throw new IOException("YouTube answered " + code);
                    long before = got;
                    try (InputStream in = c.getInputStream()) {
                        for (int n; (n = in.read(buf)) > 0 && got < bytes; ) {
                            int w = (int) Math.min(n, bytes - got);
                            fo.write(buf, 0, w);
                            got += w;
                        }
                    }
                    if (got == before || code == 200) break;                      // nothing more, or the whole file at once
                } finally { c.disconnect(); }
            }
        }
    }

    /** Copies the video track of `in` into a clean MP4 or WebM, up to `maxUs`; a cut-off end is fine. */
    /**
     * Copies the picture (and the sound, when {@code audioIn} is given) from {@code startUs} for {@code maxUs} into a
     * clean file, starting at the key frame before the start point and with the two tracks interleaved by time.
     */
    /** Returns the picture's first time (microseconds into the video), where a separate sound file starts too. */
    private static long remux(File in, File audioIn, File out, long startUs, long maxUs, boolean webm) throws IOException {
        MediaExtractor ex = new MediaExtractor(), ax = audioIn == null ? null : new MediaExtractor();
        MediaMuxer mux = null;
        boolean started = false;
        long samples = 0;
        try {
            ex.setDataSource(in.getAbsolutePath());
            int track = firstTrack(ex, "video/");
            if (track < 0) throw new IOException("no picture in the download");
            ex.selectTrack(track);
            MediaFormat fmt = ex.getTrackFormat(track);
            MediaFormat afmt = null;
            if (ax != null) {
                ax.setDataSource(audioIn.getAbsolutePath());
                int at = firstTrack(ax, "audio/");
                if (at < 0) throw new IOException("no sound in the download");
                ax.selectTrack(at);
                afmt = ax.getTrackFormat(at);
            }
            mux = new MediaMuxer(out.getAbsolutePath(), webm ? MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM : MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int t = mux.addTrack(fmt), ta = afmt == null ? -1 : mux.addTrack(afmt);
            mux.start();
            started = true;
            if (startUs > 0) ex.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            long first = ex.getSampleTime();
            if (first < 0) throw new IOException("the start point is past the download");
            if (ax != null) {
                ax.seekTo(first, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                while (ax.getSampleTime() >= 0 && ax.getSampleTime() < first) if (!ax.advance()) break;
            }
            int size = fmt.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE) ? Math.max(fmt.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE), 2 << 20) : 8 << 20;
            ByteBuffer buf = ByteBuffer.allocate(size);
            MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();
            boolean vDone = false, aDone = ax == null;
            while (!vDone || !aDone) {
                long vt = vDone ? Long.MAX_VALUE : ex.getSampleTime(), at = aDone ? Long.MAX_VALUE : ax.getSampleTime();
                if (!vDone && (vt < 0 || vt - first > maxUs)) { vDone = true; continue; }
                if (!aDone && (at < 0 || at - first > maxUs)) { aDone = true; continue; }
                boolean video = vt <= at;
                MediaExtractor src = video ? ex : ax;
                int n;
                try { n = src.readSampleData(buf, 0); } catch (RuntimeException cut) { n = -1; }   // a cut-off last sample
                if (n < 0) { if (video) vDone = true; else aDone = true; continue; }
                bi.set(0, n, (video ? vt : at) - first, (src.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0);
                mux.writeSampleData(video ? t : ta, buf, bi);
                if (video) samples++;
                if (!src.advance()) { if (video) vDone = true; else aDone = true; }
            }
            if (samples < 30) throw new IOException("the video couldn't be read");
            return first;
        } finally {
            ex.release();
            if (ax != null) ax.release();
            if (mux != null) {
                try { if (started) mux.stop(); } catch (RuntimeException e) { Log.w(TAG, "YouTube: muxer stop: " + e); }
                mux.release();
            }
        }
    }
    /** The sound alone, from {@code firstUs} for {@code maxUs}, into an M4A file beside a 4K clip. */
    private static void remuxAudio(File in, File out, long firstUs, long maxUs) throws IOException {
        MediaExtractor ax = new MediaExtractor();
        MediaMuxer mux = null;
        boolean started = false;
        long samples = 0;
        try {
            ax.setDataSource(in.getAbsolutePath());
            int at = firstTrack(ax, "audio/");
            if (at < 0) throw new IOException("no sound in the download");
            ax.selectTrack(at);
            mux = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int t = mux.addTrack(ax.getTrackFormat(at));
            mux.start();
            started = true;
            ax.seekTo(firstUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            while (ax.getSampleTime() >= 0 && ax.getSampleTime() < firstUs) if (!ax.advance()) break;
            ByteBuffer buf = ByteBuffer.allocate(1 << 20);
            MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();
            while (true) {
                long pts = ax.getSampleTime();
                if (pts < 0 || pts - firstUs > maxUs) break;
                int n;
                try { n = ax.readSampleData(buf, 0); } catch (RuntimeException cut) { break; }
                if (n < 0) break;
                bi.set(0, n, pts - firstUs, MediaCodec.BUFFER_FLAG_KEY_FRAME);
                mux.writeSampleData(t, buf, bi);
                samples++;
                if (!ax.advance()) break;
            }
            if (samples < 30) throw new IOException("the sound couldn't be read");
        } finally {
            ax.release();
            if (mux != null) {
                try { if (started) mux.stop(); } catch (RuntimeException e) { Log.w(TAG, "YouTube: muxer stop: " + e); }
                mux.release();
            }
        }
    }
    private static int firstTrack(MediaExtractor ex, String kind) {
        for (int i = 0; i < ex.getTrackCount(); i++) {
            String mime = ex.getTrackFormat(i).getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith(kind)) return i;
        }
        return -1;
    }
}
