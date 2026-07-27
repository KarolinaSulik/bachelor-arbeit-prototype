import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from 'https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@11.0.0/+esm';

const statusOutput = document.getElementById('status-output');
const loginSuccessCard = document.getElementById('login-success');
const successMessage = document.getElementById('success-message');

// Shows the latest result directly in the UI.
function setStatus(title, data) {
  statusOutput.textContent = `${title}\n\n${JSON.stringify(data, null, 2)}`;
}

function hideLoginSuccess() {
  loginSuccessCard.classList.add('success-card-hidden');
}

function showLoginSuccess(user, method = 'Anmeldung') {
  const email = user?.email ? ` (${user.email})` : '';
  successMessage.textContent = `${method} war erfolgreich${email}. Deine Session ist aktiv und du kannst den geschützten Bereich öffnen.`;
  loginSuccessCard.classList.remove('success-card-hidden');
}

// Helper for simple JSON requests to the backend.
async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// General app logic: ask whether a login session already exists.
async function loadSession() {
  const response = await fetch('/api/session');
  const data = await response.json();
  setStatus('Aktuelle Session', data);

  if (data.authenticated) {
    showLoginSuccess(data.user, 'Anmeldung');
  } else {
    hideLoginSuccess();
  }
}

// General app logic: call the protected route after login.
async function openDashboard() {
  const response = await fetch('/dashboard');
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Dashboard request failed');
  }

  setStatus('Dashboard', data);
}

document
  .getElementById('password-register-form')
  .addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
    };

    try {
      // Password flow: one normal request with email + password.
      const data = await postJson('/register/password', payload);
      setStatus('Passwortregistrierung erfolgreich', data);
      showLoginSuccess(data.user, 'Registrierung und Anmeldung');
    } catch (error) {
      hideLoginSuccess();
      setStatus('Passwortregistrierung fehlgeschlagen', { error: error.message });
    }
  });

document.getElementById('password-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const payload = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  try {
    // Password flow: one normal request with email + password.
    const data = await postJson('/login/password', payload);
    setStatus('Passwortanmeldung erfolgreich', data);
    showLoginSuccess(data.user, 'Passwortanmeldung');
  } catch (error) {
    hideLoginSuccess();
    setStatus('Passwortanmeldung fehlgeschlagen', { error: error.message });
  }
});

document.getElementById('passkey-register-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!browserSupportsWebAuthn()) {
    setStatus('Passkey-Registrierung fehlgeschlagen', {
      error: 'Dieser Browser unterstützt WebAuthn nicht',
    });
    return;
  }

  const formData = new FormData(event.currentTarget);
  const email = formData.get('email');

  try {
    // Passkey flow: first get options from the server, then start WebAuthn in the browser.
    const options = await postJson('/register/passkey/options', { email });
    const response = await startRegistration({ optionsJSON: options });
    const data = await postJson('/register/passkey/verify', { email, response });
    setStatus('Passkey-Registrierung erfolgreich', data);
    showLoginSuccess(data.user || { email }, 'Passkey-Registrierung und Anmeldung');
  } catch (error) {
    hideLoginSuccess();
    setStatus('Passkey-Registrierung fehlgeschlagen', { error: error.message });
  }
});

document.getElementById('passkey-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!browserSupportsWebAuthn()) {
    setStatus('Passkey-Anmeldung fehlgeschlagen', {
      error: 'Dieser Browser unterstützt WebAuthn nicht',
    });
    return;
  }

  const formData = new FormData(event.currentTarget);
  const email = formData.get('email');

  try {
    // Passkey login follows the same two-step pattern.
    const options = await postJson('/login/passkey/options', { email });
    const response = await startAuthentication({ optionsJSON: options });
    const data = await postJson('/login/passkey/verify', { email, response });
    setStatus('Passkey-Anmeldung erfolgreich', data);
    showLoginSuccess(data.user, 'Passkey-Anmeldung');
  } catch (error) {
    hideLoginSuccess();
    setStatus('Passkey-Anmeldung fehlgeschlagen', { error: error.message });
  }
});

document.getElementById('refresh-session').addEventListener('click', async () => {
  try {
    await loadSession();
  } catch (error) {
    setStatus('Session-Aktualisierung fehlgeschlagen', { error: error.message });
  }
});

document.getElementById('open-dashboard').addEventListener('click', async () => {
  try {
    await openDashboard();
  } catch (error) {
    setStatus('Dashboard-Anfrage fehlgeschlagen', { error: error.message });
  }
});

document.getElementById('logout-button').addEventListener('click', async () => {
  try {
    const data = await postJson('/logout', {});
    setStatus('Erfolgreich abgemeldet', data);
    hideLoginSuccess();
  } catch (error) {
    setStatus('Abmeldung fehlgeschlagen', { error: error.message });
  }
});

loadSession().catch((error) => {
  hideLoginSuccess();
  setStatus('Erstes Laden fehlgeschlagen', { error: error.message });
});
