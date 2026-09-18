/**
 * Recent comments widget.
 *
 * Comments are powered by utterances, which stores them as issues (with a
 * specific label) in the GitHub Pages repository. This script queries the
 * public GitHub REST API for the most recently updated comment issues and
 * lists them in the sidebar, linking straight to the issue thread so the
 * blog owner and visitors can read and reply on GitHub.
 */
(function () {
  'use strict';

  var section = document.getElementById('recent-comments');
  var list = document.getElementById('recent-comments-list');
  if (!section || !list) return;

  var CONFIG = {
    owner: 'WeiZhang555',
    repo: 'weizhang555.github.io',
    label: 'blog comments ✨💬✨',
    count: 8,
    cacheKey: 'recent-comments-cache',
    cacheTTL: 10 * 60 * 1000 // 10 minutes
  };

  function timeAgo(iso) {
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 3600) return Math.max(1, Math.floor(diff / 60)) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 30 * 86400) return Math.floor(diff / 86400) + ' 天前';
    return new Date(iso).toLocaleDateString('zh-CN');
  }

  function render(issues) {
    if (!issues.length) return;
    section.hidden = false;
    issues.forEach(function (issue) {
      // utterances titles look like "Post Title | Site Name"
      var title = issue.title.split(' | ')[0] || issue.title;
      var li = document.createElement('li');
      li.className = 'recent-comment-item';

      var a = document.createElement('a');
      a.href = issue.html_url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'recent-comment-title';
      a.textContent = title;

      var meta = document.createElement('span');
      meta.className = 'recent-comment-meta';
      meta.textContent = issue.comments + ' 条评论 · ' + timeAgo(issue.updated_at);

      li.appendChild(a);
      li.appendChild(meta);
      list.appendChild(li);
    });
    var hint = section.querySelector('.recent-comments-hint');
    if (hint) hint.hidden = false;
  }

  function fetchComments() {
    var url = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo +
      '/issues?state=all&per_page=' + CONFIG.count +
      '&sort=updated&direction=desc&labels=' + encodeURIComponent(CONFIG.label);

    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (issues) {
        try {
          localStorage.setItem(CONFIG.cacheKey, JSON.stringify({
            ts: Date.now(), data: issues
          }));
        } catch (e) { /* localStorage may be unavailable */ }
        render(issues);
      })
      .catch(function () {
        var cached = loadCache();
        if (cached) render(cached);
        // silently hide the widget when the API is unreachable or rate-limited
      });
  }

  function loadCache() {
    try {
      var raw = localStorage.getItem(CONFIG.cacheKey);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.ts > CONFIG.cacheTTL) return null;
      return obj.data;
    } catch (e) { return null; }
  }

  var cached = loadCache();
  if (cached) {
    render(cached);
    // refresh in background only when the cache is stale
    try {
      var obj = JSON.parse(localStorage.getItem(CONFIG.cacheKey));
      if (Date.now() - obj.ts > CONFIG.cacheTTL) fetchComments();
    } catch (e) { fetchComments(); }
  } else {
    fetchComments();
  }
})();
