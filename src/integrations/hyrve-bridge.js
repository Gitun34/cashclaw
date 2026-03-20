import { loadConfig } from '../cli/utils/config.js';
import { VERSION } from '../utils/version.js';

const DEFAULT_API_URL = 'https://api.hyrveai.com/v1';

/**
 * Get the HYRVE API base URL from config or default.
 */
async function getApiUrl() {
  const config = await loadConfig();
  return config.hyrve?.api_url || DEFAULT_API_URL;
}

/**
 * Build request headers for HYRVE API calls.
 * Includes X-API-Key for authenticated requests.
 */
async function getHeaders(config = null) {
  if (!config) config = await loadConfig();
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': `CashClaw/${VERSION}`,
    'X-Agent-Id': config.hyrve?.agent_id || '',
    'X-Agent-Name': config.agent?.name || '',
  };
  if (config.hyrve?.api_key) {
    headers['X-API-Key'] = config.hyrve.api_key;
  }
  return headers;
}

/**
 * Parse an API error response into a descriptive message.
 * Handles JSON error bodies, plain text, and network errors.
 * @param {Response} response - The fetch Response object
 * @returns {string} Human-readable error message
 */
async function parseErrorResponse(response) {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      if (body.error?.message) return body.error.message;
      if (body.message) return body.message;
      if (body.error && typeof body.error === 'string') return body.error;
      return JSON.stringify(body);
    }
    const text = await response.text();
    return text || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status} ${response.statusText}`;
  }
}

/**
 * Check if the HYRVE bridge is properly configured with API key.
 * @param {object} config - CashClaw configuration
 * @returns {object} { configured: boolean, message: string }
 */
function checkBridgeConfig(config) {
  if (!config.hyrve?.api_key) {
    return {
      configured: false,
      message: 'HYRVE API key not configured. Run "cashclaw config --hyrve-key <YOUR_KEY>" or set hyrve.api_key in config.',
    };
  }
  if (!config.hyrve?.agent_id) {
    return {
      configured: false,
      message: 'Agent not registered with HYRVE. Run "cashclaw init" first.',
    };
  }
  return { configured: true, message: 'Bridge configured' };
}

/**
 * Register the CashClaw agent on the HYRVEai marketplace.
 * This makes the agent discoverable to potential clients.
 * @param {object} config - CashClaw configuration
 * @returns {object} Registration result with agent_id
 */
export async function registerAgent(config) {
  const apiUrl = config.hyrve?.api_url || DEFAULT_API_URL;

  const enabledServices = Object.entries(config.services || {})
    .filter(([_, svc]) => svc.enabled)
    .map(([key, svc]) => ({
      type: key,
      pricing: svc.pricing,
      description: svc.description,
    }));

  const payload = {
    agent_name: config.agent?.name || 'CashClaw Agent',
    owner_name: config.agent?.owner || '',
    email: config.agent?.email || '',
    currency: config.agent?.currency || 'USD',
    services: enabledServices,
    stripe_connected: !!config.stripe?.secret_key,
    version: VERSION,
  };

  try {
    // Use self-register endpoint (no auth required for initial registration)
    const selfRegPayload = {
      agent_name: payload.agent_name,
      description: `CashClaw agent: ${enabledServices.map(s => s.type).join(', ')}`,
      capabilities: enabledServices.map(s => s.type),
      pricing_model: 'per_task',
      base_price_usd: enabledServices[0]?.pricing?.basic || 5,
      owner_email: payload.email,
      owner_name: payload.owner_name,
    };

    const response = await fetch(`${apiUrl}/agents/self-register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `CashClaw/${VERSION}`,
      },
      body: JSON.stringify(selfRegPayload),
    });

    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`HYRVE API error (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        agent_id: data.agent_id || data.id,
        api_key: data.api_key || null,
        agent_slug: data.agent_slug || null,
        dashboard_url: data.dashboard_url || null,
      },
      message: data.message || 'Agent registered successfully',
    };
  } catch (err) {
    // If the API is not reachable, return a graceful failure
    if (err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ENOTFOUND' || err.message.includes('fetch')) {
      return {
        success: false,
        agent_id: null,
        message: 'HYRVEai marketplace is not reachable. Check your network connection or try again later.',
      };
    }
    return {
      success: false,
      agent_id: null,
      message: `Registration failed: ${err.message}`,
    };
  }
}

/**
 * Sync agent status with HYRVE marketplace.
 * Sends current earnings, mission count, and availability.
 */
export async function syncStatus() {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();

  const check = checkBridgeConfig(config);
  if (!check.configured) {
    return { success: false, message: check.message };
  }

  try {
    const response = await fetch(`${apiUrl}/agents/${config.hyrve.agent_id}/sync`, {
      method: 'POST',
      headers: await getHeaders(config),
      body: JSON.stringify({
        status: 'active',
        stats: config.stats || {},
        updated_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Sync failed (${response.status}): ${errMsg}`);
    }

    return { success: true, message: 'Status synced with HYRVE marketplace' };
  } catch (err) {
    return {
      success: false,
      message: `Sync unavailable: ${err.message}. Local data is up to date.`,
    };
  }
}

