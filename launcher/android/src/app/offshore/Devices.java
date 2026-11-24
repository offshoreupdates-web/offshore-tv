package app.offshore;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Bluetooth and Wi-Fi inside Customize, so people rarely need Fire TV's own screens. Everything here is
 * the public Android API a normal app may use; finding devices and networks needs the location permission (Android ties
 * scanning to it), asked once with Android's own prompt.
 * Safety: Bluetooth is never turned off, and the Fire TV remote (and Amazon accessories) can't be forgotten from here,
 * because the remote itself is a Bluetooth device. Wi-Fi passwords go straight to Android and are never kept by the app.
 */
final class Devices {
    private static final String TAG = "Offshore";
    private final Context ctx;
    private final Home home;
    private final Map<String, BluetoothDevice> found = new HashMap<>();
    private BluetoothProfile a2dp;
    private boolean listening;

    Devices(Context ctx, Home home) {
        this.ctx = ctx.getApplicationContext();
        this.home = home;
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        if (a != null) a.getProfileProxy(this.ctx, new BluetoothProfile.ServiceListener() {
            @Override public void onServiceConnected(int p, BluetoothProfile proxy) { a2dp = proxy; }
            @Override public void onServiceDisconnected(int p) { a2dp = null; }
        }, BluetoothProfile.A2DP);
    }

    private BroadcastReceiver rcv;

    /** Customize closed (or the page is going): stop hearing every Wi-Fi scan and Bluetooth event until asked again. */
    void stop() {
        if (!listening) return;
        listening = false;
        try { ctx.unregisterReceiver(rcv); } catch (Exception ignored) { }
        try { BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter(); if (a != null && a.isDiscovering()) a.cancelDiscovery(); } catch (Exception ignored) { }
    }

