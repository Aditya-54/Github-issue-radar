/**
 * GitHub Issue Radar — sidebar.js
 * Rich analytics sidebar with difficulty scoring, charts, and stats
 */

// ─── Difficulty Scoring Engine ──────────────────────────────────────────────

const HARD_LABELS = ['complexity: high', 'difficulty: hard', 'senior', 'performance', 'security', 'architecture', 'breaking change', 'refactor'];
const MEDIUM_LABELS = ['difficulty: medium', 'complexity: medium', 'enhancement', 'bug'];
const EASY_LABELS = ['good first issue', 'good-first-issue', 'beginner', 'easy', 'starter', 'difficulty: easy', 'help wanted'];

const HARD_KEYWORDS = ['race condition', 'memory leak', 'concurrency', 'deadlock', 'cryptograph', 'algorithm', 'optimization', 'benchmark', 'regression', 'migration', 'breaking', 'deprecat', 'vulnerability', 'exploit', 'segfault', 'undefined behavior', 'thread safe', 'async', 'refactor', 'rewrite', 'architecture'];
const MEDIUM_KEYWORDS = ['implement', 'add support', 'feature request', 'integrate', 'api', 'endpoint', 'database', 'schema', 'component', 'module', 'plugin'];
const EASY_KEYWORDS = ['typo', 'spelling', 'grammar', 'documentation', 'docs', 'readme', 'comment', 'test', 'lint', 'format', 'style', 'rename', 'missing link', 'broken link', 'update dependency', 'bump version'];

function calcDifficultyScore(issueData, comments, prHistory) {
  let score = 50; // baseline = medium
  const signals = [];

  const title = (issueData.title || '').toLowerCase();
  const body = (issueData.body || '').toLowerCase();
  const text = title + ' ' + body;
  const labels = (issueData.labels || []).map(l => l.name.toLowerCase());

  // Label signals (strongest signal)
  if (labels.some(l => EASY_LABELS.includes(l))) {
    score -= 25;
    signals.push({ type: 'easy', text: 'Labeled as beginner-friendly', delta: -25 });
  }
  if (labels.some(l => HARD_LABELS.some(hl => l.includes(hl)))) {
    score += 30;
    signals.push({ type: 'hard', text: 'Label indicates high complexity', delta: +30 });
  }
  if (labels.some(l => MEDIUM_LABELS.includes(l))) {
    score += 5;
    signals.push({ type: 'medium', text: 'General enhancement/bug label', delta: +5 });
  }

  // Keyword signals in title/body
  const hardKws = HARD_KEYWORDS.filter(kw => text.includes(kw));
  if (hardKws.length > 0) {
    const delta = Math.min(hardKws.length * 8, 32);
    score += delta;
    signals.push({ type: 'hard', text: `Technical keywords: ${hardKws.slice(0, 3).join(', ')}`, delta: +delta });
  }

  const easyKws = EASY_KEYWORDS.filter(kw => text.includes(kw));
  if (easyKws.length > 0) {
    const delta = Math.min(easyKws.length * 7, 28);
    score -= delta;
    signals.push({ type: 'easy', text: `Beginner-friendly terms: ${easyKws.slice(0, 3).join(', ')}`, delta: -delta });
  }

  // Body length (longer = more complex usually)
  const bodyLen = (issueData.body || '').length;
  if (bodyLen > 3000) { score += 12; signals.push({ type: 'hard', text: 'Very detailed issue body', delta: +12 }); }
  else if (bodyLen > 1000) { score += 5; signals.push({ type: 'medium', text: 'Detailed description', delta: +5 }); }
  else if (bodyLen < 200) { score -= 5; signals.push({ type: 'easy', text: 'Simple, short issue', delta: -5 }); }

  // Comment depth (more discussion = harder)
  const commentCount = issueData.comments || 0;
  if (commentCount > 20) { score += 15; signals.push({ type: 'hard', text: `Heavy discussion (${commentCount} comments)`, delta: +15 }); }
  else if (commentCount > 8) { score += 7; signals.push({ type: 'medium', text: `Active discussion (${commentCount} comments)`, delta: +7 }); }

  // Prior PR attempts (multiple attempts = harder than it looks)
  if (prHistory && prHistory.length > 2) {
    score += 18;
    signals.push({ type: 'hard', text: `${prHistory.length} prior PR attempts`, delta: +18 });
  } else if (prHistory && prHistory.length > 0) {
    score += 8;
    signals.push({ type: 'medium', text: 'Previous PRs attempted', delta: +8 });
  }

  // Code blocks in body (likely requires coding depth)
  const codeBlockCount = (issueData.body || '').split('```').length - 1;
  if (codeBlockCount > 3) { score += 10; signals.push({ type: 'hard', text: 'Multiple code examples', delta: +10 }); }

  score = Math.max(0, Math.min(100, score));

  let level, label, canBeginner, color, emoji;
  if (score < 28) {
    level = 'beginner'; label = 'Beginner'; canBeginner = true;
    color = '#1a7f37'; emoji = '🟢';
  } else if (score < 50) {
    level = 'easy-medium'; label = 'Easy–Medium'; canBeginner = true;
    color = '#2da44e'; emoji = '🟡';
  } else if (score < 68) {
    level = 'medium'; label = 'Intermediate'; canBeginner = false;
    color = '#9a6700'; emoji = '🟡';
  } else if (score < 82) {
    level = 'hard'; label = 'Advanced'; canBeginner = false;
    color = '#cf222e'; emoji = '🔴';
  } else {
    level = 'expert'; label = 'Expert'; canBeginner = false;
    color = '#8250df'; emoji = '💀';
  }

  return { score, level, label, canBeginner, color, emoji, signals };
}