/**
 * List available jobs from the HYRVE marketplace that match
 * this agent's enabled services.
 */
export async function listAvailableJobs() {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();

  const enabledTypes = Object.entries(config.services || {})
    .filter(([_, svc]) => svc.enabled)
    .map(([key]) => key);

  try {
    const params = new URLSearchParams({ limit: '20' });
    if (enabledTypes.length > 0) {
      params.set('service_types', enabledTypes.join(','));
    }

    const response = await fetch(`${apiUrl}/jobs?${params}`, {
      headers: await getHeaders(config),
    });

    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Failed to fetch jobs (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    return {
      success: true,
      jobs: data.jobs || [],
      total: data.total || 0,
    };
  } catch (err) {
    return {
      success: false,
      jobs: [],
      total: 0,
      message: `Marketplace unavailable: ${err.message}`,
    };
  }
}

/**
 * Accept a job from the HYRVE marketplace.
 * This creates a mission locally and notifies the marketplace.
 * @param {string} jobId - The HYRVE job ID to accept
 */
export async function acceptJob(jobId) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();

  const check = checkBridgeConfig(config);
  if (!check.configured) {
    return { success: false, message: check.message };
  }

  try {
    const response = await fetch(`${apiUrl}/jobs/${jobId}/accept`, {
      method: 'POST',
      headers: await getHeaders(config),
      body: JSON.stringify({
        agent_id: config.hyrve.agent_id,
        accepted_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Failed to accept job (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    return {
      success: true,
      job: data.job || {},
      mission_template: data.mission_template || null,
      message: data.message || 'Job accepted successfully',
    };
  } catch (err) {
    return {
      success: false,
      message: `Could not accept job: ${err.message}`,
    };
  }
}

/**
 * Deliver completed work for an order on the HYRVE marketplace.
 * Uploads deliverables and marks the order as delivered.
 * @param {string} orderId - The HYRVE order ID
 * @param {object} deliverables - Deliverable details
 * @param {string} deliverables.summary - Summary of work completed
 * @param {string[]} deliverables.files - Array of file paths or URLs
 * @param {object} deliverables.metadata - Additional metadata (word count, pages, etc.)
 * @returns {object} Delivery result
 */
export async function deliverJob(orderId, deliverables) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();

  const check = checkBridgeConfig(config);
  if (!check.configured) {
    return { success: false, message: check.message };
  }

  if (!orderId) {
    return { success: false, message: 'Order ID is required.' };
  }

  if (!deliverables || !deliverables.summary) {
    return { success: false, message: 'Deliverables must include a summary.' };
  }

  try {
    const response = await fetch(`${apiUrl}/orders/${orderId}/deliver`, {
      method: 'POST',
      headers: await getHeaders(config),
      body: JSON.stringify({
        agent_id: config.hyrve.agent_id,
        summary: deliverables.summary,
        files: deliverables.files || [],
        metadata: deliverables.metadata || {},
        delivered_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Delivery failed (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    return {
      success: true,
      order: data.order || {},
      message: data.message || 'Deliverables submitted successfully. Awaiting client review.',
    };
  } catch (err) {
    return {
      success: false,
      message: `Could not deliver order: ${err.message}`,
    };
  }
}

/**
 * Get the authenticated agent's profile from the HYRVE marketplace.
 * Returns agent details, stats, reputation, and active services.
 * @returns {object} Agent profile data
 */
export async function getAgentProfile() {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();

  const check = checkBridgeConfig(config);
  if (!check.configured) {
    return { success: false, message: check.message };
  }

  try {
    const response = await fetch(`${apiUrl}/agents/${config.hyrve.agent_id}`, {
      method: 'GET',
      headers: await getHeaders(config),
    });

    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Failed to fetch profile (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    return {
      success: true,
      profile: data.agent || data,
      message: 'Agent profile retrieved successfully',
    };
  } catch (err) {
    return {
      success: false,
      profile: null,
      message: `Could not fetch profile: ${err.message}`,
    };
  }
}

/**
 * List orders for the authenticated agent from the HYRVE marketplace.
 * Returns active, completed, and pending orders.
 * @param {object} options - Query options
 * @param {string} options.status - Filter by status: 'active', 'completed', 'pending', 'all'
 * @param {number} options.limit - Max results (default 20)
 * @param {number} options.offset - Pagination offset (default 0)
 * @returns {object} Orders list
 */
export async function listOrders(options = {}) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();

  const check = checkBridgeConfig(config);
  if (!check.configured) {
    return { success: false, orders: [], total: 0, message: check.message };
  }

  try {
    const params = new URLSearchParams({
      status: options.status || 'all',
      limit: String(options.limit || 20),
      offset: String(options.offset || 0),
    });

    const response = await fetch(`${apiUrl}/orders?${params}`, {
      method: 'GET',
      headers: await getHeaders(config),
    });

    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Failed to fetch orders (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    return {
      success: true,
      orders: data.orders || [],
      total: data.total || 0,
      message: `Found ${data.total || 0} order(s)`,
    };
  } catch (err) {
    return {
      success: false,
      orders: [],
      total: 0,
      message: `Could not fetch orders: ${err.message}`,
    };
  }
}

/**
 * Get the agent's wallet data from the HYRVE marketplace.
 * Returns available balance, pending balance, total earned, and recent transactions.
 * @returns {object} Wallet data with balances and transactions
 */
export async function getWallet() {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  const check = checkBridgeConfig(config);
  if (!check.configured) {
    return { success: false, wallet: null, transactions: [], message: check.message };
  }
  try {
    const response = await fetch(`${apiUrl}/wallet`, {
      headers: await getHeaders(config),
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Wallet fetch failed (${response.status}): ${errMsg}`);
    }
    const data = await response.json();
    return {
      success: true,
      wallet: data.wallet || { available: 0, pending: 0, total_earned: 0 },
      transactions: data.transactions || [],
    };
  } catch (err) {
    return { success: false, wallet: null, transactions: [], message: `Wallet unavailable: ${err.message}` };
  }
}

// ─── JWT Auth & v1.1.0 Functions ────────────────────────────────────────

/**
 * Build request headers with JWT or API key authentication.
 * Prefers JWT Bearer token if available, falls back to X-API-Key.
 */
async function getAuthHeaders(config = null) {
  if (!config) config = await loadConfig();
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': `CashClaw/${VERSION}`,
  };
  // JWT token varsa Bearer kullan, yoksa API key kullan
  if (config.hyrve?.jwt_token) {
    headers['Authorization'] = `Bearer ${config.hyrve.jwt_token}`;
  } else if (config.hyrve?.api_key) {
    headers['X-API-Key'] = config.hyrve.api_key;
  }
  if (config.hyrve?.agent_id) {
    headers['X-Agent-Id'] = config.hyrve.agent_id;
  }
  return headers;
}

/**
 * Login to HYRVE AI and obtain a JWT token.
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {object} { success, token, refresh_token, user }
 */
export async function loginAndGetToken(email, password) {
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `CashClaw/${VERSION}` },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Login failed (${response.status}): ${errMsg}`);
    }
    const data = await response.json();
    return {
      success: true,
      token: data.access_token || data.token,
      refresh_token: data.refresh_token,
      user: data.user,
    };
  } catch (err) {
    return { success: false, message: `Login failed: ${err.message}` };
  }
}

/**
 * Accept a proposal for an order.
 * @param {string} orderId - The order ID with the proposal
 * @returns {object} { success, order, message }
 */
export async function acceptProposal(orderId) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/orders/${orderId}/accept-proposal`, {
      method: 'POST',
      headers: await getAuthHeaders(config),
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Accept failed (${response.status}): ${errMsg}`);
    }
    const data = await response.json();
    return { success: true, order: data.order || data, message: 'Proposal accepted' };
  } catch (err) {
    return { success: false, message: `Could not accept proposal: ${err.message}` };
  }
}

/**
 * Reject a proposal for an order.
 * @param {string} orderId - The order ID with the proposal
 * @returns {object} { success, message }
 */
export async function rejectProposal(orderId) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/orders/${orderId}/reject-proposal`, {
      method: 'POST',
      headers: await getAuthHeaders(config),
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Reject failed (${response.status}): ${errMsg}`);
    }
    return { success: true, message: 'Proposal rejected' };
  } catch (err) {
    return { success: false, message: `Could not reject proposal: ${err.message}` };
  }
}

/**
 * Send a message on an order thread.
 * @param {string} orderId - The order ID
 * @param {string} content - Message content
 * @returns {object} { success, message }
 */
export async function sendMessage(orderId, content) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/orders/${orderId}/messages`, {
      method: 'POST',
      headers: await getAuthHeaders(config),
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Send failed (${response.status}): ${errMsg}`);
    }
    const data = await response.json();
    return { success: true, message: data };
  } catch (err) {
    return { success: false, message: `Could not send message: ${err.message}` };
  }
}

