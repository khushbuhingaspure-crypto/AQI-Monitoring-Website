const $ = (id) => document.getElementById(id);
const ui = {
	title: $("place-title"), subtitle: $("place-subtitle"), search: $("city-search"), suggestions: $("suggestions"),
	status: $("status-text"), statusLine: document.querySelector(".status"), time: $("reading-time"),
};
const weatherText = {
	0: ["Clear sky", "☼"], 1: ["Mostly clear", "☀"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁"],
	45: ["Foggy", "≋"], 48: ["Foggy", "≋"], 51: ["Light drizzle", "☂"], 53: ["Drizzle", "☂"], 55: ["Heavy drizzle", "☂"],
	61: ["Light rain", "☂"], 63: ["Rain", "☂"], 65: ["Heavy rain", "☂"], 71: ["Light snow", "❄"], 73: ["Snow", "❄"],
	75: ["Heavy snow", "❄"], 80: ["Rain showers", "☂"], 81: ["Showers", "☂"], 82: ["Heavy showers", "☂"], 95: ["Thunderstorm", "ϟ"], 96: ["Thunderstorm", "ϟ"], 99: ["Thunderstorm", "ϟ"],
};
const pollutants = [
	{ key: "pm25", api: "pm2_5", max: 55.5 }, { key: "pm10", api: "pm10", max: 154 },
	{ key: "ozone", api: "ozone", max: 200 }, { key: "no2", api: "nitrogen_dioxide", max: 100 },
];
let locationRequest = 0;
let searchRequest = 0;
let searchTimer;
let latestResults = [];

function status(message, state = "") {
	ui.status.textContent = message;
	ui.statusLine.className = `status ${state}`;
}

function number(value, digits = 0) {
	return value == null || !Number.isFinite(Number(value)) ? "--" : Number(value).toFixed(digits);
}

function category(aqi) {
	if (aqi <= 50) return ["Good", "Air quality is satisfactory, with little or no risk.", "#bce847", ""];
	if (aqi <= 100) return ["Moderate", "Acceptable air quality; unusually sensitive people may notice effects.", "#f1c95b", "moderate"];
	if (aqi <= 150) return ["Unhealthy for sensitive groups", "Sensitive groups may experience health effects.", "#efa06a", "unhealthy"];
	if (aqi <= 200) return ["Unhealthy", "Everyone may begin to experience health effects.", "#e77b64", "unhealthy"];
	if (aqi <= 300) return ["Very unhealthy", "Health alert: everyone may experience more serious effects.", "#c5759b", "unhealthy"];
	return ["Hazardous", "Health warning: everyone is more likely to be affected.", "#aa6077", "hazardous"];
}

function render(data) {
	const weather = data.weather || {};
	const air = data.air || {};
	const aqi = Number(air.us_aqi);
	const validAqi = Number.isFinite(aqi);
	const [label, message, color, level] = validAqi ? category(aqi) : ["AQI unavailable", "Air quality readings are unavailable for this location.", "#ffffff1e", ""];
	$("aqi").textContent = validAqi ? Math.round(aqi) : "--";
	$("gauge-number").textContent = validAqi ? Math.round(aqi) : "--";
	$("aqi-label").textContent = label;
	$("aqi-message").textContent = message;
	$("aqi-panel").className = `aqi-panel ${level}`;
	const arc = validAqi ? Math.min(aqi, 500) / 500 * 270 : 0;
	document.querySelector(".gauge").style.setProperty("--arc", `${arc}deg`);
	document.querySelector(".gauge").style.setProperty("--aqi-color", color);

	const contributor = [
		["PM2.5", air.us_aqi_pm2_5], ["PM10", air.us_aqi_pm10], ["Ozone", air.us_aqi_ozone], ["Nitrogen dioxide", air.us_aqi_nitrogen_dioxide],
	].filter(([, value]) => value != null && Number.isFinite(Number(value))).sort((a, b) => b[1] - a[1])[0];
	$("main-pollutant").textContent = contributor ? contributor[0] : "Unavailable";

	$("temperature").textContent = `${number(weather.temperature_2m)}°`;
	$("feels-like").textContent = `${number(weather.apparent_temperature)}°`;
	const [condition, icon] = weatherText[weather.weather_code] || ["Conditions available", "◌"];
	$("weather-description").textContent = condition;
	$("weather-icon").textContent = icon;
	$("humidity").textContent = `${number(weather.relative_humidity_2m)}%`;
	$("wind").textContent = `${number(weather.wind_speed_10m)} km/h`;
	$("uv").textContent = number(weather.uv_index, 1);

	for (const pollutant of pollutants) {
		const value = air[pollutant.api];
		$(`${pollutant.key}`).textContent = number(value, 1);
		$(`meter-${pollutant.key}`).style.width = value == null ? "0%" : `${Math.min(100, Number(value) / pollutant.max * 100)}%`;
	}
	const timezone = weather.timezone || undefined;
	try {
		$("clock").textContent = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date()).toUpperCase();
		ui.time.textContent = `READING ${new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(weather.time || Date.now()))}`;
	} catch {
		$("clock").textContent = "LOCAL TIME";
	}
}

