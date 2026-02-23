/**
 * GitHub Issue Radar v2.1 - content.js
 * Main orchestrator: banner + sidebar analytics
 */

const CLAIM_KEYWORDS = [
  "i'm working on this", "i am working on this", "can i take this",
  "i'll take this", "i will take this", "working on it", "/assign",
  "taking this", "i can work on this", "let me work on this",
  "i'll fix this", "i will fix this", "i'll tackle this"
];

const STALE_CLAIM_HOURS = 72;
const CACHE_TTL = 1000 * 60 * 10;

// ─── Utility ─────────────────────────────────────────────────────────────────

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function hoursAgo(date) {
  return (Date.now() - new Date(date).getTime()) / 3600000;
}

async function getCache(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => {
      const entry = result[key];
      if (entry && Date.now() - entry.timestamp < CACHE_TTL) resolve(entry.data);
      else resolve(null);
    });
  });
}

async function setCache(key, data) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: { data, timestamp: Date.now() } }, resolve);
  });
}

async function getPAT() {
  return new Promise(resolve => {
    chrome.storage.sync.get('github_pat', result => resolve(result.github_pat || null));
  });
}

async function githubAPI(url) {
  const pat = await getPAT();
  const cacheKey = `cache_${url}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH_GITHUB', url, pat }, response => {
      if (response.success) {
        setCache(cacheKey, response.data);
        resolve(response.data);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

// ─── Feature 1: PR Detection ──────────────────────────────────────────────────

async function detectPRs(owner, repo, issueNumber) {
  const sidebarPRs = [];
  const devSection = Array.from(document.querySelectorAll('.discussion-sidebar-item'))
    .find(el => el.innerText.includes('Development'));

  if (devSection) {
    devSection.querySelectorAll('a[href*="/pull/"]').forEach(a => {
      const num = a.href.match(/\/pull\/(\d+)/)?.[1];
      if (num) sidebarPRs.push({
        url: a.href, number: parseInt(num),
        title: a.innerText.trim(),
        isDraft: a.innerText.toLowerCase().includes('draft'),
        source: 'sidebar'
      });
    });
  }

  let apiPRs = [];
  try {
    const query = `is:pr is:open repo:${owner}/${repo} ${issueNumber} in:title,body`;
    const data = await githubAPI(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=5`);
    apiPRs = (data.items || []).map(item => ({
      url: item.html_url, number: item.number, title: item.title,
      isDraft: item.draft, user: item.user?.login,
      createdAt: item.created_at, updatedAt: item.updated_at, source: 'api'
    }));
  } catch (e) {
    console.warn('OSS Traffic: PR API scan failed:', e.message);
  }

  const seen = new Set(sidebarPRs.map(p => p.number));
  const all = [...sidebarPRs];
  apiPRs.forEach(p => { if (!seen.has(p.number)) { all.push(p); seen.add(p.number); } });
  return all;
}

// ─── Feature 2: Stale Claim Detection ────────────────────────────────────────

function detectClaims() {
  const results = [];
  document.querySelectorAll('.timeline-comment-group').forEach(group => {
    const body = group.querySelector('.timeline-comment-body');
    if (!body) return;
    const text = body.innerText.toLowerCase();
    const matchedKeyword = CLAIM_KEYWORDS.find(kw => text.includes(kw));
    if (!matchedKeyword) return;

    const timeEl = group.querySelector('relative-time');
    const authorEl = group.querySelector('.author');
    const linkEl = group.querySelector('.js-timestamp');
    const commentTime = timeEl ? new Date(timeEl.getAttribute('datetime')) : null;
    if (!commentTime) return;

    const ageHours = hoursAgo(commentTime);
    results.push({
      claimer: authorEl?.innerText?.trim() || 'Someone',
      commentUrl: linkEl?.href || window.location.href,
      claimedAt: commentTime.toISOString(),
      ageHours: Math.floor(ageHours),
      isStale: ageHours > STALE_CLAIM_HOURS,
      keyword: matchedKeyword
    });
  });
  results.sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt));
  return results;
}

// ─── Feature 3: Momentum Score ────────────────────────────────────────────────

