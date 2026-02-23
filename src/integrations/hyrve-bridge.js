import { loadConfig } from '../cli/utils/config.js';

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
 */
async function getHeaders(config = null) {
  if (!config) config = await loadConfig();
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'CashClaw/1.0.0',
    'X-Agent-Id': config.hyrve?.agent_id || '',
    'X-Agent-Name': config.agent?.name || '',
  };
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
    version: '1.0.0',
  };

  try {
    const response = await fetch(`${apiUrl}/agents/register`, {
      method: 'POST',
      headers: await getHeaders(config),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`HYRVE API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return {
      success: true,
      agent_id: data.agent_id || data.id,
      message: data.message || 'Agent registered successfully',
    };
  } catch (err) {
    // If the API is not reachable, return a graceful failure
    if (err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ENOTFOUND' || err.message.includes('fetch')) {
      return {
        success: false,
        agent_id: null,
        message: 'HYRVEai marketplace is not yet available. Your agent is configured locally and will auto-register when the marketplace launches.',
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

  if (!config.hyrve?.agent_id) {
    return {
      success: false,
      message: 'Agent not registered with HYRVE. Run "cashclaw init" first.',
    };
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
      throw new Error(`Sync failed (${response.status})`);
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
    const params = new URLSearchParams({
      service_types: enabledTypes.join(','),
      currency: config.agent?.currency || 'USD',
      limit: '20',
    });

    const response = await fetch(`${apiUrl}/jobs?${params}`, {
      headers: await getHeaders(config),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch jobs (${response.status})`);
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
      message: `Marketplace unavailable: ${err.message}. Jobs will appear here when HYRVEai launches.`,
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

  if (!config.hyrve?.agent_id) {
    return {
      success: false,
      message: 'Agent not registered. Run "cashclaw init" first.',
    };
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
      throw new Error(`Failed to accept job (${response.status})`);
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
