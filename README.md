# Mini Auth Demo

Ein lokaler Vergleichsprototyp für passwortbasierte und passkeybasierte Authentifizierung. Er veranschaulicht die jeweiligen Authentifizierungsabläufe in einer kleinen Webanwendung.

## Funktionen

- Registrierung und Anmeldung mit Passwort
- Registrierung und Anmeldung mit Passkey über WebAuthn
- geschütztes Dashboard mit Session
- lokale Speicherung in SQLite

## Lokal starten

Verwende Node.js 20 oder neuer.

```bash
npm install
npm run dev
```

Öffne anschließend <http://localhost:3000>.

## Testablauf

1. Registriere ein Konto mit E-Mail-Adresse und Passwort.
2. Melde dich ab und einmal mit dem Passwort an.
3. Registriere für dieselbe E-Mail-Adresse einen Passkey.
4. Melde dich ab und mit dem Passkey wieder an.
5. Öffne das geschützte Dashboard.

## Projektstruktur

```text
mini-auth-demo/
├── AUTHENTICATION_FLOWS.md
├── CODE_EXAMPLES.md
├── IMPLEMENTATION_OVERVIEW.md
├── RUNNING_THE_DEMO.md
├── server.js
├── public/
└── data/
```

## Dokumentation

- [Implementierungsübersicht](IMPLEMENTATION_OVERVIEW.md)
- [Authentifizierungsabläufe](AUTHENTICATION_FLOWS.md)
- [Codebeispiele](CODE_EXAMPLES.md)
- [Prototyp starten](RUNNING_THE_DEMO.md)

## Wichtige Einschränkungen

Dies ist ein Lehrprototyp und kein produktionsreifer
Authentifizierungsdienst. Sessions werden im Arbeitsspeicher gehalten, die
lokale Datenbank wird bewusst von Git ignoriert und es gibt weder Rate Limiting
noch Kontowiederherstellung, E-Mail-Verifikation oder einen persistenten
Session-Speicher. Vor einer anderen Nutzung als der lokalen Entwicklung muss
`SESSION_SECRET` auf einen starken, eindeutigen Wert gesetzt werden.

Für die lokale Entwicklung verwenden RP ID und Origin standardmäßig
`localhost` beziehungsweise `http://localhost:3000`. Bei Bedarf können sie
über `RP_ID`, `ORIGIN` und `PORT` überschrieben werden.
