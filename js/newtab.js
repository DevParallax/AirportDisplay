import { Board } from './flap.js';
import { FlapAudio } from './audio.js';
import { loadSettings, saveSettings, onSettingsChanged } from './settings.js';
import { resolveLocation, fetchWeather } from './weather.js';
import * as cal from './calendar.js';

// ---- board geometry: TIME(6) _ MEETING(21) _ STATUS(8) = 37 columns ----
const COLS = 37;
const TIME_W = 6, TITLE_W = 21, STATUS_W = 8;
const HEAD_ROWS = 3;
const MIN_MEET_ROWS = 5, MAX_MEET_ROWS = 12;
const BOARDING_MIN = 15;

const DEMO = new URLSearchParams(location.search).has('demo');

const $ = (id) => document.getElementById(id);
const audio = new FlapAudio();

const state = {
  settings: null,
  now: new Date(),
  weather: null,        // { ... } | { error: 'TEXT' } | null (loading)
  events: [],
  calState: 'loading',  // loading | ok | needs-auth | not-configured | unsupported | error
};
let headBoard, meetBoard, meetRows = 0;

// ---------------------------------------------------------------- formatting
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST',
  'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const p2 = (n) => String(n).padStart(2, '0');

function fmtTime(d, long) {
  if (!state.settings.hour12) return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const h = d.getHours() % 12 || 12;
  return `${h}:${p2(d.getMinutes())}${long ? ' ' : ''}${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

const justify = (l, r) => l.slice(0, COLS - r.length - 1).padEnd(COLS - r.length) + r;

function headLines() {
  const n = state.now;
  const date = `${DAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
  const lines = [justify(date, fmtTime(n, true))];

  const w = state.weather;
  if (!w) {
    lines.push('LOADING WEATHER');
    lines.push('');
  } else if (w.error) {
    lines.push(w.error);
    lines.push('');
  } else {
    const where = (w.place || '').toUpperCase().slice(0, 12);
    lines.push(justify(`${where} ${w.desc}`.trim(), `${w.temp}°${w.unit}`));
    const parts = [];
    if (w.hi != null) parts.push(`HI ${w.hi}° LO ${w.lo}°`);
    parts.push(`WIND ${w.wind} ${w.windUnit}`);
    if (w.pop != null) parts.push(`RAIN ${w.pop}%`);
    lines.push(parts.join('  '));
  }
  return lines;
}

function statusFor(ev, now) {
  if (ev.allDay) return 'TODAY';
  if (now >= ev.end) return 'DEPARTED';
  if (now >= ev.start) return 'NOW';
  if (ev.start - now <= BOARDING_MIN * 60e3) return 'BOARDING';
  return 'ON TIME';
}

function meetLine(time, title, status) {
  return time.slice(0, TIME_W).padEnd(TIME_W) + ' ' +
    title.slice(0, TITLE_W).padEnd(TITLE_W) + ' ' + status.slice(0, STATUS_W);
}

function meetLines() {
  const now = state.now;
  const msg = (title, status = '') => [meetLine('', title, status)];
  switch (state.calState) {
    case 'loading': return msg('LOADING CALENDAR');
    case 'needs-auth': return msg('CLICK TO CONNECT CALENDAR', 'SIGN IN');
    case 'not-configured': return [meetLine('', 'CALENDAR NOT CONFIGURED', 'SETUP'), meetLine('', 'SEE README.MD', '')];
    case 'unsupported': return msg('CALENDAR NEEDS CHROME', 'ERROR');
    case 'error': return msg('CALENDAR UNAVAILABLE', 'RETRYING');
  }
  let events = state.events;
  if (!events.length) return msg('NO MEETINGS TODAY', 'ALL CLEAR');

  let more = 0;
  if (events.length > meetRows) {
    // Drop finished meetings first so what's still ahead stays visible.
    const live = events.filter((e) => e.allDay || e.end > now);
    events = live.length >= events.length ? events : live;
    if (events.length > meetRows) {
      more = events.length - (meetRows - 1);
      events = events.slice(0, meetRows - 1);
    }
  }
  const lines = events.map((e) =>
    meetLine(e.allDay ? 'ALLDAY' : fmtTime(e.start, false), e.title, statusFor(e, now)));
  if (more) lines.push(meetLine('', `+${more} MORE`, ''));
  return lines;
}

function render(opts) {
  headBoard.setLines(headLines(), opts);
  meetBoard.setLines(meetLines(), opts);
}

// -------------------------------------------------------------------- layout
function layout() {
  const vw = innerWidth, vh = innerHeight;
  const gapK = 0.07, hK = 1.4, pad = 0.3 * 2; // pad: board padding in tile widths
  let w = (vw * 0.96) / (COLS * (1 + gapK) + pad);

  const rowH = (k) => k * (hK + gapK);             // k rows, in tile widths
  const chrome = 0.45 * 2 + pad * 2 + 0.6 + 0.2;   // stage gaps + both paddings + labels
  const needed = (rows) => rowH(rows) + chrome;
  const avail = vh * 0.94;
  if (needed(HEAD_ROWS + MIN_MEET_ROWS) * w > avail) w = avail / needed(HEAD_ROWS + MIN_MEET_ROWS);

  const root = document.documentElement.style;
  root.setProperty('--w', w.toFixed(2) + 'px');
  root.setProperty('--h', (w * hK).toFixed(2) + 'px');
  root.setProperty('--g', Math.max(1, w * gapK).toFixed(2) + 'px');

  let rows = MIN_MEET_ROWS;
  while (rows < MAX_MEET_ROWS && needed(HEAD_ROWS + rows + 1) * w <= avail) rows++;
  return rows;
}

function build() {
  const rows = layout();
  if (!headBoard) headBoard = new Board($('board-head'), COLS, HEAD_ROWS, audio);
  if (rows !== meetRows) {
    meetBoard?.destroy();
    meetRows = rows;
    meetBoard = new Board($('board-meet'), COLS, meetRows, audio);
  }
}

// ----------------------------------------------------------------- data feeds
async function refreshWeather() {
  if (DEMO) {
    state.weather = { place: 'DEMO CITY', desc: 'PARTLY CLOUDY', temp: 14, hi: 18, lo: 9, pop: 20, wind: 12, unit: 'C', windUnit: 'KMH' };
    return render();
  }
  try {
    const loc = await resolveLocation(state.settings.city);
    state.weather = await fetchWeather(loc, state.settings.units);
  } catch (e) {
    const msg = { NO_LOCATION: 'ALLOW LOCATION OR SET CITY', CITY_NOT_FOUND: 'CITY NOT FOUND', OFFLINE: 'WEATHER OFFLINE', GEOCODE: 'CITY LOOKUP FAILED' }[e.code];
    // keep stale data on transient failures
    if (!state.weather || msg) state.weather = { error: msg || 'WEATHER UNAVAILABLE' };
  }
  render();
}

function demoEvents() {
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  const n = new Date();
  const soon = new Date(n.getTime() + 9 * 60e3);
  const mk = (title, s, e, allDay = false) => ({ id: title, title, start: s, end: e, allDay });
  return [
    mk('Company holiday calendar', at(0, 0), at(23, 59), true),
    mk('Daily standup', at(9, 30), at(9, 45)),
    mk('Design review: onboarding', at(10, 30), at(11, 30)),
    mk('1:1 with Priya', new Date(n.getTime() - 10 * 60e3), new Date(n.getTime() + 20 * 60e3)),
    mk('Quarterly planning workshop', soon, new Date(soon.getTime() + 3600e3)),
    mk('Customer call - Acme Corp', at(16, 0), at(16, 45)),
    mk('Dinner with Sam', at(19, 30), at(21, 0)),
  ];
}

async function refreshCalendar({ interactive = false } = {}) {
  if (DEMO) { state.events = demoEvents(); state.calState = 'ok'; return render(); }
  try {
    state.events = await cal.fetchTodayEvents({ interactive });
    state.calState = 'ok';
  } catch (e) {
    state.calState = ({ NEEDS_AUTH: 'needs-auth', NOT_CONFIGURED: 'not-configured', UNSUPPORTED: 'unsupported' })[e.code] || 'error';
  }
  render();
}

// ------------------------------------------------------------- sound & chrome
function syncSound() {
  audio.enabled = !!state.settings.sound;
  audio.volume = state.settings.volume;
  $('btn-sound').textContent = audio.enabled ? '🔊' : '🔇';
  $('sound-hint').hidden = !(audio.enabled && !audio.running);
}

async function unlockSound() {
  if (!audio.enabled) return;
  await audio.unlock();
  syncSound();
}

audio.onstate = syncSound;

function wireUi() {
  document.addEventListener('pointerdown', () => {
    unlockSound();
    if (state.calState === 'needs-auth') refreshCalendar({ interactive: true });
  });
  document.addEventListener('keydown', unlockSound);

  $('btn-sound').addEventListener('click', async (e) => {
    e.stopPropagation();
    const sound = !state.settings.sound;
    state.settings.sound = sound;
    await saveSettings({ sound });
    syncSound();
    if (sound) unlockSound();
  });
  $('btn-full').addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });
  $('btn-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
    else location.href = 'options.html';
  });

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { build(); render({ instant: true }); }, 150);
  });
}

