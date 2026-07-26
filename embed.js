// ============================================================
// POLLUP — Embeddable Poll Widget
// Usage: <script src="https://pollup.pages.dev/embed.js" data-poll="slug-here"></script>
// ============================================================

(function() {
  const script = document.currentScript;
  const slug = script.getAttribute('data-poll');
  const theme = script.getAttribute('data-theme') || 'light';
  const accent = script.getAttribute('data-accent') || '#1a73e8';
  const width = script.getAttribute('data-width') || '100%';
  
  if (!slug) return;

  const API_BASE = 'https://pollup.pages.dev/api';

  // Fingerprint generator
  async function getFingerprint() {
    const data = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.indexedDB,
      navigator.hardwareConcurrency || 'unknown'
    ].join('|');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Create container
  const container = document.createElement('div');
  container.className = 'pollup-widget';
  container.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: ${width};
    background: ${theme === 'dark' ? '#1e1e1e' : '#ffffff'};
    color: ${theme === 'dark' ? '#e8eaed' : '#202124'};
    border: 1px solid ${theme === 'dark' ? '#3c4043' : '#dadce0'};
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    margin: 12px 0;
    box-sizing: border-box;
  `;

  // Loading state
  container.innerHTML = `
    <div style="text-align:center;padding:20px;">
      <div class="pollup-spinner" style="
        width:24px;height:24px;border:3px solid #e8eaed;border-top-color:${accent};
        border-radius:50%;animation:pollup-spin 0.6s linear infinite;margin:0 auto 12px;
      "></div>
      <p style="font-size:13px;color:#5f6368;margin:0;">Loading poll...</p>
    </div>
    <style>
      @keyframes pollup-spin { to { transform: rotate(360deg); } }
      .pollup-bar {
        height: 8px;
        border-radius: 4px;
        background: #f1f3f4;
        overflow: hidden;
        margin-top: 4px;
        transition: background 0.2s;
      }
      .pollup-bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .pollup-option-btn {
        width: 100%;
        text-align: left;
        padding: 10px 14px;
        border: 1px solid #dadce0;
        border-radius: 6px;
        background: #fff;
        cursor: pointer;
        font-size: 14px;
        margin-bottom: 8px;
        transition: all 0.15s;
        color: #202124;
      }
      .pollup-option-btn:hover {
        background: #f8f9fa;
        border-color: ${accent};
      }
      .pollup-option-btn.selected {
        background: ${accent}10;
        border-color: ${accent};
        color: ${accent};
      }
      .pollup-submit {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 6px;
        background: ${accent};
        color: #fff;
        font-weight: 500;
        font-size: 14px;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .pollup-submit:hover { opacity: 0.9; }
      .pollup-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    </style>
  `;

  script.parentNode.insertBefore(container, script);

  // Fetch poll
  async function loadPoll() {
    try {
      const fp = await getFingerprint();
      const res = await fetch(`${API_BASE}/public/poll/${slug}`);
      const { poll, error } = await res.json();

      if (error || !poll) {
        container.innerHTML = `<div style="text-align:center;padding:20px;color:#d93025;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <p style="font-size:13px;margin:8px 0 0;">Poll not available</p>
        </div>`;
        return;
      }

      // Check if already voted
      const checkRes = await fetch(`${API_BASE}/public/poll/${slug}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: fp })
      });
      const { voted } = await checkRes.json();

      if (voted || poll.sts === 2) {
        showResults(poll);
      } else {
        showVoteForm(poll);
      }
    } catch {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:#d93025;">
        <p style="font-size:13px;margin:0;">Failed to load poll. Check your connection.</p>
      </div>`;
    }
  }

  function showVoteForm(poll) {
    let selectedOption = poll.typ === 1 ? [] : null;

    const optionsHtml = (poll.opt || []).map((o, i) => {
      const inputType = poll.typ === 1 ? 'checkbox' : 'radio';
      return `
        <button class="pollup-option-btn" data-option="${o.id}" style="display:flex;align-items:center;gap:10px;">
          <span style="width:18px;height:18px;border:2px solid #dadce0;border-radius:${poll.typ === 1 ? '4px' : '50%'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span class="pollup-check" style="display:none;width:8px;height:8px;background:${accent};border-radius:${poll.typ === 1 ? '1px' : '50%'};"></span>
          </span>
          ${escapeHtml(o.text)}
        </button>
      `;
    }).join('');

    container.innerHTML = `
      <h3 style="margin:0 0 16px;font-size:16px;font-weight:500;">${escapeHtml(poll.tit)}</h3>
      <div class="pollup-options">${optionsHtml}</div>
      <button class="pollup-submit" disabled>Submit Vote</button>
      ${poll.exp ? `<p style="font-size:11px;color:#5f6368;margin:8px 0 0;">Ends ${new Date(poll.exp).toLocaleDateString()}</p>` : ''}
      <div style="text-align:center;margin-top:8px;">
        <a href="https://pollup.pages.dev/poll/${slug}" style="font-size:10px;color:#5f6368;text-decoration:none;">Powered by PollUp</a>
      </div>
    `;

    // Option selection
    const optionBtns = container.querySelectorAll('.pollup-option-btn');
    const submitBtn = container.querySelector('.pollup-submit');

    optionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (poll.typ === 1) {
          // Multiple choice
          const idx = selectedOption.indexOf(btn.dataset.option);
          if (idx > -1) {
            selectedOption.splice(idx, 1);
            btn.classList.remove('selected');
            btn.querySelector('.pollup-check').style.display = 'none';
          } else {
            selectedOption.push(btn.dataset.option);
            btn.classList.add('selected');
            btn.querySelector('.pollup-check').style.display = 'block';
          }
        } else {
          // Single choice
          optionBtns.forEach(b => {
            b.classList.remove('selected');
            b.querySelector('.pollup-check').style.display = 'none';
          });
          selectedOption = btn.dataset.option;
          btn.classList.add('selected');
          btn.querySelector('.pollup-check').style.display = 'block';
        }
        submitBtn.disabled = poll.typ === 1 ? selectedOption.length === 0 : !selectedOption;
      });
    });

    // Submit
    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      const fp = await getFingerprint();
      const options = poll.typ === 1 ? selectedOption : [selectedOption];

      for (const opt of options) {
        const res = await fetch(`${API_BASE}/public/poll/${slug}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ option: opt, fingerprint: fp })
        });
        const data = await res.json();
        if (data.voted) {
          showResults({ ...poll, results: data.results, totalVotes: data.totalVotes });
        }
      }
    });
  }

  function showResults(poll) {
    const results = poll.results || [];
    const total = poll.totalVotes || results.reduce((s, r) => s + (r.count || 0), 0);
    const maxCount = Math.max(...results.map(r => r.count || 0), 1);

    const resultsHtml = results.map(r => `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
          <span>${escapeHtml(r.text)}</span>
          <span style="color:#5f6368;">${r.percent || 0}%</span>
        </div>
        <div class="pollup-bar">
          <div class="pollup-bar-fill" style="width:${r.percent || 0}%;background:${accent};"></div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <h3 style="margin:0 0 4px;font-size:16px;font-weight:500;">${escapeHtml(poll.tit)}</h3>
      <p style="font-size:11px;color:#5f6368;margin:0 0 16px;">${total} vote${total !== 1 ? 's' : ''}${poll.sts === 2 ? ' • Closed' : ''}</p>
      ${resultsHtml}
      <div style="text-align:center;margin-top:12px;">
        <a href="https://pollup.pages.dev/poll/${slug}" style="font-size:10px;color:#5f6368;text-decoration:none;">Powered by PollUp</a>
        <button class="pollup-report" style="background:none;border:none;color:#5f6368;cursor:pointer;font-size:10px;margin-left:8px;text-decoration:underline;" title="Report">Report</button>
      </div>
    `;

    // Report handler
    container.querySelector('.pollup-report')?.addEventListener('click', async () => {
      const reason = prompt('Why are you reporting this poll? (spam, offensive, misinformation, other)');
      if (reason) {
        await fetch(`${API_BASE}/public/poll/${slug}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        alert('Report submitted. Thank you.');
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  loadPoll();
})();
