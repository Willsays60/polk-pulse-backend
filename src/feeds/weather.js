const axios = require('axios');

// Polk County, FL - NWS zone FLZ141 (Lakeland/Central Polk)
const NWS_ZONE = 'FLZ141';
const NWS_COUNTY = 'FLC105'; // Polk County FIPS
const LAT = 28.0395;
const LON = -81.9498;

async function getWeather() {
  const results = [];

  try {
    // Active alerts for Polk County
    const alertsRes = await axios.get(
      `https://api.weather.gov/alerts/active?zone=${NWS_ZONE}`,
      { timeout: 8000, headers: { 'User-Agent': 'PolkPulse/1.0 (polkpulse.com)' } }
    );

    const alerts = alertsRes.data?.features || [];
    for (const alert of alerts.slice(0, 5)) {
      const props = alert.properties;
      results.push({
        id: `weather-alert-${props.id}`,
        category: 'weather',
        severity: getSeverity(props.severity),
        headline: props.headline || props.event,
        summary: props.description?.substring(0, 300) || '',
        source: 'National Weather Service',
        url: `https://alerts.weather.gov/cap/fl.php?x=0`,
        timestamp: props.sent || new Date().toISOString(),
        tags: ['weather', props.event?.toLowerCase().replace(/ /g, '-') || 'alert']
      });
    }
  } catch (e) {
    console.warn('[weather] alerts fetch failed:', e.message);
  }

  try {
    // Current conditions via NWS gridpoints
    const pointRes = await axios.get(
      `https://api.weather.gov/points/${LAT},${LON}`,
      { timeout: 8000, headers: { 'User-Agent': 'PolkPulse/1.0 (polkpulse.com)' } }
    );
    const forecastUrl = pointRes.data?.properties?.forecast;
    const observationUrl = pointRes.data?.properties?.observationStations;

    if (observationUrl) {
      const stationsRes = await axios.get(observationUrl, {
        timeout: 8000,
        headers: { 'User-Agent': 'PolkPulse/1.0 (polkpulse.com)' }
      });
      const stationId = stationsRes.data?.features?.[0]?.properties?.stationIdentifier;
      if (stationId) {
        const obsRes = await axios.get(
          `https://api.weather.gov/stations/${stationId}/observations/latest`,
          { timeout: 8000, headers: { 'User-Agent': 'PolkPulse/1.0 (polkpulse.com)' } }
        );
        const obs = obsRes.data?.properties;
        if (obs) {
          const tempC = obs.temperature?.value;
          const tempF = tempC != null ? Math.round(tempC * 9 / 5 + 32) : null;
          const windMph = obs.windSpeed?.value != null
            ? Math.round(obs.windSpeed.value * 0.621371)
            : null;

          results.push({
            id: `weather-current-${Date.now()}`,
            category: 'weather',
            severity: 'info',
            headline: `Current Conditions: ${obs.textDescription || 'Updating...'} · ${tempF != null ? tempF + '°F' : '--'}`,
            summary: `Humidity: ${obs.relativeHumidity?.value != null ? Math.round(obs.relativeHumidity.value) + '%' : '--'} · Wind: ${windMph != null ? windMph + ' mph' : '--'} · Visibility: ${obs.visibility?.value != null ? Math.round(obs.visibility.value / 1609) + ' mi' : '--'}`,
            source: 'NWS Observation Station',
            url: 'https://weather.gov/tbw',
            timestamp: obs.timestamp || new Date().toISOString(),
            tags: ['weather', 'current-conditions'],
            current: {
              tempF,
              description: obs.textDescription,
              humidity: obs.relativeHumidity?.value,
              windMph
            }
          });
        }
      }
    }
  } catch (e) {
    console.warn('[weather] conditions fetch failed:', e.message);
  }

  return results;
}

function getSeverity(nwsSeverity) {
  if (!nwsSeverity) return 'info';
  const s = nwsSeverity.toLowerCase();
  if (s === 'extreme' || s === 'severe') return 'critical';
  if (s === 'moderate') return 'warning';
  return 'info';
}

module.exports = { getWeather };
