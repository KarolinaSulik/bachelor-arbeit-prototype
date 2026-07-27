# Codebeispiele

Die folgenden Ausschnitte zeigen den wesentlichen Unterschied zwischen den
beiden Authentifizierungsverfahren.

## Passwortanmeldung

```js
const user = await findUserByEmail(email);

if (!user || !(await bcrypt.compare(password, user.password_hash))) {
  res.status(401).json({ error: 'Invalid credentials' });
  return;
}

req.session.userId = user.id;
```

Der Server führt einen direkten Vergleich mit dem Passwort-Hash durch und
startet bei Erfolg eine Session.

## Passkey-Optionen

```js
const options = await generateAuthenticationOptions({
  rpID,
  allowCredentials: passkeys.map((passkey) => ({
    id: passkey.credential_id,
    transports: passkey.transports ? JSON.parse(passkey.transports) : [],
  })),
  userVerification: 'preferred',
});

req.session.currentChallenge = options.challenge;
res.json(options);
```

Bevor eine Passkey-Anmeldung starten kann, erstellt der Server
WebAuthn-Optionen und speichert die zugehörige Challenge in der Session.

## Passkey-Prüfung

```js
const verification = await verifyAuthenticationResponse({
  response: req.body.response,
  expectedChallenge,
  expectedOrigin: origin,
  expectedRPID: rpID,
  credential: {
    id: passkey.credential_id,
    publicKey: new Uint8Array(passkey.public_key),
    counter: passkey.counter,
    transports: passkey.transports ? JSON.parse(passkey.transports) : [],
  },
});

await run('UPDATE passkeys SET counter = ? WHERE id = ?', [
  verification.authenticationInfo.newCounter,
  passkey.id,
]);
```

Der Prüfungsschritt vergleicht die signierte Browserantwort mit der
gespeicherten Challenge, Origin, RP ID und dem öffentlichen Schlüssel. Nach
einer erfolgreichen Anmeldung wird der Signaturzähler aktualisiert.

## WebAuthn-Aufruf im Browser

```js
const options = await postJson('/login/passkey/options', { email });
const response = await startAuthentication({ optionsJSON: options });
const data = await postJson('/login/passkey/verify', { email, response });
```

Der Browser vermittelt zwischen Server und Authenticator des Benutzers.
