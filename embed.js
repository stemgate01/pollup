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
  var userReported = false;
  var currentReportCount = 0;

  async function getFingerprint() {
    var data = [navigator.userAgent, navigator.language, screen.colorDepth, screen.width + 'x' + screen.height, new Date().getTimezoneOffset(), !!window.sessionStorage, !!window.indexedDB, navigator.hardwareConcurrency || 'unknown'].join('|');
    var hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  var isDark = theme === 'dark';
  var bg = isDark ? '#1e1e1e' : '#ffffff';
  var text = isDark ? '#e8eaed' : '#202124';
  var gray = isDark ? '#9aa0a6' : '#5f6368';
  var border = isDark ? '#3c4043' : '#dadce0';
  var surface = isDark ? '#2d2d2d' : '#f1f3f4';

  var container = document.createElement('div');
  container.className = 'pollup-widget';
  container.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:' + width + ';background:' + bg + ';color:' + text + ';border:1px solid ' + border + ';border-radius:8px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin:12px 0;box-sizing:border-box;line-height:1.5;';

  container.innerHTML = 
    '<div style="text-align:center;padding:20px;">' +
      '<div class="pollup-spinner" style="width:24px;height:24px;border:3px solid ' + surface + ';border-top-color:' + accent + ';border-radius:50%;animation:pollup-spin 0.6s linear infinite;margin:0 auto 12px;"></div>' +
      '<p style="font-size:13px;color:' + gray + ';margin:0;">Loading poll...</p>' +
    '</div>' +
    '<style>' +
      '@keyframes pollup-spin{to{transform:rotate(360deg)}}' +
      '.pollup-widget .pollup-bar{height:8px;border-radius:4px;background:' + surface + ';overflow:hidden;margin-top:4px;}' +
      '.pollup-widget .pollup-bar-fill{height:100%;border-radius:4px;transition:width 0.5s cubic-bezier(0.4,0,0.2,1);background:' + accent + ';}' +
      '.pollup-widget .pollup-option-btn{width:100%;text-align:left;padding:10px 14px;border:1px solid ' + border + ';border-radius:6px;background:' + bg + ';cursor:pointer;font-size:14px;margin-bottom:8px;transition:all 0.15s;color:' + text + ';font-family:inherit;display:flex;align-items:center;gap:10px;}' +
      '.pollup-widget .pollup-option-btn:hover{background:' + (isDark ? '#353535' : '#f8f9fa') + ';border-color:' + accent + ';}' +
      '.pollup-widget .pollup-option-btn.selected{background:' + accent + '10;border-color:' + accent + ';}' +
      '.pollup-widget .pollup-submit{width:100%;padding:10px;border:none;border-radius:6px;background:' + accent + ';color:#fff;font-weight:500;font-size:14px;cursor:pointer;transition:opacity 0.15s;font-family:inherit;}' +
      '.pollup-widget .pollup-submit:hover{opacity:0.9}' +
      '.pollup-widget .pollup-submit:disabled{opacity:0.5;cursor:not-allowed}' +
      '.pollup-widget .pollup-radio{width:18px;height:18px;border-radius:50%;border:2px solid ' + border + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;}' +
      '.pollup-widget .pollup-option-btn.selected .pollup-radio{border-color:' + accent + '}' +
      '.pollup-widget .pollup-radio-fill{width:8px;height:8px;border-radius:50%;background:' + accent + ';opacity:0;}' +
      '.pollup-widget .pollup-option-btn.selected .pollup-radio-fill{opacity:1}' +
      '.pollup-widget .pollup-checkbox{width:18px;height:18px;border-radius:4px;border:2px solid ' + border + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;}' +
      '.pollup-widget .pollup-option-btn.selected .pollup-checkbox{border-color:' + accent + ';background:' + accent + ';}' +
      '.pollup-widget .pollup-checkbox-fill{width:10px;height:10px;color:#fff;opacity:0;}' +
      '.pollup-widget .pollup-option-btn.selected .pollup-checkbox-fill{opacity:1}' +
      '.pollup-widget .pollup-report{background:none;border:none;color:' + gray + ';cursor:pointer;font-size:10px;text-decoration:underline;font-family:inherit;}' +
      '.pollup-widget .pollup-report:hover{color:' + text + '}' +
    '</style>';

  script.parentNode.insertBefore(container, script);

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }

  async function checkReportStatus() {
    var fp = await getFingerprint();
    try {
      var res = await fetch(API_BASE + '/public/poll/' + slug + '/report-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint: fp }) });
      var data = await res.json();
      userReported = data.reported;
      currentReportCount = data.reportCount || 0;
    } catch(e) {}
  }

  function updateReportBtn(btn) {
    if (!btn) return;
    btn.textContent = userReported ? 'Reported' + (currentReportCount > 0 ? ' (' + currentReportCount + ')' : '') : 'Report' + (currentReportCount > 0 ? ' (' + currentReportCount + ')' : '');
    btn.style.color = userReported ? '#d93025' : '';
  }

  async function loadPoll() {
    try {
      var fp = await getFingerprint();
      var res = await fetch(API_BASE + '/public/poll/' + slug);
      var data = await res.json();
      var poll = data.poll;

      if (!poll) { container.innerHTML = '<div style="text-align:center;padding:20px;color:#d93025"><p style="font-size:13px;margin:0;">Poll not available</p></div>'; return; }
      if (poll.votingDisabled) { container.innerHTML = '<h3 style="margin:0 0 12px;font-size:16px;font-weight:500;">' + esc(poll.tit) + '</h3><div style="text-align:center;padding:16px;background:#fef7e0;border-radius:8px;color:#e37400;font-size:13px;"><p style="margin:0;">Voting is temporarily paused.</p></div>'; return; }

      await checkReportStatus();

      var checkRes = await fetch(API_BASE + '/public/poll/' + slug + '/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint: fp }) });
      var checkData = await checkRes.json();

      if (checkData.voted || poll.sts === 2) { showResults(poll); }
      else { showVoteForm(poll); }
    } catch(e) { container.innerHTML = '<div style="text-align:center;padding:20px;color:#d93025"><p style="font-size:13px;margin:0;">Failed to load poll.</p></div>'; }
  }

  function showVoteForm(poll) {
    var opts = poll.opt || [];
    var isMultiple = poll.typ === 1;
    var selectedOptions = [];
    container.innerHTML = 
      '<h3 style="margin:0 0 16px;font-size:16px;font-weight:500;">' + esc(poll.tit) + '</h3>' +
      '<div class="pollup-options">' + opts.map(function(o) {
        return '<button class="pollup-option-btn" data-oid="' + o.id + '">' +
          (isMultiple ? '<div class="pollup-checkbox"><svg class="pollup-checkbox-fill" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>' : '<div class="pollup-radio"><div class="pollup-radio-fill"></div></div>') +
          '<span style="flex:1">' + esc(o.text) + '</span></button>';
      }).join('') + '</div>' +
      '<button class="pollup-submit" disabled>Submit Vote</button>' +
      (poll.exp ? '<p style="font-size:11px;color:' + gray + ';margin:8px 0 0;">Ends ' + new Date(poll.exp).toLocaleDateString() + '</p>' : '') +
      '<div style="text-align:center;margin-top:8px;"><a href="https://pollup.pages.dev/poll.html?p=' + slug + '" style="font-size:10px;color:' + gray + ';text-decoration:none;" target="_blank">Powered by PollUp</a></div>';

    var btns = container.querySelectorAll('.pollup-option-btn');
    var submitBtn = container.querySelector('.pollup-submit');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var oid = btn.getAttribute('data-oid');
        if (isMultiple) {
          var idx = selectedOptions.indexOf(oid);
          if (idx > -1) { selectedOptions.splice(idx, 1); btn.classList.remove('selected'); }
          else { selectedOptions.push(oid); btn.classList.add('selected'); }
        } else {
          btns.forEach(function(b) { b.classList.remove('selected'); });
          selectedOptions = [oid]; btn.classList.add('selected');
        }
        submitBtn.disabled = selectedOptions.length === 0;
      });
    });
    submitBtn.addEventListener('click', async function() {
      submitBtn.disabled = true; submitBtn.textContent = 'Submitting...';
      var fp = await getFingerprint();
      for (var i = 0; i < selectedOptions.length; i++) {
        var res = await fetch(API_BASE + '/public/poll/' + slug + '/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ option: selectedOptions[i], fingerprint: fp }) });
        var d = await res.json();
        if (!res.ok) { alert(d.error || 'Vote failed'); submitBtn.disabled = false; submitBtn.textContent = 'Submit Vote'; return; }
        poll.results = d.results; poll.totalVotes = d.totalVotes;
      }
      localStorage.setItem('pollup_voted_' + slug, 'true');
      showResults(poll);
    });
  }

  function showResults(poll) {
    var results = poll.results || [];
    var total = poll.totalVotes || results.reduce(function(s, r) { return s + (r.count || 0); }, 0);
    container.innerHTML = 
      '<h3 style="margin:0 0 4px;font-size:16px;font-weight:500;">' + esc(poll.tit) + '</h3>' +
      '<p style="font-size:11px;color:' + gray + ';margin:0 0 16px;">' + total + ' vote' + (total !== 1 ? 's' : '') + (poll.sts === 2 ? ' · Closed' : '') + '</p>' +
      results.map(function(r) {
        return '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>' + esc(r.text) + '</span><span style="color:' + gray + ';">' + (r.percent || 0) + '%</span></div><div class="pollup-bar"><div class="pollup-bar-fill" style="width:' + (r.percent || 0) + '%;"></div></div><div style="font-size:11px;color:' + gray + ';margin-top:2px;">' + (r.count || 0) + ' vote' + (r.count !== 1 ? 's' : '') + '</div></div>';
      }).join('') +
      '<div style="text-align:center;margin-top:12px;"><a href="https://pollup.pages.dev/poll.html?p=' + slug + '" style="font-size:10px;color:' + gray + ';text-decoration:none;" target="_blank">Powered by PollUp</a>' +
      '<button class="pollup-report" style="margin-left:8px;">Report</button></div>';

    var reportBtn = container.querySelector('.pollup-report');
    updateReportBtn(reportBtn);
    reportBtn.addEventListener('click', async function() {
      var fp = await getFingerprint();
      var res = await fetch(API_BASE + '/public/poll/' + slug + '/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint: fp }) });
      var d = await res.json();
      if (d.success) { userReported = d.reported; currentReportCount = d.reportCount || 0; updateReportBtn(reportBtn); }
    });
  }

  loadPoll();
})();
