// background.js - Service Worker for GitHub Issue Radar

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_GITHUB') {
    fetchGitHub(request.url, request.pat)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async
  }
});

async function fetchGitHub(url, pat = null) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Issue-Radar'
  };
  if (pat) {
    headers['Authorization'] = `token ${pat}`;
  }

  const response = await fetch(url, { headers });

  if (response.status === 403) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    throw new Error(`Rate limited. Resets at ${new Date(reset * 1000).toLocaleTimeString()}. Remaining: ${remaining}`);
  }

  if (response.status === 401) {
    throw new Error('Invalid Personal Access Token. Please check your settings.');
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}
