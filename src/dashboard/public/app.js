/**
 * CashClaw Dashboard - Frontend Application
 * Fetches data from the Express API and renders it dynamically.
 * Auto-refreshes every 30 seconds.
 */

const REFRESH_INTERVAL = 30000;
const CURRENCY_SYMBOLS = { USD: '$', EUR: '\u20ac', GBP: '\u00a3', TRY: '\u20ba' };

let currentCurrency = '$';

// ─── Initialization ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  setInterval(loadAll, REFRESH_INTERVAL);
});

async function loadAll() {
  try {
    await Promise.all([
      loadStatus(),
      loadEarnings(),
      loadMissions(),
      loadSkills(),
    ]);
    document.getElementById('lastUpdated').textContent =
      'Updated: ' + new Date().toLocaleTimeString();
    document.getElementById('statusDot').classList.remove('offline');
  } catch (err) {
    console.error('Failed to load data:', err);
    document.getElementById('statusDot').classList.add('offline');
  }
}

// ─── Status ────────────────────────────────────────────────────────────

async function loadStatus() {
  const res = await fetch('/api/status');
  const data = await res.json();

  currentCurrency = CURRENCY_SYMBOLS[data.agent?.currency] || '$';

  // Agent name in header
  document.getElementById('agentName').textContent = data.agent?.name || 'CashClaw';

  // Agent info panel
  document.getElementById('infoOwner').textContent = data.agent?.owner || '-';
  document.getElementById('infoEmail').textContent = data.agent?.email || '-';
  document.getElementById('infoCurrency').textContent = data.agent?.currency || 'USD';

  const stripeEl = document.getElementById('infoStripe');
  if (data.stripe?.connected) {
    stripeEl.textContent = 'Connected (' + data.stripe.mode + ')';
    stripeEl.className = 'info-value connected';
  } else {
    stripeEl.textContent = 'Not configured';
    stripeEl.className = 'info-value disconnected';
  }

  const hyrveEl = document.getElementById('infoHyrve');
  if (data.hyrve?.registered) {
    hyrveEl.textContent = 'Registered';
    hyrveEl.className = 'info-value connected';
  } else {
    hyrveEl.textContent = 'Not registered';
    hyrveEl.className = 'info-value disconnected';
  }

  const openClawEl = document.getElementById('infoOpenClaw');
  if (data.openclaw?.auto_detected) {
    openClawEl.textContent = 'Detected';
    openClawEl.className = 'info-value connected';
  } else {
    openClawEl.textContent = 'Not found';
    openClawEl.className = 'info-value disconnected';
  }

  // Services
  renderServices(data.services || []);
}

// ─── Earnings ──────────────────────────────────────────────────────────

async function loadEarnings() {
  const res = await fetch('/api/earnings');
  const data = await res.json();

  const s = data.summary || {};

  document.getElementById('totalEarned').textContent =
    currentCurrency + (s.total || 0).toFixed(2);
  document.getElementById('monthlyEarned').textContent =
    currentCurrency + (s.monthly || 0).toFixed(2);
  document.getElementById('monthlyCount').textContent =
    (s.monthly_count || 0) + ' jobs';
  document.getElementById('weeklyEarned').textContent =
    currentCurrency + (s.weekly || 0).toFixed(2);
  document.getElementById('weeklyCount').textContent =
    (s.weekly_count || 0) + ' jobs';
  document.getElementById('todayEarned').textContent =
    currentCurrency + (s.today || 0).toFixed(2);
  document.getElementById('todayCount').textContent =
    (s.today_count || 0) + ' jobs';

  // Chart
  renderChart(data.daily_totals || []);

  // Recent earnings
  renderRecentEarnings(data.history || []);
}

// ─── Missions ──────────────────────────────────────────────────────────

async function loadMissions() {
  const res = await fetch('/api/missions');
  const data = await res.json();

  document.getElementById('missionCount').textContent = data.total || 0;
  renderMissions(data.missions || []);
}

// ─── Skills ────────────────────────────────────────────────────────────

async function loadSkills() {
  const res = await fetch('/api/skills');
  const data = await res.json();

  document.getElementById('skillsCount').textContent = data.total_installed || 0;
  renderSkills(data.skills || []);
}

// ─── Renderers ─────────────────────────────────────────────────────────

