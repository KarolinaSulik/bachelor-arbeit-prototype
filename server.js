import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import sqlite3 from 'sqlite3';
import path from 'path';
import { randomUUID, webcrypto } from 'crypto';
import { fileURLToPath } from 'url';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

// ES modules do not expose __dirname automatically, so we rebuild it.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const dbPath = path.join(__dirname, 'data', 'auth-demo.sqlite');
const PORT = Number(process.env.PORT || 3000);
const rpName = 'Mini Auth Demo';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || `http://localhost:${PORT}`;
const sessionSecret = process.env.SESSION_SECRET || randomUUID();
const isProduction = process.env.NODE_ENV === 'production';
const textEncoder = new TextEncoder();
const MIN_PASSWORD_LENGTH = 15;
// bcrypt only uses the first 72 bytes of the password input.
const MAX_PASSWORD_BYTES = 72;
// Example deny list based on the HPI Identity Leak Checker statistics page.
const blockedPasswords = new Set([
  '12345',
  '123456',
  '12345678',
  '123456789',
  'password',
  'qwerty',
  '111111',
  'qwerty123',
  '1q2w3e',
  '123123',
]);

// SimpleWebAuthn expects a Web Crypto API implementation.
// Node 20 exposes this consistently, but on older local setups it is safer
// to wire it explicitly.
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const db = new sqlite3.Database(dbPath);

// Tiny sqlite helpers so the route handlers can use async/await.
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

// users = normal account data
// passkeys = WebAuthn credentials linked to a user account
async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      user_handle TEXT NOT NULL UNIQUE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS passkeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
}

// Only return the fields that the frontend really needs.
function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}

// Small query helpers keep the main route handlers shorter.
async function findUserByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', [email]);
}

async function findUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', [id]);
}

async function findPasskeysForUser(userId) {
  return all('SELECT * FROM passkeys WHERE user_id = ? ORDER BY id ASC', [userId]);
}

async function findPasskeyByCredentialId(credentialId) {
  return get('SELECT * FROM passkeys WHERE credential_id = ?', [credentialId]);
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validatePassword(password) {
  if (!password) {
    return 'Password is required';
  }

  // Check the deny list before the length rule so the demo can show
  // a specific rejection for known leaked passwords.
  if (blockedPasswords.has(password.toLowerCase())) {
    return 'Choose a less common password';
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Password must not exceed ${MAX_PASSWORD_BYTES} bytes`;
  }

  return null;
}

// During a passkey flow we temporarily store challenge + email in the session.
function clearPendingChallenge(req) {
  req.session.currentChallenge = null;
  req.session.currentEmail = null;
  req.session.currentAction = null;
}

app.use(express.json());
app.use(
  session({
    // A deployment should set SESSION_SECRET. Locally, generate a fresh secret
    // instead of relying on a public, hard-coded value.
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    },
  }),
);
app.use(express.static(path.join(__dirname, 'public')));

// Helper route for checking whether origin and RP ID are what we expect.
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    rpID,
    origin,
  });
});

// General web app logic:
// if there is a valid session cookie, return the logged-in user.
app.get('/api/session', async (req, res) => {
  if (!req.session.userId) {
    res.json({ authenticated: false });
    return;
  }

  const user = await findUserById(req.session.userId);

  if (!user) {
    req.session.destroy(() => {});
    res.json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    user: sanitizeUser(user),
  });
});

// Protected route that only works after login.
app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = await findUserById(req.session.userId);
  const passkeys = await findPasskeysForUser(req.session.userId);

  res.json({
    message: 'Protected area reached',
    user: sanitizeUser(user),
    passkeyCount: passkeys.length,
  });
});

// Shared logout for both password and passkey logins.
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// PASSWORD REGISTER
// Classic flow: validate input, hash password, save user, create session.
app.post('/register/password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const passwordError = validatePassword(password);

    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    // We never store the plain password, only its hash.
    const passwordHash = await bcrypt.hash(password, 10);
    // user_handle is a stable internal id that we later reuse for WebAuthn.
    const userHandle = `user-${randomUUID()}`;

    const result = await run(
      'INSERT INTO users (email, password_hash, user_handle) VALUES (?, ?, ?)',
      [email, passwordHash, userHandle],
    );

    req.session.userId = result.lastID;

    res.status(201).json({
      success: true,
      user: {
        id: result.lastID,
        email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PASSWORD LOGIN
// Also classic: load user, compare password hash, create session.
app.post('/login/password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const user = await findUserByEmail(email);

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    req.session.userId = user.id;

    res.json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PASSKEY REGISTER, STEP 1
// The server prepares WebAuthn options and a challenge for the browser.
app.post('/register/passkey/options', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const user = await findUserByEmail(email);

    if (!user) {
      res.status(404).json({ error: 'Create the password account first' });
      return;
    }

    const existingPasskeys = await findPasskeysForUser(user.id);
    // This is passkey-specific:
    // before the browser can open a system dialog, it needs options from the server.
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: user.email,
      userID: textEncoder.encode(user.user_handle),
      attestationType: 'none',
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports ? JSON.parse(passkey.transports) : [],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
      supportedAlgorithmIDs: [-7, -257],
    });

    req.session.currentChallenge = options.challenge;
    req.session.currentEmail = user.email;
    req.session.currentAction = 'register-passkey';

    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PASSKEY REGISTER, STEP 2
// The browser returns the created credential and the server verifies it.
app.post('/register/passkey/verify', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const expectedChallenge = req.session.currentChallenge;
    const expectedEmail = req.session.currentEmail;
    const expectedAction = req.session.currentAction;

    if (!expectedChallenge || expectedAction !== 'register-passkey' || email !== expectedEmail) {
      res.status(400).json({ error: 'No active passkey registration found' });
      return;
    }

    const user = await findUserByEmail(email);

    if (!user) {
      clearPendingChallenge(req);
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // WebAuthn verification checks challenge, origin and RP ID.
    const verification = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    const { verified, registrationInfo } = verification;

    if (!verified || !registrationInfo) {
      clearPendingChallenge(req);
      res.status(400).json({ error: 'Passkey registration could not be verified' });
      return;
    }

    const { credential } = registrationInfo;

    // We store only verification data, never a private key.
    await run(
      `
        INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        user.id,
        credential.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        JSON.stringify(req.body.response.response.transports || []),
      ],
    );

    clearPendingChallenge(req);
    req.session.userId = user.id;

    res.json({ success: true, verified: true });
  } catch (error) {
    clearPendingChallenge(req);
    res.status(400).json({ error: error.message });
  }
});