/**
 * Get messages for an order.
 * @param {string} orderId - The order ID
 * @param {number} page - Page number (default 1)
 * @returns {object} { success, messages, total }
 */
export async function getMessages(orderId, page = 1) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/orders/${orderId}/messages?page=${page}&limit=50`, {
      headers: await getAuthHeaders(config),
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Fetch failed (${response.status}): ${errMsg}`);
    }
    const data = await response.json();
    return { success: true, messages: data.messages || data, total: data.total || 0 };
  } catch (err) {
    return { success: false, messages: [], message: `Could not fetch messages: ${err.message}` };
  }
}

/**
 * Get unread message count for an order.
 * @param {string} orderId - The order ID
 * @returns {object} { success, count }
 */
export async function getUnreadCount(orderId) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/orders/${orderId}/messages/unread`, {
      headers: await getAuthHeaders(config),
    });
    if (!response.ok) return { success: false, count: 0 };
    const data = await response.json();
    return { success: true, count: data.unread_count || data.count || 0 };
  } catch (err) {
    return { success: false, count: 0 };
  }
}

/**
 * Request a withdrawal from the HYRVE wallet.
 * @param {number} amountUsd - Amount in USD to withdraw
 * @param {string} method - Payment method (stripe/usdt_trc20/usdt_erc20)
 * @returns {object} { success, withdrawal }
 */
export async function requestWithdraw(amountUsd, method = 'stripe') {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/wallet/withdraw`, {
      method: 'POST',
      headers: await getAuthHeaders(config),
      body: JSON.stringify({ amount_usd: amountUsd, method }),
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Withdraw failed (${response.status}): ${errMsg}`);
    }
    const data = await response.json();
    return { success: true, withdrawal: data };
  } catch (err) {
    return { success: false, message: `Withdrawal failed: ${err.message}` };
  }
}

/**
 * Get withdrawal history from the HYRVE wallet.
 * @returns {object} { success, withdrawals }
 */
export async function getWithdrawals() {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/wallet/withdrawals`, {
      headers: await getAuthHeaders(config),
    });
    if (!response.ok) return { success: false, withdrawals: [] };
    const data = await response.json();
    return { success: true, withdrawals: data.withdrawals || data };
  } catch (err) {
    return { success: false, withdrawals: [] };
  }
}

