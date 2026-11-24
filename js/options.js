import { loadSettings, saveSettings } from './settings.js';
import { FlapAudio } from './audio.js';
import { Board } from './flap.js';
import * as cal from './calendar.js';

const $ = (id) => document.getElementById(id);
const s = await loadSettings();

$('city').value = s.city;
$('units').value = s.units;
$('hour12').value = String(s.hour12);
$('sound').checked = s.sound;
$('volume').value = s.volume;

let timer;
$('city').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => saveSettings({ city: $('city').value.trim() }), 500);
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
  if (!cal.isConfigured()) {
    el.textContent = 'Not configured: add your OAuth client ID to manifest.json (see README).';
    connected.disabled = disconnected.disabled = true;
    return;
  }
  try { await cal.getToken(false); el.textContent = 'Connected.'; connected.disabled = true; disconnected.disabled = false; }
  catch { el.textContent = 'Not connected.'; connected.disabled = false; disconnected.disabled = true; }
}
$('connect').addEventListener('click', async () => { try { await cal.getToken(true); } catch { /* cancelled */ } calStatus(); });
$('disconnect').addEventListener('click', async () => { await cal.disconnect(); calStatus(); });
calStatus();
