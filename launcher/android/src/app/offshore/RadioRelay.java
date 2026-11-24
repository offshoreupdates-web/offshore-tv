package app.offshore;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;

/**
 * Radio stations that only stream unencrypted (radio only).
 * The app allows no cleartext, so the page and Android's player can't open an http:// station. This relay fetches
 * the one station chosen (a public internet address, checked after the name is looked up) and passes the audio on at
 * http://127.0.0.1:port/token, the only cleartext address the app allows (res/xml/network_security_config.xml).
 * It listens on the TV's loopback only, behind a random token, for one station at a time; old SHOUTcast servers that
 * answer "ICY 200 OK" come out as plain HTTP, so the players accept them.
 */
final class RadioRelay {
    private static ServerSocket server;
    private static volatile String target = "", token = "";
    private static volatile Socket upstream, client;

    /** Starts relaying this http:// station and returns the local address to play, or "" if it isn't allowed. */
    static synchronized String relay(String url) {
        try {
            URI u = new URI(url);
            String h = u.getHost();
            if (!"http".equals(u.getScheme()) || h == null || u.getUserInfo() != null || !h.contains(".")) return "";
            if (server == null || server.isClosed()) {
                server = new ServerSocket();
                server.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 4);
                Thread t = new Thread(new Runnable() { @Override public void run() { serve(); } }, "radio-relay");
                t.setDaemon(true); t.start();
            }
            closeStreams();
            target = url;
            token = Long.toHexString(new java.security.SecureRandom().nextLong() & Long.MAX_VALUE);
            return "http://127.0.0.1:" + server.getLocalPort() + "/" + token;
        } catch (Exception e) { return ""; }
    }

    /** True for an address this relay handed out (Home.radioPlay lets exactly that one through). */
    static boolean mine(String url) {
        return server != null && !token.isEmpty() && url != null && url.equals("http://127.0.0.1:" + server.getLocalPort() + "/" + token);
    }

    static synchronized void stop() { target = ""; token = ""; closeStreams(); }

    private static void closeStreams() {
        try { if (upstream != null) upstream.close(); } catch (Exception e) { }
        try { if (client != null) client.close(); } catch (Exception e) { }
        upstream = null; client = null;
    }

    private static void serve() {
        while (true) {
            final Socket s;
            try { s = server.accept(); } catch (Exception e) { return; }
            new Thread(new Runnable() { @Override public void run() { handle(s); } }, "radio-relay-conn").start();
        }
    }

    /** A public internet address: not this TV, the home network, IPv6 home addresses (fc00::/7) or a carrier's shared
     *  range (100.64.0.0/10), however it's written (an IPv6 address carrying an IPv4 one is checked as that one). */
    static boolean isPublic(InetAddress a) {
        byte[] b = a.getAddress();
        if (b.length == 16 && (b[0] & 0xfe) == 0xfc) return false;
        if (b.length == 16) {                                      // ::ffff:a.b.c.d and ::a.b.c.d
            boolean v4 = true;
            for (int i = 0; i < 10; i++) if (b[i] != 0) v4 = false;
            if (v4 && (b[10] == b[11]) && (b[10] == 0 || b[10] == (byte) 0xff)) {
                try { return isPublic(InetAddress.getByAddress(java.util.Arrays.copyOfRange(b, 12, 16))); } catch (Exception e) { return false; }
            }
        }
        if (b.length == 4 && ((b[0] & 0xff) == 100 && (b[1] & 0xc0) == 64 || (b[0] & 0xff) == 0)) return false;
        return !(a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress() || a.isAnyLocalAddress() || a.isMulticastAddress());
    }

    private static String line(InputStream in) throws Exception {
        StringBuilder b = new StringBuilder();
        int c;
        while ((c = in.read()) != -1 && c != '\n') { if (c != '\r') b.append((char) c); if (b.length() > 8192) throw new Exception("long line"); }
        if (c == -1 && b.length() == 0) throw new Exception("closed");
        return b.toString();
    }

    private static void handle(Socket s) {
        Socket up = null;
        try {
            s.setSoTimeout(15000);
            InputStream cin = s.getInputStream();
            String req = line(cin);
            while (line(cin).length() > 0) { }                    // the player's headers: not needed
            String want = token;
            String[] parts = req.split(" ");
            if (parts.length < 2 || want.isEmpty() || !parts[1].equals("/" + want)) { s.close(); return; }
            String url = target;
            InputStream uin = null; String type = "audio/mpeg";
            for (int hop = 0; hop < 5 && uin == null; hop++) {    // follow up to 5 redirects
                URI u = new URI(url);
                boolean tls = "https".equals(u.getScheme());
                if (!tls && !"http".equals(u.getScheme())) throw new Exception("scheme");
                InetAddress a = InetAddress.getByName(u.getHost());
                if (!isPublic(a)) throw new Exception("not a public address");   // a name can't point the relay at this TV or the home network
                int port = u.getPort() > 0 ? u.getPort() : tls ? 443 : 80;
                up = new Socket();
                up.connect(new InetSocketAddress(a, port), 10000);
                if (tls) {
                    javax.net.ssl.SSLSocket ss = (javax.net.ssl.SSLSocket) ((javax.net.ssl.SSLSocketFactory) javax.net.ssl.SSLSocketFactory.getDefault()).createSocket(up, u.getHost(), port, true);
                    ss.startHandshake();
                    if (!javax.net.ssl.HttpsURLConnection.getDefaultHostnameVerifier().verify(u.getHost(), ss.getSession())) throw new Exception("certificate");
                    up = ss;
                }
                up.setSoTimeout(20000);
                synchronized (RadioRelay.class) { if (!want.equals(token)) throw new Exception("replaced"); upstream = up; client = s; }
                String path = (u.getRawPath() == null || u.getRawPath().isEmpty() ? "/" : u.getRawPath()) + (u.getRawQuery() != null ? "?" + u.getRawQuery() : "");
                OutputStream uo = up.getOutputStream();
                uo.write(("GET " + path + " HTTP/1.0\r\nHost: " + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "") +
                    "\r\nUser-Agent: Offshore (TV home screen)\r\nAccept: */*\r\nIcy-MetaData: 0\r\nConnection: close\r\n\r\n").getBytes("ISO-8859-1"));
                uo.flush();
                InputStream in = up.getInputStream();
                String status = line(in);                           // "HTTP/1.1 200 OK" or SHOUTcast's "ICY 200 OK"
                String[] st = status.split(" ");
                int code = st.length > 1 ? Integer.parseInt(st[1].trim()) : 0;
                String loc = null, h;
                while ((h = line(in)).length() > 0) {
                    int i = h.indexOf(':'); if (i < 0) continue;
                    String k = h.substring(0, i).trim().toLowerCase(java.util.Locale.US), v = h.substring(i + 1).trim();
                    if (k.equals("location")) loc = v;
                    else if (k.equals("content-type") && v.matches("[\\w.+-]+/[\\w.+-]+.*")) type = v.split(";")[0];
                }
                if (code >= 300 && code < 400 && loc != null) { up.close(); url = u.resolve(loc).toString(); continue; }
                if (code != 200) throw new Exception("status " + code);
                uin = in;
            }
            if (uin == null) throw new Exception("too many redirects");
            OutputStream out = s.getOutputStream();
            out.write(("HTTP/1.0 200 OK\r\nContent-Type: " + type + "\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n").getBytes("ISO-8859-1"));
            byte[] buf = new byte[16384];
            int n;
            while ((n = uin.read(buf)) > 0 && want.equals(token)) out.write(buf, 0, n);
        } catch (Exception e) {
            try { s.getOutputStream().write("HTTP/1.0 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n".getBytes("ISO-8859-1")); } catch (Exception x) { }
        } finally {
            try { if (up != null) up.close(); } catch (Exception e) { }
            try { s.close(); } catch (Exception e) { }
        }
    }
}
