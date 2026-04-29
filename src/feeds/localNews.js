const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'PolkPulse/1.0 (polkpulse.com)' }
});

const NEWS_SOURCES = [
  {
    name: 'LkldNow',
    url: 'https://www.lkldnow.com/feed/',
    fallback: 'https://www.lkldnow.com/feed',
    alwaysPolkRelated: true
  },
  {
    name: 'WFLA News',
    url: 'https://www.wfla.com/news/polk-county/feed/',
    fallback: 'https://www.wfla.com/feed/',
    alwaysPolkRelated: false
  },
  {
    // ABC Action News rebranded to Tampa Bay 28
    name: 'Tampa Bay 28',
    url: 'https://www.tampabay28.com/news/region-polk/rss',
    fallback: 'https://www.tampabay28.com/news.rss',
    alwaysPolkRelated: false
  },
  {
    name: 'FOX 13 Tampa',
    url: 'https://www.fox13news.com/rss.xml',
    fallback: 'https://www.fox13news.com/news.rss',
    alwaysPolkRelated: false
  },
  {
    name: 'Bay News 9',
    url: 'https://www.baynews9.com/fl/tampa/news/rss',
    fallback: 'https://www.baynews9.com/fl/tampa/rss',
    alwaysPolkRelated: false
  },
  {
    name: 'Tampa Bay Times',
    url: 'https://www.tampabay.com/feed/',
    fallback: null,
    alwaysPolkRelated: false
  }
];

const POLK_KEYWORDS = [
  'polk county', 'lakeland', 'winter haven', 'bartow', 'auburndale',
  'haines city', 'davenport', 'plant city', 'mulberry', 'dundee',
  'frostproof', 'lake wales', 'polk city', 'eagle lake', 'fort meade',
  'pcso', 'polk sheriff', 'lakeland police', 'lpd', 'legoland florida',
  'florida southern', 'polk state', 'florida poly', 'florida polytechnic',
  'champions gate', 'four corners', 'highland city', 'medulla', 'kathleen'
];

async function getLocalNews() {
  const results = [];

  for (const source of NEWS_SOURCES) {
    let feed = null;

    try {
      feed = await parser.parseURL(source.url);
    } catch (e) {
      console.warn(`[news] Primary failed for ${source.name}:`, e.message);
      if (source.fallback) {
        try {
          feed = await parser.parseURL(source.fallback);
        } catch (e2) {
          console.warn(`[news] Fallback failed for ${source.name}:`, e2.message);
        }
      }
    }

    if (!feed?.items) continue;

    for (const item of feed.items.slice(0, 20)) {
      const title = item.title || '';
      const content = (item.contentSnippet || item.content || item.summary || '').substring(0, 500);
      const combined = (title + ' ' + content).toLowerCase();

      const isPolkRelated = source.alwaysPolkRelated || POLK_KEYWORDS.some(kw => combined.includes(kw));
      if (!isPolkRelated) continue;

      const category = classifyCategory(combined);
      const severity = getNewsSeverity(combined, category);

      results.push({
        id: `news-${source.name.replace(/ /g, '-')}-${Buffer.from(item.link || title).toString('base64').substring(0, 20)}`,
        category,
        severity,
        headline: cleanText(title),
        summary: cleanText(content).substring(0, 280),
        source: source.name,
        url: item.link || '#',
        timestamp: item.isoDate || item.pubDate || new Date().toISOString(),
        image: extractImage(item),
        tags: [category, ...extractTags(combined)]
      });
    }
  }

  const seen = new Set();
  const deduped = results.filter(item => {
    const key = item.headline.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return deduped.slice(0, 30);
}

function classifyCategory(text) {
  // Crime must be checked FIRST before traffic — "human trafficking" was getting miscategorized
  if (
    text.includes('arrest') || text.includes('shooting') || text.includes('murder') ||
    text.includes('robbery') || text.includes('crime') || text.includes('police') ||
    text.includes('sheriff') || text.includes('suspect') || text.includes('jail') ||
    text.includes('homicide') || text.includes('stabbing') || text.includes('assault') ||
    text.includes('trafficking') || text.includes('missing person') || text.includes('dui') ||
    text.includes('drug bust') || text.includes('charged') || text.includes('indicted') ||
    text.includes('fugitive') || text.includes('warrant')
  ) return 'crime';

  if (
    text.includes('hurricane') || text.includes('tornado') || text.includes('flood') ||
    text.includes('tropical storm') || text.includes('weather alert') ||
    text.includes('lightning strike') || text.includes('wildfire')
  ) return 'weather';

  if (
    text.includes('car crash') || text.includes('fatal crash') || text.includes('road closed') ||
    text.includes('lane closed') || text.includes('traffic accident') ||
    text.includes('collision on') || text.includes('i-4 crash') ||
    (text.includes('crash') && !text.includes('crime') && !text.includes('arrest'))
  ) return 'traffic';

  return 'local';
}

function getNewsSeverity(text, category) {
  if (category === 'crime') {
    if (text.includes('homicide') || text.includes('murder') || text.includes('fatal shooting') || text.includes('killed')) return 'critical';
    if (text.includes('shooting') || text.includes('robbery') || text.includes('stabbing') || text.includes('trafficking')) return 'warning';
  }
  if (category === 'weather') {
    if (text.includes('tornado') || text.includes('hurricane') || text.includes('emergency')) return 'critical';
    if (text.includes('warning') || text.includes('watch')) return 'warning';
  }
  if (category === 'traffic') {
    if (text.includes('fatal') || text.includes('fatality') || text.includes('killed')) return 'critical';
    if (text.includes('crash') || text.includes('closed') || text.includes('blocked')) return 'warning';
  }
  return 'info';
}

function extractImage(item) {
  if (item['media:content']?.url) return item['media:content'].url;
  if (item.enclosure?.url) return item.enclosure.url;
  const match = (item.content || '').match(/src=["']([^"']+\.(jpg|jpeg|png|webp))/i);
  return match ? match[1] : null;
}

function extractTags(text) {
  const tags = [];
  const map = {
    'lakeland': 'lakeland', 'winter haven': 'winter-haven', 'bartow': 'bartow',
    'davenport': 'davenport', 'haines city': 'haines-city', 'plant city': 'plant-city',
    'i-4': 'i-4', 'election': 'election', 'school': 'education',
    'fire': 'fire', 'florida poly': 'florida-poly', 'florida southern': 'fsc'
  };
  for (const [kw, tag] of Object.entries(map)) {
    if (text.includes(kw)) tags.push(tag);
  }
  return tags.slice(0, 3);
}

function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { getLocalNews };