async function loadLocation(place) {
	const current = ++locationRequest;
	ui.title.textContent = `${place.name}.`;
	ui.subtitle.textContent = [place.admin1, place.country].filter(Boolean).join(", ") || "Current location";
	status("Getting live air and weather data");
	try {
		const data = await getConditions(place.latitude, place.longitude);
		if (current !== locationRequest) return;
		render(data);
		status("Live readings updated", "ok");
	} catch (error) {
		if (current === locationRequest) status(error.message || "Live data unavailable. Check your internet connection.", "error");
	}
}

async function getConditions(latitude, longitude) {
	const params = new URLSearchParams({ lat: latitude, lon: longitude });
	try {
		const response = await fetch(`/api/conditions?${params}`);
		if (response.ok) return await response.json();
	} catch {
		// Static servers such as Live Server do not provide the Python API route.
	}
	const weatherParams = new URLSearchParams({
		latitude, longitude,
		current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index",
		timezone: "auto",
	});
	const airParams = new URLSearchParams({
		latitude, longitude,
		current: "us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_ozone,us_aqi_nitrogen_dioxide,pm2_5,pm10,ozone,nitrogen_dioxide",
		timezone: "auto",
	});
	const [weatherResponse, airResponse] = await Promise.all([
		fetch(`https://api.open-meteo.com/v1/forecast?${weatherParams}`),
		fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`),
	]);
	if (!weatherResponse.ok || !airResponse.ok) throw new Error("Live data unavailable. Check your internet connection.");
	const [weather, air] = await Promise.all([weatherResponse.json(), airResponse.json()]);
	return { weather: weather.current || {}, air: air.current || {} };
}

async function findPlaces(query) {
	try {
		const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
		if (response.ok) return (await response.json()).results || [];
	} catch {
		// Use the public geocoder when running as a static page.
	}
	const params = new URLSearchParams({ name: query, count: 7, language: "en", format: "json" });
	const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
	if (!response.ok) throw new Error("City search is unavailable. Check your internet connection.");
	const data = await response.json();
	return (data.results || []).map((place) => ({
		name: place.name,
		admin1: place.admin1 || "",
		country: place.country || "",
		latitude: place.latitude,
		longitude: place.longitude,
	}));
}

function showPlaces(places) {
	latestResults = places;
	ui.suggestions.replaceChildren();
	if (!places.length) {
		const empty = document.createElement("div");
		empty.className = "suggestion";
		empty.textContent = "No matching cities. Try a nearby larger city.";
		ui.suggestions.append(empty);
	} else {
		for (const place of places) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "suggestion";
			button.setAttribute("role", "option");
			const name = document.createElement("span");
			name.textContent = place.name;
			const details = document.createElement("small");
			details.textContent = [place.admin1, place.country].filter(Boolean).join(", ");
			button.append(name, details);
			button.addEventListener("click", () => choosePlace(place));
			ui.suggestions.append(button);
		}
	}
	ui.suggestions.hidden = false;
}

function choosePlace(place) {
	searchRequest++;
	clearTimeout(searchTimer);
	ui.suggestions.hidden = true;
	ui.search.value = "";
	loadLocation(place);
}

async function search(query, selectFirst = false) {
	if (query.length < 2) {
		status("Type at least 2 letters to search", "error");
		return;
	}
	const current = ++searchRequest;
	status("Searching cities");
	try {
		const places = await findPlaces(query);
		if (current !== searchRequest) return;
		if (selectFirst && places.length) {
			choosePlace(places[0]);
			return;
		}
		showPlaces(places);
		status(places.length ? "Select a city below, or press Enter for the first match" : "No matching cities found", places.length ? "" : "error");
	} catch (error) {
		if (current === searchRequest) status(error.message, "error");
	}
}

$("search-form").addEventListener("submit", (event) => {
	event.preventDefault();
	clearTimeout(searchTimer);
	search(ui.search.value.trim(), true);
});
ui.search.addEventListener("input", () => {
	clearTimeout(searchTimer);
	const query = ui.search.value.trim();
	if (query.length < 2) {
		searchRequest++;
		ui.suggestions.hidden = true;
		return;
	}
	searchTimer = setTimeout(() => search(query), 220);
});
document.addEventListener("click", (event) => {
	if (!$("search-form").contains(event.target)) ui.suggestions.hidden = true;
});

$("my-location").addEventListener("click", () => {
	if (!navigator.geolocation) return status("This browser does not support location", "error");
	status("Finding your location");
	navigator.geolocation.getCurrentPosition(({ coords }) => loadLocation({
		name: "Your location", admin1: "Nearby", latitude: coords.latitude, longitude: coords.longitude,
	}), (error) => status(error.code === error.PERMISSION_DENIED ? "Allow location in browser settings, or search for your city" : "Location unavailable. Search for your city instead.", "error"), {
		enableHighAccuracy: false, timeout: 10000, maximumAge: 300000,
	});
});

function initialize() {
	const initialRequest = locationRequest;
	loadLocation({ name: "New Delhi", admin1: "India", latitude: 28.6139, longitude: 77.209 });
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(({ coords }) => {
			if (locationRequest === initialRequest + 1) loadLocation({ name: "Your location", admin1: "Nearby", latitude: coords.latitude, longitude: coords.longitude });
		}, () => {}, { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 });
	}
}

initialize();
