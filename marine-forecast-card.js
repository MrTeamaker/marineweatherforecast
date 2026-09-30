/**
 * marine-forecast-card.js
 *
 * A vanilla-JS Home Assistant Lovelace card that renders a WillyWeather-style
 * marine forecast chart:
 *   - wind speed + direction barbs, colour-coded by speed, with an optional
 *     "easterly" highlight ring
 *   - swell height + direction barbs, colour-coded by height
 *   - a temperature line (+ a light-green daily-min line) with boxed values
 *   - light-blue rain shading, scaled by probability (and mm, if your data
 *     has it)
 *   - a tide curve on its own real metres axis (0-2 m by default)
 *   - light vertical strips for daylight hours, from real sunrise/sunset
 *   - a row of weather condition icons
 *
 * All colours live in the COLORS constant right below this comment — that's
 * the one place to edit for anything purely visual.
 *
 * THREE WAYS TO USE THE SAME CARD TYPE, via `mode`:
 *   mode: "hourly"  — one forecast sensor, per-hour resolution throughout.
 *                      Typically 8-72 points. Temperature/rain/labels are
 *                      shown per point.
 *   mode: "daily"   — one forecast sensor, one point per day (7ish points).
 *                      Barbs are off by default (daily averages are noisy);
 *                      turn them back on with wind: { show_barbs: true }.
 *   mode: "mixed"   — TWO forecast sensors at once: `forecast_entity` (hourly)
 *                      for the near term — limited by how far out your
 *                      provider actually gives hourly data, WillyWeather is
 *                      ~3-4 days — then `daily_entity` (daily) for the rest
 *                      of the week. Labels, temperature and rain
 *                      automatically switch from per-hour to per-day at the
 *                      point where the chart switches sources. This is what
 *                      a "7-day forecast" card should use.
 * The x-axis is always time-proportional (not just evenly spaced by point
 * index), so a day made of hourly points takes up exactly as much width as
 * a day represented by a single daily point.
 *
 * Install:
 *  1. Copy this file to /config/www/marine-forecast-card.js (a subfolder is
 *     fine too, e.g. /config/www/community/marine-forecast-card/ — just make
 *     the Resources URL below match wherever you actually put it)
 *  2. Settings -> Dashboards -> (⋮ menu, top right) -> Resources -> Add
 *       URL: /local/marine-forecast-card.js   Type: JavaScript Module
 *  3. Use `type: custom:marine-forecast-card` in a Lovelace card (Manual
 *     card editor if it doesn't show up in the visual picker — custom cards
 *     often don't, that's normal, not a sign anything's broken).
 *  4. Bump a `?v=2` style query string on the Resources URL every time you
 *     update this file, or the browser/HA frontend will keep serving a
 *     cached copy — this bit us many, many times during development.
 *
 * DATA SOURCES — none of this comes from one place:
 *
 * 1. Wind/swell/temperature/rain-probability: a plain `sensor.*` whose
 *    `forecast` attribute is a list of objects (NOT a `weather.*` entity —
 *    modern HA weather entities only expose forecasts via the
 *    `weather.get_forecasts` action, not as a static attribute, so a
 *    trigger-based template sensor is used to call that action on a timer
 *    and cache the result as an attribute the card can just read). See
 *    configuration.yaml for the actual sensors. Expected item shape:
 *      {
 *        datetime: "2026-08-25T14:00:00+08:00",
 *        temperature: 19.4,
 *        templow: 12.1,              // daily entries only
 *        wind_speed: 24,             // km/h
 *        wind_bearing: 210,          // degrees, 0 = N
 *        swell_height: 1.2,          // m — hourly entries only, WillyWeather
 *        swell_direction: 195,       //     doesn't return this on daily ones
 *        precipitation_probability: 60, // % — WillyWeather only gives ONE
 *                                        // real value per calendar day, on
 *                                        // the day's 00:00 entry; the card
 *                                        // forward-fills it across the rest
 *                                        // of that day
 *        condition: "partlycloudy"   // daily entries only, drives the icon row
 *      }
 *
 * 2. Rain probability can optionally come from a DIFFERENT sensor entirely
 *    (rain.source_entity) — useful because WillyWeather's rain is only ever
 *    a once-a-day figure, while e.g. a BOM-backed weather entity gives a
 *    genuine hourly trend. Same underlying pattern: a trigger-based sensor
 *    caching that entity's own `weather.get_forecasts` result.
 *
 * 3. Weather condition icons can similarly come from a different sensor via
 *    condition_source_entity, for the same reason (WillyWeather's hourly
 *    forecast has no `condition` field at all, only the daily one does).
 *
 * 4. Tide has NO relation to the forecast sensors above at all — WillyWeather's
 *    weather.get_forecasts action doesn't return tide data in any form. Two
 *    options, tried in this order:
 *      - tide.events_entity: a REST sensor hitting WillyWeather's API
 *        directly with forecasts=tides, whose `days` attribute holds the
 *        real high/low events (arbitrary count per day — this is what lets
 *        the card show a one-high day differently from a two-high day).
 *        This is the one actually worth setting up.
 *      - tide.high_time_entity / low_time_entity (+ optional *_height
 *        entities): the WillyWeather integration's built-in "next high tide"
 *        / "next low tide" sensors. Only ever two data points, so the card
 *        falls back to modelling a single smooth wave from them — better
 *        than nothing, but can't distinguish 1-high vs 2-high days.
 *
 * 5. Daylight strips use Home Assistant's own configured home location
 *    (hass.config.latitude/longitude/time_zone) by default — override with
 *    daylight.latitude / daylight.longitude if the boat harbour isn't your
 *    home location. No sensor needed; sunrise/sunset are computed in-card
 *    with a standard astronomical formula.
 *
* Add the following lines to your configuration.yaml (ensure you only have one rest key)
*
* rest:
* - resource: !secret willyweather_tides_url
*   scan_interval: 21600
*    sensor:
*      - name: "WW Tide Events"
*        unique_id: ww_tide_events
*        value_template: "{{ value_json.forecasts.tides.days | length }}"
*        json_attributes_path: "$.forecasts.tides"
*        json_attributes:
*          - days
*
* 
* Add the following line to your secrets.yaml file (replace YOUR_KEY with the real key)
* 
* willyweather_tides_url: "https://api.willyweather.com.au/v2/YOUR_KEY/locations/19546/weather.json?forecasts=tides&days=7"
* 
*/
 
 
// Maps Home Assistant's standard weather `condition` strings to the
// matching Material Design Icon — used for the daily icon row. Home
// Assistant's frontend already ships every mdi icon, so <ha-icon> just
// works here without any extra imports.
const CONDITION_ICONS = {
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  exceptional: "mdi:alert-circle-outline",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};