    private void listen() {
        if (listening) return;
        listening = true;
        IntentFilter f = new IntentFilter();
        f.addAction(BluetoothDevice.ACTION_FOUND);
        f.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        f.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        f.addAction(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
        f.addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION);
        ctx.registerReceiver(rcv = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                String a = i.getAction();
                if (BluetoothDevice.ACTION_FOUND.equals(a)) {
                    BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (d != null && d.getName() != null) found.put(d.getAddress(), d);
                }
                if (a != null && a.startsWith("android.bluetooth")) home.pageJs("window.guestBt && guestBt(" + btState() + ")");
                else home.pageJs("window.guestWifi && guestWifi(" + wifiState() + ")");
            }
        }, f);
    }

    // ---- Bluetooth ---------------------------------------------------------------------------------------------

    /** An Amazon remote or accessory: never offered to be forgotten here. */
    private static boolean protectedDevice(BluetoothDevice d) {
        String n = d.getName() == null ? "" : d.getName();
        return n.matches("(?i).*(amazon|fire ?tv|alexa|remote).*");
    }

    private static String kind(BluetoothDevice d) {
        BluetoothClass k = d.getBluetoothClass();
        if (k == null) return "other";
        switch (k.getMajorDeviceClass()) {
            case BluetoothClass.Device.Major.AUDIO_VIDEO: return "audio";
            case BluetoothClass.Device.Major.PERIPHERAL: return "input";
            case BluetoothClass.Device.Major.PHONE: return "phone";
            case BluetoothClass.Device.Major.COMPUTER: return "computer";
            default: return "other";
        }
    }

    private static boolean connected(BluetoothDevice d) {
        try { return (Boolean) d.getClass().getMethod("isConnected").invoke(d); } catch (Exception e) { return false; }
    }

    String btState() {
        JSONObject o = new JSONObject();
        try {
            BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
            o.put("ok", a != null && a.isEnabled()).put("scanning", a != null && a.isDiscovering());
            JSONArray paired = new JSONArray(), near = new JSONArray();
            if (a != null) {
                for (BluetoothDevice d : a.getBondedDevices()) {
                    paired.put(new JSONObject().put("addr", d.getAddress()).put("name", d.getName() == null ? d.getAddress() : d.getName())
                            .put("kind", kind(d)).put("connected", connected(d)).put("locked", protectedDevice(d)));
                }
                for (BluetoothDevice d : found.values()) {
                    if (d.getBondState() == BluetoothDevice.BOND_BONDED) continue;
                    near.put(new JSONObject().put("addr", d.getAddress()).put("name", d.getName()).put("kind", kind(d))
                            .put("pairing", d.getBondState() == BluetoothDevice.BOND_BONDING));
                }
            }
            o.put("paired", paired).put("near", near);
        } catch (Exception e) {
            Log.w(TAG, "bluetooth state: " + e);
        }
        return o.toString();
    }

    void btScan() {
        listen();
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        if (a == null || !a.isEnabled()) return;
        found.clear();
        if (a.isDiscovering()) a.cancelDiscovery();
        a.startDiscovery();                                 // results arrive as ACTION_FOUND (about 12 s)
        home.pageJs("window.guestBt && guestBt(" + btState() + ")");
    }

    void btPair(String addr) {
        listen();
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        if (a == null) return;
        a.cancelDiscovery();                                // pairing is unreliable while searching
        BluetoothDevice d = found.containsKey(addr) ? found.get(addr) : a.getRemoteDevice(addr);
        d.createBond();                                     // headphones usually connect by themselves once paired
    }

    /** Connect a paired speaker or headphones (A2DP). Uses the platform's connect call; if it isn't allowed, says so. */
    boolean btConnect(String addr) {
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        if (a == null || a2dp == null) return false;
        try {
            BluetoothDevice d = a.getRemoteDevice(addr);
            Object r = a2dp.getClass().getMethod("connect", BluetoothDevice.class).invoke(a2dp, d);
            return r instanceof Boolean && (Boolean) r;
        } catch (Exception e) {
            Log.w(TAG, "bluetooth connect: " + e);
            return false;
        }
    }

    boolean btForget(String addr) {
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        if (a == null) return false;
        BluetoothDevice d = a.getRemoteDevice(addr);
        if (protectedDevice(d)) return false;               // never the remote
        try { return (Boolean) d.getClass().getMethod("removeBond").invoke(d); } catch (Exception e) { Log.w(TAG, "bluetooth forget: " + e); return false; }
    }

    // ---- Wi-Fi -------------------------------------------------------------------------------------------------

    private WifiManager wifi() { return (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE); }

    private static String unquote(String s) { return s != null && s.length() > 1 && s.startsWith("\"") && s.endsWith("\"") ? s.substring(1, s.length() - 1) : s; }

    String wifiState() {
        JSONObject o = new JSONObject();
        try {
            WifiManager w = wifi();
            WifiInfo info = w.getConnectionInfo();
            String now = info == null ? "" : unquote(info.getSSID());
            if ("<unknown ssid>".equals(now)) now = "";
            o.put("ok", w.isWifiEnabled()).put("now", now).put("nowLevel", info == null ? 0 : WifiManager.calculateSignalLevel(info.getRssi(), 5));
            java.util.Set<String> saved = new java.util.HashSet<>();
            List<WifiConfiguration> cfg = w.getConfiguredNetworks();
            if (cfg != null) for (WifiConfiguration c : cfg) saved.add(unquote(c.SSID));
            Map<String, JSONObject> best = new HashMap<>();
            List<ScanResult> res = w.getScanResults();
            if (res != null) for (ScanResult r : res) {
                if (r.SSID == null || r.SSID.isEmpty()) continue;
                int lvl = WifiManager.calculateSignalLevel(r.level, 5);
                JSONObject cur = best.get(r.SSID);
                if (cur != null && cur.getInt("level") >= lvl) continue;
                String caps = r.capabilities == null ? "" : r.capabilities;
                String sec = caps.contains("WPA3") || caps.contains("SAE") ? "wpa3" : caps.contains("WPA") ? "wpa" : caps.contains("WEP") ? "wep" : caps.contains("EAP") ? "eap" : "open";
                best.put(r.SSID, new JSONObject().put("ssid", r.SSID).put("level", lvl).put("sec", sec).put("saved", saved.contains(r.SSID)));
            }
            JSONArray list = new JSONArray();
            for (JSONObject n : best.values()) list.put(n);
            o.put("networks", list).put("scanned", res != null && !res.isEmpty());
        } catch (Exception e) {
            Log.w(TAG, "wifi state: " + e);
        }
        return o.toString();
    }

    void wifiScan() {
        listen();
        wifi().startScan();
        home.pageJs("window.guestWifi && guestWifi(" + wifiState() + ")");
    }

    /**
     * Join a network: a saved one directly; otherwise with the password typed on the TV (WPA/WPA2 personal or open;
     * WPA3-only, WEP and enterprise networks go to Fire TV's settings). The password is handed to Android, not kept.
     */
    String wifiJoin(String ssid, String password) {
        WifiManager w = wifi();
        List<WifiConfiguration> cfg = w.getConfiguredNetworks();
        if (cfg != null) for (WifiConfiguration c : cfg) {
            if (ssid.equals(unquote(c.SSID)) && (password == null || password.isEmpty())) {
                w.disconnect();
                boolean ok = w.enableNetwork(c.networkId, true) && w.reconnect();
                return ok ? "ok" : "failed";
            }
        }
        WifiConfiguration c = new WifiConfiguration();
        c.SSID = "\"" + ssid + "\"";
        if (password == null || password.isEmpty()) c.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE);
        else { if (password.length() < 8) return "short"; c.preSharedKey = "\"" + password + "\""; }
        int id = w.addNetwork(c);
        if (id < 0) return "failed";
        w.disconnect();
        boolean ok = w.enableNetwork(id, true) && w.reconnect();
        return ok ? "ok" : "failed";
    }
}
