package com.familyguard.parent.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.LoginRequest
import com.familyguard.parent.network.RedeemAdultRequest
import com.familyguard.parent.network.RegisterRequest
import kotlinx.coroutines.launch

private enum class AuthMode { Login, Register, Invite }

@Composable
fun LoginScreen(prefs: Prefs, onLoggedIn: () -> Unit) {
    var mode by remember { mutableStateOf(AuthMode.Login) }
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val expired by prefs.sessionExpired.collectAsState(initial = false)

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("FamilyGuard", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(4.dp))
        Text(
            when (mode) {
                AuthMode.Register -> "Creá tu cuenta de padre/madre"
                AuthMode.Invite -> "Sumate a tu familia con el código que te dieron"
                AuthMode.Login -> "Ingresá con tu cuenta"
            }
        )
        if (expired && mode == AuthMode.Login) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Tu sesión venció, por eso volvés a ver esta pantalla. No se borró nada: al ingresar de nuevo vas a ver a tu familia.",
                color = MaterialTheme.colorScheme.tertiary,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Spacer(Modifier.height(24.dp))

        if (mode == AuthMode.Invite) {
            OutlinedTextField(
                value = code, onValueChange = { code = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(8) },
                label = { Text("Código de invitación") }, singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            )
            Spacer(Modifier.height(8.dp))
        }
        if (mode != AuthMode.Login) {
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Tu nombre") }, singleLine = true)
            Spacer(Modifier.height(8.dp))
        }
        OutlinedTextField(value = email, onValueChange = { email = it.trim() }, label = { Text("Email") }, singleLine = true)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = password, onValueChange = { password = it }, label = { Text("Contraseña (mínimo 8 caracteres)") },
            visualTransformation = PasswordVisualTransformation(), singleLine = true
        )
        Spacer(Modifier.height(16.dp))

        Button(
            enabled = !loading && email.isNotBlank() && password.length >= 8 &&
                (mode == AuthMode.Login || name.isNotBlank()) && (mode != AuthMode.Invite || code.length >= 4),
            onClick = {
                loading = true
                error = null
                scope.launch {
                    val api = ApiClient.create(prefs)
                    val result = runCatching {
                        when (mode) {
                            AuthMode.Register -> api.register(RegisterRequest(email, password, name))
                            AuthMode.Invite -> api.redeemAdultInvite(RedeemAdultRequest(code, name.trim(), email, password))
                            AuthMode.Login -> api.login(LoginRequest(email, password))
                        }
                    }
                    loading = false
                    result.onSuccess { response ->
                        val body = response.body()
                        if (response.isSuccessful && body != null) {
                            prefs.saveSession(body.token, body.parent.name)
                            onLoggedIn()
                        } else {
                            error = when (response.code()) {
                                401 -> "Email o contraseña incorrectos."
                                409 -> "Ese email ya tiene una cuenta. Probá ingresar."
                                400 -> if (mode == AuthMode.Invite) "Ese código no sirve: venció o ya se usó. Pedí uno nuevo." else "Revisá los datos."
                                429 -> "Demasiados intentos. Esperá unos minutos y probá de nuevo."
                                in 500..599 -> "El servidor tuvo un problema (${response.code()}). Probá de nuevo en un minuto."
                                else -> "No pudimos ingresar (código ${response.code()})."
                            }
                        }
                    }.onFailure {
                        error = "No pudimos conectar con el servidor. Si estaba dormido puede tardar hasta un minuto: probá de nuevo."
                    }
                }
            }
        ) {
            Text(
                if (loading) "Un momento…" else when (mode) {
                    AuthMode.Register -> "Crear cuenta"
                    AuthMode.Invite -> "Sumarme a la familia"
                    AuthMode.Login -> "Ingresar"
                }
            )
        }

        Spacer(Modifier.height(8.dp))
        if (mode != AuthMode.Login) {
            TextButton(onClick = { mode = AuthMode.Login; error = null }) { Text("Ya tengo cuenta") }
        } else {
            TextButton(onClick = { mode = AuthMode.Invite; error = null }) { Text("Tengo un código de invitación") }
            TextButton(onClick = { mode = AuthMode.Register; error = null }) { Text("Crear una cuenta nueva (primera vez)") }
        }

        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
