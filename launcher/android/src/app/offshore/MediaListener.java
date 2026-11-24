package app.offshore;

import android.service.notification.NotificationListenerService;

/**
 * Exists only so Android lets the home screen see what's playing (MediaSessionManager.getActiveSessions needs an enabled
 * notification listener). It reads no notifications. Enabled once by the user:
 *   adb shell cmd notification allow_listener app.offshore/app.offshore.MediaListener
 */
public class MediaListener extends NotificationListenerService {
    @Override
    public void onListenerConnected() {
        Home.musicPermissionChanged(getApplicationContext());
    }
}
