require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const { runAgent } = require('./agent');
const { createLogger } = require('../shared/utils');

const app = express();
const PORT = process.env.AGENT_SERVICE_PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Health Check ─────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ service: 'agent-service', status: 'healthy', timestamp: new Date().toISOString() });
});

// ─── POST /agent/run ──────────────────────────────────
app.post('/agent/run', async (req, res) => {
  const { company, email, icp, requestId } = req.body;
  const log = createLogger(requestId);

  if (!company || !email || !icp) {
    return res.status(400).json({ error: 'Missing required fields: company, email, icp' });
  }

  log.info(`🤖 Agent Service received request for "${company}"`);

  try {
    const result = await runAgent({ company, email, icp, requestId });
    res.json(result);
  } catch (err) {
    log.error(`❌ Agent pipeline failed: ${err.message}`);
    res.status(500).json({
      error: 'Agent execution failed',
      details: err.message,
      requestId,
    });
  }
});

// ─── Start Server ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🤖 Agent Service running on http://localhost:${PORT}`);
  console.log(`   POST /agent/run — Run FireReach agent pipeline`);
  console.log(`   GET  /health    — Health check\n`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('   ⚠ WARNING: GROQ_API_KEY is not set in .env\n');
  }
});
