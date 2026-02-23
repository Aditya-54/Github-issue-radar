## GitHub Issue Radar

GitHub Issue Radar is a Chrome Extension that adds a status banner and analytics sidebar to GitHub issue pages. It helps you see whether work is already in progress and how active an issue is before you start contributing.

### What it does
- Detects open pull requests related to the issue.
- Detects fresh and stale “claim” comments.
- Computes an issue momentum score from recent activity and maintainer responses.
- Shows recent fork activity that might indicate work happening elsewhere.
- Displays assignee workload based on their open pull requests.

### Installation
1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable Developer Mode (top-right toggle).
4. Click “Load unpacked” and select this folder.
5. (Optional) Pin the extension from the extensions toolbar.

### Configuration (optional but recommended)
1. Click the extension icon to open the GitHub Issue Radar popup.
2. Enter a GitHub Personal Access Token with `public_repo` scope (for higher API limits).
3. Choose which features to enable.
4. Click “Save Settings”.

### License
MIT
