import { listMissions } from './mission-runner.js';
import { loadConfig } from '../cli/utils/config.js';

let heartbeatTimer = null;
let isRunning = false;

/**
 * Start the heartbeat scheduler that periodically checks for
 * pending missions and unpaid invoices.
 * @param {number} intervalMs - Interval in milliseconds (default: 60000)
 */
export function startHeartbeat(intervalMs = 60000) {
  if (isRunning) {
    console.log('[scheduler] Heartbeat already running.');
    return;
  }

  isRunning = true;
  console.log(`[scheduler] Heartbeat started (interval: ${intervalMs}ms)`);

  // Run immediately on start
  tick();

  heartbeatTimer = setInterval(tick, intervalMs);
}

/**
 * Stop the heartbeat scheduler.
 */
export function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  isRunning = false;
  console.log('[scheduler] Heartbeat stopped.');
}

/**
 * Single tick of the heartbeat: check pending work.
 */
async function tick() {
  try {
    await checkPendingMissions();
    await checkUnpaidInvoices();
  } catch (err) {
    console.error(`[scheduler] Heartbeat tick error: ${err.message}`);
  }
}

/**
 * Check for missions that are created but not started,
 * or in_progress missions that may need attention.
 * @returns {object} Summary of pending missions
 */
export async function checkPendingMissions() {
  try {
    const created = await listMissions('created');
    const inProgress = await listMissions('in_progress');

    const summary = {
      pending_start: created.length,
      in_progress: inProgress.length,
      missions_needing_attention: [],
    };

    // Flag missions that have been in_progress for more than 24 hours
    const now = Date.now();
    for (const mission of inProgress) {
      const startedAt = new Date(mission.started_at).getTime();
      const hoursElapsed = (now - startedAt) / (1000 * 60 * 60);
      if (hoursElapsed > mission.estimated_hours * 2) {
        summary.missions_needing_attention.push({
          id: mission.id,
          name: mission.name,
          hours_elapsed: Math.round(hoursElapsed * 10) / 10,
          estimated_hours: mission.estimated_hours,
        });
      }
    }

    if (summary.pending_start > 0 || summary.missions_needing_attention.length > 0) {
      console.log(
        `[scheduler] Pending: ${summary.pending_start} to start, ` +
        `${summary.in_progress} in progress, ` +
        `${summary.missions_needing_attention.length} overdue`
      );
    }

    return summary;
  } catch (err) {
    console.error(`[scheduler] Error checking pending missions: ${err.message}`);
    return { pending_start: 0, in_progress: 0, missions_needing_attention: [] };
  }
}

/**
 * Check for completed missions that haven't been paid yet.
 * @returns {object} Summary of unpaid invoices
 */
export async function checkUnpaidInvoices() {
  try {
    const completed = await listMissions('completed');

    const unpaid = completed.filter(
      (m) => m.payment && m.payment.status === 'unpaid'
    );

    const summary = {
      unpaid_count: unpaid.length,
      unpaid_total: unpaid.reduce((sum, m) => sum + (m.price_usd || 0), 0),
      unpaid_missions: unpaid.map((m) => ({
        id: m.id,
        name: m.name,
        amount: m.price_usd,
        client: m.client?.name || 'Unknown',
        completed_at: m.completed_at,
      })),
    };

    if (summary.unpaid_count > 0) {
      console.log(
        `[scheduler] Unpaid invoices: ${summary.unpaid_count} ($${summary.unpaid_total})`
      );
    }

    return summary;
  } catch (err) {
    console.error(`[scheduler] Error checking unpaid invoices: ${err.message}`);
    return { unpaid_count: 0, unpaid_total: 0, unpaid_missions: [] };
  }
}

/**
 * Check if heartbeat is currently running.
 */
export function isHeartbeatRunning() {
  return isRunning;
}