// ---------------------------------------------------------------------
// ALL COLORS LIVE HERE. Change anything visually to do with color by
// editing this block — nothing else in the file needs to be touched.
// ---------------------------------------------------------------------
const COLORS = {
  wind: {
    line: "#FFA726", // orange
    // Barb color thresholds, ascending [max_value, color]. Last max
    // should be Infinity to catch everything above it.
    scale: [
      [15, "#4CAF50"], // green:  < 15 km/h
      [28, "#FFC107"], // amber: 15–28 km/h
      [Infinity, "#F44336"], // red:   > 28 km/h
    ],
    // A subtle ring drawn behind any wind barb that falls in the
    // "easterly" bearing range — does not change the barb's own color.
    easterlyHighlight: "#FFD54F",
  },
  swell: {
    line: "#29B6F6", // blue
    scale: [
      [1, "#009999"],
      [2, "#126180"],
      [3, "#004242"],
      [4, "#004953"],
      [Infinity, "#004953"],
    ],
  },
  temperature: {
    line: "#EF9A9A", // light red (high/hourly)
    box: "#EF9A9A",
    lowLine: "#A5D6A7", // light green (daily min)
    lowBox: "#A5D6A7",
  },
  rain: {
    fill: "#4FC3F7", // light blue
    text: "#4FC3F7",
  },
  tide: "var(--secondary-text-color)",
  // Very light vertical strip behind the chart for the hours between real
  // sunrise and sunset each day. Raise opacity if it's too subtle.
  daylight: { fill: "#FFE082", opacity: 0.07 },
  grid: "var(--divider-color)",
  axisLabel: "var(--secondary-text-color)",
};

class MarineForecastCard extends HTMLElement {
  setConfig(config) {
    if (!config.forecast_entity) {
      throw new Error("marine-forecast-card: `forecast_entity` is required");
    }
    this._config = {
      forecast_entity: config.forecast_entity,
      title: config.title || "",
      mode: config.mode || "hourly", // hourly | daily | mixed
      points: config.points || (config.mode === "daily" ? 7 : 8),
      // "mixed" mode: hourly barbs for the near-term (limited by how far out
      // WillyWeather actually provides hourly data — typically 3 days), then
      // falls back to daily entries for the remaining days, all in one chart.
      daily_entity: config.daily_entity || null,
      hourly_hours: config.hourly_hours || 72,
      hourly_step: config.hourly_step || 1, // take every Nth hourly point to reduce clutter
      daily_days: config.daily_days || 7, // total days the chart should try to span
      // Where a daily entry sits on the time axis: "noon" (centre of its day, so it
      // lines up with that day's daylight strip) or "midnight" (start of the day).
      daily_anchor: config.daily_anchor || "noon",
      wind: {
        speed_field: "wind_speed",
        bearing_field: "wind_bearing",
        unit: "km/h",
        color_scale: COLORS.wind.scale,
        // Highlight barbs whose bearing falls in this range (compass
        // degrees, 90 = due East) with a ring — doesn't touch barb color.
        // Easy to retune: change these two numbers, or set enabled:false.
        easterly: { enabled: true, min: 67.5, max: 112.5 },
        axis_max: 60, // default axis ceiling; grows automatically if data exceeds it
        ...(config.wind || {}),
      },
      swell: {
        height_field: "swell_height",
        bearing_field: "swell_direction",
        unit: "m",
        axis_max: 6, // default axis ceiling; grows automatically if data exceeds it
        show_barbs: config.mode !== "daily",
        color_scale: COLORS.swell.scale,
        ...(config.swell || {}),
      },
      temperature: {
        field: "temperature",
        low_field: "templow", // standard HA field for daily min temp; hourly entries won't have this
        show: true,
        show_low: true,
        ...(config.temperature || {}),
      },
      condition_field: config.condition_field || "condition",
      // Optional: pull the weather icon per hour from a *different* forecast
      // sensor (e.g. BOM-backed), since WillyWeather's hourly forecast has
      // no `condition` field at all — only its daily one does. Matched to
      // the main series by hour, same as rain.source_entity.
      condition_source_entity: config.condition_source_entity || null,
      show_condition_icons: config.show_condition_icons !== false,
      wind_show_barbs: config.mode !== "daily",
      rain: {
        // WillyWeather's hourly forecast only carries a probability figure
        // (and only once per day, not per-hour) — no mm amount at hourly
        // resolution. Leave amount_field null unless your data has one;
        // the card falls back to probability-only shading in that case.
        amount_field: null,
        probability_field: "precipitation_probability",
        // 0 = shading always scales with actual probability, matching the
        // numeric label underneath it. Raise this if you'd rather only see
        // shading on days likely enough to matter (e.g. 50 hides anything
        // under 50% entirely) — but then the shading and the label number
        // will disagree by design below that cutoff.
        probability_threshold: 0,
        max_mm: 10,
        // Optional: pull rain data from a *different* forecast sensor
        // entirely (e.g. a BOM-backed entity) instead of forecast_entity.
        // Must be a sensor whose `forecast` attribute is a list shaped the
        // same way (datetime + probability/amount fields), matched to the
        // main series by hour.
        source_entity: null,
        ...(config.rain || {}),
      },
      // Tide. Best source is `events_entity`: a sensor whose `days` attribute
      // holds WillyWeather's real high/low tide events (see setup notes) — that
      // is what lets the curve show days with one high vs two. If it isn't
      // set/available, falls back to a smooth wave built from the integration's
      // "next high / next low" sensors (times + heights), which can't tell
      // one-high days from two-high days.
      tide: config.tide
        ? {
            events_entity: null,
            high_time_entity: null,
            low_time_entity: null,
            high_height_entity: null,
            low_height_entity: null,
            axis_min: 0, // metres; the axis grows automatically if tides exceed it
            axis_max: 2,
            show_axis: true,
            ...config.tide,
          }
        : null,
      // Light strips for daylight hours, from computed sunrise/sunset for the
      // HA home location (override latitude/longitude here if needed).
      daylight: { enabled: true, latitude: null, longitude: null, ...(config.daylight || {}) },
      height: config.height || 340,
    };
    if (config.wind && "show_barbs" in config.wind) {
      this._config.wind_show_barbs = config.wind.show_barbs;
    }
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 6;
  }

