package app.offshore;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * After the TV starts and after Offshore is updated: make sure the Home button is still switched on
 * (GuestService.ensureOn; only acts if the user set it up with tools\setup_tv.ps1). Both broadcasts come only from
 * the system.
 */
public class Startup extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) GuestService.ensureOn(c);
    }
}
