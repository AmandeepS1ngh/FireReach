const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique request ID
 */
function generateRequestId() {
  return `req_${uuidv4().split('-')[0]}`;
}

/**
 * Retry wrapper with exponential backoff
 * @param {Function} fn - async function to execute
 * @param {number} retries - number of retries
 * @param {number} delayMs - base delay in ms
 */
async function withRetry(fn, retries = 4, delayMs = 2000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      
      // Determine wait time - check for 429 status and use retry-after if available
      let waitTime = delayMs * Math.pow(2, attempt);
      if (err.response?.status === 429 || err.status === 429) {
        waitTime += 5000; // Extra grace period for rate limits
      }
      
      console.warn(`  ⚠ Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
    }
  }
}

/**
 * Create a prefixed logger for a request
 * @param {string} requestId
 */
function createLogger(requestId) {
  const prefix = requestId ? `[${requestId}]` : '';
  return {
    info: (...args) => console.log(`${prefix}`, ...args),
    warn: (...args) => console.warn(`${prefix}`, ...args),
    error: (...args) => console.error(`${prefix}`, ...args),
  };
}

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

module.exports = { generateRequestId, withRetry, createLogger, isValidEmail };