  // ---------- helpers ----------

  // Looks up a color from a [max, color] scale (ascending order, last max
  // should be Infinity). Same helper used for both wind and swell so the
  // logic only needs to live — and be edited — in one place (see COLORS).
  static _colorFromScale(v, scale) {
    for (const [max, color] of scale) if (v < max) return color;
    return scale[scale.length - 1][1];
  }

  static _niceMax(v) {
    if (!isFinite(v) || v <= 0) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    let nice;
    if (n <= 1) nice = 1;
    else if (n <= 2) nice = 2;
    else if (n <= 5) nice = 5;
    else nice = 10;
    return nice * pow;
  }

  // rotate 0deg = pointing straight up (matches compass bearing directly)
  static _barb(x, y, bearing, color, scale = 1) {
    return `
      <g transform="translate(${x},${y}) rotate(${bearing})">
        <line x1="0" y1="11" x2="0" y2="-11" stroke="${color}" stroke-width="${3.5 * scale}" stroke-linecap="round"/>
        <path d="M -7,-5 L 0,-15 L 7,-5 Z" fill="${color}" stroke="${color}" stroke-width="${1 * scale}" stroke-linejoin="round"/>
      </g>`;
  }

  // Drawn *behind* a barb (z-order: call before _barb) to flag a
  // direction range without touching the barb's own color at all.
  static _highlightRing(x, y, color) {
    return `<circle cx="${x}" cy="${y}" r="17" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 2"/>`;
  }

  // A small rounded box with centered text — used for temperature values,
  // matching the "boxed value on the line" look from typical weather apps.
  static _labelBox(x, y, text, color) {
    const w = Math.max(30, text.length * 9 + 12);
    const h = 22;
    return `
      <g transform="translate(${x - w / 2}, ${y - h / 2})">
        <rect width="${w}" height="${h}" rx="5" fill="var(--card-background-color, #1c1c1c)" stroke="${color}" stroke-width="1.5"/>
        <text x="${w / 2}" y="${h / 2 + 5}" font-size="13" text-anchor="middle" fill="${color}">${text}</text>
      </g>`;
  }

  // hour-precision key so we can match two different forecast sources
  // even if their ISO strings differ slightly in seconds/offset formatting
  static _hourKey(datetimeStr) {
    const d = new Date(datetimeStr);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
  }

  static _formatHour24(d) {
    return `${String(d.getHours()).padStart(2, "0")}:00`;
  }

  _rainLookup() {
    const cfg = this._config;
    if (!cfg.rain.source_entity) return null;
    const ent = this._hass.states[cfg.rain.source_entity];
    if (!ent || !ent.attributes || !ent.attributes.forecast) return null;
    const map = {};
    ent.attributes.forecast.forEach((p) => {
      map[MarineForecastCard._hourKey(p.datetime)] = {
        prob: Number(p[cfg.rain.probability_field]) || 0,
        amount: cfg.rain.amount_field && p[cfg.rain.amount_field] != null ? Number(p[cfg.rain.amount_field]) : null,
      };
    });
    return map;
  }

  _conditionLookup() {
    const cfg = this._config;
    if (!cfg.condition_source_entity) return null;
    const ent = this._hass.states[cfg.condition_source_entity];
    if (!ent || !ent.attributes || !ent.attributes.forecast) return null;
    const map = {};
    ent.attributes.forecast.forEach((p) => {
      map[MarineForecastCard._hourKey(p.datetime)] = p[cfg.condition_field];
    });
    return map;
  }

  _forwardFill(raw) {
    const cfg = this._config;
    // WillyWeather doesn't return swell or rain-probability on every hour
    // (swell updates every few hours; probability is a once-per-day figure
    // attached only to the 00:00 entry). Forward-fill so the chart doesn't
    // show gaps/zeros where the real value just wasn't repeated.
    const fillFields = [cfg.swell.height_field, cfg.swell.bearing_field, "swell_period", cfg.rain.probability_field];
    const last = {};
    return raw.map((p) => {
      const filled = { ...p };
      fillFields.forEach((f) => {
        if (filled[f] === undefined || filled[f] === null) {
          if (last[f] !== undefined) filled[f] = last[f];
        } else {
          last[f] = filled[f];
        }
      });
      return filled;
    });
  }

  // Moves a daily entry to local noon of its own calendar day (see daily_anchor).
  _anchorDaily(p) {
    if (this._config.daily_anchor !== "noon") return p;
    const tz = (this._hass.config || {}).time_zone;
    if (!tz) return p;
    const ymd = MarineForecastCard._localYMD(new Date(p.datetime).getTime(), tz);
    const pad = (v) => String(v).padStart(2, "0");
    const noon = MarineForecastCard._parseWallClock(`${ymd.y}-${pad(ymd.m)}-${pad(ymd.d)} 12:00:00`, tz);
    return isNaN(noon) ? p : { ...p, datetime: new Date(noon).toISOString() };
  }

