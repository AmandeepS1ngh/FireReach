require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { generateRequestId, isValidEmail, createLogger } = require('../shared/utils');

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 3000;
const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:3001';

// ─── Middleware ────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan('short'));

// Rate limiting: 10 requests per minute
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/run-agent', limiter);

// ─── Health Check ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ service: 'api-gateway', status: 'healthy', timestamp: new Date().toISOString() });
});

// ─── POST /run-agent ───────────────────────────────────
app.post('/run-agent', async (req, res) => {
  const requestId = generateRequestId();
  const log = createLogger(requestId);

  try {
    const { company, email, icp } = req.body;

    // Input validation
    if (!company || !email || !icp) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['company', 'email', 'icp'],
        requestId,
      });
    }

    if (typeof company !== 'string' || company.trim().length < 2) {
      return res.status(400).json({ error: 'Company name must be at least 2 characters', requestId });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address format', requestId });
    }

    if (typeof icp !== 'string' || icp.trim().length < 5) {
      return res.status(400).json({ error: 'ICP description must be at least 5 characters', requestId });
    }

    log.info(`🚀 FireReach agent triggered for company: "${company}"`);

    // Forward to Agent Service
    const response = await axios.post(`${AGENT_SERVICE_URL}/agent/run`, {
      company: company.trim(),
      email: email.trim(),
      icp: icp.trim(),
      requestId,
    }, {
      timeout: 300000, // 5 min timeout for full agent pipeline
    });

    log.info(`✅ Agent pipeline completed successfully`);

    res.json({
      success: true,
      requestId,
      data: response.data,
    });
  } catch (err) {
    log.error(`❌ Agent pipeline failed:`, err.response?.data?.error || err.message);
    const status = err.response?.status || 500;
    res.status(status).json({
      success: false,
      requestId,
      error: err.response?.data?.error || 'Agent execution failed',
      details: err.message,
    });
  }
});

// ─── Start Server ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌐 FireReach API Gateway running on http://localhost:${PORT}`);
  console.log(`   POST /run-agent — Run the outreach agent`);
  console.log(`   GET  /health    — Health check\n`);
});
