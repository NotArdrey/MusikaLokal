import { getAppLinkDestination } from './appLinks.js';

const destination = getAppLinkDestination(window.location.href);
const open = document.getElementById('open-app');
if (destination) {
  open.href = window.location.pathname === '/action'
    ? `musikalokal://action?${new URLSearchParams({ destination })}`
    : `musikalokal://${destination.slice(1)}`;
  open.hidden = false;
} else {
  document.getElementById('message').textContent = 'This shared link is incomplete. Ask the sender to share it again.';
  document.getElementById('hint').hidden = true;
}

try {
  const response = await fetch('/android-release.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Release unavailable');
  const release = await response.json();
  const download = new URL(release.downloadUrl);
  if (download.protocol !== 'https:') throw new Error('Invalid download');
  document.getElementById('download').href = download.href;
} catch {
  document.getElementById('download-status').textContent = 'Visit our home page for the latest Android download.';
}
