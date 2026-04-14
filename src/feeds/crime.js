const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser({ timeout: 10000 });

const CRIME_SOURCES = [
  {
    name: 'Polk County Sheriff',
    url: 'https://www.polksheriff.org/news/rss',
    fallback: 'https://www.polksheriff.org/feed'
  },
  {
    name: 'Lakeland Police Dept',
    url: 'https://www.lakelandgov.net/departments/police-department/news/rss',
    fallback: null
  }
];

const CRIME_KEYWORDS = [
  'arrest', 'arrested', 'homicide', 'murder', 'shooting', 'shot', 'stabbing',
  'robbery', 'burglary', 'theft', 'assault', 'battery', 'crash', 'dui',
  'drug', 'missing', 'suspect', 'warrant', 'charges', 'indicted', 'fugitive',
  'human trafficking', 'sexual assault', 'carjacking', 'fraud', 'scam'
];

async function getCrime() {
  const results = [];

  for (const source of CRIME_SOURCES) {
    let feed = null;

    // Try primary URL
    try {
      feed = await parser.parseURL(source.url);
    } catch (e) {
      console.warn(`[crime] Primary RSS failed for ${source.name}:`, e.message);
      // Try fallback
      if (source.fallback) {
        try {
          feed = await parser.parseURL(source.fallback);
        } catch (e2) {
          console.warn(`[crime] Fallback RSS failed for ${source.name}:`, e2.message);
        }
      }
    }

    if (!feed?.items) continue;

    for (const item of feed.items.slice(0, 15)) {
      const title = item.title || '';
      const content = (item.contentSnippet || item.content || item.summary || '').substring(0, 400);
      const combined = (title + ' ' + content).toLowerCase();

      const isCrimeRelated = CRIME_KEYWORDS.some(kw => combined.includes(kw));
      if (!isCrimeRelated) continue;

      const severity = getCrimeSeverity(combined);
      results.push({
        id: `crime-${source.name.replace(/ /g, '-')}-${encodeURIComponent(item.link || item.guid || title).substring(0, 40)}`,
        category: 'crime',
        severity,
        headline: cleanHeadline(title),
        summary: content.replace(/<[^>]+>/g, '').substring(0, 250),
        source: source.name,
        url: item.link || '#',
        timestamp: item.isoDate || item.pubDate || new Date().toISOString(),
        tags: ['crime', ...getMatchedTags(combined)]
      });
    }
  }

  // Sort by recency
  results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return results.slice(0, 20);
}

function getCrimeSeverity(text) {
  if (
    text.includes('homicide') || text.includes('murder') ||
    text.includes('shooting') || text.includes('stabbing') ||
    text.includes('human trafficking') || text.includes('sexual assault')
  ) return 'critical';
  if (
    text.includes('arrest') || text.includes('robbery') ||
    text.includes('assault') || text.includes('dui') ||
    text.includes('missing')
  ) return 'warning';
  return 'info';
}

function getMatchedTags(text) {
  const tags = [];
  const tagMap = {
    'homicide': 'homicide', 'murder': 'homicide', 'shooting': 'shooting',
    'stabbing': 'stabbing', 'robbery': 'robbery', 'burglary': 'burglary',
    'arrest': 'arrest', 'dui': 'dui', 'drug': 'drugs', 'missing': 'missing',
    'fraud': 'fraud', 'scam': 'fraud'
  };
  for (const [kw, tag] of Object.entries(tagMap)) {
    if (text.includes(kw) && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, 3);
}

function cleanHeadline(title) {
  return title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}

module.exports = { getCrime };
