const Groq = require('groq-sdk');
const { TOOL_SCHEMAS, executeTool } = require('./tools');
const { createLogger } = require('../shared/utils');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Tool Execution Order Guard ───────────────────────
const TOOL_ORDER = [
  'tool_signal_harvester',
  'tool_research_analyst',
  'tool_outreach_sender',
];

// ─── System Prompt ────────────────────────────────────
const SYSTEM_PROMPT = `You are FireReach, an autonomous outreach engine.
You must research companies using live signals and generate personalized outreach emails.

Workflow — you MUST call tools in this EXACT order:
1. Call tool_signal_harvester to collect live company signals (funding, hiring, launches, tech stack)
2. Call tool_research_analyst to analyze signals and generate an account brief
3. Call tool_outreach_sender to generate and send a personalized email

Rules:
- Never guess or fabricate signals — only use data from tool_signal_harvester
- Emails must reference specific signals explicitly
- Follow the tool order strictly: Signal → Research → Email
- Pass all data between tools accurately — do not summarize or drop fields
- For tool_research_analyst, pass the direct signals array you received
- For tool_outreach_sender, pass the direct account brief and signals array
- ONCE tool_outreach_sender HAS BEEN CALLED AND RETURNED A SUCCESSFUL STATUS (sent, failed, or skipped), YOU ARE FINISHED. DO NOT CALL ANY MORE TOOLS. Provide a final summary of what was done and then STOP.`;

/**
 * Run the FireReach agent pipeline
 * @param {Object} params - { company, email, icp, requestId }
 * @returns {Object} - Full results with trace
 */
async function runAgent({ company, email, icp, requestId }) {
  const log = createLogger(requestId);
  const trace = [];
  const results = {};
  let currentStep = 0;

  log.info('═══════════════════════════════════════════');
  log.info('🤖 FireReach Agent started');
  log.info(`   Company: ${company}`);
  log.info(`   Email:   ${email}`);
  log.info(`   ICP:     ${icp}`);
  log.info('═══════════════════════════════════════════');

  trace.push({ step: 'agent_started', message: 'FireReach Agent initialized', timestamp: new Date().toISOString() });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Research the company "${company}" and send a personalized outreach email to ${email}.\n\nIdeal Customer Profile (ICP): ${icp}\n\nStart by collecting signals, then analyze them, then generate and send the email.`,
    },
  ];

  // Agent loop — process tool calls sequentially
  const MAX_ITERATIONS = 10;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    log.info(`\n── Agent iteration ${i + 1} ──`);

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 2048,
    });

    const choice = completion.choices[0];
    const assistantMessage = choice.message;

    // Add assistant message to conversation
    messages.push(assistantMessage);

    // If no tool calls, the agent is done
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      log.info('🏁 Agent finished — no more tool calls');
      trace.push({ step: 'agent_completed', message: 'Agent pipeline complete', timestamp: new Date().toISOString() });
      break;
    }

    // Process each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      log.info(`📌 Tool call: ${toolName}`);

      // ─── Tool Execution Guard ───────────────────
      const expectedIndex = currentStep;
      const toolIndex = TOOL_ORDER.indexOf(toolName);

      // If tool is not in TOOL_ORDER, error
      if (toolIndex === -1) {
        const errorMsg = `Unknown tool called: "${toolName}"`;
        log.error(`🛑 ${errorMsg}`);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: errorMsg }) });
        continue;
      }

      // If tool is skiping a step (e.g. calling outreach before research has ever been called)
      if (toolIndex > expectedIndex) {
        const errorMsg = `Tool order violation: you must call "${TOOL_ORDER[expectedIndex]}" before calling "${toolName}"`;
        log.error(`🛑 ${errorMsg}`);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: errorMsg, expectedNext: TOOL_ORDER[expectedIndex] }) });
        continue;
      }

      try {
        const result = await executeTool(toolName, args, requestId);

        // Advance step only if we haven't reached it yet
        if (toolIndex === expectedIndex) {
          currentStep++;
        }
        if (toolName === 'tool_signal_harvester') {
          results.signals = result.signals || [];
          trace.push({
            step: 'signals_collected',
            message: `${results.signals.length} signals captured for "${company}"`,
            timestamp: new Date().toISOString(),
          });
        } else if (toolName === 'tool_research_analyst') {
          results.brief = result.brief || '';
          trace.push({
            step: 'research_completed',
            message: 'Account brief generated',
            timestamp: new Date().toISOString(),
          });
        } else if (toolName === 'tool_outreach_sender') {
          results.email = {
            subject: result.subject,
            content: result.emailContent,
            sentStatus: result.sentStatus,
            messageId: result.messageId,
          };
          trace.push({
            step: 'email_sent',
            message: `Email ${result.sentStatus} to ${email}`,
            timestamp: new Date().toISOString(),
          });
        }

        currentStep++;
        log.info(`✅ ${toolName} completed successfully`);

        // Important: tell the AI the result of the tool
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });

      } catch (err) {
        log.error(`❌ ${toolName} failed: ${err.message}`);
        
        // Return error to AI so it can correct itself, but don't add to visual trace
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: err.message }),
        });
      }
    }
  }

  log.info('\n═══════════════════════════════════════════');
  log.info('🏁 FireReach Agent pipeline completed');
  log.info('═══════════════════════════════════════════\n');

  return {
    company,
    email,
    icp,
    signals: results.signals || [],
    brief: results.brief || '',
    emailContent: results.email?.content || '',
    emailSubject: results.email?.subject || '',
    sentStatus: results.email?.sentStatus || 'not_reached',
    messageId: results.email?.messageId || null,
    trace,
  };
}

module.exports = { runAgent };
