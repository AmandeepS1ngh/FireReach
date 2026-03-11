require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const { createLogger, withRetry } = require('./utils');

const app = express();
const PORT = process.env.RESEARCH_SERVICE_PORT || 3003;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());

// ─── Health Check ─────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ service: 'research-analyst', status: 'healthy', timestamp: new Date().toISOString() });
});

// ─── POST /research ───────────────────────────────────
app.post('/research', async (req, res) => {
  const { signals, icp, company, requestId } = req.body;
  const log = createLogger(requestId);

  if (!signals || !Array.isArray(signals) || signals.length === 0) {
    return res.status(400).json({ error: 'Signals array is required and must not be empty' });
  }
  if (!icp) {
    return res.status(400).json({ error: 'ICP description is required' });
  }

  log.info(`🧠 Generating account brief for "${company || 'unknown company'}"...`);

  const signalSummary = signals.map((s, i) =>
    `${i + 1}. [${s.type.toUpperCase()}] ${s.title} — ${s.snippet} (Score: ${s.score || 'N/A'})`
  ).join('\n');

  const prompt = `You are a B2B research analyst. Analyze the following company signals and generate a concise 2-paragraph account brief.

**Company Signals:**
${signalSummary}

**Ideal Customer Profile (ICP):**
${icp}

**Instructions:**
- Paragraph 1: Summarize the company's recent growth signals, momentum, and strategic direction based on the signals above.
- Paragraph 2: Explain how this company aligns with the ICP and why they would be a strong outreach target right now.
- Be specific — reference actual signal data, not generic statements.
- Keep the brief under 200 words total.`;

  try {
    const completion = await withRetry(async () => {
      return await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are a precise B2B research analyst. Always reference specific data points from the provided signals.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 500,
      });
    }, 2, 1000);

    const brief = completion.choices[0]?.message?.content || '';
    log.info(`✅ Account brief generated (${brief.split(' ').length} words)`);

    res.json({
      company: company || 'Unknown',
      brief,
      signalsAnalyzed: signals.length,
    });
  } catch (err) {
    log.error(`❌ Research analysis failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to generate account brief', details: err.message });
  }
});

// ─── Start Server ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🧠 Research Analyst Service running on http://localhost:${PORT}`);
  console.log(`   POST /research — Generate account brief`);
  console.log(`   GET  /health   — Health check\n`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('   ⚠ WARNING: GROQ_API_KEY is not set in .env\n');
  }
});
