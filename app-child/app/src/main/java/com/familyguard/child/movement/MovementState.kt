package com.familyguard.child.movement

/** Último tipo de movimiento detectado (caminando, auto, etc.), leído por
 * el servicio de ubicación y el worker de respaldo al armar cada ping.
 * En memoria nomás: si el proceso murió y se reinició, no pasa nada que
 * se pierda — se vuelve a llenar con la próxima detección. */
object MovementState {
    @Volatile
    var current: String? = null
}
