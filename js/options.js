import { loadSettings, saveSettings } from './settings.js';
import { FlapAudio } from './audio.js';
import { Board } from './flap.js';
import { geolocate, resolveLocation } from './weather.js';
import { cacheSet } from './settings.js';
import * as cal from './calendar.js';

const $ = (id) => document.getElementById(id);
const s = await loadSettings();

$('city').value = s.city;
$('units').value = s.units;
$('hour12').value = String(s.hour12);
$('sound').checked = s.sound;
$('volume').value = s.volume;

$('clientid').value = s.webClientId || '';
$('redirect').textContent = chrome.identity?.getRedirectURL?.() || '';
$('clientid').addEventListener('change', async () => { await saveSettings({ webClientId: $('clientid').value.trim() }); calStatus(); });

let timer;
$('city').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const city = $('city').value.trim();
    await saveSettings({ city });
    const st = $('geo-status');
    if (!city) { st.textContent = ''; return; }
    st.textContent = 'Looking up…';
    try { st.textContent = 'Found: ' + ((await resolveLocation(city)).label || city); }
    catch (e) {
      st.textContent = { CITY_NOT_FOUND: 'No city with that name was found.', OFFLINE: 'Could not reach the weather service (offline or blocked).' }[e.code]
        || 'Lookup failed: ' + (e.message || e.code);
    }
  }, 600);
});
$('units').addEventListener('change', () => saveSettings({ units: $('units').value }));
$('hour12').addEventListener('change', () => saveSettings({ hour12: $('hour12').value === 'true' }));
$('sound').addEventListener('change', () => saveSettings({ sound: $('sound').checked }));
$('volume').addEventListener('input', () => saveSettings({ volume: Number($('volume').value) }));

// Test clatter: a tiny off-screen board flipping a few tiles.
$('test').addEventListener('click', async () => {
  const audio = new FlapAudio();
  audio.volume = Number($('volume').value);
  await audio.unlock();
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(holder);
  const board = new Board(holder, 12, 1, audio);
  board.setLines(['DEPARTURES']);
  setTimeout(() => { board.destroy(); holder.remove(); }, 4000);
});

async function calStatus() {
  const el = $('cal-status');
  const connected = $('connect'), disconnected = $('disconnect');
  if (!(await cal.isConfigured())) {
    el.textContent = 'Not configured: add an OAuth client ID (see README).';
    connected.disabled = disconnected.disabled = true;
    return;
  }
  try { await cal.getToken(false); el.textContent = 'Connected.'; connected.disabled = true; disconnected.disabled = false; }
  catch { el.textContent = 'Not connected.'; connected.disabled = false; disconnected.disabled = true; }
}
$('connect').addEventListener('click', async () => { try { await cal.getToken(true); } catch { /* cancelled */ } calStatus(); });
$('disconnect').addEventListener('click', async () => { await cal.disconnect(); calStatus(); });
calStatus();

$('geo').addEventListener('click', async () => {
  const st = $('geo-status');
  st.textContent = 'Asking the browser…';
  try {
    const pos = await geolocate();
    await cacheSet('geo:last', { ...pos, name: 'LOCAL' });
    $('city').value = '';
    await saveSettings({ city: '' });
    st.textContent = `Using browser location (${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}).`;
  } catch {
    st.textContent = 'Location blocked or unavailable. Allow location for this browser/site in system settings, or enter a city.';
  }
});
