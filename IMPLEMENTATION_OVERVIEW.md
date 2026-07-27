# Implementierungsübersicht

## Zweck

Dieser Prototyp vergleicht zwei Verfahren zur Authentifizierung in derselben
kleinen Webanwendung: Passwort und Passkey. Die zusätzlichen WebAuthn-Schritte
sollen im Code und im Ablauf sichtbar werden.

## Komponenten

- `public/index.html` enthält die Formulare und das Statusfeld.
- `public/app.js` sendet Anfragen und ruft die WebAuthn-API des Browsers auf.
- `server.js` stellt die Express-Routen bereit und prüft
  Authentifizierungsergebnisse.
- `data/auth-demo.sqlite` ist die beim Start erzeugte lokale SQLite-Datenbank.

Die Datenbankdatei wird von Git ignoriert, da sie lokale Kontodaten,
Passwort-Hashes und öffentliche Anmeldedaten enthalten kann.

## Passwortablauf

Bei der Passwortregistrierung prüft der Server E-Mail-Adresse und Passwort,
erstellt mit `bcrypt` einen Hash, legt das Konto an und startet eine Session.
Bei der Anmeldung lädt er das Konto und vergleicht das übermittelte Passwort
mit dem gespeicherten Hash.

## Passkey-Ablauf

Die Registrierung und Anmeldung mit Passkey bestehen jeweils aus zwei
Anfragen:

1. Der Browser fordert vom Server WebAuthn-Optionen an.
2. Der Browser ruft `startRegistration()` oder `startAuthentication()` auf.
3. Der Browser sendet das Ergebnis zur Prüfung an den Server zurück.

Der Server speichert die Credential-ID, den öffentlichen Schlüssel, den
Signaturzähler und die Transportinformationen. Der private Schlüssel eines
Benutzers wird niemals gespeichert; er bleibt im Authenticator.

## Gemeinsame Anwendungslogik

Beide Ansätze teilen dieselbe HTML-Oberfläche, den Express-Server, die
SQLite-Datenbank, die Session-Verwaltung und das geschützte Dashboard.
WebAuthn-Optionen, Challenges, Browser-Aufrufe und kryptografische Prüfung sind
passkeyspezifisch.

## Session-Verwaltung

`express-session` hält Sessions kleinheitshalber im Arbeitsspeicher. Für lokale
Läufe wird ein neuer Session-Secret erzeugt, sofern `SESSION_SECRET` nicht
gesetzt ist. Ohne konfigurierten Secret werden Sessions daher bei einem
Serverneustart bewusst ungültig.

## Lokale Konfiguration

Die Standardwerte sind nur für die lokale Entwicklung geeignet:

```text
RP_ID=localhost
ORIGIN=http://localhost:3000
PORT=3000
```

Für eine andere Umgebung können passende Werte über Umgebungsvariablen gesetzt
werden.
