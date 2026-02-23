import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

const MISSIONS_DIR = path.join(os.homedir(), '.cashclaw', 'missions');

/**
 * Ensure the missions directory exists.
 */
async function ensureMissionsDir() {
  await fs.ensureDir(MISSIONS_DIR);
}

/**
 * Create a new mission from a template and client info.
 * @param {object} template - Mission template (from missions/*.json)
 * @param {object} client - Client info { name, email, notes }
 * @returns {object} The created mission object
 */
export async function createMission(template, client = {}) {
  await ensureMissionsDir();

  const id = uuidv4();
  const now = dayjs().toISOString();

  const mission = {
    id,
    template: template.template || 'custom',
    service_type: template.service_type || 'general',
    tier: template.tier || 'basic',
    name: template.name || 'Untitled Mission',
    description: template.description || '',
    price_usd: template.default_price_usd || 0,
    estimated_hours: template.estimated_hours || 1,
    skills_required: template.skills_required || [],
    deliverables: template.deliverables || [],
    steps: (template.steps || []).map((step, i) => ({
      index: i,
      description: step,
      status: 'pending',
      completed_at: null,
    })),
    client: {
      name: client.name || 'Unknown',
      email: client.email || '',
      notes: client.notes || '',
    },
    status: 'created', // created -> in_progress -> completed -> paid | cancelled
    payment: {
      status: 'unpaid', // unpaid -> pending -> paid
      stripe_payment_id: null,
      payment_link: null,
      paid_at: null,
    },
    created_at: now,
    started_at: null,
    completed_at: null,
    updated_at: now,
  };

  const missionPath = path.join(MISSIONS_DIR, `${id}.json`);
  await fs.writeJson(missionPath, mission, { spaces: 2 });

  return mission;
}

/**
 * Start a mission by ID - sets status to in_progress.
 */
export async function startMission(id) {
  const mission = await getMission(id);
  if (!mission) {
    throw new Error(`Mission not found: ${id}`);
  }
  if (mission.status !== 'created') {
    throw new Error(`Mission ${id} cannot be started (status: ${mission.status})`);
  }

  mission.status = 'in_progress';
  mission.started_at = dayjs().toISOString();
  mission.updated_at = dayjs().toISOString();

  const missionPath = path.join(MISSIONS_DIR, `${id}.json`);
  await fs.writeJson(missionPath, mission, { spaces: 2 });

  return mission;
}

/**
 * Complete a mission by ID - sets status to completed.
 */
export async function completeMission(id) {
  const mission = await getMission(id);
  if (!mission) {
    throw new Error(`Mission not found: ${id}`);
  }
  if (mission.status !== 'in_progress') {
    throw new Error(`Mission ${id} cannot be completed (status: ${mission.status})`);
  }

  mission.status = 'completed';
  mission.completed_at = dayjs().toISOString();
  mission.updated_at = dayjs().toISOString();

  // Mark all steps as completed
  for (const step of mission.steps) {
    if (step.status === 'pending') {
      step.status = 'completed';
      step.completed_at = dayjs().toISOString();
    }
  }

  const missionPath = path.join(MISSIONS_DIR, `${id}.json`);
  await fs.writeJson(missionPath, mission, { spaces: 2 });

  return mission;
}

/**
 * Cancel a mission by ID.
 */
export async function cancelMission(id) {
  const mission = await getMission(id);
  if (!mission) {
    throw new Error(`Mission not found: ${id}`);
  }
  if (mission.status === 'paid') {
    throw new Error(`Mission ${id} is already paid and cannot be cancelled`);
  }

  mission.status = 'cancelled';
  mission.updated_at = dayjs().toISOString();

  const missionPath = path.join(MISSIONS_DIR, `${id}.json`);
  await fs.writeJson(missionPath, mission, { spaces: 2 });

  return mission;
}

/**
 * Update mission step status.
 */
export async function updateMissionStep(id, stepIndex, status) {
  const mission = await getMission(id);
  if (!mission) {
    throw new Error(`Mission not found: ${id}`);
  }
  if (!mission.steps[stepIndex]) {
    throw new Error(`Step ${stepIndex} not found in mission ${id}`);
  }

  mission.steps[stepIndex].status = status;
  if (status === 'completed') {
    mission.steps[stepIndex].completed_at = dayjs().toISOString();
  }
  mission.updated_at = dayjs().toISOString();

  const missionPath = path.join(MISSIONS_DIR, `${id}.json`);
  await fs.writeJson(missionPath, mission, { spaces: 2 });

  return mission;
}

/**
 * List all missions, optionally filtered by status.
 */
export async function listMissions(statusFilter = null) {
  await ensureMissionsDir();

  const files = await fs.readdir(MISSIONS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const missions = [];
  for (const file of jsonFiles) {
    try {
      const mission = await fs.readJson(path.join(MISSIONS_DIR, file));
      if (!statusFilter || mission.status === statusFilter) {
        missions.push(mission);
      }
    } catch (err) {
      // Skip corrupted files
      continue;
    }
  }

  // Sort by created_at descending
  missions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return missions;
}

/**
 * Get a single mission by ID.
 */
export async function getMission(id) {
  const missionPath = path.join(MISSIONS_DIR, `${id}.json`);
  try {
    const exists = await fs.pathExists(missionPath);
    if (!exists) return null;
    return await fs.readJson(missionPath);
  } catch (err) {
    return null;
  }
}

/**
 * Get mission statistics.
 */
export async function getMissionStats() {
  const all = await listMissions();
  return {
    total: all.length,
    created: all.filter((m) => m.status === 'created').length,
    in_progress: all.filter((m) => m.status === 'in_progress').length,
    completed: all.filter((m) => m.status === 'completed').length,
    cancelled: all.filter((m) => m.status === 'cancelled').length,
    paid: all.filter((m) => m.status === 'paid').length,
    total_value: all.reduce((sum, m) => sum + (m.price_usd || 0), 0),
    completed_value: all
      .filter((m) => m.status === 'completed' || m.status === 'paid')
      .reduce((sum, m) => sum + (m.price_usd || 0), 0),
  };
}
