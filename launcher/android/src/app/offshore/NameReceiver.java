package app.offshore;

import android.bluetooth.BluetoothAdapter;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * The TV's Bluetooth name (what phones and headphones see) follows Customize > This TV > Room, e.g. "Living room TV".
 * The name the TV had before is kept here, and restore_stock.sh puts it back (RESTORE_BT_NAME) before uninstalling.
 */
public class NameReceiver extends BroadcastReceiver {
    private static final String TAG = "Offshore";

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("device", Context.MODE_PRIVATE); }

    /** Sets the Bluetooth name, keeping the original the first time. Fire OS may put its own back at boot, so the app sets it again on start. */
    static void apply(Context c, String name) {
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        name = name == null ? "" : name.replaceAll("[\\x00-\\x1f]", "").trim();
        if (a == null || name.isEmpty()) return;
        if (name.length() > 40) name = name.substring(0, 40);
        String now = a.getName();
        SharedPreferences p = prefs(c);
        if (!p.contains("btOriginal") && now != null) p.edit().putString("btOriginal", now).apply();
        if (!name.equals(now) && a.setName(name)) Log.i(TAG, "bluetooth name set from the room name");
    }

    static void restore(Context c) {
        String original = prefs(c).getString("btOriginal", null);
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        if (a != null && original != null && a.setName(original)) Log.i(TAG, "bluetooth name restored");
    }

    @Override
    public void onReceive(Context c, Intent i) {
        if ("app.offshore.RESTORE_BT_NAME".equals(i.getAction())) restore(c);
    }
}
