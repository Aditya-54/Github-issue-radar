// popup.js

const patInput = document.getElementById('pat-input');
const eyeBtn = document.getElementById('eye-btn');
const saveBtn = document.getElementById('save-btn');
const statusText = document.getElementById('status-text');

const featureIds = ['feat-pr', 'feat-claims', 'feat-momentum', 'feat-forks', 'feat-workload'];
const featureKeys = ['pr', 'claims', 'momentum', 'forks', 'workload'];

// Load saved settings
chrome.storage.sync.get(['github_pat', 'features'], result => {
  if (result.github_pat) {
    patInput.value = result.github_pat;
    statusText.textContent = '✓ PAT configured';
  }

  const features = result.features || {};
  featureIds.forEach((id, i) => {
    const el = document.getElementById(id);
    // Default all features to ON if not explicitly set
    el.checked = features[featureKeys[i]] !== false;
  });
});

// Eye toggle
eyeBtn.addEventListener('click', () => {
  patInput.type = patInput.type === 'password' ? 'text' : 'password';
  eyeBtn.textContent = patInput.type === 'password' ? '👁' : '🙈';
});

// Save
saveBtn.addEventListener('click', async () => {
  const pat = patInput.value.trim();
  const features = {};
  featureIds.forEach((id, i) => {
    features[featureKeys[i]] = document.getElementById(id).checked;
  });

  // Validate PAT format
  if (pat && !pat.startsWith('ghp_') && !pat.startsWith('github_pat_')) {
    statusText.textContent = '⚠️ PAT should start with ghp_';
    statusText.style.color = '#cf222e';
    return;
  }

  chrome.storage.sync.set({ github_pat: pat, features }, () => {
    saveBtn.textContent = '✓ Saved!';
    saveBtn.classList.add('saved');
    statusText.textContent = pat ? '✓ PAT configured · 5000 req/hr' : 'No PAT · 60 req/hr';
    statusText.style.color = '';

    setTimeout(() => {
      saveBtn.textContent = 'Save Settings';
      saveBtn.classList.remove('saved');
    }, 2000);
  });
});
