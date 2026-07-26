// ============================================================
// POLLUP — Embeddable Poll Widget
// Usage: <script src="https://pollup.pages.dev/embed.js" data-poll="slug-here"></script>
// Options: data-theme="light|dark" data-accent="#ff6b6b" data-width="100%"
// ============================================================

(function() {
  var script = document.currentScript;
  var slug = script.getAttribute('data-poll');
  var theme = script.getAttribute('data-theme') || 'light';
  var accent = script.getAttribute('data-accent') || '#1a73e8';
  var width = script.getAttribute('data-width') || '100%';
  
  if (!slug) return;

  var API_BASE = 'https://pollup.pages.dev/api';

  // Fingerprint generator
  async function getFingerprint() {
    var data = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.indexedDB,
      navigator.hardwareConcurrency || 'unknown'
    ].join('|');
    var hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // Theme colors
  var isDark = theme === 'dark';
  var bg = isDark ? '#1e1e1e' : '#ffffff';
  var text = isDark ? '#e8eaed' : '#202124';
  var gray = isDark ? '#9aa0a6' : '#5f6368';
  var border = isDark ? '#3c4043' : '#dadce0';
  var surface = isDark ? '#2d2d2d' : '#f1f3f4';

  // Create container
  var container = document.createElement('div');
  container.className = 'pollup-widget';
  container.style.cssText = 
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'max-width:' + width + ';' +
    'background:' + bg + ';' +
    'color:' + text + ';' +
    'border:1px solid ' + border + ';' +
    'border-radius:8px;' +
    'padding:20px;' +
    'box-shadow:0 1px 3px rgba(0,0,0,0.08);' +
    'margin:12px 0;' +
    'box-sizing:border-box;' +
    'line-height:1.5;';

  // Loading state
  container.innerHTML = 
    '<div style="text-align:center;padding:20px;">' +
      '<div class="pollup-spinner" style="' +
        'width:24px;height:24px;border:3px solid ' + surface + ';' +
        'border-top-color:' + accent + ';border-radius:50%;' +
        'animation:pollup-spin 0.6s linear infinite;margin:0 auto 12px;' +
      '"></div>' +
      '<p style="font-size:13px;color:' + gray + ';margin:0;">Loading poll...</p>' +
    '</div>' +
    '<style>' +
      '@keyframes pollup-spin{to{transform:rotate(360deg)}}' +
      '.pollup-widget .pollup-bar{' +
        'height:8px;border-radius:4px;' +
        'background:' + surface + ';' +
        'overflow:hidden;margin-top:4px;' +
      '}' +
      '.pollup-widget .pollup-bar-fill{' +
        'height:100%;border-radius:4px;' +
        'transition:width 0.5s cubic-bezier(0.4,0,0.2,1);' +
        'background:' + accent + ';' +
      '}' +
      '.pollup-widget .pollup-option-btn{' +
        'width:100%;text-align:left;' +
        'padding:10px 14px;' +
        'border:1px solid ' + border + ';' +
        'border-radius:6px;' +
        'background:' + bg + ';' +
        'cursor:pointer;' +
        'font-size:14px;' +
        'margin-bottom:8px;' +
        'transition:all 0.15s;' +
        'color:' + text + ';' +
        'font-family:inherit;' +
        'display:flex;align-items:center;gap:10px;' +
      '}' +
      '.pollup-widget .pollup-option-btn:hover{' +
        'background:' + (isDark ? '#353535' : '#f8f9fa') + ';' +
        'border-color:' + accent + ';' +
      '}' +
      '.pollup-widget .pollup-option-btn.selected{' +
        'background:' + accent + '10;' +
        'border-color:' + accent + ';' +
      '}' +
      '.pollup-widget .pollup-submit{' +
        'width:100%;padding:10px;' +
        'border:none;border-radius:6px;' +
        'background:' + accent + ';' +
        'color:#fff;font-weight:500;' +
        'font-size:14px;cursor:pointer;' +
        'transition:opacity 0.15s;' +
        'font-family:inherit;' +
      '}' +
      '.pollup-widget .pollup-submit:hover{opacity:0.9}' +
      '.pollup-widget .pollup-submit:disabled{opacity:0.5;cursor:not-allowed}' +
      '.pollup-widget .pollup-radio{' +
        'width:18px;height:18px;border-radius:50%;' +
        'border:2px solid ' + border + ';' +
        'flex-shrink:0;display:flex;align-items:center;justify-content:center;' +
        'transition:border 0.15s;' +
      '}' +
      '.pollup-widget .pollup-option-btn.selected .pollup-radio{border-color:' + accent + '}' +
      '.pollup-widget .pollup-radio-fill{' +
        'width:8px;height:8px;border-radius:50%;' +
        'background:' + accent + ';opacity:0;transition:opacity 0.15s;' +
      '}' +
      '.pollup-widget .pollup-option-btn.selected .pollup-radio-fill{opacity:1}' +
      '.pollup-widget .pollup-checkbox{' +
        'width:18px;height:18px;border-radius:4px;' +
        'border:2px solid ' + border + ';' +
        'flex-shrink:0;display:flex;align-items:center;justify-content:center;' +
        'transition:all 0.15s;' +
      '}' +
      '.pollup-widget .pollup-option-btn.selected .pollup-checkbox{' +
        'border-color:' + accent + ';background:' + accent + ';' +
      '}' +
      '.pollup-widget .pollup-checkbox-fill{' +
        'width:10px;height:10px;color:#fff;opacity:0;transition:opacity 0.15s;' +
      '}' +
      '.pollup-widget .pollup-option-btn.selected .pollup-checkbox-fill{opacity:1}' +
      '.pollup-widget .pollup-report{' +
        'background:none;border:none;color:' + gray + ';' +
        'cursor:pointer;font-size:10px;text-decoration:underline;' +
        'font-family:inherit;' +
      '}' +
      '.pollup-widget .pollup-report:hover{color:' + text + '}' +
      '.pollup-widget .pollup-voted-badge{' +
        'display:inline-flex;align-items:center;gap:4px;' +
        'padding:3px 8px;border-radius:10px;' +
        'background:' + accent + '15;color:' + accent + ';' +
        'font-size:11px;font-weight:500;' +
      '}' +
    '</style>';

  script.parentNode.insertBefore(container, script);

  // ============================================================
  // ESCAPE HTML
  // ============================================================
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  // ============================================================
  // LOAD POLL
  // ============================================================
  async function loadPoll() {
    try {
      var fp = await getFingerprint();
      var res = await fetch(API_BASE + '/public/poll/' + slug);
      var data = await res.json();
      var poll = data.poll;

      if (!poll) {
        container.innerHTML = 
          '<div style="text-align:center;padding:20px;color:' + (isDark ? '#f28b82' : '#d93025') + '">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block;margin:0 auto 8px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
            '<p style="font-size:13px;margin:0;">Poll not available</p>' +
          '</div>';
        return;
      }

      // Voting disabled
      if (poll.votingDisabled) {
        container.innerHTML = 
          '<h3 style="margin:0 0 12px;font-size:16px;font-weight:500;">' + esc(poll.tit) + '</h3>' +
          '<div style="text-align:center;padding:16px;background:' + (isDark ? '#3c2e00' : '#fef7e0') + ';border-radius:8px;color:' + (isDark ? '#fdd663' : '#e37400') + ';font-size:13px;">' +
            '<p style="margin:0;">Voting is temporarily paused.</p>' +
          '</div>';
        return;
      }

      // Check if already voted
      var checkRes = await fetch(API_BASE + '/public/poll/' + slug + '/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: fp })
      });
      var checkData = await checkRes.json();

      if (checkData.voted || poll.sts === 2) {
        showResults(poll);
      } else {
        showVoteForm(poll);
      }
    } catch(e) {
      container.innerHTML = 
        '<div style="text-align:center;padding:20px;color:' + (isDark ? '#f28b82' : '#d93025') + '">' +
          '<p style="font-size:13px;margin:0;">Failed to load poll.</p>' +
        '</div>';
    }
  }

  // ============================================================
  // VOTE FORM
  // ============================================================
  function showVoteForm(poll) {
    var opts = poll.opt || [];
    var isMultiple = poll.typ === 1;
    var selectedOptions = [];

    var optionsHtml = opts.map(function(o) {
      return '<button class="pollup-option-btn" data-oid="' + o.id + '">' +
        (isMultiple ? 
          '<div class="pollup-checkbox"><svg class="pollup-checkbox-fill" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>' :
          '<div class="pollup-radio"><div class="pollup-radio-fill"></div></div>'
        ) +
        '<span style="flex:1">' + esc(o.text) + '</span>' +
      '</button>';
    }).join('');

    container.innerHTML = 
      '<h3 style="margin:0 0 16px;font-size:16px;font-weight:500;">' + esc(poll.tit) + '</h3>' +
      '<div class="pollup-options">' + optionsHtml + '</div>' +
      '<button class="pollup-submit" disabled>Submit Vote</button>' +
      (poll.exp ? '<p style="font-size:11px;color:' + gray + ';margin:8px 0 0;">Ends ' + new Date(poll.exp).toLocaleDateString() + '</p>' : '') +
      '<div style="text-align:center;margin-top:8px;">' +
        '<a href="https://pollup.pages.dev/poll.html?p=' + slug + '" style="font-size:10px;color:' + gray + ';text-decoration:none;" target="_blank">Powered by PollUp</a>' +
      '</div>';

    var optionBtns = container.querySelectorAll('.pollup-option-btn');
    var submitBtn = container.querySelector('.pollup-submit');

    optionBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var oid = btn.getAttribute('data-oid');
        if (isMultiple) {
          var idx = selectedOptions.indexOf(oid);
          if (idx > -1) {
            selectedOptions.splice(idx, 1);
            btn.classList.remove('selected');
          } else {
            selectedOptions.push(oid);
            btn.classList.add('selected');
          }
        } else {
          optionBtns.forEach(function(b) { b.classList.remove('selected'); });
          selectedOptions = [oid];
          btn.classList.add('selected');
        }
        submitBtn.disabled = selectedOptions.length === 0;
      });
    });

    submitBtn.addEventListener('click', async function() {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      var fp = await getFingerprint();
      var allOk = true;

      for (var i = 0; i < selectedOptions.length; i++) {
        try {
          var res = await fetch(API_BASE + '/public/poll/' + slug + '/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ option: selectedOptions[i], fingerprint: fp })
          });
          var data = await res.json();
          if (!res.ok) {
            alert(data.error || 'Vote failed');
            allOk = false;
            break;
          }
          poll.results = data.results;
          poll.totalVotes = data.totalVotes;
        } catch(e) {
          alert('Network error');
          allOk = false;
          break;
        }
      }

      if (allOk) {
        localStorage.setItem('pollup_voted_' + slug, 'true');
        showResults(poll);
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Vote';
      }
    });
  }

  // ============================================================
  // RESULTS
  // ============================================================
  function showResults(poll) {
    var results = poll.results || [];
    var total = poll.totalVotes || results.reduce(function(s, r) { return s + (r.count || 0); }, 0);
    var maxCount = Math.max.apply(null, results.map(function(r) { return r.count || 0; }).concat([1]));
    var voted = localStorage.getItem('pollup_voted_' + slug);

    var resultsHtml = results.map(function(r) {
      return '<div style="margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">' +
          '<span>' + esc(r.text) + '</span>' +
          '<span style="color:' + gray + ';">' + (r.percent || 0) + '%</span>' +
        '</div>' +
        '<div class="pollup-bar">' +
          '<div class="pollup-bar-fill" style="width:' + (r.percent || 0) + '%;"></div>' +
        '</div>' +
        '<div style="font-size:11px;color:' + gray + ';margin-top:2px;">' + (r.count || 0) + ' vote' + (r.count !== 1 ? 's' : '') + '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = 
      '<h3 style="margin:0 0 4px;font-size:16px;font-weight:500;">' + esc(poll.tit) + '</h3>' +
      '<p style="font-size:11px;color:' + gray + ';margin:0 0 16px;">' +
        (voted ? '<span class="pollup-voted-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> You voted</span> ' : '') +
        total + ' vote' + (total !== 1 ? 's' : '') + (poll.sts === 2 ? ' &middot; Closed' : '') +
      '</p>' +
      resultsHtml +
      '<div style="text-align:center;margin-top:12px;">' +
        '<a href="https://pollup.pages.dev/poll.html?p=' + slug + '" style="font-size:10px;color:' + gray + ';text-decoration:none;" target="_blank">Powered by PollUp</a>' +
        '<button class="pollup-report" style="margin-left:8px;" title="Report this poll">Report</button>' +
      '</div>';

    // Report handler
    var reportBtn = container.querySelector('.pollup-report');
    if (reportBtn) {
      reportBtn.addEventListener('click', async function() {
        var reason = prompt('Why are you reporting this poll?\n\nspam, offensive, misinformation, other');
        if (!reason) return;
        try {
          await fetch(API_BASE + '/public/poll/' + slug + '/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason })
          });
          alert('Report submitted. Thank you.');
        } catch(e) {
          alert('Failed to submit report.');
        }
      });
    }

    // Animate bars
    setTimeout(function() {
      var bars = container.querySelectorAll('.pollup-bar-fill');
      bars.forEach(function(bar, i) {
        bar.style.width = (results[i].percent || 0) + '%';
      });
    }, 50);
  }

  // ============================================================
  // INIT
  // ============================================================
  loadPoll();
})();