// ─── Chart Renderers (pure Canvas / SVG — no external deps) ─────────────────

function renderRadarChart(canvas, stats) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const r = Math.min(W, H) / 2 - 24;
  ctx.clearRect(0, 0, W, H);

  const axes = [
    { label: 'Activity', value: stats.activity },
    { label: 'Discussion', value: stats.discussion },
    { label: 'Maintainer\nResponse', value: stats.maintainerResponse },
    { label: 'PR\nProgress', value: stats.prProgress },
    { label: 'Simplicity', value: stats.simplicity },
    { label: 'Documentation', value: stats.documentation },
  ];

  const N = axes.length;
  const angleStep = (Math.PI * 2) / N;
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const labelColor = isDark ? '#848d97' : '#656d76';
  const fillColor = isDark ? 'rgba(56, 139, 253, 0.18)' : 'rgba(9, 105, 218, 0.12)';
  const strokeColor = isDark ? '#388bfd' : '#0969da';

  // Grid rings
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = cx + Math.cos(angle) * r * (ring / 4);
      const y = cy + Math.sin(angle) * r * (ring / 4);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Axis spokes
  for (let i = 0; i < N; i++) {
    const angle = i * angleStep - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Data polygon
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const val = Math.min(100, Math.max(0, axes[i].value)) / 100;
    const x = cx + Math.cos(angle) * r * val;
    const y = cy + Math.sin(angle) * r * val;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots on vertices
  for (let i = 0; i < N; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const val = Math.min(100, Math.max(0, axes[i].value)) / 100;
    const x = cx + Math.cos(angle) * r * val;
    const y = cy + Math.sin(angle) * r * val;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  }

  // Labels
  ctx.font = `600 9.5px 'JetBrains Mono', monospace`;
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'center';
  for (let i = 0; i < N; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const lx = cx + Math.cos(angle) * (r + 16);
    const ly = cy + Math.sin(angle) * (r + 16);
    const lines = axes[i].label.split('\n');
    lines.forEach((line, li) => {
      ctx.fillText(line, lx, ly + li * 11 - (lines.length - 1) * 5);
    });
  }
}

function renderActivityChart(canvas, activityData) {
  // activityData: array of { date, count } last 30 days
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { top: 8, right: 8, bottom: 20, left: 28 };
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  ctx.clearRect(0, 0, W, H);

  if (!activityData || activityData.length === 0) {
    ctx.fillStyle = isDark ? '#848d97' : '#656d76';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No activity data', W / 2, H / 2);
    return;
  }

  const maxCount = Math.max(...activityData.map(d => d.count), 1);
  const barW = Math.max(2, (iW / activityData.length) - 1.5);

  // Grid lines
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad.top + iH - (iH * g / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    if (g > 0) {
      ctx.fillStyle = isDark ? '#848d97' : '#9ca3af';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxCount * g / 4), pad.left - 3, y + 3);
    }
  }

  // Bars
  activityData.forEach((d, i) => {
    const x = pad.left + i * (iW / activityData.length);
    const barH = (d.count / maxCount) * iH;
    const y = pad.top + iH - barH;

    const gradient = ctx.createLinearGradient(0, y, 0, y + barH);
    gradient.addColorStop(0, isDark ? '#388bfd' : '#0969da');
    gradient.addColorStop(1, isDark ? 'rgba(56,139,253,0.3)' : 'rgba(9,105,218,0.3)');

    ctx.fillStyle = d.count > 0 ? gradient : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)');
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y, barW, Math.max(barH, 1), [2, 2, 0, 0]);
    ctx.fill();
  });

  // X-axis labels (every 7 days)
  ctx.fillStyle = isDark ? '#848d97' : '#9ca3af';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  activityData.forEach((d, i) => {
    if (i === 0 || i === activityData.length - 1 || i % 7 === 0) {
      const x = pad.left + i * (iW / activityData.length) + barW / 2;
      const label = new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
      ctx.fillText(label, x, H - 4);
    }
  });
}