async function calcMomentumScore(owner, repo, issueNumber) {
  try {
    const [issueData, commentsData] = await Promise.all([
      githubAPI(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`),
      githubAPI(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`)
    ]);

    const daysSinceUpdate = (Date.now() - new Date(issueData.updated_at)) / 86400000;
    const daysSinceOpen = (Date.now() - new Date(issueData.created_at)) / 86400000;
    const commentCount = issueData.comments;

    const maintainerResponse = commentsData.find(c =>
      c.author_association === 'OWNER' || c.author_association === 'MEMBER' || c.author_association === 'COLLABORATOR'
    );

    let maintainerResponseDays = null;
    if (maintainerResponse) {
      maintainerResponseDays = (new Date(maintainerResponse.created_at) - new Date(issueData.created_at)) / 86400000;
    }

    let score = 50;
    if (daysSinceUpdate < 1) score += 25;
    else if (daysSinceUpdate < 7) score += 15;
    else if (daysSinceUpdate < 30) score += 5;
    else if (daysSinceUpdate < 90) score -= 10;
    else score -= 30;

    if (commentCount > 10) score += 15;
    else if (commentCount > 5) score += 8;
    else if (commentCount > 1) score += 3;
    else if (commentCount === 0) score -= 15;

    if (maintainerResponseDays !== null) {
      if (maintainerResponseDays < 1) score += 20;
      else if (maintainerResponseDays < 7) score += 10;
      else if (maintainerResponseDays >= 30) score -= 10;
    } else {
      score -= 15;
    }

    score = Math.max(0, Math.min(100, score));

    return {
      score, issueData, commentsData,
      label: score >= 70 ? 'Active' : score >= 40 ? 'Slow' : 'Stalled',
      color: score >= 70 ? '#2ea44f' : score >= 40 ? '#d29922' : '#cf222e',
      daysSinceUpdate: Math.floor(daysSinceUpdate),
      daysSinceOpen: Math.floor(daysSinceOpen),
      commentCount,
      maintainerResponseDays: maintainerResponseDays !== null ? Math.floor(maintainerResponseDays) : null,
      lastActivity: issueData.updated_at,
      labels: issueData.labels?.map(l => l.name) || [],
      assignees: issueData.assignees?.map(a => a.login) || []
    };
  } catch (e) {
    console.warn('OSS Traffic: Momentum failed:', e.message);
    return null;
  }
}

// ─── Feature 4: Fork Activity Scanner ────────────────────────────────────────

async function scanForkActivity(owner, repo, issueNumber) {
  try {
    const forks = await githubAPI(`https://api.github.com/repos/${owner}/${repo}/forks?sort=newest&per_page=10`);
    const activeForks = forks.filter(f => hoursAgo(f.pushed_at) / 24 < 30 && f.pushed_at !== f.created_at);
    const forkMatches = [];

    for (const fork of activeForks.slice(0, 5)) {
      try {
        const branches = await githubAPI(`https://api.github.com/repos/${fork.full_name}/branches?per_page=20`);
        const match = branches.find(b =>
          b.name.includes(issueNumber) ||
          b.name.toLowerCase().includes('fix') ||
          b.name.toLowerCase().includes('feature')
        );
        if (match) forkMatches.push({ forkUrl: fork.html_url, owner: fork.owner.login, branchName: match.name, pushedAt: fork.pushed_at });
      } catch (_) {}
    }
    return forkMatches;
  } catch (e) { return []; }
}

// ─── Feature 5: Contributor Workload ─────────────────────────────────────────

async function checkContributorWorkload(owner, repo, issueNumber) {
  try {
    const issueData = await githubAPI(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`);
    const assignees = issueData.assignees || [];
    if (assignees.length === 0) return null;

    return await Promise.all(assignees.map(async a => {
      try {
        const d = await githubAPI(`https://api.github.com/search/issues?q=is:pr+is:open+author:${a.login}&per_page=1`);
        return { login: a.login, avatarUrl: a.avatar_url, openPRCount: d.total_count, overloaded: d.total_count > 8 };
      } catch (_) { return { login: a.login, openPRCount: null, overloaded: false }; }
    }));
  } catch (_) { return null; }
}

// ─── Banner Builder ───────────────────────────────────────────────────────────