/**
 * Claim an agent registered via SKILL.md or self-register.
 * @param {string} apiKey - The API key to claim
 * @returns {object} { success, agent, message }
 */
export async function claimAgent(apiKey) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/agents/claim`, {
      method: 'POST',
      headers: await getAuthHeaders(config),
      body: JSON.stringify({ api_key: apiKey }),
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Claim failed (${response.status}): ${errMsg}`);
    }
    const data = await response.json();
    return { success: true, agent: data.agent || data, message: 'Agent claimed successfully' };
  } catch (err) {
    return { success: false, message: `Could not claim agent: ${err.message}` };
  }
}

/**
 * Open a dispute for an order.
 * @param {string} orderId - The order ID
 * @param {string} reason - Dispute reason
 * @returns {object} { success, message }
 */
export async function openDispute(orderId, reason) {
  const config = await loadConfig();
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/orders/${orderId}/dispute`, {
      method: 'POST',
      headers: await getAuthHeaders(config),
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Dispute failed (${response.status}): ${errMsg}`);
    }
    return { success: true, message: 'Dispute opened' };
  } catch (err) {
    return { success: false, message: `Could not open dispute: ${err.message}` };
  }
}

/**
 * Get detailed information about a specific job.
 * @param {string} jobId - The job ID
 * @returns {object} { success, job }
 */
export async function getJobDetail(jobId) {
  const apiUrl = await getApiUrl();
  try {
    const response = await fetch(`${apiUrl}/jobs/${jobId}`, {
      headers: { 'User-Agent': `CashClaw/${VERSION}` },
    });
    if (!response.ok) {
      const errMsg = await parseErrorResponse(response);
      throw new Error(`Fetch failed (${response.status}): ${errMsg}`);
    }
    const data = await response.json();
    return { success: true, job: data.job || data };
  } catch (err) {
    return { success: false, message: `Could not fetch job: ${err.message}` };
  }
}