// PASSKEY LOGIN, STEP 1
// Again the server first sends a challenge and allowed credentials.
app.post('/login/passkey/options', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const user = await findUserByEmail(email);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const passkeys = await findPasskeysForUser(user.id);

    if (!passkeys.length) {
      res.status(404).json({ error: 'No passkey registered for this user' });
      return;
    }

    // This is the login equivalent of the registration options endpoint.
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports ? JSON.parse(passkey.transports) : [],
      })),
      userVerification: 'preferred',
    });

    req.session.currentChallenge = options.challenge;
    req.session.currentEmail = user.email;
    req.session.currentAction = 'login-passkey';

    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PASSKEY LOGIN, STEP 2
// The browser sends back a signed assertion which the server verifies.
app.post('/login/passkey/verify', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const expectedChallenge = req.session.currentChallenge;
    const expectedEmail = req.session.currentEmail;
    const expectedAction = req.session.currentAction;

    if (!expectedChallenge || expectedAction !== 'login-passkey' || email !== expectedEmail) {
      res.status(400).json({ error: 'No active passkey login found' });
      return;
    }

    const user = await findUserByEmail(email);

    if (!user) {
      clearPendingChallenge(req);
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const passkey = await findPasskeyByCredentialId(req.body.response.id);

    if (!passkey || passkey.user_id !== user.id) {
      clearPendingChallenge(req);
      res.status(404).json({ error: 'Passkey not found for this user' });
      return;
    }

    // The stored public key is used to verify the login response.
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
      requireUserVerification: false,
    });

    const { verified, authenticationInfo } = verification;

    if (!verified) {
      clearPendingChallenge(req);
      res.status(401).json({ error: 'Passkey login failed' });
      return;
    }

    // The counter is updated after every successful passkey login.
    await run('UPDATE passkeys SET counter = ? WHERE id = ?', [
      authenticationInfo.newCounter,
      passkey.id,
    ]);

    clearPendingChallenge(req);
    req.session.userId = user.id;

    res.json({
      success: true,
      verified: true,
      user: sanitizeUser(user),
    });
  } catch (error) {
    clearPendingChallenge(req);
    res.status(400).json({ error: error.message });
  }
});

// Start database first, then start the server.
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Mini Auth Demo running on ${origin}`);
    });
  })
  .catch((error) => {
    console.error('Database init failed:', error);
    process.exit(1);
  });
