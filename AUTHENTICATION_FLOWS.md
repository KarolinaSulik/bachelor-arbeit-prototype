# Authentifizierungsabläufe

## Passwortregistrierung

```text
Benutzer -> Browser -> POST /register/password -> Server -> SQLite
                                                   |
                                                   +-> bcrypt hasht das Passwort
                                                   +-> erstellt eine Session
```

Der Benutzer übermittelt E-Mail-Adresse und Passwort. Der Server prüft, ob die
E-Mail-Adresse bereits registriert ist, speichert nur einen bcrypt-Passwort-Hash
und startet eine Session für das neue Konto.

## Passwortanmeldung

```text
Benutzer -> Browser -> POST /login/password -> Server -> SQLite
                                                |
                                                +-> bcrypt vergleicht den Passwort-Hash
                                                +-> erstellt bei Erfolg eine Session
```

Der Server lädt das Konto anhand der E-Mail-Adresse und vergleicht das
übermittelte Passwort mit dem gespeicherten Hash. Bei Übereinstimmung entsteht
eine Session.

## Passkey-Registrierung

```text
Benutzer -> Browser -> POST /register/passkey/options -> Server
           ^                                             |
           |                                             +-> erstellt WebAuthn-Optionen und Challenge
           |
Browser -> Authenticator: startRegistration(options)
Browser -> POST /register/passkey/verify -> Server -> SQLite
                                                  |
                                                  +-> prüft Challenge, Origin und RP ID
                                                  +-> speichert öffentliche Credential-Daten
```

Der Server erstellt zunächst eine Challenge und Registrierungsoptionen. Der
Browser öffnet anschließend den System-Authenticator, beispielsweise Touch ID,
Face ID oder eine Geräte-PIN. Nach der Prüfung speichert der Server
Credential-ID, öffentlichen Schlüssel, Zähler und Transportinformationen.

## Passkey-Anmeldung

```text
Benutzer -> Browser -> POST /login/passkey/options -> Server -> SQLite
           ^                                          |
           |                                          +-> erstellt Challenge und erlaubte Credentials
           |
Browser -> Authenticator: startAuthentication(options)
Browser -> POST /login/passkey/verify -> Server
                                               |
                                               +-> prüft die signierte Assertion und aktualisiert den Zähler
                                               +-> erstellt eine Session
```

Statt ein Passwort zu vergleichen, prüft der Server eine signierte Assertion
mit dem bei der Registrierung gespeicherten öffentlichen Schlüssel.

## Zentraler Unterschied

Die Passwortauthentifizierung hat für Registrierung oder Anmeldung eine
zentrale Anfrage. Bei Passkeys kommen eine Optionsanfrage, die Interaktion
zwischen Browser und Authenticator, Challenge-Verwaltung und kryptografische
Prüfung hinzu.
