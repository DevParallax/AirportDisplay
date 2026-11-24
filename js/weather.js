// Weather via Open-Meteo (free, no API key).
import { cacheGet, cacheSet } from './settings.js';

const WMO = {
  0: 'CLEAR', 1: 'MOSTLY CLEAR', 2: 'PARTLY CLOUDY', 3: 'OVERCAST',
  45: 'FOG', 48: 'FREEZING FOG',
  51: 'LIGHT DRIZZLE', 53: 'DRIZZLE', 55: 'HEAVY DRIZZLE',
  56: 'FREEZING DRIZZLE', 57: 'FREEZING DRIZZLE',
  61: 'LIGHT RAIN', 63: 'RAIN', 65: 'HEAVY RAIN',
  66: 'FREEZING RAIN', 67: 'FREEZING RAIN',
  71: 'LIGHT SNOW', 73: 'SNOW', 75: 'HEAVY SNOW', 77: 'SNOW GRAINS',
  80: 'LIGHT SHOWERS', 81: 'SHOWERS', 82: 'HEAVY SHOWERS',
  85: 'SNOW SHOWERS', 86: 'HEAVY SNOW SHWRS',
  95: 'THUNDERSTORM', 96: 'THUNDER + HAIL', 99: 'THUNDER + HAIL',
};

export class WeatherError extends Error {
  constructor(code, msg) { super(msg || code); this.code = code; }
}

function geolocate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new WeatherError('NO_LOCATION'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new WeatherError('NO_LOCATION')),
      { timeout: 10000, maximumAge: 3600e3 });
  });
}

/** Resolve the configured city (or the browser's location) to coordinates. */
export async function resolveLocation(city) {
  city = (city || '').trim();
  if (city) {
    const key = 'geo:' + city.toLowerCase();
    const cached = await cacheGet(key);
    if (cached) return cached;
    const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' +
      encodeURIComponent(city);
    const res = await fetch(url);
    if (!res.ok) throw new WeatherError('GEOCODE');
    const hit = (await res.json()).results?.[0];
    if (!hit) throw new WeatherError('CITY_NOT_FOUND');
    const loc = { lat: hit.latitude, lon: hit.longitude, name: hit.name };
    await cacheSet(key, loc);
    return loc;
  }
  try {
    const pos = await geolocate();
    const loc = { ...pos, name: 'LOCAL' };
    await cacheSet('geo:last', loc);
    return loc;
  } catch (e) {
    const last = await cacheGet('geo:last');
    if (last) return last;
    throw e;
  }
}

export async function fetchWeather(loc, units = 'metric') {
  const imperial = units === 'imperial';
  const params = new URLSearchParams({
    latitude: loc.lat,
    longitude: loc.lon,
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1',
    temperature_unit: imperial ? 'fahrenheit' : 'celsius',
    wind_speed_unit: imperial ? 'mph' : 'kmh',
  });
  const res = await fetch('https://api.open-meteo.com/v1/forecast?' + params);
  if (!res.ok) throw new WeatherError('HTTP', 'Open-Meteo ' + res.status);
  const j = await res.json();
  const r = (n) => (n == null ? null : Math.round(n));
  return {
    place: loc.name,
    desc: WMO[j.current.weather_code] ?? 'UNKNOWN',
    temp: r(j.current.temperature_2m),
    hi: r(j.daily?.temperature_2m_max?.[0]),
    lo: r(j.daily?.temperature_2m_min?.[0]),
    pop: r(j.daily?.precipitation_probability_max?.[0]),
    wind: r(j.current.wind_speed_10m),
    unit: imperial ? 'F' : 'C',
    windUnit: imperial ? 'MPH' : 'KMH',
  };
}
