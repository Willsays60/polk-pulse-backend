const Parser = require('rss-parser');

const parser = new Parser({ timeout: 10000 });

const NEWS_SOURCES = [
  {
    name: 'The Ledger',
    url: 'https://www.theledger.com/news/local/rss.xml',
    fallback: 'https://www.theledger.com/rss/news'
  },
  {
    name: 'WFLA News',
    url: 'https://www.wfla.com/news/polk-county/feed/',
    fallback: 'https://www.wfla.com/feed/'
  },
  {
    name: 'FOX 13 Tampa',
    url: 'https://www.fox13news.com/rss.xml',
    fallback: 'https://www.fox13news.com/news.rss'
  },
  {
    name: 'Bay News 9',
    url: 'https://www.baynews9.com/fl/tampa/rss',
    fallback: null
  },
  {
    name: 'Tampa Bay Times',
    url: 'https://www.tampabay.com/feed/',
    fallback: null
  }
];

const POLK_KEYWORDS = [
  'polk county', 'lakeland', 'winter haven', 'bartow', 'auburndale',
  'haines city', 'davenport', 'plant city', 'mulberry', 'dundee',
  'frostproof', 'lake wales', 'highlands city', 'polk city', 'eagle lake',
  'highland city', 'fort meade', 'klondike', 'medulla', 'kathleen',
  'pcso', 'polk sheriff', 'lakeland police', 'lpd',
  'tampa bay buccaneers', 'legoland florida' // major regional interest
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

      // Filter for Polk County relevance
      const isPolkRelated = POLK_KEYWORDS.some(kw => combined.includes(kw));
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

  // Deduplicate by similar headlines
  const seen = new Set();
  const deduped = results.filter(item => {
    const key = item.headline.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by recency
  deduped.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return deduped.slice(0, 30);
}

function classifyCategory(text) {
  if (
    text.includes('arrest') || text.includes('shooting') || text.includes('murder') ||
    text.includes('robbery') || text.includes('crime') || text.includes('police') ||
    text.includes('sheriff') || text.includes('suspect') || text.includes('jail')
  ) return 'crime';

  if (
    text.includes('weather') || text.includes('hurricane') || text.includes('tornado') ||
    text.includes('flood') || text.includes('storm') || text.includes('lightning') ||
    text.includes('rain') || text.includes('heat')
  ) return 'weather';

  if (
    text.includes('crash') || text.includes('accident') || text.includes('road') ||
    text.includes('traffic') || text.includes('highway') || text.includes('i-4') ||
    text.includes('intersection') || text.includes('collision')
  ) return 'traffic';

  return 'local';
}

function getNewsSeverity(text, category) {
  if (category === 'crime') {
    if (text.includes('homicide') || text.includes('murder') || text.includes('fatal')) return 'critical';
    if (text.includes('shooting') || text.includes('robbery')) return 'warning';
  }
  if (category === 'weather') {
    if (text.includes('tornado') || text.includes('hurricane') || text.includes('emergency')) return 'critical';
    if (text.includes('warning') || text.includes('watch')) return 'warning';
  }
  if (category === 'traffic') {
    if (text.includes('fatal') || text.includes('fatality')) return 'critical';
    if (text.includes('crash') || text.includes('closed')) return 'warning';
  }
  return 'info';
}

function extractImage(item) {
  if (item['media:content']?.url) return item['media:content'].url;
  if (item.enclosure?.url) return item.enclosure.url;
  // Try to extract from content
  const match = (item.content || '').match(/src=["']([^"']+\.(jpg|jpeg|png|webp))/i);
  return match ? match[1] : null;
}

function extractTags(text) {
  const tags = [];
  const map = {
    'lakeland': 'lakeland', 'winter haven': 'winter-haven', 'bartow': 'bartow',
    'i-4': 'i-4', 'election': 'election', 'school': 'education',
    'fire': 'fire', 'water': 'water', 'development': 'development'
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
