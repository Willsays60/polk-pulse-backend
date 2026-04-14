const { getWeather } = require('./weather');
const { getTraffic } = require('./traffic');
const { getCrime } = require('./crime');
const { getLocalNews } = require('./localNews');

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

async function aggregateFeeds() {
  console.log('[aggregator] Fetching all feeds...');

  // Fetch all in parallel, with individual error handling
  const [weather, traffic, crime, news] = await Promise.allSettled([
    getWeather(),
    getTraffic(),
    getCrime(),
    getLocalNews()
  ]);

  const allItems = [
    ...(weather.status === 'fulfilled' ? weather.value : []),
    ...(traffic.status === 'fulfilled' ? traffic.value : []),
    ...(crime.status === 'fulfilled' ? crime.value : []),
    ...(news.status === 'fulfilled' ? news.value : [])
  ];

  if (weather.status === 'rejected') console.warn('[aggregator] Weather failed:', weather.reason?.message);
  if (traffic.status === 'rejected') console.warn('[aggregator] Traffic failed:', traffic.reason?.message);
  if (crime.status === 'rejected') console.warn('[aggregator] Crime failed:', crime.reason?.message);
  if (news.status === 'rejected') console.warn('[aggregator] News failed:', news.reason?.message);

  // Sort by severity first, then recency
  allItems.sort((a, b) => {
    const severityDiff = (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2);
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  // Deduplicate
  const seen = new Set();
  const deduped = allItems.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // Build ticker items (critical + recent)
  const ticker = deduped
    .filter(item => item.severity === 'critical' || item.severity === 'warning')
    .slice(0, 8)
    .map(item => item.headline);

  console.log(`[aggregator] Total items: ${deduped.length} (${weather.value?.length || 0} weather, ${traffic.value?.length || 0} traffic, ${crime.value?.length || 0} crime, ${news.value?.length || 0} news)`);

  return {
    items: deduped,
    ticker,
    meta: {
      total: deduped.length,
      byCategory: {
        weather: deduped.filter(i => i.category === 'weather').length,
        traffic: deduped.filter(i => i.category === 'traffic').length,
        crime: deduped.filter(i => i.category === 'crime').length,
        local: deduped.filter(i => i.category === 'local').length
      },
      fetchedAt: new Date().toISOString()
    }
  };
}

module.exports = { aggregateFeeds };