  _forecastPoints() {
    const cfg = this._config;
    const ent = this._hass.states[cfg.forecast_entity];
    if (!ent || !ent.attributes || !ent.attributes.forecast) return [];

    if (!cfg.daily_entity) {
      // plain single-source mode (hourly-only, or daily-only)
      const raw = ent.attributes.forecast.slice(0, cfg.points);
      return this._forwardFill(raw).map((p) => {
        const q = { ...p, __isDaily: cfg.mode === "daily" };
        return q.__isDaily ? this._anchorDaily(q) : q;
      });
    }

    // "mixed" mode: near-term hourly (thinned by hourly_step) covering
    // complete calendar days, then whatever daily entries fall after that.
    // Slicing by day count (not a fixed hour count) matters: a fixed hour
    // count almost always lands mid-afternoon on the last day, making it
    // visually narrower than the fully-populated days before it.
    const allHourlyRaw = this._forwardFill(ent.attributes.forecast);
    const targetHourlyDays = Math.max(1, Math.round(cfg.hourly_hours / 24));
    const seenDays = new Set();
    const hourlyRaw = [];
    for (const p of allHourlyRaw) {
      const dayKey = new Date(p.datetime).toDateString();
      if (!seenDays.has(dayKey)) {
        if (seenDays.size >= targetHourlyDays) break; // completed target days — stop before a new one starts
        seenDays.add(dayKey);
      }
      hourlyRaw.push(p);
    }
    const hourlyPoints = hourlyRaw.filter((_, i) => i % cfg.hourly_step === 0).map((p) => ({ ...p, __isDaily: false }));

    const lastHourlyDate = hourlyPoints.length
      ? new Date(hourlyPoints[hourlyPoints.length - 1].datetime).toDateString()
      : null;

    const dailyEnt = this._hass.states[cfg.daily_entity];
    let dailyPoints = [];
    if (dailyEnt && dailyEnt.attributes && dailyEnt.attributes.forecast) {
      dailyPoints = dailyEnt.attributes.forecast
        .filter((p) => {
          const dDate = new Date(p.datetime).toDateString();
          // skip any day already represented in the hourly segment
          return !lastHourlyDate || new Date(p.datetime) > new Date(hourlyPoints[hourlyPoints.length - 1].datetime);
        })
        .slice(0, Math.max(0, cfg.daily_days - Math.ceil(cfg.hourly_hours / 24)))
        .map((p) => this._anchorDaily({ ...p, __isDaily: true }));
    }

    return [...hourlyPoints, ...dailyPoints];
  }

  // ---------- time zone + sun helpers (tested standalone) ----------

  static _tzOffsetMs(epochMs, tz) {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const p = {};
    dtf.formatToParts(new Date(epochMs)).forEach((x) => (p[x.type] = x.value));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - epochMs;
  }

