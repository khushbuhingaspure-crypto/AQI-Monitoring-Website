import json
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PORT = 8000


def fetch_json(url):
	request = urllib.request.Request(url, headers={"User-Agent": "AirSignal/1.0"})
	with urllib.request.urlopen(request, timeout=15) as response:
		return json.loads(response.read().decode("utf-8"))


class Handler(SimpleHTTPRequestHandler):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, directory=str(ROOT), **kwargs)

	def send_json(self, payload, status=200):
		body = json.dumps(payload).encode()
		self.send_response(status)
		self.send_header("Content-Type", "application/json; charset=utf-8")
		self.send_header("Content-Length", str(len(body)))
		self.send_header("Cache-Control", "no-store")
		self.end_headers()
		self.wfile.write(body)

	def do_GET(self):
		parsed = urllib.parse.urlparse(self.path)
		query = urllib.parse.parse_qs(parsed.query)
		try:
			if parsed.path == "/api/search":
				name = query.get("q", [""])[0].strip()
				if len(name) < 2:
					return self.send_json({"results": []})
				url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode({
					"name": name, "count": 7, "language": "en", "format": "json"
				})
				places = fetch_json(url).get("results", [])
				return self.send_json({"results": [{
					"name": place["name"],
					"admin1": place.get("admin1", ""),
					"country": place.get("country", ""),
					"latitude": place["latitude"],
					"longitude": place["longitude"],
				} for place in places]})

			if parsed.path == "/api/conditions":
				latitude = float(query["lat"][0])
				longitude = float(query["lon"][0])
				if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
					return self.send_json({"error": "Coordinates are outside valid bounds."}, 400)
				weather_url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({
					"latitude": latitude, "longitude": longitude,
					"current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index",
					"timezone": "auto",
				})
				air_url = "https://air-quality-api.open-meteo.com/v1/air-quality?" + urllib.parse.urlencode({
					"latitude": latitude, "longitude": longitude,
					"current": "us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_ozone,us_aqi_nitrogen_dioxide,pm2_5,pm10,ozone,nitrogen_dioxide",
					"timezone": "auto",
				})
				weather, air = fetch_json(weather_url), fetch_json(air_url)
				return self.send_json({"weather": weather.get("current", {}), "air": air.get("current", {})})

			if parsed.path == "/":
				self.path = "/frontend.html"
			return super().do_GET()
		except (KeyError, ValueError, IndexError):
			return self.send_json({"error": "Enter a valid location."}, 400)
		except urllib.error.HTTPError as error:
			return self.send_json({"error": f"Live data provider returned HTTP {error.code}."}, 502)
		except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
			return self.send_json({"error": "Live data is temporarily unavailable. Check your internet connection."}, 502)

	def log_message(self, format, *args):
		print(f"{self.log_date_time_string()} {args[0]}")


if __name__ == "__main__":
	server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
	print(f"Air Signal ready at http://127.0.0.1:{PORT}")
	print("Press Ctrl+C to stop.")
	try:
		server.serve_forever()
	except KeyboardInterrupt:
		server.server_close()
