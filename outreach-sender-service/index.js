require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const nodemailer = require('nodemailer');
const { createLogger, withRetry } = require('../shared/utils');

const app = express();
const PORT = process.env.OUTREACH_SERVICE_PORT || 3004;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── SMTP Transporter ─────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.use(cors());
app.use(express.json());

// ─── Health Check ─────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ service: 'outreach-sender', status: 'healthy', timestamp: new Date().toISOString() });
});

// ─── POST /send ───────────────────────────────────────
app.post('/send', async (req, res) => {
  const { company, email, brief, signals, requestId } = req.body;
  const log = createLogger(requestId);

  if (!company || !email || !brief || !signals) {
    return res.status(400).json({ error: 'Missing required fields: company, email, brief, signals' });
  }

  log.info(`✉️  Generating personalized outreach email for "${company}"...`);

  // Format top signals for the prompt
  const signalList = signals.slice(0, 3).map((s, i) =>
    `${i + 1}. [${s.type}] ${s.title}: ${s.snippet}`
  ).join('\n');

  const prompt = `You are an expert cold email copywriter. Write a personalized outreach email for the following prospect.

**Target Company:** ${company}
**Recipient Email:** ${email}

**Account Brief:**
${brief}

**Key Signals:**
${signalList}

**Rules (STRICTLY FOLLOW):**
- Reference at least 2 specific signals from the list above explicitly in the email body
- Do NOT write generic outreach — every sentence should feel researched
- Maximum 120 words total
- Maximum 3 short paragraphs
- Friendly, human tone — no marketing buzzwords
- Include a clear, soft call-to-action (e.g., "Worth a quick chat?")
- Subject line must reference a specific signal
- Format: First line is "Subject: ...", then blank line, then email body
- Sign off as "The FireReach Team"`;

  try {
    // Generate email with LLM
    const completion = await withRetry(async () => {
      return await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You write concise, signal-driven cold emails. Never use filler words or generic statements. Every claim must reference real data.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 400,
      });
    }, 2, 1000);

    const emailContent = completion.choices[0]?.message?.content || '';

    // Parse subject and body
    const lines = emailContent.split('\n');
    let subject = 'FireReach — Personalized Outreach';
    let body = emailContent;
    if (lines[0]?.toLowerCase().startsWith('subject:')) {
      subject = lines[0].replace(/^subject:\s*/i, '').trim();
      body = lines.slice(2).join('\n').trim();
    }

    const wordCount = body.split(/\s+/).length;
    log.info(`📝 Email generated (${wordCount} words, subject: "${subject}")`);

    // Attempt to send email
    let sentStatus = 'not_attempted';
    let messageId = null;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const info = await withRetry(async () => {
          return await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.SMTP_USER,
            to: email,
            subject: subject,
            text: body,
          });
        }, 2, 2000);

        sentStatus = 'sent';
        messageId = info.messageId;
        log.info(`📤 Email sent successfully (messageId: ${messageId})`);
      } catch (sendErr) {
        sentStatus = 'failed';
        log.error(`❌ Email sending failed: ${sendErr.message}`);
      }
    } else {
      sentStatus = 'skipped_no_smtp';
      log.warn('⚠ SMTP credentials not configured — email not sent');
    }

    res.json({
      company,
      email,
      subject,
      emailContent: body,
      wordCount,
      sentStatus,
      messageId,
    });
  } catch (err) {
    log.error(`❌ Outreach generation failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to generate outreach email', details: err.message });
  }
});

// ─── Start Server ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✉️  Outreach Sender Service running on http://localhost:${PORT}`);
  console.log(`   POST /send   — Generate & send personalized email`);
  console.log(`   GET  /health — Health check\n`);
  if (!process.env.GROQ_API_KEY) console.warn('   ⚠ WARNING: GROQ_API_KEY is not set in .env');
  if (!process.env.SMTP_USER) console.warn('   ⚠ WARNING: SMTP_USER is not set — emails will not be sent\n');
});
