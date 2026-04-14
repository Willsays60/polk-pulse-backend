const axios = require('axios');

// Polk County bounding box
const POLK_BOUNDS = {
  minLat: 27.6,
  maxLat: 28.4,
  minLon: -82.0,
  maxLon: -81.0
};

async function getTraffic() {
  const results = [];

  // FL511 / NavAlert API (public, no key required)
  try {
    const res = await axios.get(
      'https://fl511.com/List/Incidents',
      {
        timeout: 10000,
        headers: {
          'User-Agent': 'PolkPulse/1.0 (polkpulse.com)',
          'Accept': 'application/json'
        }
      }
    );

    const incidents = res.data?.items || res.data || [];
    const polkIncidents = incidents.filter(inc => {
      const lat = parseFloat(inc.Latitude || inc.lat || 0);
      const lon = parseFloat(inc.Longitude || inc.lon || 0);
      return (
        lat >= POLK_BOUNDS.minLat && lat <= POLK_BOUNDS.maxLat &&
        lon >= POLK_BOUNDS.minLon && lon <= POLK_BOUNDS.maxLon
      );
    });

    for (const inc of polkIncidents.slice(0, 10)) {
      const type = (inc.Type || inc.type || 'Incident').toLowerCase();
      const severity = getTrafficSeverity(type, inc.Severity || inc.severity);
      results.push({
        id: `traffic-${inc.Id || inc.id || Date.now()}-${Math.random()}`,
        category: 'traffic',
        severity,
        headline: formatTrafficHeadline(inc),
        summary: inc.Description || inc.description || formatTrafficSummary(inc),
        source: 'FL511 / FDOT',
        url: `https://fl511.com`,
        timestamp: inc.StartTime || inc.startTime || new Date().toISOString(),
        location: {
          lat: parseFloat(inc.Latitude || inc.lat),
          lon: parseFloat(inc.Longitude || inc.lon),
          road: inc.RoadName || inc.road || ''
        },
        tags: ['traffic', type.replace(/ /g, '-')]
      });
    }
  } catch (e) {
    console.warn('[traffic] FL511 fetch failed:', e.message);
  }

  // Try FDOT ATIS as fallback
  if (results.length === 0) {
    try {
      const res = await axios.get(
        'https://www.fl511.com/api/v1/incidents?format=json&county=Polk',
        { timeout: 8000 }
      );
      const incidents = Array.isArray(res.data) ? res.data : res.data?.incidents || [];
      for (const inc of incidents.slice(0, 8)) {
        results.push({
          id: `traffic-atis-${inc.id || Date.now()}`,
          category: 'traffic',
          severity: getTrafficSeverity(inc.type, inc.severity),
          headline: inc.description || 'Traffic Incident — Polk County',
          summary: `${inc.road || ''} near ${inc.crossStreet || 'Polk County'}`,
          source: 'FL511 / FDOT',
          url: 'https://fl511.com',
          timestamp: inc.startTime || new Date().toISOString(),
          tags: ['traffic']
        });
      }
    } catch (e2) {
      console.warn('[traffic] FDOT fallback failed:', e2.message);
    }
  }

  return results;
}

function formatTrafficHeadline(inc) {
  const type = inc.Type || inc.type || 'Incident';
  const road = inc.RoadName || inc.road || 'Polk County';
  const at = inc.AtCrossStreet || inc.crossStreet || '';
  return `${type} on ${road}${at ? ' at ' + at : ''}`;
}

function formatTrafficSummary(inc) {
  const lanes = inc.LanesAffected || inc.lanesAffected;
  const city = inc.City || inc.city || 'Polk County';
  return `${city}${lanes ? ' · ' + lanes + ' affected' : ''}`;
}

function getTrafficSeverity(type, severity) {
  if (!type) return 'info';
  const t = type.toLowerCase();
  const s = (severity || '').toLowerCase();
  if (t.includes('fatal') || s === 'high' || s === 'major') return 'critical';
  if (t.includes('crash') || t.includes('accident') || s === 'medium') return 'warning';
  return 'info';
}

module.exports = { getTraffic };
