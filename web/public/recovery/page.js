import { config } from './config.js';
import {
  establishRecoverySession, parseRecoveryUrl, recoveryCredentialParams, RECOVERY_LINK_ERROR,
  signOutRecoverySession, updateRecoveryPassword, validateRecoveryPassword,
} from './flow.js';

const byId = id => document.getElementById(id);
const status = byId('status');
const entry = byId('entry');
const passwordForm = byId('password-form');
const requestForm = byId('request-form');
const openApp = byId('open-app');
const continueButton = byId('continue');
const saveButton = byId('save');
const requestButton = byId('request');
let credential = null;
let session = null;
let busy = false;
let passwordChanged = false;
let generation = 0;

// A passive email scanner cannot consume the hash. A user chooses the browser
// or app before verification. Remove secrets from browser history immediately.
function beginRecovery() {
  generation++;
  credential = parseRecoveryUrl(location.href);
  session = null; busy = false; passwordChanged = false;
  passwordForm.reset(); passwordForm.hidden = true; requestForm.hidden = true;
  byId('login').hidden = true; continueButton.disabled = false; saveButton.disabled = false; requestButton.disabled = false;
  byId('password').required = true; byId('confirmation').required = true;
  byId('password').disabled = false; byId('confirmation').disabled = false;
  saveButton.textContent = 'Reset password'; openApp.removeAttribute('href');
  history.replaceState(null, '', '/recovery');
  if (!credential || credential.kind === 'invalid') {
    status.textContent = RECOVERY_LINK_ERROR;
    entry.hidden = true; requestForm.hidden = false;
  } else {
    status.textContent = 'Continue to check your secure reset link.';
    entry.hidden = false;
    openApp.href = `musikalokal://password_recovery?${recoveryCredentialParams(credential)}`;
    openApp.hidden = false;
  }
}
beginRecovery();
window.addEventListener('hashchange', beginRecovery);
window.addEventListener('pageshow', event => { if (event.persisted) beginRecovery(); });

continueButton.addEventListener('click', async () => {
  if (busy || !credential) return;
  const current = generation;
  busy = true; continueButton.disabled = true;
  status.textContent = 'Checking your reset link...';
  try {
    const confirmed = await establishRecoverySession(config, credential);
    if (current !== generation) return;
    session = confirmed;
    credential = null; openApp.removeAttribute('href');
    entry.hidden = true; passwordForm.hidden = false;
    status.textContent = 'Choose a new password with at least 6 characters.';
    byId('password').focus();
  } catch (error) {
    if (current !== generation) return;
    status.textContent = error.message || RECOVERY_LINK_ERROR;
    if (status.textContent === RECOVERY_LINK_ERROR) {
      credential = null; openApp.removeAttribute('href'); entry.hidden = true; requestForm.hidden = false;
    }
  } finally {
    if (current === generation) { busy = false; continueButton.disabled = false; }
  }
});

passwordForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !session) return;
  const current = generation;
  const confirmed = session;
  const password = byId('password').value;
  const confirmation = byId('confirmation').value;
  const error = !passwordChanged && validateRecoveryPassword(password, confirmation);
  if (error) { status.textContent = error; return; }
  busy = true; saveButton.disabled = true;
  try {
    if (!passwordChanged) {
      await updateRecoveryPassword(config, confirmed, password, confirmation);
      if (current !== generation) return;
      passwordChanged = true; passwordForm.reset();
      byId('password').required = false; byId('confirmation').required = false;
      byId('password').disabled = true; byId('confirmation').disabled = true;
      saveButton.textContent = 'Finish signing out';
    }
    await signOutRecoverySession(config, confirmed);
    if (current !== generation) return;
    session = null; passwordForm.hidden = true;
    // A separately signed-in admin stays untouched; recovery never used its
    // storage or credentials. Returning to the app opens the login entry.
    status.textContent = 'Your password has been reset. Log in with your new password.';
    byId('login').hidden = false;
  } catch (error) {
    if (current !== generation) return;
    status.textContent = error.message || 'Unable to reset your password. Please try again.';
    if (!passwordChanged && status.textContent === RECOVERY_LINK_ERROR) {
      session = null; passwordForm.reset(); passwordForm.hidden = true; requestForm.hidden = false;
    }
  } finally {
    if (current === generation) { busy = false; saveButton.disabled = false; }
  }
});

requestForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const current = generation;
  busy = true; requestButton.disabled = true;
  try {
    const response = await fetch(`${config.url}/functions/v1/account-email`, {
      method: 'POST', headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_password_reset', email: byId('email').value.trim() }),
    });
    const data = await response.json();
    if (current !== generation) return;
    if (!response.ok || !data.success) throw new Error('Unable to send a reset link. Please try again.');
    requestForm.reset();
    status.textContent = 'If an account uses that email, a reset link will arrive in its inbox. Check your spam folder too.';
  } catch (error) {
    if (current !== generation) return;
    status.textContent = error.message || 'Unable to send a reset link. Please try again.';
  } finally {
    if (current === generation) { busy = false; requestButton.disabled = false; }
  }
});

window.addEventListener('pagehide', () => { generation++; credential = null; session = null; passwordForm.reset(); });
