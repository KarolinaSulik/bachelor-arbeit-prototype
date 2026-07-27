# Prototyp starten

## Voraussetzungen

- Node.js 20 oder neuer
- ein moderner Browser mit WebAuthn-Unterstützung
- ein verfügbarer Authenticator für Passkeys, etwa eine Geräte-PIN, Touch ID
  oder Face ID

## Installation

Installiere aus diesem Verzeichnis die Abhängigkeiten und starte den Server:

```bash
npm install
npm run dev
```

Öffne anschließend <http://localhost:3000>.

## Empfohlene Reihenfolge

1. Registriere ein Passwortkonto mit einer E-Mail-Adresse und einem Passwort
   mit mindestens 15 Zeichen.
2. Melde dich ab und über das Passwortformular wieder an.
3. Registriere für dieselbe E-Mail-Adresse einen Passkey.
4. Melde dich ab und verwende das Passkey-Anmeldeformular.
5. Öffne nach erfolgreicher Anmeldung das Dashboard.

Das Statusfeld zeigt die letzte Backend-Antwort und hilft beim Beobachten der
einzelnen Schritte.

## Fehlerbehebung

- Verwende für die Standardkonfiguration `localhost`; WebAuthn ist auf sichere
  Kontexte beschränkt, wobei Browser localhost als Entwicklungs-Ausnahme
  behandeln.
- Falls kein Passkey-Dialog erscheint, prüfe die WebAuthn-Unterstützung von
  Browser und Gerät.
- Die Standardwerte `RP_ID=localhost` und `ORIGIN=http://localhost:3000`
  müssen zur im Browser geöffneten URL passen.
- Die SQLite-Datenbank wird automatisch in `data/` erzeugt und kann lokal
  entfernt werden, um mit neuen Testdaten zu beginnen. Sie ist von Git
  ausgeschlossen.
