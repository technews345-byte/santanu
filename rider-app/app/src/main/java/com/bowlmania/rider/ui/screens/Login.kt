@file:OptIn(ExperimentalMaterial3Api::class)

package com.bowlmania.rider.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeliveryDining
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.BuildConfig
import com.bowlmania.rider.notify.Push
import com.bowlmania.rider.ui.appContainer
import com.bowlmania.rider.ui.components.BigButton
import com.bowlmania.rider.work.Workers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class LoginVm(private val c: AppContainer) : ViewModel() {
    val loading = MutableStateFlow(false)
    val error = MutableStateFlow<String?>(null)

    fun signIn(email: String, password: String, onDone: () -> Unit) {
        if (loading.value) return
        if (email.isBlank() || password.isBlank()) { error.value = "Enter your email and password."; return }
        viewModelScope.launch {
            loading.value = true; error.value = null
            c.repository.login(email, password).fold(
                {
                    Workers.schedulePeriodicSync(c.app)
                    launch { Push.register(c.repository) }
                    onDone()
                },
                { error.value = it.message },
            )
            loading.value = false
        }
    }
}

@Composable
fun LoginScreen(onSignedIn: () -> Unit, notice: String?) {
    val c = appContainer()
    val vm: LoginVm = viewModel { LoginVm(c) }
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current

    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState())
            .systemBarsPadding().imePadding().padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(Modifier.height(24.dp))
        Box(Modifier.size(72.dp).clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.DeliveryDining, null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(40.dp))
        }
        Text("Bowl Mania Rider", style = MaterialTheme.typography.headlineMedium)
        Text("Sign in with the account your manager created for you.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (notice != null) Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = MaterialTheme.shapes.medium) {
            Text(notice, Modifier.padding(14.dp), color = MaterialTheme.colorScheme.onTertiaryContainer)
        }
        OutlinedTextField(
            value = email, onValueChange = { email = it.trim() }, label = { Text("Email") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(), enabled = !loading,
        )
        OutlinedTextField(
            value = password, onValueChange = { password = it }, label = { Text("Password") }, singleLine = true,
            visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { focus.clearFocus(); vm.signIn(email, password, onSignedIn) }),
            trailingIcon = {
                IconButton(onClick = { show = !show }) { Icon(if (show) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, if (show) "Hide password" else "Show password") }
            },
            modifier = Modifier.fillMaxWidth(), enabled = !loading,
        )
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        BigButton("Sign in", onClick = { focus.clearFocus(); vm.signIn(email, password, onSignedIn) }, loading = loading)
        Text(
            "Forgot your password? Ask your manager to reset it from the admin panel.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
        )
        if (BuildConfig.ENVIRONMENT != "production") Text(
            "${BuildConfig.ENVIRONMENT} · ${BuildConfig.API_BASE_URL}", style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
        )
    }
}
