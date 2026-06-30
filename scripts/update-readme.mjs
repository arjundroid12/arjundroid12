/**
 * Profile README Auto-Updater
 *
 * Runs in GitHub Actions, fetches live stats from the GitHub API,
 * and updates README.md with fresh numbers + recent activity.
 *
 * Env vars needed:
 *   GH_TOKEN  - GitHub token with repo:read scope (provided by Actions)
 *   GITHUB_REPOSITORY_OWNER - auto-provided by Actions (username)
 */

import fs from "node:fs";

const USERNAME = process.env.GITHUB_REPOSITORY_OWNER || "arjundroid12";
const TOKEN = process.env.GH_TOKEN;

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "profile-updater",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const fetchJSON = async (url) => {
  const r = await fetch(url, { headers });
  if (!r.ok) {
    console.error(`  ✗ ${url} → HTTP ${r.status}`);
    return null;
  }
  return r.json();
};

// ---------- Fetch all stats ----------
const fetchStats = async () => {
  console.log(`Fetching stats for @${USERNAME}...`);

  // User profile
  const user = await fetchJSON(`https://api.github.com/users/${USERNAME}`);
  if (!user) throw new Error("Could not fetch user");

  // All public repos
  const repos = await fetchJSON(
    `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=pushed`
  );
  if (!Array.isArray(repos)) throw new Error("Could not fetch repos");

  // Total stars received
  const totalStars = repos.reduce(
    (sum, r) => sum + (r.stargazers_count || 0),
    0
  );
  const totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);

  // Top languages across repos
  const langCounts = {};
  repos.forEach((r) => {
    if (r.language) {
      langCounts[r.language] = (langCounts[r.language] || 0) + 1;
    }
  });
  const topLanguages = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang, count]) => ({ lang, count }));

  // Recent events (commits, PRs, etc.)
  const events = await fetchJSON(
    `https://api.github.com/users/${USERNAME}/events/public?per_page=30`
  );
  const recentEvents = Array.isArray(events) ? events.slice(0, 5) : [];

  // Recent commits across repos (last 5)
  const recentCommits = [];
  for (const r of repos.slice(0, 5)) {
    if (recentCommits.length >= 5) break;
    const cs = await fetchJSON(
      `https://api.github.com/repos/${USERNAME}/${r.name}/commits?per_page=1`
    );
    if (Array.isArray(cs) && cs[0]) {
      recentCommits.push({
        repo: r.name,
        sha: cs[0].sha.slice(0, 7),
        message: cs[0].commit.message.split("\n")[0].slice(0, 60),
        date: cs[0].commit.author.date,
        url: cs[0].html_url,
      });
    }
  }

  return {
    user,
    repos,
    totalStars,
    totalForks,
    topLanguages,
    recentEvents,
    recentCommits,
    timestamp: new Date().toISOString(),
  };
};

// ---------- Render README ----------
const langColor = (lang) => {
  const colors = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Python: "#3572A5",
    "C++": "#f34b7d",
    Java: "#b07219",
    Shell: "#89e051",
  };
  return colors[lang] || "#cccccc";
};

