require('dotenv').config();
const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const { aggregateFeeds } = require('./feeds/aggregator');
const { getWeather } = require('./feeds/weather');
const { getTraffic } = require('./feeds/traffic');

const app = express();
const PORT = process.env.PORT || 3001;

// Cache: 3 minutes for main feed, 1 min for weather alerts
const feedCache = new NodeCache({ stdTTL: 180, checkperiod: 60 });
const weatherCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });
const trafficCache = new NodeCache({ stdTTL: 90, checkperiod: 45 });

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://polkpulse.com', 'https://www.polkpulse.com', /\.vercel\.app$/]
    : '*'
}));
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Polk Pulse API',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ── Main feed (all categories merged) ────────────────────────────────────────
app.get('/api/feed', async (req, res) => {
  try {
    const cached = feedCache.get('main');
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const data = await aggregateFeeds();
    feedCache.set('main', data);
    res.json({ ...data, cached: false });
  } catch (err) {
    console.error('[/api/feed] Error:', err);
    res.status(500).json({ error: 'Feed fetch failed', message: err.message });
  }
});

// ── Weather only ──────────────────────────────────────────────────────────────
app.get('/api/weather', async (req, res) => {
  try {
    const cached = weatherCache.get('weather');
    if (cached) {
      return res.json({ items: cached, cached: true });
    }

    const items = await getWeather();
    weatherCache.set('weather', items);
    res.json({ items, cached: false });
  } catch (err) {
    console.error('[/api/weather] Error:', err);
    res.status(500).json({ error: 'Weather fetch failed', message: err.message });
  }
});

// ── Traffic only ──────────────────────────────────────────────────────────────
app.get('/api/traffic', async (req, res) => {
  try {
    const cached = trafficCache.get('traffic');
    if (cached) {
      return res.json({ items: cached, cached: true });
    }

    const items = await getTraffic();
    trafficCache.set('traffic', items);
    res.json({ items, cached: false });
  } catch (err) {
    console.error('[/api/traffic] Error:', err);
    res.status(500).json({ error: 'Traffic fetch failed', message: err.message });
  }
});

// ── Cache bust (useful during dev) ───────────────────────────────────────────
app.post('/api/refresh', (req, res) => {
  feedCache.flushAll();
  weatherCache.flushAll();
  trafficCache.flushAll();
  res.json({ message: 'Cache cleared', timestamp: new Date().toISOString() });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ██████╗  ██████╗ ██╗     ██╗  ██╗    ██████╗ ██╗   ██╗██╗     ███████╗███████╗
  ██╔══██╗██╔═══██╗██║     ██║ ██╔╝    ██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
  ██████╔╝██║   ██║██║     █████╔╝     ██████╔╝██║   ██║██║     ███████╗█████╗
  ██╔═══╝ ██║   ██║██║     ██╔═██╗     ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝
  ██║     ╚██████╔╝███████╗██║  ██╗    ██║     ╚██████╔╝███████╗███████║███████╗
  ╚═╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝    ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝

  🚨 Polk Pulse API running on port ${PORT}
  📡 http://localhost:${PORT}/health
  `);
});
