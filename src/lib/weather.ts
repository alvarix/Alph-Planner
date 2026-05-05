/**
 * Open-Meteo weather integration.
 * Free, no API key required.
 * https://open-meteo.com/
 */

export interface DayWeather {
	date: string;   // ISO date "YYYY-MM-DD"
	code: number;   // WMO weather code
	emoji: string;
	desc: string;
	high: number;   // °C, rounded
	low: number;
}

/** Map WMO weather interpretation code to emoji + short label. */
function wmoInfo(code: number): { emoji: string; desc: string } {
	if (code === 0)  return { emoji: '☀️',  desc: 'Clear' };
	if (code === 1)  return { emoji: '🌤️', desc: 'Mostly clear' };
	if (code === 2)  return { emoji: '⛅',  desc: 'Partly cloudy' };
	if (code === 3)  return { emoji: '☁️',  desc: 'Overcast' };
	if (code <= 48)  return { emoji: '🌫️', desc: 'Fog' };
	if (code <= 57)  return { emoji: '🌦️', desc: 'Drizzle' };
	if (code <= 67)  return { emoji: '🌧️', desc: 'Rain' };
	if (code <= 77)  return { emoji: '🌨️', desc: 'Snow' };
	if (code <= 82)  return { emoji: '🌧️', desc: 'Showers' };
	if (code <= 86)  return { emoji: '❄️',  desc: 'Snow showers' };
	if (code === 95) return { emoji: '⛈️',  desc: 'Thunderstorm' };
	return                  { emoji: '⛈️',  desc: 'Severe storm' };
}

/**
 * Resolve user coordinates via Geolocation API.
 * Falls back to San Francisco if permission is denied or API unavailable.
 */
async function getCoords(): Promise<{ lat: number; lng: number }> {
	const fallback = { lat: 37.77, lng: -122.42 };
	if (typeof navigator === 'undefined' || !navigator.geolocation) return fallback;
	return new Promise(resolve => {
		navigator.geolocation.getCurrentPosition(
			pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
			()  => resolve(fallback),
			{ timeout: 5000 }
		);
	});
}

/**
 * Fetch a 7-day forecast from Open-Meteo.
 * Returns a map of ISO date → DayWeather.
 * Returns empty object on any failure so callers can treat it as optional.
 */
export async function fetchWeek(): Promise<Record<string, DayWeather>> {
	try {
		const { lat, lng } = await getCoords();
		const url = new URL('https://api.open-meteo.com/v1/forecast');
		url.searchParams.set('latitude',  String(lat));
		url.searchParams.set('longitude', String(lng));
		url.searchParams.set('daily',     'weather_code,temperature_2m_max,temperature_2m_min');
		url.searchParams.set('timezone',  'auto');
		url.searchParams.set('forecast_days', '7');

		const res = await fetch(url.toString());
		if (!res.ok) return {};
		const json = await res.json();

		const { time, weather_code, temperature_2m_max, temperature_2m_min } = json.daily;
		const out: Record<string, DayWeather> = {};
		for (let i = 0; i < time.length; i++) {
			const { emoji, desc } = wmoInfo(weather_code[i]);
			out[time[i]] = {
				date: time[i],
				code: weather_code[i],
				emoji, desc,
				high: Math.round(temperature_2m_max[i]),
				low:  Math.round(temperature_2m_min[i]),
			};
		}
		return out;
	} catch {
		return {};
	}
}