  // WillyWeather timestamps like "2026-09-19 05:12:00" carry no offset — they
  // are wall-clock time at the location. Interpret them in HA's time zone
  // rather than whatever zone the browser happens to be in.
  static _parseWallClock(str, tz) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(str));
    if (!m) return NaN;
    if (!tz) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    const off1 = MarineForecastCard._tzOffsetMs(guess, tz);
    const off2 = MarineForecastCard._tzOffsetMs(guess - off1, tz);
    return guess - off2;
  }

  static _localYMD(ms, tz) {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const p = {};
    dtf.formatToParts(new Date(ms)).forEach((x) => (p[x.type] = x.value));
    return { y: +p.year, m: +p.month, d: +p.day };
  }

  // Sunrise/sunset (standard astronomical algorithm, includes atmospheric
  // refraction) for the solar day nearest `ms`. Typically within a minute or
  // two of published times. Returns NaN for polar day/night.
  static _sunTimes(ms, lat, lng) {
    const rad = Math.PI / 180,
      DAY = 86400000,
      J1970 = 2440588,
      J2000 = 2451545,
      J0 = 0.0009,
      OBL = rad * 23.4397;
    const days = ms / DAY - 0.5 + J1970 - J2000;
    const lw = rad * -lng,
      phi = rad * lat;
    const n = Math.round(days - J0 - lw / (2 * Math.PI));
    const approx = (Ht) => J0 + (Ht + lw) / (2 * Math.PI) + n;
    const ds = approx(0);
    const M = rad * (357.5291 + 0.98560028 * ds);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(L) * Math.sin(OBL));
    const transit = (a) => J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const w = Math.acos((Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    if (isNaN(w)) return { rise: NaN, set: NaN };
    const Jnoon = transit(ds),
      Jset = transit(approx(w)),
      Jrise = Jnoon - (Jset - Jnoon);
    const toMs = (j) => (j + 0.5 - J1970) * DAY;
    return { rise: toMs(Jrise), set: toMs(Jset) };
  }

  // [{rise, set}] in epoch ms, one per local calendar day touching [t0, t1]
  _daylightSpans(t0, t1) {
    const dl = this._config.daylight;
    if (!dl || !dl.enabled) return [];
    const hc = this._hass.config || {};
    const tz = hc.time_zone;
    const lat = dl.latitude != null ? dl.latitude : hc.latitude;
    const lng = dl.longitude != null ? dl.longitude : hc.longitude;
    if (lat == null || lng == null || !tz) return [];
    const a = MarineForecastCard._localYMD(t0, tz),
      b = MarineForecastCard._localYMD(t1, tz);
    const spans = [];
    for (let cur = Date.UTC(a.y, a.m - 1, a.d), end = Date.UTC(b.y, b.m - 1, b.d); cur <= end; cur += 86400000) {
      const c = new Date(cur);
      const pad = (v) => String(v).padStart(2, "0");
      const noon = MarineForecastCard._parseWallClock(`${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(c.getUTCDate())} 12:00:00`, tz);
      const st = MarineForecastCard._sunTimes(noon, lat, lng);
      if (!isNaN(st.rise) && !isNaN(st.set)) spans.push(st);
    }
    return spans;
  }

  // ---------- tide ----------

  // Real high/low events from a sensor's `days[].entries[]` attribute
  // (WillyWeather's tides forecast). Returns [{time, height}] sorted, or null.
  _tideEvents() {
    const t = this._config.tide;
    if (!t || !t.events_entity) return null;
    const ent = this._hass.states[t.events_entity];
    if (!ent || !ent.attributes || !Array.isArray(ent.attributes.days)) return null;
    const tz = (this._hass.config || {}).time_zone;
    const ev = [];
    ent.attributes.days.forEach((day) =>
      (day.entries || []).forEach((e) => {
        const time = MarineForecastCard._parseWallClock(e.dateTime, tz);
        const height = Number(e.height);
        if (!isNaN(time) && !isNaN(height)) ev.push({ time, height });
      })
    );
    ev.sort((p, q) => p.time - q.time);
    return ev.length >= 2 ? ev : null;
  }

  // Smooth tide height in metres, sampled every 30 min on its own time grid
  // (independent of how sparse the forecast points are). With real events it
  // interpolates between each consecutive high/low using the same half-cosine
  // shape as before, so a day with one high and one low looks different from
  // a day with two. Returns { samples: [{time, value}], source } or null.
  _tideCurveDense(t0, t1) {
    const t = this._config.tide;
    if (!t) return null;
    const STEP = 30 * 60 * 1000;
    const samples = [];

    const events = this._tideEvents();
    if (events) {
      let i = 0;
      const lo = Math.max(t0, events[0].time),
        hi = Math.min(t1, events[events.length - 1].time);
      for (let ts = lo; ts <= hi; ts += STEP) {
        while (i < events.length - 2 && events[i + 1].time < ts) i++;
        const a = events[i],
          b = events[i + 1];
        const f = Math.min(1, Math.max(0, (ts - a.time) / (b.time - a.time || 1)));
        samples.push({ time: ts, value: a.height + (b.height - a.height) * ((1 - Math.cos(f * Math.PI)) / 2) });
      }
      return samples.length ? { samples, source: "events" } : null;
    }

    // Fallback: one wave from the "next high / next low" sensors.
    const get = (id) => (id && this._hass.states[id] ? this._hass.states[id] : null);
    const hi = get(t.high_time_entity),
      lo = get(t.low_time_entity);
    if (!hi && !lo) return null;
    const hiTime = hi ? new Date(hi.state).getTime() : NaN;
    const loTime = lo ? new Date(lo.state).getTime() : NaN;
    const hiOk = !isNaN(hiTime),
      loOk = !isNaN(loTime);
    if (!hiOk && !loOk) return null;
    const DEFAULT_PERIOD = 12.42 * 3600 * 1000;
    let period = DEFAULT_PERIOD,
      anchor;
    if (hiOk && loOk) {
      period = Math.abs(hiTime - loTime) * 2 || DEFAULT_PERIOD;
      anchor = hiTime;
    } else if (hiOk) {
      anchor = hiTime;
    } else {
      anchor = loTime + period / 2;
    }
    const numState = (id) => {
      const e = get(id);
      const v = e ? Number(e.state) : NaN;
      return isNaN(v) ? null : v;
    };
    const hiH = numState(t.high_height_entity) ?? 1.0;
    const loH = numState(t.low_height_entity) ?? 0.4;
    const mean = (hiH + loH) / 2,
      amp = (hiH - loH) / 2;
    for (let ts = t0; ts <= t1; ts += STEP) {
      samples.push({ time: ts, value: mean + amp * Math.cos(((ts - anchor) / period) * 2 * Math.PI) });
    }
    return { samples, source: "sinusoid" };
  }

  _render() {
    if (!this._hass || !this._config) return;
    const cfg = this._config;
    const points = this._forecastPoints();
    if (!points.length) {
      this._root.innerHTML = `<ha-card><div style="padding:16px">No forecast data for ${cfg.forecast_entity}</div></ha-card>`;
      return;
    }

    const W = 800,
      H = cfg.height,
      padL = 40,
      padR = cfg.tide && cfg.tide.show_axis ? 100 : 40, // extra room for the tide axis
      padTop = 40, // room for the time-label row above the plot
      padBottom = 44; // room for the rain-probability row below the plot
    const plotW = W - padL - padR;
    const plotH = H - padTop - padBottom;
    const n = points.length;
    // Time-proportional x-axis: position is driven by actual elapsed time,
    // not by point index. This makes a day's worth of hourly points span
    // exactly as much width as one daily point one day further along —
    // dense (hourly) stretches naturally take more room than sparse (daily) ones.
    const times = points.map((p) => new Date(p.datetime).getTime());
    // A daily point at noon represents its whole day, so pad half a day at a
    // daily edge to show that day in full (its strip would otherwise be cut).
    const HALF_DAY = 12 * 3600 * 1000;
    const padStart = points[0].__isDaily && cfg.daily_anchor === "noon" ? HALF_DAY : 0;
    const padEnd = points[n - 1].__isDaily && cfg.daily_anchor === "noon" ? HALF_DAY : 0;
    const tStart = times[0] - padStart;
    const tEnd = times[n - 1] + padEnd;
    const totalSpan = tEnd - tStart || 1;
    const xOfTime = (t) => padL + ((t - tStart) / totalSpan) * plotW;
    const x = (i) => xOfTime(times[i]);

    // group point indices by calendar day, used for day labels and for
    // condensing temperature/rain down to one value per day
    const dayGroups = {}; // dateString -> [point indices]
    points.forEach((p, i) => {
      const key = new Date(p.datetime).toDateString();
      (dayGroups[key] = dayGroups[key] || []).push(i);
    });

    // --- scales ---
    // NaN (not 0) for missing data — e.g. WillyWeather's daily forecast
    // entries don't carry swell at all, and treating that as a real 0
    // makes the barb/line collapse to the bottom of the chart as if there
    // genuinely were no swell, rather than "we don't know." NaN lets every
    // downstream loop skip these points instead of plotting a false zero.
    const windVals = points.map((p) => (p[cfg.wind.speed_field] != null ? Number(p[cfg.wind.speed_field]) : NaN));
    const swellVals = points.map((p) => (p[cfg.swell.height_field] != null ? Number(p[cfg.swell.height_field]) : NaN));
    const validWind = windVals.filter((v) => !isNaN(v));
    const validSwell = swellVals.filter((v) => !isNaN(v));
    const swellMax = Math.max(cfg.swell.axis_max, (validSwell.length ? Math.max(...validSwell) : 0) * 1.2);
    const windMax = Math.max(cfg.wind.axis_max, (validWind.length ? Math.max(...validWind) : 0) * 1.2);
    const yWind = (v) => padTop + plotH - (v / windMax) * plotH;
    const ySwell = (v) => padTop + plotH - (v / swellMax) * plotH;

    // temperature: its own auto min/max, mapped across the same plot height.
    // Includes both the main (high) field and the daily-min field in the
    // same scale so both lines sit correctly relative to each other.
    const tempVals = points.map((p) => Number(p[cfg.temperature.field]));
    const tempLowVals = points.map((p) => Number(p[cfg.temperature.low_field]));
    const allTemps = [...tempVals, ...tempLowVals].filter((v) => !isNaN(v));
    let tempMin = allTemps.length ? Math.floor(Math.min(...allTemps)) - 1 : 0;
    let tempMax = allTemps.length ? Math.ceil(Math.max(...allTemps)) + 1 : 1;
    if (tempMax - tempMin < 2) tempMax = tempMin + 2;
    const yTemp = (v) => padTop + plotH - ((v - tempMin) / (tempMax - tempMin)) * plotH;

    // rain: probability gate, then either mm-scaled (if you have an amount
    // field) or probability-scaled (WillyWeather hourly default, no mm figure).
    // If rain.source_entity is set, pull rain from that entity instead,
    // matched to each point by hour.
    const rainLookup = this._rainLookup();
    const rainVals = points.map((p) => {
      let prob, amount;
      if (rainLookup) {
        const hit = rainLookup[MarineForecastCard._hourKey(p.datetime)];
        prob = hit ? hit.prob : 0;
        amount = hit ? hit.amount : null;
      } else {
        prob = Number(p[cfg.rain.probability_field]) || 0;
        amount = cfg.rain.amount_field && p[cfg.rain.amount_field] != null ? Number(p[cfg.rain.amount_field]) : null;
      }
      if (prob < cfg.rain.probability_threshold) return 0;
      if (amount != null) return Math.min(1, amount / cfg.rain.max_mm);
      return prob / 100; // no mm data available — fall back to probability height
    });
    const rainProbs = points.map((p) => {
      if (rainLookup) {
        const hit = rainLookup[MarineForecastCard._hourKey(p.datetime)];
        return hit ? hit.prob : 0;
      }
      return Number(p[cfg.rain.probability_field]) || 0;
    });

    // tide: real metres, sampled on its own fine time grid
    const tideData = this._tideCurveDense(tStart, tEnd);
    const tideSamples = tideData ? tideData.samples : null;

    // --- build SVG pieces ---
    let rainPath = "";
    if (rainVals.some((v) => v > 0)) {
      let d = `M ${x(0)} ${padTop + plotH}`;
      points.forEach((_, i) => (d += ` L ${x(i)} ${padTop + plotH - rainVals[i] * plotH}`));
      d += ` L ${x(n - 1)} ${padTop + plotH} Z`;
      rainPath = `<path d="${d}" fill="${COLORS.rain.fill}" fill-opacity="0.28" stroke="none"/>`;
    }

    // Tide axis: 0-2 m by default (configurable), spanning the full plot height
    // like wind/swell. Grows automatically if the tide ever exceeds the range.
    let tideMin = cfg.tide ? cfg.tide.axis_min : 0,
      tideMax = cfg.tide ? cfg.tide.axis_max : 2;
    if (tideSamples && tideSamples.length) {
      const vals = tideSamples.map((s) => s.value);
      tideMin = Math.min(tideMin, Math.floor(Math.min(...vals) * 2) / 2);
      tideMax = Math.max(tideMax, Math.ceil(Math.max(...vals) * 2) / 2);
    }
    const yTide = (m) => padTop + plotH - ((m - tideMin) / (tideMax - tideMin)) * plotH;
    let tidePath = "";
    if (tideSamples) {
      let d = "";
      tideSamples.forEach((s, i) => {
        d += (i === 0 ? "M " : "L ") + `${xOfTime(s.time)} ${yTide(s.value)} `;
      });
      tidePath = `<path d="${d}" fill="none" stroke="${COLORS.tide}" stroke-width="1.5" opacity="0.7"/>`;
    }

    // tide axis, on the far right beyond the swell labels
    let tideAxis = "";
    if (cfg.tide && cfg.tide.show_axis && tideSamples) {
      const ax = W - padR + 52;
      tideAxis += `<line x1="${ax}" y1="${padTop}" x2="${ax}" y2="${padTop + plotH}" stroke="${COLORS.tide}" stroke-width="1" opacity="0.5"/>`;
      tideAxis += `<text x="${ax + 6}" y="${padTop - 10}" font-size="11" text-anchor="start" fill="${COLORS.tide}">Tide</text>`;
      const step = tideMax - tideMin > 2.5 ? 1 : 0.5;
      for (let v = tideMin; v <= tideMax + 1e-9; v += step) {
        const ty = yTide(v);
        tideAxis += `<line x1="${ax - 3}" y1="${ty}" x2="${ax}" y2="${ty}" stroke="${COLORS.tide}" stroke-width="1" opacity="0.5"/>`;
        tideAxis += `<text x="${ax + 6}" y="${ty + 4}" font-size="11" text-anchor="start" fill="${COLORS.tide}">${v.toFixed(1)}m</text>`;
      }
    }

    // daylight strips: sunrise to sunset for each day, clipped to the chart
    let daylight = "";
    this._daylightSpans(tStart, tEnd).forEach(({ rise, set }) => {
      const a = Math.max(rise, tStart),
        b = Math.min(set, tEnd);
      if (b > a) {
        daylight += `<rect x="${xOfTime(a)}" y="${padTop}" width="${xOfTime(b) - xOfTime(a)}" height="${plotH}" fill="${COLORS.daylight.fill}" fill-opacity="${COLORS.daylight.opacity}"/>`;
      }
    });

    // grid lines (wind axis left, swell axis right)
    let grid = "";
    const gridSteps = 3;
    for (let i = 0; i <= gridSteps; i++) {
      const gy = padTop + (plotH / gridSteps) * i;
      const windLabel = Math.round(windMax - (windMax / gridSteps) * i);
      const swellLabel = (swellMax - (swellMax / gridSteps) * i).toFixed(1);
      grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${COLORS.grid}" stroke-width="1" opacity="0.4"/>`;
      grid += `<text x="${padL - 8}" y="${gy + 4}" font-size="11" text-anchor="end" fill="${COLORS.axisLabel}">${windLabel}</text>`;
      grid += `<text x="${W - padR + 8}" y="${gy + 4}" font-size="11" text-anchor="start" fill="${COLORS.axisLabel}">${swellLabel}m</text>`;
    }

    // temperature: one min and one max value per calendar day (not per
    // point) — both the connecting line and the boxes use just these
    // daily-representative points, so the line stays a simple daily
    // high/low trend rather than a noisy hour-by-hour wiggle.
    const dailyExtremes = Object.values(dayGroups).map((idxs) => {
      let maxVal = -Infinity,
        maxIdx = -1,
        minVal = Infinity,
        minIdx = -1;
      idxs.forEach((i) => {
        if (!isNaN(tempVals[i]) && tempVals[i] > maxVal) {
          maxVal = tempVals[i];
          maxIdx = i;
        }
        if (!isNaN(tempVals[i]) && tempVals[i] < minVal) {
          minVal = tempVals[i];
          minIdx = i;
        }
        if (!isNaN(tempLowVals[i]) && tempLowVals[i] < minVal) {
          minVal = tempLowVals[i];
          minIdx = i;
        }
      });
      return { maxVal, maxIdx, minVal, minIdx };
    });

    // wind, swell & temperature lines
    let windLine = "",
      swellLine = "",
      tempLine = "",
      tempLowLine = "";
    points.forEach((p, i) => {
      if (!isNaN(windVals[i])) {
        windLine += (windLine === "" ? "M " : " L ") + `${x(i)} ${yWind(windVals[i])}`;
      }
      if (!isNaN(swellVals[i])) {
        swellLine += (swellLine === "" ? "M " : " L ") + `${x(i)} ${ySwell(swellVals[i])}`;
      }
    });
    if (cfg.mode === "hourly" && !cfg.daily_entity) {
      // plain single-source hourly card: follow every point's actual
      // temperature — condensing to one min/max per day would collapse an
      // 8-72 point chart down to a single pair, which is wrong here.
      points.forEach((p, i) => {
        if (!isNaN(tempVals[i])) {
          tempLine += (tempLine === "" ? "M " : " L ") + `${x(i)} ${yTemp(tempVals[i])}`;
        }
        if (!isNaN(tempLowVals[i])) {
          tempLowLine += (tempLowLine === "" ? "M " : " L ") + `${x(i)} ${yTemp(tempLowVals[i])}`;
        }
      });
    } else {
      // daily / mixed card: one min + one max per calendar day, keeps a
      // week-long chart readable instead of a dense hourly squiggle.
      dailyExtremes.forEach(({ maxVal, maxIdx, minVal, minIdx }) => {
        if (maxIdx >= 0) {
          tempLine += (tempLine === "" ? "M " : " L ") + `${x(maxIdx)} ${yTemp(maxVal)}`;
        }
        if (minIdx >= 0) {
          tempLowLine += (tempLowLine === "" ? "M " : " L ") + `${x(minIdx)} ${yTemp(minVal)}`;
        }
      });
    }

    let barbs = "";
    points.forEach((p, i) => {
      if (cfg.wind_show_barbs && !isNaN(windVals[i])) {
        const bearing = Number(p[cfg.wind.bearing_field]) || 0;
        const isEasterly = cfg.wind.easterly.enabled && bearing >= cfg.wind.easterly.min && bearing <= cfg.wind.easterly.max;
        if (isEasterly) {
          barbs += MarineForecastCard._highlightRing(x(i), yWind(windVals[i]), COLORS.wind.easterlyHighlight);
        }
        barbs += MarineForecastCard._barb(x(i), yWind(windVals[i]), bearing, MarineForecastCard._colorFromScale(windVals[i], cfg.wind.color_scale));
      }
      if (cfg.swell.show_barbs && !isNaN(swellVals[i])) {
        const bearing = Number(p[cfg.swell.bearing_field]) || 0;
        barbs += MarineForecastCard._barb(x(i), ySwell(swellVals[i]), bearing, MarineForecastCard._colorFromScale(swellVals[i], cfg.swell.color_scale), 0.9);
      }
    });

    let tempBoxes = "";
    if (cfg.mode === "hourly" && !cfg.daily_entity) {
      points.forEach((p, i) => {
        if (cfg.temperature.show && !isNaN(tempVals[i])) {
          tempBoxes += MarineForecastCard._labelBox(x(i), yTemp(tempVals[i]), `${Math.round(tempVals[i])}°`, COLORS.temperature.box);
        }
        if (cfg.temperature.show_low && !isNaN(tempLowVals[i])) {
          tempBoxes += MarineForecastCard._labelBox(x(i), yTemp(tempLowVals[i]), `${Math.round(tempLowVals[i])}°`, COLORS.temperature.lowBox);
        }
      });
    } else {
      dailyExtremes.forEach(({ maxVal, maxIdx, minVal, minIdx }) => {
        if (cfg.temperature.show && maxIdx >= 0) {
          tempBoxes += MarineForecastCard._labelBox(x(maxIdx), yTemp(maxVal), `${Math.round(maxVal)}°`, COLORS.temperature.box);
        }
        if (cfg.temperature.show_low && minIdx >= 0 && minVal !== maxVal) {
          tempBoxes += MarineForecastCard._labelBox(x(minIdx), yTemp(minVal), `${Math.round(minVal)}°`, COLORS.temperature.lowBox);
        }
      });
    }

    // Label style depends on mode: a plain single-source hourly card needs
    // actual hour labels per point (it's usually just 8-72 points within a
    // few days, not spanning enough days for day-labels to be useful). A
    // daily or mixed (hourly+daily) card instead gets one weekday label
    // centered per calendar day, since per-point hour labels there would
    // be either meaningless (daily points) or unreadably dense (the hourly
    // segment of a week-long mixed chart).
    let timeLabels = "";
    if (cfg.mode === "hourly" && !cfg.daily_entity) {
      points.forEach((p, i) => {
        const d = new Date(p.datetime);
        timeLabels += `<text x="${x(i)}" y="${padTop - 16}" font-size="16" text-anchor="middle" fill="${COLORS.axisLabel}">${MarineForecastCard._formatHour24(d)}</text>`;
      });
    } else {
      Object.values(dayGroups).forEach((idxs) => {
        const dayTimes = idxs.map((i) => times[i]);
        const midTime = (Math.min(...dayTimes) + Math.max(...dayTimes)) / 2;
        const label = new Date(dayTimes[0]).toLocaleDateString([], { weekday: "short" });
        timeLabels += `<text x="${xOfTime(midTime)}" y="${padTop - 16}" font-size="16" text-anchor="middle" fill="${COLORS.axisLabel}">${label}</text>`;
      });
    }

    // rain-probability row, below the plot. Daily/mixed cards get one
    // value per day (WillyWeather's own probability is genuinely only a
    // daily figure anyway). The plain hourly card shows one per point —
    // which matters if you've wired rain.source_entity to an actually
    // hourly source (e.g. BOM) rather than WillyWeather's forward-filled
    // daily figure.
    let rainLabels = "";
    if (cfg.mode === "hourly" && !cfg.daily_entity) {
      points.forEach((p, i) => {
        const rainLabel = rainProbs[i] > 0 ? `${Math.round(rainProbs[i])}%` : "–";
        rainLabels += `<text x="${x(i)}" y="${H - 14}" font-size="18" text-anchor="middle" fill="${COLORS.rain.text}">${rainLabel}</text>`;
      });
    } else {
      Object.values(dayGroups).forEach((idxs) => {
        const dayTimes = idxs.map((i) => times[i]);
        const midTime = (Math.min(...dayTimes) + Math.max(...dayTimes)) / 2;
        const prob = Math.max(...idxs.map((i) => rainProbs[i]));
        const rainLabel = prob > 0 ? `${Math.round(prob)}%` : "–";
        rainLabels += `<text x="${xOfTime(midTime)}" y="${H - 14}" font-size="18" text-anchor="middle" fill="${COLORS.rain.text}">${rainLabel}</text>`;
      });
    }

    // condition icon row, below the SVG entirely (uses <ha-icon>, which is
    // already available inside the HA frontend — no extra imports needed).
    // Hourly forecast entries don't carry a `condition` field at all (only
    // daily ones do) — skip those points entirely rather than showing a
    // meaningless "unknown" icon.
    let iconRow = "";
    if (cfg.show_condition_icons) {
      const conditionLookup = this._conditionLookup();
      const icons = points
        .map((p, i) => {
          const cond = conditionLookup ? conditionLookup[MarineForecastCard._hourKey(p.datetime)] : p[cfg.condition_field];
          if (cond == null) return "";
          const mdi = CONDITION_ICONS[cond] || "mdi:help-circle-outline";
          const leftPct = (x(i) / W) * 100;
          return `<ha-icon icon="${mdi}" style="position:absolute;left:${leftPct}%;transform:translateX(-50%);--mdc-icon-size:26px;color:var(--secondary-text-color);"></ha-icon>`;
        })
        .join("");
      iconRow = `<div style="position:relative;height:36px;margin-top:4px;">${icons}</div>`;
    }

    this._root.innerHTML = `
      <ha-card>
        ${cfg.title ? `<div style="padding:12px 16px 0;font-size:16px;font-weight:500;color:var(--primary-text-color)">${cfg.title}</div>` : ""}
        <div style="padding:8px 12px 12px;">
          <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
            ${daylight}
            ${rainPath}
            ${tidePath}
            ${grid}
            ${tideAxis}
            <path d="${windLine}" fill="none" stroke="${COLORS.wind.line}" stroke-width="1.5"/>
            <path d="${swellLine}" fill="none" stroke="${COLORS.swell.line}" stroke-width="1.5"/>
            <path d="${tempLine}" fill="none" stroke="${COLORS.temperature.line}" stroke-width="1.5"/>
            <path d="${tempLowLine}" fill="none" stroke="${COLORS.temperature.lowLine}" stroke-width="1.5"/>
            ${barbs}
            ${tempBoxes}
            ${timeLabels}
            ${rainLabels}
          </svg>
          ${iconRow}
        </div>
      </ha-card>
    `;
  }
}

customElements.define("marine-forecast-card", MarineForecastCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "marine-forecast-card",
  name: "Marine Forecast Card",
  description: "Wind/swell barbs, temperature line, indicative tide curve and scaled rain shading, for hourly or daily forecast data.",
});