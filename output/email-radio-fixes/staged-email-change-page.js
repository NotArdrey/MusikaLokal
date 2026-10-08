import { config } from '/recovery/config.js';
import { parseEmailChangeUrl } from './flow.js';

const status = document.getElementById('status');
const confirm = document.getElementById('confirm');
let tokenHash;
let generation = 0;
let busy = false;

function beginConfirmation() {
  generation++;
  tokenHash = parseEmailChangeUrl(location.href);
  busy = false;
  history.replaceState(null, '', '/email-change');
  confirm.hidden = !tokenHash;
  confirm.disabled = false;
  status.textContent = tokenHash
    ? 'Continue to confirm this email address.'
    : 'This email change link is invalid, expired, or already used. Request another change from Account Details in the app.';
}
beginConfirmation();
window.addEventListener('hashchange', beginConfirmation);
window.addEventListener('pageshow', event => { if (event.persisted) beginConfirmation(); });

confirm.addEventListener('click', async () => {
  if (busy || !tokenHash) return;
  const current = generation;
  busy = true;
  confirm.disabled = true;
  status.textContent = 'Confirming this address...';
  try {
    const response = await fetch(`${config.url}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_hash: tokenHash, type: 'email_change' }),
    });
    if (current !== generation) return;
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) throw new Error('Confirmation is temporarily unavailable. Please try again.');
      tokenHash = null;
      confirm.hidden = true;
      status.textContent = 'This email change link is invalid, expired, or already used. Request another change from Account Details in the app.';
      return;
    }
    // Confirmation does not install a browser session or change the signed-in
    // app user. Supabase enforces confirmation of both addresses when required.
    tokenHash = null;
    confirm.hidden = true;
    status.textContent = 'This address is confirmed. If you received a second confirmation email, confirm that address too to finish the change. Then return to Account Details in the app.';
  } catch (error) {
    if (current === generation) status.textContent = error.message || 'Unable to confirm this address. Please try again.';
  } finally {
    if (current === generation) {
      busy = false;
      confirm.disabled = false;
    }
  }
});
