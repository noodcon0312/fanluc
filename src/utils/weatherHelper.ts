import { WeatherCardData } from "../types";
import { parseThinkContent } from "./parseThink";

export interface WeatherCommand {
  location: string;
  rawCall: string;
}

export const WEATHER_REGEX = /(?:```[a-z]*\s*)?(?:call:)?show_weather\s*\(\s*([\s\S]*?)\s*\)(?:\s*```)?/gi;

export function extractWeatherCommands(
  text: string,
  thinkStartTag?: string,
  thinkEndTag?: string
): WeatherCommand[] {
  const thinkParsed = parseThinkContent(text, thinkStartTag, thinkEndTag);
  const targetText = thinkParsed.mainText;
  if (!targetText) return [];

  const results: WeatherCommand[] = [];
  const regex = new RegExp(WEATHER_REGEX.source, "gi");
  let match;

  while ((match = regex.exec(targetText)) !== null) {
    let locArg = "auto";
    const rawArgs = match[1].trim();

    const locParamMatch = rawArgs.match(/(?:^|,\s*)(?:location|city)\s*=\s*(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`|([a-zA-Z0-9_-]+))/i);
    if (locParamMatch) {
      locArg = locParamMatch[1] || locParamMatch[2] || locParamMatch[3] || locParamMatch[4] || "auto";
    } else if (rawArgs) {
      const parts = rawArgs.split(",").map(p => p.trim().replace(/['"`]/g, ""));
      if (parts[0]) locArg = parts[0];
    }

    results.push({
      location: locArg,
      rawCall: match[0],
    });
  }
  return results;
}

export function stripWeatherCommands(text: string): string {
  if (!text) return "";
  return text
    .replace(new RegExp(WEATHER_REGEX.source, "gi"), "")
    .replace(/`\s*(?:call:)?show_weather\s*\([\s\S]*?\)\s*`/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getGeolocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported outside the browser"));
    } else {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (err) => {
          reject(err);
        },
        { timeout: 10000 }
      );
    }
  });
}

export async function performWeatherFetch(cmd: WeatherCommand): Promise<WeatherCardData> {
  try {
    let url = `/api/weather?city=${encodeURIComponent(cmd.location)}`;
    
    if (cmd.location.toLowerCase() === "auto") {
      try {
        const coords = await getGeolocation();
        url = `/api/weather?lat=${coords.lat}&lon=${coords.lon}`;
      } catch (err: any) {
        return {
          location: "Unknown",
          temperature: 0,
          condition: "Unknown",
          error: "Permission denied or geolocation failed. Try specifying a city name like show_weather(location='Hanoi').",
        };
      }
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return {
         location: cmd.location,
         temperature: 0,
         condition: "Unknown",
         error: data.error || "Failed to fetch weather",
      };
    }

    const now = new Date();
    const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateFormatter = new Intl.DateTimeFormat("en-US", { weekday: 'short', month: 'short', day: 'numeric' });

    return {
      id: `weather-${Date.now()}`,
      location: data.location,
      temperature: data.temperature,
      condition: data.condition,
      isDay: data.isDay,
      time: timeFormatter.format(now),
      date: dateFormatter.format(now).replace(",", "."), // Mon, Mar 26 -> Mon. Mar 26
    };
  } catch (err: any) {
    return {
      location: cmd.location,
      temperature: 0,
      condition: "Unknown",
      error: err.message || "Failed to fetch weather data",
    };
  }
}
