import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, saveConfig } from '../cli/utils/config.js';
import { listMissions, getMissionStats } from '../engine/mission-runner.js';
import { getTotal, getMonthly, getWeekly, getToday, getHistory, getByService, getDailyTotals } from '../engine/earnings-tracker.js';
import { listInstalledSkills, listAvailableSkills } from '../integrations/openclaw-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create and configure the Express dashboard server.
 * @returns {express.Application}
 */
export function createDashboardServer() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // CORS for local development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Serve static files from public/
  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));

  // ─── API Routes ────────────────────────────────────────────────────

  /**
   * GET /api/status
   * Returns agent status, config summary, and overall stats.
   */
  app.get('/api/status', async (req, res) => {
    try {
      const config = await loadConfig();
      const missionStats = await getMissionStats();
      const total = await getTotal();
      const monthly = await getMonthly();
      const today = await getToday();

      const enabledServices = Object.entries(config.services || {})
        .filter(([_, svc]) => svc.enabled)
        .map(([key, svc]) => ({
          type: key,
          pricing: svc.pricing,
          description: svc.description,
        }));

      res.json({
        agent: config.agent,
        stripe: {
          connected: config.stripe?.connected || false,
          mode: config.stripe?.mode || 'test',
        },
        services: enabledServices,
        services_count: enabledServices.length,
        missions: missionStats,
        earnings: {
          total,
          monthly: monthly.total,
          monthly_count: monthly.count,
          today: today.total,
          today_count: today.count,
        },
        server: config.server,
        hyrve: {
          registered: config.hyrve?.registered || false,
          agent_id: config.hyrve?.agent_id || null,
        },
        openclaw: {
          workspace: config.openclaw?.workspace || null,
          auto_detected: config.openclaw?.auto_detected || false,
        },
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  /**
   * GET /api/missions
   * Returns list of all missions with optional status filter.
   */
  app.get('/api/missions', async (req, res) => {
    try {
      const statusFilter = req.query.status || null;
      const missions = await listMissions(statusFilter);
      const stats = await getMissionStats();

      res.json({
        missions,
        stats,
        total: missions.length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  /**
   * GET /api/earnings
   * Returns earnings summary, history, breakdown by service, and daily totals.
   */
  app.get('/api/earnings', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const days = parseInt(req.query.days) || 30;

      const [total, monthly, weekly, today, history, byService, dailyTotals] = await Promise.all([
        getTotal(),
        getMonthly(),
        getWeekly(),
        getToday(),
        getHistory(limit),
        getByService(),
        getDailyTotals(days),
      ]);

      res.json({
        summary: {
          total,
          monthly: monthly.total,
          monthly_count: monthly.count,
          weekly: weekly.total,
          weekly_count: weekly.count,
          today: today.total,
          today_count: today.count,
        },
        by_service: byService,
        daily_totals: dailyTotals,
        history,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  /**
   * GET /api/skills
   * Returns available and installed CashClaw skills.
   */
  app.get('/api/skills', async (req, res) => {
    try {
      const config = await loadConfig();
      const available = await listAvailableSkills();
      const installed = await listInstalledSkills(config.openclaw?.skills_dir);

      const skills = available.map((s) => ({
        name: s.name,
        installed: installed.includes(s.name),
        has_skill_md: s.has_skill_md,
      }));

      res.json({
        skills,
        total_available: available.length,
        total_installed: installed.length,
        openclaw_detected: !!config.openclaw?.workspace,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  /**
   * POST /api/config
   * Update configuration values.
   * Body: { key: "dot.notation.key", value: "new value" }
   */
  app.post('/api/config', async (req, res) => {
    try {
      const { key, value } = req.body;

      if (!key) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Key is required' },
        });
      }

      const config = await loadConfig();
      const keys = key.split('.');
      let obj = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
          obj[keys[i]] = {};
        }
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;

      await saveConfig(config);

      res.json({ success: true, key, value });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  /**
   * GET /api/health
   * Simple health check endpoint.
   */
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
  });

  // Fallback: serve index.html for SPA routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