function buildBanner(status, data) {
  const { prs, claims, momentum, difficulty } = data;
  const banner = document.createElement('div');
  banner.id = 'oss-tc-banner';

  let headerIcon, headerText, headerSub;
  if (status === 'red') {
    headerIcon = '🛑'; headerText = `${prs.length} Active PR${prs.length > 1 ? 's' : ''} Found`;
    headerSub = 'Someone is already working on this issue';
  } else if (status === 'yellow') {
    const fresh = claims.filter(c => !c.isStale);
    if (fresh.length > 0) {
      headerIcon = '⚠️'; headerText = `${fresh[0].claimer} recently claimed this`;
      headerSub = `${timeAgo(fresh[0].claimedAt)} · Reach out before starting`;
    } else {
      headerIcon = '🟡'; headerText = `Possible stale claim detected`;
      headerSub = `Someone claimed this but may have abandoned it`;
    }
  } else {
    headerIcon = '✅'; headerText = 'Clear to Contribute';
    headerSub = 'No active PRs or recent claims detected';
  }

  // Difficulty pill for banner
  const diffPill = difficulty
    ? `<div class="oss-tc-diff-pill" style="background:${difficulty.color}20;color:${difficulty.color};border-color:${difficulty.color}40">${difficulty.emoji} ${difficulty.label} · ${difficulty.canBeginner ? '🟢 Beginner OK' : '🔴 Not for beginners'}</div>`
    : '';

  let sectionsHtml = '';
  if (prs.length > 0) {
    sectionsHtml += `<div class="oss-tc-section"><div class="oss-tc-section-label">PULL REQUESTS</div><div class="oss-tc-pr-list">` +
      prs.map(pr => `<a href="${pr.url}" target="_blank" class="oss-tc-pr-link"><span class="oss-tc-pr-badge ${pr.isDraft ? 'draft' : 'open'}">${pr.isDraft ? 'Draft' : 'Open'}</span> PR #${pr.number}${pr.title ? ` · ${pr.title.slice(0, 45)}${pr.title.length > 45 ? '…' : ''}` : ''}</a>`).join('') +
      `</div></div>`;
  }
  if (claims.length > 0) {
    sectionsHtml += `<div class="oss-tc-section"><div class="oss-tc-section-label">CLAIMS</div>` +
      claims.slice(0, 3).map(c => `<div class="oss-tc-claim ${c.isStale ? 'stale' : 'fresh'}"><span class="oss-tc-claim-dot"></span><a href="${c.commentUrl}" target="_blank">@${c.claimer}</a><span class="oss-tc-meta">${c.isStale ? '⚠️ Stale · ' : ''}${timeAgo(c.claimedAt)}</span></div>`).join('') +
      `</div>`;
  }
  if (momentum) {
    sectionsHtml += `<div class="oss-tc-section"><div class="oss-tc-section-label">MOMENTUM</div><div class="oss-tc-momentum"><div class="oss-tc-momentum-bar-wrap"><div class="oss-tc-momentum-bar" style="width:${momentum.score}%;background:${momentum.color}"></div></div><span class="oss-tc-momentum-label" style="color:${momentum.color}">${momentum.label} · ${momentum.score}/100</span></div></div>`;
  }

  banner.innerHTML = `
    <div class="oss-tc-header ${status}">
      <div class="oss-tc-traffic-light">
        <div class="oss-tc-light red ${status === 'red' ? 'on' : ''}"></div>
        <div class="oss-tc-light yellow ${status === 'yellow' ? 'on' : ''}"></div>
        <div class="oss-tc-light green ${status === 'green' ? 'on' : ''}"></div>
      </div>
      <div class="oss-tc-header-text">
        <div class="oss-tc-header-title">${headerIcon} ${headerText}</div>
        <div class="oss-tc-header-sub">${headerSub}</div>
        ${diffPill}
      </div>
      <button class="oss-tc-analytics-btn" id="oss-tc-open-sidebar">📊 Analytics</button>
      <button class="oss-tc-toggle" id="oss-tc-details-toggle">▾</button>
    </div>
    <div class="oss-tc-details" id="oss-tc-details">
      ${sectionsHtml || '<div class="oss-tc-empty" style="padding:8px 16px;font-size:12px;color:#656d76">No additional details.</div>'}
    </div>
  `;

  const toggle = banner.querySelector('#oss-tc-details-toggle');
  const details = banner.querySelector('#oss-tc-details');
  toggle.addEventListener('click', () => {
    const open = details.classList.toggle('open');
    toggle.textContent = open ? '▴' : '▾';
  });

  return banner;
}

function showLoader() {
  if (document.getElementById('oss-tc-banner')) return;
  const loader = document.createElement('div');
  loader.id = 'oss-tc-banner';
  loader.className = 'oss-tc-loading';
  loader.innerHTML = `<div class="oss-tc-spinner"></div><span>GitHub Issue Radar scanning…</span>`;
  const target = document.querySelector('#partial-discussion-header, .gh-header-show, .gh-header, main');
  if (target) target.prepend(loader);
}