function renderDonutChart(canvas, value, label, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const outerR = Math.min(W, H) / 2 - 4;
  const innerR = outerR * 0.62;
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  ctx.clearRect(0, 0, W, H);

  const angle = (value / 100) * Math.PI * 2 - Math.PI / 2;
  const startAngle = -Math.PI / 2;

  // BG ring
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  ctx.fill();

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  ctx.lineWidth = outerR - innerR;
  ctx.stroke();

  // Value arc
  ctx.beginPath();
  ctx.arc(cx, cy, (outerR + innerR) / 2, startAngle, startAngle + (value / 100) * Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = outerR - innerR;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Center text
  ctx.fillStyle = isDark ? '#e6edf3' : '#1f2328';
  ctx.font = `bold ${Math.floor(outerR * 0.45)}px 'Syne', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(value), cx, cy - 3);

  ctx.fillStyle = isDark ? '#848d97' : '#656d76';
  ctx.font = `${Math.floor(outerR * 0.22)}px 'JetBrains Mono', monospace`;
  ctx.fillText(label, cx, cy + outerR * 0.35);
  ctx.textBaseline = 'alphabetic';
}

// ─── Data Builders ──────────────────────────────────────────────────────────

function buildRadarStats(issueData, momentum, prHistory) {
  const daysSinceUpdate = momentum ? momentum.daysSinceUpdate : 999;
  const activity = Math.max(0, 100 - daysSinceUpdate * 3);

  const commentCount = issueData.comments || 0;
  const discussion = Math.min(100, commentCount * 7);

  const maintainerResponse = momentum?.maintainerResponseDays !== null
    ? Math.max(0, 100 - (momentum.maintainerResponseDays || 0) * 4)
    : 10;

  const prProgress = prHistory
    ? Math.min(100, prHistory.length * 25)
    : 0;

  // Simplicity = inverse of difficulty
  const diff = issueData._difficulty?.score ?? 50;
  const simplicity = Math.max(0, 100 - diff);

  // Documentation = body length + code blocks + linked resources
  const bodyLen = (issueData.body || '').length;
  const codeBlocks = (issueData.body || '').split('```').length - 1;
  const links = (issueData.body || '').match(/https?:\/\//g)?.length || 0;
  const documentation = Math.min(100, (bodyLen / 50) + codeBlocks * 8 + links * 5);

  return { activity, discussion, maintainerResponse, prProgress, simplicity, documentation };
}

function buildActivityTimeline(comments) {
  // Build 30-day activity timeline from comment timestamps
  const days = {};
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    days[key] = 0;
  }

  if (comments) {
    comments.forEach(c => {
      const key = c.created_at?.split('T')[0];
      if (key && days[key] !== undefined) days[key]++;
    });
  }

  return Object.entries(days).map(([date, count]) => ({ date, count }));
}

// ─── Sidebar DOM Builder ─────────────────────────────────────────────────────

function buildSidebar(issueData, momentum, prs, claims, forks, comments, difficulty) {
  const sidebar = document.createElement('div');
  sidebar.id = 'oss-tc-sidebar';

  const radarStats = buildRadarStats(issueData, momentum, prs);
  const activityData = buildActivityTimeline(comments);

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000);
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  };

  const beginner_verdict = difficulty.canBeginner
    ? `<div class="tc-verdict can"><span class="tc-verdict-icon">✅</span><div><strong>Doable for beginners</strong><p>This issue appears approachable without deep codebase knowledge.</p></div></div>`
    : `<div class="tc-verdict cannot"><span class="tc-verdict-icon">⛔</span><div><strong>Not recommended for beginners</strong><p>Significant experience with the codebase or underlying tech is likely needed.</p></div></div>`;

  const signalRows = difficulty.signals.slice(0, 5).map(s => `
    <div class="tc-signal ${s.type}">
      <span class="tc-signal-dot"></span>
      <span class="tc-signal-text">${s.text}</span>
      <span class="tc-signal-delta">${s.delta > 0 ? '+' : ''}${s.delta}</span>
    </div>
  `).join('');

  sidebar.innerHTML = `
    <div class="tc-sidebar-inner">

      <!-- Header -->
      <div class="tc-sidebar-hdr">
        <div class="tc-sidebar-title">
          <span class="tc-sidebar-icon">🚦</span>
          Issue Analytics
        </div>
        <button class="tc-sidebar-close" id="tc-sidebar-close" title="Close sidebar">✕</button>
      </div>

      <!-- Difficulty Card -->
      <div class="tc-card tc-card-difficulty">
        <div class="tc-card-label">DIFFICULTY RATING</div>
        <div class="tc-diff-row">
          <div class="tc-diff-badge" style="background:${difficulty.color}20;border-color:${difficulty.color}40;color:${difficulty.color}">
            ${difficulty.emoji} ${difficulty.label}
          </div>
          <div class="tc-diff-score-wrap">
            <canvas id="tc-donut-diff" width="72" height="72"></canvas>
          </div>
        </div>
        ${beginner_verdict}
        <div class="tc-card-sublabel" style="margin-top:10px">SCORING SIGNALS</div>
        <div class="tc-signals">${signalRows || '<div class="tc-no-signals">No strong signals detected</div>'}</div>
      </div>

      <!-- Radar Chart Card -->
      <div class="tc-card">
        <div class="tc-card-label">ISSUE HEALTH RADAR</div>
        <div class="tc-radar-wrap">
          <canvas id="tc-radar" width="220" height="200"></canvas>
        </div>
        <div class="tc-radar-legend">
          ${Object.entries(radarStats).map(([k,v]) => `
            <div class="tc-rl-row">
              <span class="tc-rl-key">${k}</span>
              <div class="tc-rl-bar-wrap"><div class="tc-rl-bar" style="width:${v}%"></div></div>
              <span class="tc-rl-val">${Math.round(v)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Activity Timeline Card -->
      <div class="tc-card">
        <div class="tc-card-label">30-DAY COMMENT ACTIVITY</div>
        <div class="tc-activity-wrap">
          <canvas id="tc-activity" width="248" height="90"></canvas>
        </div>
        <div class="tc-activity-stats">
          <div class="tc-astat">
            <div class="tc-astat-val">${issueData.comments || 0}</div>
            <div class="tc-astat-key">total comments</div>
          </div>
          <div class="tc-astat">
            <div class="tc-astat-val">${momentum ? momentum.daysSinceOpen : '?'}</div>
            <div class="tc-astat-key">days open</div>
          </div>
          <div class="tc-astat">
            <div class="tc-astat-val">${momentum ? timeAgo(momentum.lastActivity) : '?'}</div>
            <div class="tc-astat-key">last activity</div>
          </div>
        </div>
      </div>

      <!-- Momentum Donuts Row -->
      <div class="tc-card">
        <div class="tc-card-label">MOMENTUM METRICS</div>
        <div class="tc-donuts-row">
          <div class="tc-donut-item">
            <canvas id="tc-donut-momentum" width="76" height="76"></canvas>
            <div class="tc-donut-label">Momentum</div>
          </div>
          <div class="tc-donut-item">
            <canvas id="tc-donut-activity" width="76" height="76"></canvas>
            <div class="tc-donut-label">Recency</div>
          </div>
          <div class="tc-donut-item">
            <canvas id="tc-donut-engagement" width="76" height="76"></canvas>
            <div class="tc-donut-label">Discussion</div>
          </div>
        </div>
        ${momentum ? `
        <div class="tc-maintainer-box">
          <div class="tc-maintainer-label">MAINTAINER RESPONSE</div>
          ${momentum.maintainerResponseDays !== null
            ? `<div class="tc-maintainer-stat good">✅ Responded in ${momentum.maintainerResponseDays} day${momentum.maintainerResponseDays !== 1 ? 's' : ''}</div>`
            : `<div class="tc-maintainer-stat bad">❌ No maintainer response yet</div>`}
        </div>
        ` : ''}
      </div>

      <!-- PR History Card -->
      <div class="tc-card">
        <div class="tc-card-label">PR HISTORY</div>
        ${prs.length > 0 ? prs.map(pr => `
          <a href="${pr.url}" target="_blank" class="tc-pr-row">
            <span class="tc-pr-state ${pr.isDraft ? 'draft' : 'open'}">${pr.isDraft ? 'Draft' : 'Open'}</span>
            <span class="tc-pr-num">#${pr.number}</span>
            <span class="tc-pr-title">${(pr.title || '').slice(0, 38)}${(pr.title || '').length > 38 ? '…' : ''}</span>
            ${pr.updatedAt ? `<span class="tc-pr-age">${timeAgo(pr.updatedAt)}</span>` : ''}
          </a>
        `).join('') : `<div class="tc-empty-row">No open PRs found</div>`}
      </div>

      <!-- Fork Activity Card -->
      ${forks && forks.length > 0 ? `
      <div class="tc-card tc-card-warn">
        <div class="tc-card-label">⚡ FORK ACTIVITY DETECTED</div>
        ${forks.map(f => `
          <a href="${f.forkUrl}/tree/${f.branchName}" target="_blank" class="tc-fork-row">
            <span class="tc-fork-user">🍴 ${f.owner}</span>
            <code class="tc-fork-branch">${f.branchName}</code>
            <span class="tc-fork-age">${timeAgo(f.pushedAt)}</span>
          </a>
        `).join('')}
      </div>
      ` : ''}

      <!-- Claims Card -->
      ${claims && claims.length > 0 ? `
      <div class="tc-card">
        <div class="tc-card-label">CLAIMS TIMELINE</div>
        ${claims.map(c => `
          <div class="tc-claim-row ${c.isStale ? 'stale' : 'fresh'}">
            <div class="tc-claim-dot"></div>
            <div class="tc-claim-info">
              <a href="${c.commentUrl}" target="_blank">@${c.claimer}</a>
              <span class="tc-claim-time">${c.isStale ? '⚠️ Stale · ' : '🟡 Fresh · '}${timeAgo(c.claimedAt)}</span>
            </div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Labels Card -->
      ${issueData.labels && issueData.labels.length > 0 ? `
      <div class="tc-card">
        <div class="tc-card-label">LABELS</div>
        <div class="tc-labels-wrap">
          ${issueData.labels.map(l => `
            <span class="tc-label" style="background:#${l.color}22;border-color:#${l.color}66;color:#${l.color}">
              ${l.name}
            </span>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Footer -->
      <div class="tc-sidebar-footer">
        GitHub Issue Radar v2.0 · <a href="https://github.com" target="_blank">View on GitHub</a>
      </div>

    </div>
  `;

  return sidebar;
}

// ─── Main Sidebar Init ───────────────────────────────────────────────────────

function initCharts(radarStats, activityData, difficulty, momentum) {
  // Radar
  const radarCanvas = document.getElementById('tc-radar');
  if (radarCanvas) renderRadarChart(radarCanvas, radarStats);

  // Activity
  const actCanvas = document.getElementById('tc-activity');
  if (actCanvas) renderActivityChart(actCanvas, activityData);

  // Difficulty donut
  const diffDonut = document.getElementById('tc-donut-diff');
  if (diffDonut) renderDonutChart(diffDonut, difficulty.score, 'score', difficulty.color);

  // Momentum donuts
  const mScore = momentum ? momentum.score : 30;
  const aScore = momentum ? Math.max(0, 100 - momentum.daysSinceUpdate * 3) : 20;
  const eScore = momentum ? Math.min(100, momentum.commentCount * 6) : 0;

  const mDonut = document.getElementById('tc-donut-momentum');
  if (mDonut) renderDonutChart(mDonut, mScore,
    momentum ? momentum.label : 'Stalled',
    mScore >= 70 ? '#1a7f37' : mScore >= 40 ? '#9a6700' : '#cf222e');

  const aDonut = document.getElementById('tc-donut-activity');
  if (aDonut) renderDonutChart(aDonut, aScore, '/100',
    aScore >= 70 ? '#1a7f37' : aScore >= 40 ? '#9a6700' : '#cf222e');

  const eDonut = document.getElementById('tc-donut-engagement');
  if (eDonut) renderDonutChart(eDonut, eScore, '/100',
    eScore >= 60 ? '#1a7f37' : eScore >= 30 ? '#9a6700' : '#cf222e');
}

// Export
window.OSSTCSidebar = {
  calcDifficultyScore,
  buildSidebar,
  initCharts,
  buildRadarStats,
  buildActivityTimeline,
};