const renderReadme = (stats) => {
  const { user, repos, totalStars, totalForks, topLanguages, recentCommits, timestamp } = stats;

  const lastUpdated = new Date(timestamp).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Sort repos by stars, then by recency
  const topRepos = [...repos]
    .sort((a, b) => {
      if ((b.stargazers_count || 0) !== (a.stargazers_count || 0)) {
        return (b.stargazers_count || 0) - (a.stargazers_count || 0);
      }
      return new Date(b.pushed_at) - new Date(a.pushed_at);
    })
    .slice(0, 6);

  const langBars = topLanguages
    .map(({ lang, count }) => {
      const pct = Math.round((count / repos.length) * 100);
      return `    <span style="background:${langColor(lang)};color:#000;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${lang} ${pct}%</span>`;
    })
    .join("\n");

  const repoCards = topRepos
    .map((r) => {
      const desc = (r.description || "No description").slice(0, 80);
      return `    <td align="center" style="padding:8px">
      <a href="${r.html_url}" style="font-weight:600;color:#0969da;text-decoration:none">${r.name}</a><br>
      <span style="font-size:11px;color:#57606a">${desc}</span><br>
      <span style="font-size:11px">⭐ ${r.stargazers_count || 0} · 🍴 ${r.forks_count || 0} · ${r.language || "—"}</span>
    </td>`;
    })
    .join("\n");

  // Split repo cards into rows of 3
  const repoRows = topRepos
    .reduce((rows, r, i) => {
      const desc = (r.description || "No description").slice(0, 80);
      const cell = `    <td align="center" style="padding:8px">
      <a href="${r.html_url}" style="font-weight:600;color:#0969da;text-decoration:none">${r.name}</a><br>
      <span style="font-size:11px;color:#57606a">${desc}</span><br>
      <span style="font-size:11px">⭐ ${r.stargazers_count || 0} · 🍴 ${r.forks_count || 0} · ${r.language || "—"}</span>
    </td>`;
      const rowIdx = Math.floor(i / 3);
      if (!rows[rowIdx]) rows[rowIdx] = [];
      rows[rowIdx].push(cell);
      return rows;
    }, [])
    .map((row) => `  <tr>\n${row.join("\n")}\n  </tr>`)
    .join("\n");

  const commitList = recentCommits
    .map(
      (c) =>
        `    <li><a href="${c.url}" style="color:#0969da;text-decoration:none"><code>${c.repo}@${c.sha}</code></a> — ${c.message}</li>`
    )
    .join("\n");

  const parts = [
    `<!-- AUTO-GENERATED by scripts/update-readme.mjs — DO NOT EDIT MANUALLY BELOW THIS LINE -->`,
    `<!-- Last updated: ${timestamp} -->`,
    ``,
    `<h1 align="center">Hi, I'm ${user.name || user.login} 👋</h1>`,
    ``,
    `<p align="center">`,
    `  <em>${user.bio || "Building my portfolio, one project at a time."}</em>`,
    `</p>`,
    ``,
    `<p align="center">`,
    `  📍 ${user.location || "Earth"} · 📧 <a href="mailto:${user.email || ""}">${user.email || "—"}</a> · 🔗 <a href="${user.blog || "#"}">${user.blog || "—"}</a>`,
    `</p>`,
    ``,
    `---`,
    ``,
    `## 📊 Live Stats`,
    ``,
    `<p align="center">`,
    `  <strong>${user.public_repos}</strong> public repos ·`,
    `  <strong>${user.followers}</strong> followers ·`,
    `  <strong>${user.following}</strong> following ·`,
    `  <strong>⭐ ${totalStars}</strong> stars received ·`,
    `  <strong>🍴 ${totalForks}</strong> forks`,
    `</p>`,
    ``,
    `### 🌟 Top Languages`,
    ``,
    `<p align="center">`,
    langBars,
    `</p>`,
    ``,
    `---`,
    ``,
    `## 🚀 Pinned Projects`,
    ``,
    `<table>`,
    repoRows,
    `</table>`,
    ``,
    `---`,
    ``,
    `## 📝 Recent Commits`,
    ``,
    `<ul>`,
    commitList,
    `</ul>`,
    ``,
    `---`,
    ``,
    `## 🛠️ Daily Coding Log`,
    ``,
    `I am auto-committing a coding challenge, tip, and reflection every day — see [\`daily-coding-log\`](https://github.com/arjundroid12/daily-coding-log) 📓`,
    ``,
    `---`,
    ``,
    `## 🤝 Connect`,
    ``,
    `- 💼 LinkedIn: _coming soon_`,
    `- 🐦 Twitter: _coming soon_`,
    `- 🌐 Portfolio: _this profile!_`,
    ``,
    `---`,
    ``,
    `<sub>🔄 This README is auto-updated daily by GitHub Actions. Last refresh: <strong>${lastUpdated} IST</strong></sub>`,
    ``,
  ];
  return parts.join("\n");
};

// ---------- Main ----------
const STUB = [
  "<!-- This part is editable — anything above the AUTO-GENERATED marker is preserved -->",
  "",
  "# 👋 Hi there",
  "",
  "I'm Arjun, a developer building my GitHub portfolio one project at a time. Currently working through a 14-day portfolio challenge — check out my pinned repos below for live demos!",
  "",
  "## 🔭 Currently working on",
  "- 14-day portfolio build challenge (Day 1 done: Calculator, Notes, Realtime Chat)",
  "- Daily coding challenges (auto-committed via GitHub Actions)",
  "- Learning modern JS, Node.js, and full-stack patterns",
  "",
  "## 🌱 Currently learning",
  "- React 18 + Vite",
  "- Next.js App Router",
  "- Socket.io / WebSockets",
  "- CI/CD with GitHub Actions",
  "",
  "## 💬 Ask me about",
  "- Vanilla JavaScript fundamentals",
  "- Building static sites with no dependencies",
  "- Setting up GitHub Pages and Surge.sh deploys",
  "- Surviving ISP blocks on github.io 😅",
  "",
  "## ⚡ Fun fact",
  "I learned that Indian ISPs sometimes block `github.io` — so I deploy everything to Surge.sh's Bangalore edge as a backup.",
  "",
  "",
].join("\n");

const README_PATH = "README.md";
const MARKER = "<!-- AUTO-GENERATED by scripts/update-readme.mjs";

try {
  // Read existing README if it exists
  let existing = "";
  if (fs.existsSync(README_PATH)) {
    existing = fs.readFileSync(README_PATH, "utf-8");
  }

  // Find the marker - anything above it is preserved
  const markerIdx = existing.indexOf(MARKER);
  const top = markerIdx >= 0 ? existing.slice(0, markerIdx).trimEnd() + "\n\n" : STUB + "\n";

  console.log("📊 Fetching live stats...");
  const stats = await fetchStats();
  console.log(`  ✓ ${stats.repos.length} repos, ${stats.totalStars} stars, ${stats.recentCommits.length} recent commits`);

  console.log("✏️  Rendering README...");
  const dynamic = renderReadme(stats);
  const newContent = top + dynamic;

  fs.writeFileSync(README_PATH, newContent);
  console.log(`✅ Wrote ${newContent.length} bytes to README.md`);
} catch (err) {
  console.error("❌ Failed:", err.message);
  process.exit(1);
}
