// Google Calendar (read-only) via chrome.identity.getAuthToken.

const API = 'https://www.googleapis.com/calendar/v3';

export class CalendarError extends Error {
  /** code: UNSUPPORTED | NOT_CONFIGURED | NEEDS_AUTH | HTTP */
  constructor(code, msg) { super(msg || code); this.code = code; }
}

export function isConfigured() {
  try {
    const id = chrome.runtime.getManifest().oauth2?.client_id || '';
    return id && !id.startsWith('YOUR_CLIENT_ID');
  } catch { return false; }
}

export async function getToken(interactive) {
  if (typeof chrome === 'undefined' || !chrome.identity?.getAuthToken) throw new CalendarError('UNSUPPORTED');
  if (!isConfigured()) throw new CalendarError('NOT_CONFIGURED');
  try {
    const r = await chrome.identity.getAuthToken({ interactive });
    const token = typeof r === 'string' ? r : r?.token;
    if (!token) throw new Error('no token');
    return token;
  } catch (e) {
    throw new CalendarError('NEEDS_AUTH', e?.message);
  }
}

async function api(path, params, token, retry = true) {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) {
    await chrome.identity.removeCachedAuthToken({ token });
    return api(path, params, await getToken(false), false);
  }
  if (res.status === 401 || res.status === 403) throw new CalendarError('NEEDS_AUTH', 'HTTP ' + res.status);
  if (!res.ok) throw new CalendarError('HTTP', 'HTTP ' + res.status);
  return res.json();
}

function normalise(item) {
  const allDay = !!item.start?.date;
  const start = new Date(item.start?.dateTime || item.start?.date + 'T00:00:00');
  const end = new Date(item.end?.dateTime || item.end?.date + 'T00:00:00');
  return { id: item.iCalUID || item.id, title: item.summary || '(NO TITLE)', start, end, allDay };
}

/** All of today's (local day) non-declined events across the user's selected calendars. */
export async function fetchTodayEvents({ interactive = false } = {}) {
  const token = await getToken(interactive);
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

  const list = await api('/users/me/calendarList', { minAccessRole: 'reader', maxResults: '50' }, token);
  const calendars = (list.items || []).filter((c) => c.selected || c.primary).slice(0, 10);
  if (!calendars.length) calendars.push({ id: 'primary' });

  const seen = new Map();
  await Promise.all(calendars.map(async (cal) => {
    const data = await api(`/calendars/${encodeURIComponent(cal.id)}/events`, {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50',
    }, token);
    for (const item of data.items || []) {
      if (item.status === 'cancelled') continue;
      const me = (item.attendees || []).find((a) => a.self);
      if (me?.responseStatus === 'declined') continue;
      const ev = normalise(item);
      if (!seen.has(ev.id + ev.start.getTime())) seen.set(ev.id + ev.start.getTime(), ev);
    }
  }));
  return [...seen.values()].sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

export async function disconnect() {
  try {
    const token = await getToken(false);
    await fetch('https://accounts.google.com/o/oauth2/revoke?token=' + token).catch(() => {});
    await chrome.identity.removeCachedAuthToken({ token });
  } catch { /* already disconnected */ }
}
