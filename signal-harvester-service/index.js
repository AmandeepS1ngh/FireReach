require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const { createLogger, withRetry } = require('../shared/utils');

const app = express();
const PORT = process.env.SIGNAL_SERVICE_PORT || 3002;
const SERPER_API_KEY = process.env.SERPER_API_KEY;

// Cache signals for 30 minutes (1800 seconds)
const signalCache = new NodeCache({ stdTTL: 1800 });

app.use(cors());
app.use(express.json());

// ─── Signal Scoring Map ───────────────────────────────
const SIGNAL_SCORES = {
  funding: 10,
  hiring: 8,
  product_launch: 7,
  tech_stack: 6,
  expansion: 7,
  generic: 3,
};

// ─── Signal Type Detector ─────────────────────────────
function detectSignalType(text) {
  const lower = text.toLowerCase();
  if (/fund|raise|series [a-z]|investment|valuation|round/i.test(lower)) return 'funding';
  if (/hir|recruit|job|engineer|talent|team|position|role/i.test(lower)) return 'hiring';
  if (/launch|release|announc|new product|feature|ship/i.test(lower)) return 'product_launch';
  if (/tech|stack|framework|platform|infra|api|sdk|tool/i.test(lower)) return 'tech_stack';
  if (/expan|grow|new market|office|region|international/i.test(lower)) return 'expansion';
  return 'generic';
}

// ─── Serper API Search ────────────────────────────────
async function serperSearch(query) {
  const response = await axios.post('https://google.serper.dev/search', {
    q: query,
    num: 5,
  }, {
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  return response.data;
}

// ─── Parse Serper Results into Signals ────────────────
function parseSignals(serperData, queryType) {
  const results = serperData.organic || [];
  return results.map(item => {
    const combinedText = `${item.title || ''} ${item.snippet || ''}`;
    const type = detectSignalType(combinedText) || queryType;
    return {
      type,
      title: item.title || '',
      snippet: item.snippet || '',
      source: item.link || '',
      date: item.date || new Date().toISOString().split('T')[0],
      score: SIGNAL_SCORES[type] || SIGNAL_SCORES.generic,
    };
  });
}

// ─── Deduplicate Signals ──────────────────────────────
function deduplicateSignals(signals) {
  const seen = new Set();
  return signals.filter(s => {
    const key = s.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Health Check ─────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ service: 'signal-harvester', status: 'healthy', timestamp: new Date().toISOString() });
});

// ─── POST /signals ────────────────────────────────────
app.post('/signals', async (req, res) => {
  const { company, requestId } = req.body;
  const log = createLogger(requestId);

  if (!company) {
    return res.status(400).json({ error: 'Company name is required' });
  }

  // Check cache first
  const cacheKey = company.toLowerCase().trim();
  const cached = signalCache.get(cacheKey);
  if (cached) {
    log.info(`📦 Cache hit for "${company}" — returning ${cached.length} cached signals`);
    return res.json({ company, signals: cached, cached: true });
  }

  log.info(`🔍 Starting multi-query signal harvesting for "${company}"...`);

  // Multi-query signal extraction
  const queries = [
    { query: `${company} funding round`, type: 'funding' },
    { query: `${company} hiring engineers`, type: 'hiring' },
    { query: `${company} product launch`, type: 'product_launch' },
    { query: `${company} technology stack`, type: 'tech_stack' },
    { query: `${company} expansion news`, type: 'expansion' },
  ];

  let allSignals = [];

  for (const { query, type } of queries) {
    try {
      log.info(`  🔎 Searching: "${query}"`);
      const data = await withRetry(() => serperSearch(query), 2, 1000);
      const parsed = parseSignals(data, type);
      allSignals.push(...parsed);
      log.info(`    → Found ${parsed.length} results`);
    } catch (err) {
      log.warn(`  ⚠ Query failed: "${query}" — ${err.message}`);
    }
  }

  // Deduplicate
  allSignals = deduplicateSignals(allSignals);

  // Sort by score (highest first) and keep top 5
  allSignals.sort((a, b) => b.score - a.score);
  const topSignals = allSignals.slice(0, 5);

  log.info(`📊 ${allSignals.length} unique signals found, returning top ${topSignals.length}`);

  // Cache the results
  signalCache.set(cacheKey, topSignals);

  res.json({
    company,
    signals: topSignals,
    totalFound: allSignals.length,
    cached: false,
  });
});

// ─── Start Server ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔍 Signal Harvester Service running on http://localhost:${PORT}`);
  console.log(`   POST /signals — Multi-query signal extraction`);
  console.log(`   GET  /health  — Health check\n`);
  if (!SERPER_API_KEY) {
    console.warn('   ⚠ WARNING: SERPER_API_KEY is not set in .env\n');
  }
});
