Marine Forecast Card

 A vanilla-JS Home Assistant Lovelace card that renders a WillyWeather-style
 marine forecast chart:
   - wind speed + direction barbs, colour-coded by speed, with an optional
     "easterly" highlight ring
   - swell height + direction barbs, colour-coded by height
   - a temperature line (+ a light-green daily-min line) with boxed values
   - light-blue rain shading, scaled by probability (and mm, if your data
     has it)
   - a tide curve on its own real metres axis (0-2 m by default)
   - light vertical strips for daylight hours, from real sunrise/sunset
   - a row of weather condition icons

 All colours live in the COLORS constant right below this comment — that's
 the one place to edit for anything purely visual.

 THREE WAYS TO USE THE SAME CARD TYPE, via `mode`:
   mode: "hourly"  — one forecast sensor, per-hour resolution throughout.
                      Typically 8-72 points. Temperature/rain/labels are
                      shown per point.
   mode: "daily"   — one forecast sensor, one point per day (7ish points).
                      Barbs are off by default (daily averages are noisy);
                      turn them back on with wind: { show_barbs: true }.
   mode: "mixed"   — TWO forecast sensors at once: `forecast_entity` (hourly)
                      for the near term — limited by how far out your
                      provider actually gives hourly data, WillyWeather is
                      ~3-4 days — then `daily_entity` (daily) for the rest
                      of the week. Labels, temperature and rain
                      automatically switch from per-hour to per-day at the
                      point where the chart switches sources. This is what
                      a "7-day forecast" card should use.
 The x-axis is always time-proportional (not just evenly spaced by point
 index), so a day made of hourly points takes up exactly as much width as
 a day represented by a single daily point.

 Install:
  1. Copy this file to /config/www/marine-forecast-card.js (a subfolder is
     fine too, e.g. /config/www/community/marine-forecast-card/ — just make
     the Resources URL below match wherever you actually put it)
  2. Settings -> Dashboards -> (⋮ menu, top right) -> Resources -> Add
       URL: /local/marine-forecast-card.js   Type: JavaScript Module
  3. Use `type: custom:marine-forecast-card` in a Lovelace card (Manual
     card editor if it doesn't show up in the visual picker — custom cards
     often don't, that's normal, not a sign anything's broken).
  4. Bump a `?v=2` style query string on the Resources URL every time you
     update this file, or the browser/HA frontend will keep serving a
     cached copy — this bit us many, many times during development.

 DATA SOURCES — none of this comes from one place:

 1. Wind/swell/temperature/rain-probability: a plain `sensor.*` whose
    `forecast` attribute is a list of objects (NOT a `weather.*` entity —
    modern HA weather entities only expose forecasts via the
    `weather.get_forecasts` action, not as a static attribute, so a
    trigger-based template sensor is used to call that action on a timer
    and cache the result as an attribute the card can just read). See
    configuration.yaml for the actual sensors. Expected item shape:
      {
        datetime: "2026-08-25T14:00:00+08:00",
        temperature: 19.4,
        templow: 12.1,              // daily entries only
        wind_speed: 24,             // km/h
        wind_bearing: 210,          // degrees, 0 = N
        swell_height: 1.2,          // m — hourly entries only, WillyWeather
        swell_direction: 195,       //     doesn't return this on daily ones
        precipitation_probability: 60, // % — WillyWeather only gives ONE
                                        // real value per calendar day, on
                                        // the day's 00:00 entry; the card
                                        // forward-fills it across the rest
                                        // of that day
        condition: "partlycloudy"   // daily entries only, drives the icon row
      }

 2. Rain probability can optionally come from a DIFFERENT sensor entirely
    (rain.source_entity) — useful because WillyWeather's rain is only ever
    a once-a-day figure, while e.g. a BOM-backed weather entity gives a
    genuine hourly trend. Same underlying pattern: a trigger-based sensor
    caching that entity's own `weather.get_forecasts` result.

 3. Weather condition icons can similarly come from a different sensor via
    condition_source_entity, for the same reason (WillyWeather's hourly
    forecast has no `condition` field at all, only the daily one does).

 4. Tide has NO relation to the forecast sensors above at all — WillyWeather's
    weather.get_forecasts action doesn't return tide data in any form. Two
    options, tried in this order:
      - tide.events_entity: a REST sensor hitting WillyWeather's API
        directly with forecasts=tides, whose `days` attribute holds the
        real high/low events (arbitrary count per day — this is what lets
        the card show a one-high day differently from a two-high day).
        This is the one actually worth setting up.
      - tide.high_time_entity / low_time_entity (+ optional *_height
        entities): the WillyWeather integration's built-in "next high tide"
        / "next low tide" sensors. Only ever two data points, so the card
        falls back to modelling a single smooth wave from them — better
        than nothing, but can't distinguish 1-high vs 2-high days.

 5. Daylight strips use Home Assistant's own configured home location
    (hass.config.latitude/longitude/time_zone) by default — override with
    daylight.latitude / daylight.longitude if the boat harbour isn't your
    home location. No sensor needed; sunrise/sunset are computed in-card
    with a standard astronomical formula.

Add the following lines to your configuration.yaml (ensure you only have one rest key)

rest:
- resource: !secret willyweather_tides_url
  scan_interval: 21600
   sensor:
     - name: "WW Tide Events"
       unique_id: ww_tide_events
       value_template: "{{ value_json.forecasts.tides.days | length }}"
       json_attributes_path: "$.forecasts.tides"
       json_attributes:
         - days


Add the following line to your secrets.yaml file (replace YOUR_KEY with the real key)

willyweather_tides_url: "https://api.willyweather.com.au/v2/YOUR_KEY/locations/19546/weather.json?forecasts=tides&days=7"