function renderServices(services) {
  const container = document.getElementById('servicesList');

  if (services.length === 0) {
    container.innerHTML = '<div class="empty-state">No services configured. Run "cashclaw init" to set up.</div>';
    return;
  }

  const serviceLabels = {
    seo_audit: 'SEO Audit',
    content_writing: 'Content Writing',
    lead_generation: 'Lead Generation',
    whatsapp_management: 'WhatsApp Management',
    social_media: 'Social Media',
    email_outreach: 'Email Outreach',
    competitor_analysis: 'Competitor Analysis',
    landing_page: 'Landing Page',
    data_scraping: 'Data Scraping',
    reputation_management: 'Reputation Management',
  };

  container.innerHTML = services.map(svc => {
    const label = serviceLabels[svc.type] || svc.type;
    const prices = Object.values(svc.pricing || {})
      .map(p => currentCurrency + p)
      .join(', ');

    return `
      <div class="service-item">
        <div>
          <div class="service-name">${escapeHtml(label)}</div>
          <div class="service-prices">${escapeHtml(prices)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderMissions(missions) {
  const container = document.getElementById('missionsList');

  if (missions.length === 0) {
    container.innerHTML = '<div class="empty-state">No missions yet. Create one with:<br><code>cashclaw missions create seo-audit-basic</code></div>';
    return;
  }

  container.innerHTML = missions.slice(0, 15).map(m => {
    const statusClass = 'status-' + (m.status || 'created');
    return `
      <div class="mission-item">
        <div class="mission-info">
          <div class="mission-name">${escapeHtml(m.name)}</div>
          <div class="mission-meta">${escapeHtml(m.client?.name || '-')} &middot; ${new Date(m.created_at).toLocaleDateString()}</div>
        </div>
        <span class="mission-price">${currentCurrency}${m.price_usd}</span>
        <span class="mission-status ${statusClass}">${escapeHtml(m.status)}</span>
      </div>
    `;
  }).join('');
}

function renderSkills(skills) {
  const container = document.getElementById('skillsList');

  if (skills.length === 0) {
    container.innerHTML = '<div class="empty-state">No skills found</div>';
    return;
  }

  container.innerHTML = skills.map(s => {
    const badgeClass = s.installed ? 'skill-installed' : 'skill-available';
    const badgeText = s.installed ? 'installed' : 'available';
    return `
      <div class="skill-item">
        <span class="skill-name">${escapeHtml(s.name)}</span>
        <span class="skill-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
}

function renderRecentEarnings(history) {
  const container = document.getElementById('recentList');

  if (history.length === 0) {
    container.innerHTML = '<div class="empty-state">No earnings recorded yet</div>';
    return;
  }

  container.innerHTML = history.slice(0, 10).map(e => {
    return `
      <div class="recent-item">
        <div class="recent-info">
          <div class="recent-service">${escapeHtml(e.service_type || 'general')}</div>
          <div class="recent-date">${escapeHtml(e.client_name || '-')} &middot; ${new Date(e.recorded_at).toLocaleDateString()}</div>
        </div>
        <span class="recent-amount">${currentCurrency}${(e.amount || 0).toFixed(2)}</span>
      </div>
    `;
  }).join('');
}

// ─── Canvas Chart ──────────────────────────────────────────────────────

function renderChart(dailyTotals) {
  const canvas = document.getElementById('earningsChart');
  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;

  // Set canvas size to container size for crisp rendering
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  // Clear
  ctx.clearRect(0, 0, w, h);

  if (!dailyTotals || dailyTotals.length === 0) {
    ctx.fillStyle = '#5A6678';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', w / 2, h / 2);
    return;
  }

  const values = dailyTotals.map(d => d.total);
  const maxVal = Math.max(...values, 1);
  const barCount = values.length;
  const barGap = 2;
  const barWidth = Math.max(1, (chartW - barGap * (barCount - 1)) / barCount);

  // Y-axis grid lines
  ctx.strokeStyle = '#2A3A5C';
  ctx.lineWidth = 0.5;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    // Y-axis labels
    const val = maxVal - (maxVal / gridLines) * i;
    ctx.fillStyle = '#5A6678';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(currentCurrency + val.toFixed(0), padding.left - 6, y + 3);
  }

  // Bars
  for (let i = 0; i < barCount; i++) {
    const x = padding.left + i * (barWidth + barGap);
    const barH = (values[i] / maxVal) * chartH;
    const y = padding.top + chartH - barH;

    // Bar gradient
    const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartH);
    gradient.addColorStop(0, values[i] > 0 ? '#16C784' : '#2A3A5C');
    gradient.addColorStop(1, values[i] > 0 ? '#0D7A4F' : '#1E2A45');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, [2, 2, 0, 0]);
    ctx.fill();

    // X-axis labels (show every 5th day)
    if (i % 5 === 0 || i === barCount - 1) {
      const label = dailyTotals[i].date.slice(5); // MM-DD
      ctx.fillStyle = '#5A6678';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barWidth / 2, h - padding.bottom + 14);
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Handle window resize for chart
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(loadAll, 250);
});