// ----------------------------------------------------------------------- boot
async function init() {
  state.settings = await loadSettings();
  wireUi();
  build();
  syncSound();
  audio.unlock(); // succeeds straight away if the browser allows it, else waits for a click

  // Start blank, then flip everything in.
  headBoard.setLines([], { instant: true });
  meetBoard.setLines([], { instant: true });
  render();

  refreshWeather();
  refreshCalendar();

  let lastMinute = -1, lastHalfMinute = -1, lastDay = state.now.getDate();
  setInterval(() => {
    state.now = new Date();
    const m = state.now.getMinutes();
    const half = Math.floor(state.now.getSeconds() / 30);
    if (state.now.getDate() !== lastDay) { lastDay = state.now.getDate(); refreshCalendar(); }
    if (m !== lastMinute || half !== lastHalfMinute) { lastMinute = m; lastHalfMinute = half; render(); }
  }, 1000);

  setInterval(refreshWeather, 15 * 60e3);
  setInterval(() => refreshCalendar(), 5 * 60e3);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { state.now = new Date(); refreshCalendar(); render(); }
  });

  onSettingsChanged(async () => {
    state.settings = await loadSettings();
    syncSound();
    refreshWeather();
    render();
  });

  if (DEMO) window.airportDebug = { audio, state, headBoard: () => headBoard, meetBoard: () => meetBoard };
}

init();