async function injectBanner(status, data) {
  document.getElementById('oss-tc-banner')?.remove();
  const banner = buildBanner(status, data);
  const selectors = ['#partial-discussion-header', '.gh-header-show', '.gh-header', 'main'];
  let target = null;
  for (let i = 0; i < 10; i++) {
    for (const sel of selectors) { target = document.querySelector(sel); if (target) break; }
    if (target) break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (target) {
    target.prepend(banner);
    if (status !== 'green') {
      banner.querySelector('#oss-tc-details').classList.add('open');
      banner.querySelector('#oss-tc-details-toggle').textContent = '▴';
    }
  }
  banner.querySelector('#oss-tc-open-sidebar')?.addEventListener('click', () => toggleSidebar(data));
}

// ─── Sidebar Integration ──────────────────────────────────────────────────────

let sidebarOpen = false;

function toggleSidebar(data) {
  const existing = document.getElementById('oss-tc-sidebar');
  const btn = document.getElementById('oss-tc-float-btn');

  if (existing) {
    existing.remove();
    document.body.classList.remove('oss-tc-sidebar-open');
    if (btn) btn.innerHTML = `<span>📊</span><span class="btn-label">Analytics</span>`;
    sidebarOpen = false;
    return;
  }

  if (!window.OSSTCSidebar) return;

  const { issueData, momentum, prs, claims, forks, comments, difficulty } = data;
  const sidebar = window.OSSTCSidebar.buildSidebar(
    issueData || {}, momentum, prs, claims, forks, comments, difficulty
  );
  document.body.appendChild(sidebar);
  document.body.classList.add('oss-tc-sidebar-open');
  sidebarOpen = true;
  if (btn) btn.innerHTML = `<span>✕</span><span class="btn-label">Close</span>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const radarStats = window.OSSTCSidebar.buildRadarStats(issueData || {}, momentum, prs);
    const activityData = window.OSSTCSidebar.buildActivityTimeline(comments);
    window.OSSTCSidebar.initCharts(radarStats, activityData, difficulty, momentum);
  }));

  sidebar.querySelector('#tc-sidebar-close')?.addEventListener('click', () => toggleSidebar(data));
}

function injectFloatBtn(data) {
  document.getElementById('oss-tc-float-btn')?.remove();
  const btn = document.createElement('button');
  btn.id = 'oss-tc-float-btn';
  btn.innerHTML = `<span>📊</span><span class="btn-label">Analytics</span>`;
  btn.addEventListener('click', () => toggleSidebar(data));
  document.body.appendChild(btn);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function init() {
  const path = window.location.pathname.split('/');
  if (path.length < 5 || path[3] !== 'issues' || !/^\d+$/.test(path[4])) return;
  const [, owner, repo, , issueNumber] = path;

  document.getElementById('oss-tc-banner')?.remove();
  document.getElementById('oss-tc-sidebar')?.remove();
  document.getElementById('oss-tc-float-btn')?.remove();
  document.body.classList.remove('oss-tc-sidebar-open');
  sidebarOpen = false;

  showLoader();
  console.log(`GitHub Issue Radar v2.1: Scanning ${owner}/${repo}#${issueNumber}`);

  const [prs, momentum] = await Promise.all([
    detectPRs(owner, repo, issueNumber),
    calcMomentumScore(owner, repo, issueNumber)
  ]);

  const claims = detectClaims();
  const [forks, workloads] = await Promise.all([
    scanForkActivity(owner, repo, issueNumber),
    checkContributorWorkload(owner, repo, issueNumber)
  ]);

  const issueData = momentum?.issueData || {};
  const comments = momentum?.commentsData || [];

  const difficulty = window.OSSTCSidebar
    ? window.OSSTCSidebar.calcDifficultyScore(issueData, comments, prs)
    : { score: 50, level: 'medium', label: 'Intermediate', canBeginner: false, color: '#9a6700', emoji: '🟡', signals: [] };

  issueData._difficulty = difficulty;

  let status = 'green';
  if (prs.length > 0) status = 'red';
  else if (claims.some(c => !c.isStale)) status = 'yellow';
  else if (claims.some(c => c.isStale) || forks?.length > 0) status = 'yellow';

  const data = { prs, claims, momentum, forks, workloads, issueData, comments, difficulty };
  await injectBanner(status, data);
  injectFloatBtn(data);
}

init();
document.addEventListener('turbo:render', init);
document.addEventListener('pjax:end', init);
