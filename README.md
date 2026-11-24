# Airport Display

A Chrome extension that replaces the new tab page with a split-flap airport
departures board, including the mechanical clatter when the tiles change.

- **Date and time**: top row, updates each minute
- **Weather**: current conditions, hi/lo, wind and rain chance (Open-Meteo, no API key)
- **Meetings**: today's events from Google Calendar, shown as flights:
  `ON TIME`, `BOARDING` (starts within 15 min), `NOW`, `DEPARTED` (finished), `TODAY` (all-day)
- **Sound**: clacks are synthesised with Web Audio (no audio files). Browsers
  require one click on the page before audio can start; a hint appears until then.

Hover the bottom-right corner for mute, full-screen and settings buttons.

## Install

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** and select this folder.
3. Open a new tab. Weather works immediately. Set a city in settings, or allow location.

To preview with fake data and no setup, open `newtab.html?demo=1` from a local web server.

## Connect Google Calendar (one-time)

The extension ID is fixed by the `key` in `manifest.json`:
**`ojclhgbpdcjdilbjgjmmmlndfoakcebg`**

1. In [Google Cloud Console](https://console.cloud.google.com/) create or pick a project.
2. **APIs & Services > Library**: enable **Google Calendar API**.
3. **OAuth consent screen**: configure it (External is fine). Add your Google account as a **test user**.
4. **Credentials > Create credentials > OAuth client ID**, application type **Chrome extension**,
   Item ID = `ojclhgbpdcjdilbjgjmmmlndfoakcebg`.
5. Copy the client ID into `manifest.json` under `oauth2.client_id`.
6. Reload the extension, open a new tab and click the board (or use Settings > Connect) to sign in.

The extension requests only the read-only calendar scope. All calendars you have ticked in
Google Calendar are included; events you declined are hidden.

## Microsoft Edge

Install the same way: `edge://extensions` > Developer mode > **Load unpacked** (the extension ID is the same).
Edge can't use Chrome's Google sign-in, so Calendar uses a web-style OAuth flow:

1. In the same Google Cloud project, create another OAuth client ID of type **Web application**.
2. Add the **Authorised redirect URI** shown on the extension's Settings page
   (`https://ojclhgbpdcjdilbjgjmmmlndfoakcebg.chromiumapp.org/`).
3. Paste the client ID into Settings > **OAuth client ID**, then click **Connect**.

Tokens last about an hour and are renewed silently while Edge has an active Google session; if that
lapses, click the board to sign in again. The extension picks the right method automatically.

## Files

| File | Purpose |
|---|---|
| `js/flap.js` | Split-flap tile and board: steps through the character set, flips halves |
| `js/audio.js` | Synthesised clack sounds, thinned out when many tiles flip at once |
| `js/weather.js` | Open-Meteo geocoding and forecast |
| `js/calendar.js` | Google Calendar via `chrome.identity` |
| `js/newtab.js` | Layout, formatting, refresh timers |
| `options.html`, `js/options.js` | Settings: city, units, 12/24h, sound, calendar connection |

## Notes

- Text is upper-cased and limited to the board's character set; titles longer than 21 characters are cut off.
- Weather refreshes every 15 min, calendar every 5 min, statuses every 30 s.
- Chrome uses `getAuthToken`; Edge and other Chromium browsers use `launchWebAuthFlow` (see above).
