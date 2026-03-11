const axios = require('axios');
const { withRetry, createLogger } = require('./utils');

const SIGNAL_SERVICE_URL = process.env.SIGNAL_SERVICE_URL || 'http://localhost:3002';
const RESEARCH_SERVICE_URL = process.env.RESEARCH_SERVICE_URL || 'http://localhost:3003';
const OUTREACH_SERVICE_URL = process.env.OUTREACH_SERVICE_URL || 'http://localhost:3004';

/**
 * Tool schemas for Groq function calling
 */
const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'tool_signal_harvester',
      description: 'Collect live company signals including funding, hiring, product launches, and tech stack from web sources. MUST be called first.',
      parameters: {
        type: 'object',
        properties: {
          company: {
            type: 'string',
            description: 'The company name to research',
          },
        },
        required: ['company'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tool_research_analyst',
      description: 'Analyze collected signals and generate an account brief. MUST be called after tool_signal_harvester.',
      parameters: {
        type: 'object',
        properties: {
          signals: {
            type: 'array',
            items: { type: 'object' },
            description: 'The signals array received from tool_signal_harvester',
          },
          icp: {
            type: 'string',
            description: 'The Ideal Customer Profile description',
          },
          company: {
            type: 'string',
            description: 'The company name being researched',
          },
        },
        required: ['signals', 'icp', 'company'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tool_outreach_sender',
      description: 'Generate and send a personalized outreach email. MUST be called after tool_research_analyst.',
      parameters: {
        type: 'object',
        properties: {
          company: {
            type: 'string',
            description: 'The target company name',
          },
          email: {
            type: 'string',
            description: 'The recipient email address',
          },
          brief: {
            type: 'string',
            description: 'The account brief from tool_research_analyst',
          },
          signals: {
            type: 'array',
            items: { type: 'object' },
            description: 'The signals array received from tool_signal_harvester',
          },
        },
        required: ['company', 'email', 'brief', 'signals'],
      },
    },
  },
];

/**
 * Execute a tool by calling the corresponding downstream microservice
 */
async function executeTool(toolName, args, requestId) {
  const log = createLogger(requestId);

  switch (toolName) {
    case 'tool_signal_harvester': {
      log.info('🔍 Executing: Signal Harvester');
      const response = await withRetry(async () => {
        return await axios.post(`${SIGNAL_SERVICE_URL}/signals`, {
          company: args.company,
          requestId,
        }, { timeout: 30000 });
      }, 2, 1000);
      return response.data;
    }

    case 'tool_research_analyst': {
      log.info('🧠 Executing: Research Analyst');
      let signals = args.signals;
      if (typeof signals === 'string' && signals.trim() !== '') {
        try { signals = JSON.parse(signals); } catch { /* ignore and use as is */ }
      }
      
      // Safety check: if signals is still not an array (e.g. LLM sent null or something else), default to empty array
      if (!Array.isArray(signals)) signals = [];

      const response = await withRetry(async () => {
        return await axios.post(`${RESEARCH_SERVICE_URL}/research`, {
          signals,
          icp: args.icp,
          company: args.company,
          requestId,
        }, { timeout: 30000 });
      }, 2, 1000);
      return response.data;
    }

    case 'tool_outreach_sender': {
      log.info('✉️  Executing: Outreach Sender');
      let signals = args.signals;
      if (typeof signals === 'string' && signals.trim() !== '') {
        try { signals = JSON.parse(signals); } catch { /* ignore and use as is */ }
      }
      
      // Safety check
      if (!Array.isArray(signals)) signals = [];

      const response = await withRetry(async () => {
        return await axios.post(`${OUTREACH_SERVICE_URL}/send`, {
          company: args.company,
          email: args.email,
          brief: args.brief,
          signals,
          requestId,
        }, { timeout: 30000 });
      }, 2, 1000);
      return response.data;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = { TOOL_SCHEMAS, executeTool };
