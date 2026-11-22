package com.familyguard.child.push

import com.familyguard.child.data.Prefs
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Avisos del servidor hacia el celular del hijo/a:
 *  - kind = "wake": el seguimiento se durmió; se vuelve a arrancar solo (ver [ChildPush.wake]).
 */
class ChildFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        CoroutineScope(Dispatchers.IO).launch { ChildPush.register(applicationContext, Prefs(applicationContext), token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["kind"] == "wake") ChildPush.wake(applicationContext)
    }
}
