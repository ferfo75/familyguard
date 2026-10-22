package com.familyguard.parent.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.LoginRequest
import com.familyguard.parent.network.RegisterRequest
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(prefs: Prefs, onLoggedIn: () -> Unit) {
    var isRegisterMode by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("FamilyGuard", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(4.dp))
        Text(if (isRegisterMode) "Creá tu cuenta de padre/madre" else "Ingresá con tu cuenta")
        Spacer(Modifier.height(24.dp))

        if (isRegisterMode) {
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Tu nombre") })
            Spacer(Modifier.height(8.dp))
        }
        OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") })
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = password, onValueChange = { password = it }, label = { Text("Contraseña") },
            visualTransformation = PasswordVisualTransformation()
        )
        Spacer(Modifier.height(16.dp))

        Button(
            enabled = !loading && email.isNotBlank() && password.length >= 8 && (!isRegisterMode || name.isNotBlank()),
            onClick = {
                loading = true
                error = null
                scope.launch {
                    val api = ApiClient.create(prefs)
                    val result = runCatching {
                        if (isRegisterMode) api.register(RegisterRequest(email, password, name))
                        else api.login(LoginRequest(email, password))
                    }
                    loading = false
                    result.onSuccess { response ->
                        val body = response.body()
                        if (response.isSuccessful && body != null) {
                            prefs.saveSession(body.token, body.parent.name)
                            onLoggedIn()
                        } else {
                            error = "Email o contraseña incorrectos."
                        }
                    }.onFailure {
                        error = "No pudimos conectar con el servidor."
                    }
                }
            }
        ) { Text(if (loading) "Un momento…" else if (isRegisterMode) "Crear cuenta" else "Ingresar") }

        Spacer(Modifier.height(8.dp))
        TextButton(onClick = { isRegisterMode = !isRegisterMode }) {
            Text(if (isRegisterMode) "Ya tengo cuenta" else "Crear una cuenta nueva")
        }

        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
