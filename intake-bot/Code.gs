/**
 * Opportunity Intake Bot
 * Monitors intake sheet for status changes, posts to Slack channel thread.
 * Auto-triages NEW rows, auto-scores Ready rows, captures thread replies.
 * Runs hourly via Apps Script time trigger.
 */

var CONFIG = {
  SPREADSHEET_ID: '1bYw6ise5wWpIrAviP5OTNdONIF0fVC5wIPPzKgHV900',
  CHANNEL_ID: 'C03TZK6G4P8',
  TABS: ['1/ Choice', '2/Experience', '3/Value', '4/Ecosystem & Growth', '5/Foundations', '6/No Related Bet'],
  COL: { NAME: 5, DESC: 6, STATUS: 7, IMPACT: 8, METRIC: 9, CUSTOMER: 10, DOCS: 11, DEPT: 12, SUBMITTER: 13, CBO: 14, TRIBE: 15, PO: 17 },
  SCORE_COL: { STRATEGIC: 20, CONFIDENCE: 21, PRIORITY: 22, TOTAL: 23, TIER: 24, RATIONALE: 25 },
  BOT_NAME: 'Intake Bot',
  BOT_ICON: ':clipboard:',
  STAKEHOLDERS: {
    '1/ Choice':            { cbo: 'Kedar Kulkarni',           tribe: 'Tony Fadel' },
    '2/Experience':         { cbo: 'Khee Lim',                 tribe: 'Rose Marsh' },
    '3/Value':              { cbo: 'Alvaro Martinez Espinosa',  tribe: 'Rose Marsh' },
    '4/Ecosystem & Growth': { cbo: 'Hussein Daher',            tribe: 'Emily Thomas' },
    '5/Foundations':        { cbo: 'Sofia Simoes de Almeida',   tribe: 'Sofia Simoes de Almeida' }
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN — run manually or on hourly trigger
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkIntakeStatuses() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('SLACK_BOT_TOKEN');
  if (!token) { Logger.log('ERROR: No SLACK_BOT_TOKEN. Run setup() first.'); return; }

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // Phase 0: check thread replies (writes notes to intake sheet)
  var state = JSON.parse(props.getProperty('BOT_STATE') || '{"rows":{},"userCache":{}}');
  if (!state.rows) state.rows = {};
  if (!state.userCache) state.userCache = {};
  var isBootstrapped = props.getProperty('BOOTSTRAPPED') === 'true';

  var repliesProcessed = 0;
  if (isBootstrapped) {
    repliesProcessed = checkThreadReplies_(ss, state, token);
  }

  // Phase 1: snapshot current statuses BEFORE triage changes anything
  var preTriageStatuses = {};
  CONFIG.TABS.forEach(function(tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 2) return;
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getValues();
    preTriageStatuses[tabName] = {};
    data.forEach(function(row) {
      var name = String(row[CONFIG.COL.NAME] || '').trim();
      var submitter = String(row[CONFIG.COL.SUBMITTER] || '').replace(/^@/, '').trim();
      if (!name || !submitter) return;
      preTriageStatuses[tabName][name + '|' + submitter] = String(row[CONFIG.COL.STATUS] || '').trim();
    });
  });

  // Phase 2: auto-triage + auto-score (skip during bootstrap)
  var triaged = 0;
  var scored = 0;
  if (isBootstrapped) {
    triaged = triageNewRows_(ss);
    scored = scoreReadyRows_(ss);
  }

  // Phase 3: detect status changes
  var changes = [];
  var totalRows = 0;

  CONFIG.TABS.forEach(function(tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 2) return;
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getValues();
    if (!state.rows[tabName]) state.rows[tabName] = {};

    data.forEach(function(row) {
      var name = String(row[CONFIG.COL.NAME] || '').trim();
      var status = String(row[CONFIG.COL.STATUS] || '').trim();
      var submitter = String(row[CONFIG.COL.SUBMITTER] || '').replace(/^@/, '').trim();
      if (!name || !submitter) return;
      totalRows++;

      var key = name + '|' + submitter;
      var prev = state.rows[tabName][key];
      var preTriageStatus = (preTriageStatuses[tabName] && preTriageStatuses[tabName][key]) || '';

      if (!prev) {
        state.rows[tabName][key] = { status: status, notified: null };
        if (isBootstrapped) {
          if (status && status.toUpperCase() !== 'NEW') {
            var initName = String(row[CONFIG.COL.NAME] || '').trim();
            var failReasons = (triageNewRows_.failReasons && triageNewRows_.failReasons[initName]) || [];
            changes.push({ tab: tabName, row: row, key: key, old: preTriageStatus || 'New', status: status, submitter: submitter, failReasons: failReasons });
          }
        }
      } else if (prev.status !== status && status) {
        var initName2 = String(row[CONFIG.COL.NAME] || '').trim();
        var failReasons2 = (triageNewRows_.failReasons && triageNewRows_.failReasons[initName2]) || [];
        changes.push({ tab: tabName, row: row, key: key, old: prev.status, status: status, submitter: submitter, failReasons: failReasons2 });
      }
    });
  });

  // Phase 4: post to channel thread for each change
  var sent = 0, failed = 0, skipped = 0;

  changes.forEach(function(c) {
    var userId = findSlackUser_(c.submitter, state, token);
    var msg = buildMessage_(c, userId);
    var existingEntry = state.rows[c.tab] && state.rows[c.tab][c.key] || {};
    var threadTs = existingEntry.threadTs || null;

    var newTs = postToChannel_(msg, token, threadTs);
    if (newTs) {
      state.rows[c.tab][c.key] = {
        status: c.status,
        notified: new Date().toISOString(),
        threadTs: threadTs || newTs,
        lastReplyCheck: null
      };
      sent++;
      Logger.log('Posted to channel re: "' + String(c.row[CONFIG.COL.NAME]).substring(0, 40) + '"');
    } else {
      failed++;
    }
  });

  state.lastRun = new Date().toISOString();
  props.setProperty('BOT_STATE', JSON.stringify(state));

  if (!isBootstrapped) {
    props.setProperty('BOOTSTRAPPED', 'true');
    Logger.log('BOOTSTRAP COMPLETE: Tracking ' + totalRows + ' rows. No messages sent.');
  } else {
    Logger.log('Done. Rows: ' + totalRows + ' | Changes: ' + changes.length +
               ' | Sent: ' + sent + ' | Skipped: ' + skipped + ' | Failed: ' + failed +
               ' | Triaged: ' + triaged + ' | Scored: ' + scored + ' | Replies: ' + repliesProcessed);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTO-TRIAGE: quality check + stakeholder assignment
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function triageNewRows_(ss) {
  var count = 0;
  triageNewRows_.failReasons = {};

  CONFIG.TABS.forEach(function(tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 2) return;
    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 18).getValues();

    data.forEach(function(row, idx) {
      var sheetRow = idx + 2;
      var name = String(row[CONFIG.COL.NAME] || '').trim();
      var status = String(row[CONFIG.COL.STATUS] || '').trim();
      if (!name) return;
      if (status && status.toUpperCase() !== 'NEW') return;
      // TEST MODE: only triage [TEST] rows — remove this line after E2E test
      if (name.indexOf('[TEST]') !== 0) return;

      var desc = String(row[CONFIG.COL.DESC] || '').trim();
      var impact = String(row[CONFIG.COL.IMPACT] || '').trim();
      var metric = String(row[CONFIG.COL.METRIC] || '').trim();
      var docs = String(row[CONFIG.COL.DOCS] || '').trim();

      var fails = [];
      if (desc.length < 50) fails.push('Description < 50 chars');
      if (!hasNumber_(impact)) fails.push('Impact has no quantified value');
      if (!hasMetric_(metric)) fails.push('Metric not named');
      if (docs === '') {
        fails.push('No related documents');
      } else if (!docs.match(/^http/i) && !docs.match(/\b(NA|N\/A|none|nil)\b/i)) {
        fails.push('Documents: no URL or NA');
      }

      var newStatus = fails.length === 0 ? 'Ready' : 'Needs Clarification';

      if (fails.length > 0) {
        triageNewRows_.failReasons[name] = fails;
      }

      sheet.getRange(sheetRow, 8).setValue(newStatus);

      var mapping = CONFIG.STAKEHOLDERS[tabName];
      if (mapping) {
        var currentCbo = String(row[CONFIG.COL.CBO] || '').trim();
        var currentTribe = String(row[CONFIG.COL.TRIBE] || '').trim();
        if (!currentCbo) sheet.getRange(sheetRow, 15).setValue(mapping.cbo);
        if (!currentTribe) sheet.getRange(sheetRow, 16).setValue(mapping.tribe);
      }

      count++;
      Logger.log('TRIAGE: "' + name.substring(0, 40) + '" → ' + newStatus +
                 (fails.length > 0 ? ' (' + fails.join(', ') + ')' : ''));
    });
  });

  return count;
}

function hasNumber_(text) {
  if (!text) return false;
  return /[\d]/.test(text) && !/^(NA|N\/A|nil|-|none)$/i.test(text.trim());
}

function hasMetric_(text) {
  if (!text) return false;
  var t = text.trim().toLowerCase();
  if (/^(-|nil|na|n\/a|yes|no|none)$/i.test(t)) return false;
  var keywords = ['gmv', 'mau', 'ncr', 'nmr', 'orders', 'revenue', 'conversion', 'ctr',
                  'retention', 'churn', 'frequency', 'arpu', 'aov', 'basket', 'sessions',
                  'dau', 'wau', 'ltv', 'cac', 'roas', 'take rate', 'contact rate',
                  'cancel', 'cr', 'cvr', 'gp', 'margin', 'vpd'];
  for (var i = 0; i < keywords.length; i++) {
    if (t.indexOf(keywords[i]) !== -1) return true;
  }
  return t.length > 2;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTO-SCORE: heuristic scoring for Ready rows
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function scoreReadyRows_(ss) {
  var count = 0;

  CONFIG.TABS.forEach(function(tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 2) return;
    var lastRow = sheet.getLastRow();

    var headers = sheet.getRange(1, 21, 1, 6).getValues()[0];
    if (!String(headers[0]).trim()) {
      sheet.getRange(1, 21, 1, 6).setValues([['Strategic Impact', 'Confidence Level', 'Business Priority', 'Total Score', 'Tier', 'Score Rationale']]);
    }

    var data = sheet.getRange(2, 1, lastRow - 1, 26).getValues();

    data.forEach(function(row, idx) {
      var sheetRow = idx + 2;
      var name = String(row[CONFIG.COL.NAME] || '').trim();
      var status = String(row[CONFIG.COL.STATUS] || '').trim();
      var alreadyScored = String(row[CONFIG.SCORE_COL.STRATEGIC] || '').trim();
      if (!name) return;
      if (status.toLowerCase() !== 'ready') return;
      if (alreadyScored) return;

      var impact = String(row[CONFIG.COL.IMPACT] || '').trim();
      var desc = String(row[CONFIG.COL.DESC] || '').trim();
      var docs = String(row[CONFIG.COL.DOCS] || '').trim();

      var strategic = scoreStrategicImpact_(impact);
      var confidence = scoreConfidence_(impact, docs);
      var priority = scorePriority_(desc);
      var total = Math.round((strategic * 0.5 + confidence * 0.3 + priority * 0.2) * 10) / 10;
      var tier = total >= 4.0 ? 'Prioritize' : (total >= 2.5 ? 'Discuss' : 'Defer');
      var rationale = buildRationale_(strategic, confidence, priority, impact, docs);

      sheet.getRange(sheetRow, 21, 1, 6).setValues([[strategic, confidence, priority, total, tier, rationale]]);
      count++;
      Logger.log('SCORE: "' + name.substring(0, 40) + '" → ' + total + '/5.0 (' + tier + ')');
    });
  });

  return count;
}

function scoreStrategicImpact_(impact) {
  var num = extractLargestNumber_(impact);
  if (num === null) return 1;
  if (num >= 15000000) return 5;
  if (num >= 7000000) return 4;
  if (num >= 3000000) return 3;
  if (num >= 1000000) return 2;
  return 1;
}

function scoreConfidence_(impact, docs) {
  var score = 2;
  if (docs && /^http/i.test(docs)) score = 3;
  var lower = impact.toLowerCase();
  if (/\b(validated|data|test|a\/b|proven|measured)\b/.test(lower)) score = Math.min(score + 1, 5);
  if (/\b(business case|bc|financial model)\b/.test(lower)) score = Math.min(score + 1, 5);
  return score;
}

function scorePriority_(desc) {
  var lower = desc.toLowerCase();
  if (/\b(compliance|regulatory|legal|gdpr|pci)\b/.test(lower)) return 5;
  if (/\b(all markets|multi.?market|regional|cross.?country)\b/.test(lower)) return 4;
  if (/\b(cross.?functional|multiple teams)\b/.test(lower)) return 4;
  if (/\b(one market|single market)\b/.test(lower)) return 3;
  return 3;
}

function extractLargestNumber_(text) {
  if (!text) return null;
  var millions = text.match(/[\d,.]+\s*[Mm]/g);
  if (millions) {
    var nums = millions.map(function(m) { return parseFloat(m.replace(/[,\s]/g, '')) * 1000000; });
    return Math.max.apply(null, nums);
  }
  var billions = text.match(/[\d,.]+\s*[Bb]/g);
  if (billions) {
    var nums2 = billions.map(function(m) { return parseFloat(m.replace(/[,\s]/g, '')) * 1000000000; });
    return Math.max.apply(null, nums2);
  }
  var plain = text.match(/[\d,]+/g);
  if (plain) {
    var nums3 = plain.map(function(m) { return parseFloat(m.replace(/,/g, '')); });
    return Math.max.apply(null, nums3);
  }
  return null;
}

function buildRationale_(strategic, confidence, priority, impact, docs) {
  var parts = [];
  if (strategic >= 4) parts.push('Strong quantified impact');
  else if (strategic <= 2) parts.push('Limited/no quantified impact');
  else parts.push('Moderate impact');

  if (confidence >= 4) parts.push('solid evidence');
  else if (confidence <= 2) parts.push('no supporting data');
  else parts.push('some documentation');

  if (priority >= 4) parts.push('broad scope');
  else parts.push('focused scope');

  return parts.join(', ');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// THREAD REPLY CAPTURE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkThreadReplies_(ss, state, token) {
  var count = 0;

  CONFIG.TABS.forEach(function(tabName) {
    if (!state.rows[tabName]) return;
    var sheet = ss.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 2) return;
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getValues();

    Object.keys(state.rows[tabName]).forEach(function(key) {
      var entry = state.rows[tabName][key];
      if (!entry.threadTs) return;

      var replies = readThreadReplies_(entry.threadTs, token, entry.lastReplyCheck || entry.notified);
      if (replies.length === 0) return;

      var initName = key.split('|')[0];
      for (var r = 0; r < data.length; r++) {
        var rowName = String(data[r][CONFIG.COL.NAME] || '').trim();
        if (rowName === initName) {
          var sheetRow = r + 2;
          var existingNote = sheet.getRange(sheetRow, 8).getNote() || '';

          replies.forEach(function(reply) {
            var timestamp = new Date(parseFloat(reply.ts) * 1000).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' });
            var userName = reply.userName || reply.user;
            existingNote = (existingNote ? existingNote + '\n---\n' : '') +
                          '[Slack reply by ' + userName + ' — ' + timestamp + ']\n' + reply.text;
          });

          sheet.getRange(sheetRow, 8).setNote(existingNote);
          count += replies.length;
          Logger.log('REPLY captured for "' + initName.substring(0, 40) + '" (' + replies.length + ' replies)');
          break;
        }
      }

      entry.lastReplyCheck = replies[replies.length - 1].ts;
    });
  });

  return count;
}

function readThreadReplies_(threadTs, token, sinceTs) {
  var url = 'https://slack.com/api/conversations.replies?channel=' + CONFIG.CHANNEL_ID +
            '&ts=' + threadTs + '&limit=50';
  if (sinceTs) url += '&oldest=' + sinceTs;

  var resp = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  var data = JSON.parse(resp.getContentText());
  if (!data.ok) {
    Logger.log('conversations.replies error: ' + data.error);
    return [];
  }

  return data.messages.filter(function(m) {
    return m.ts !== threadTs && !m.bot_id && !m.subtype;
  }).map(function(m) {
    return { user: m.user, text: m.text, ts: m.ts, userName: m.user };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SLACK: post to channel (optionally in thread)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function postToChannel_(text, token, threadTs) {
  var payload = {
    channel: CONFIG.CHANNEL_ID,
    text: text,
    username: CONFIG.BOT_NAME,
    icon_emoji: CONFIG.BOT_ICON,
    unfurl_links: false
  };
  if (threadTs) payload.thread_ts = threadTs;

  var resp = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var data = JSON.parse(resp.getContentText());
  if (!data.ok) {
    Logger.log('postMessage error: ' + data.error);
    return null;
  }
  return data.ts;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SLACK: find user by real_name or display_name
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function findSlackUser_(name, state, token) {
  if (state.userCache[name]) return state.userCache[name];
  var nameLower = name.toLowerCase();
  var cursor = '';

  do {
    var url = 'https://slack.com/api/users.list?limit=200' +
              (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    var resp = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    var data = JSON.parse(resp.getContentText());
    if (!data.ok) { Logger.log('users.list error: ' + data.error); return null; }

    for (var i = 0; i < data.members.length; i++) {
      var m = data.members[i];
      if (m.deleted || m.is_bot) continue;
      var real = (m.real_name || '').toLowerCase();
      var display = (m.profile && m.profile.display_name || '').toLowerCase();
      if (real === nameLower || display === nameLower) {
        state.userCache[name] = m.id;
        return m.id;
      }
    }
    cursor = (data.response_metadata && data.response_metadata.next_cursor) || '';
  } while (cursor);

  Logger.log('User not found: ' + name);
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MESSAGE TEMPLATES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildMessage_(c, userId) {
  var r = c.row;
  var name = String(r[CONFIG.COL.NAME] || '').trim();
  var desc = String(r[CONFIG.COL.DESC] || '').trim();
  var impact = String(r[CONFIG.COL.IMPACT] || '').trim();
  var cbo = String(r[CONFIG.COL.CBO] || '').trim() || '—';
  var tribe = String(r[CONFIG.COL.TRIBE] || '').trim() || '—';
  var po = String(r[CONFIG.COL.PO] || '').trim() || '—';
  var tab = c.tab;
  var old = c.old || 'New';
  var s = c.status.toLowerCase();
  var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID + '/edit';
  var mention = userId ? '<@' + userId + '>' : c.submitter;

  // ── Accepted ──
  if (s.includes('accepted')) {
    return ':tada: *Initiative accepted!*\n\n' +
      '`' + name + '`\n' +
      '_Bet: ' + tab + '_ | Submitter: ' + mention + '\n\n' +
      ':busts_in_silhouette: *Assigned team*\n' +
      '• Product Owner: ' + po + '\n' +
      '• Product Tribe: ' + tribe + '\n' +
      '• CBO: ' + cbo + '\n\n' +
      ':arrow_forward: The product owner will reach out to kick off scoping.';
  }

  // ── Rejected ──
  if (s.includes('rejected')) {
    return ':no_entry_sign: *Initiative not moving forward this cycle*\n\n' +
      '`' + name + '`\n' +
      '_Bet: ' + tab + '_ | Submitter: ' + mention + '\n\n' +
      'This doesn\'t mean the idea isn\'t valuable — it may be revisited in a future cycle.\n\n' +
      ':speech_balloon: For context on the decision, reach out to *' + cbo + '*.';
  }

  // ── Needs Clarification ──
  if (s.includes('needs') || s.includes('clarification')) {
    var descSnippet = desc.substring(0, 150) + (desc.length > 150 ? '...' : '');
    var impactSnippet = impact.substring(0, 150) + (impact.length > 150 ? '...' : '');
    var msg = ':rotating_light: *Action needed* — ' + mention + ', your submission needs additional information\n\n' +
      '`' + name + '`\n' +
      '_Bet: ' + tab + '_\n\n' +
      ':memo: *What you submitted*\n' +
      '> ' + descSnippet + '\n' +
      '> _Impact: ' + impactSnippet + '_\n\n';

    var reasons = c.failReasons || [];
    if (reasons.length > 0) {
      msg += ':warning: *What\'s missing*\n';
      var friendlyLabels = {
        'Description < 50 chars': 'Description is too short — please add more detail about the initiative (at least 50 characters)',
        'Impact has no quantified value': 'Impact needs a quantified value (e.g. estimated GMV, revenue, or % lift)',
        'Metric not named': 'Metric field needs a specific metric name (e.g. GMV, MAU, conversion rate)',
        'No related documents': 'No business case or supporting document attached — please add a link to your BC/PRD',
        'Documents: no URL or NA': 'Documents field should contain a URL to your business case or "NA" if not applicable'
      };
      reasons.forEach(function(r) {
        msg += '• ' + (friendlyLabels[r] || r) + '\n';
      });
      msg += '\n';
    }

    msg += ':point_right: Please reply in this thread with the updated info, or update directly in the <' + sheetUrl + '|Intake Sheet>.';
    return msg;
  }

  // ── Ready ──
  if (s === 'ready' || s.includes('ready for review')) {
    return ':inbox_tray: *Initiative queued for review*\n\n' +
      '`' + name + '`\n' +
      '_Bet: ' + tab + '_ | Submitter: ' + mention + '\n\n' +
      '• CBO: ' + cbo + '\n' +
      '• Product Tribe: ' + tribe + '\n\n' +
      'You\'ll be notified in this thread when the review kicks off.';
  }

  // ── Product Review ──
  if (s.includes('product review')) {
    return ':microscope: *Initiative is in product review*\n\n' +
      '`' + name + '`\n' +
      '_Bet: ' + tab + '_ | Submitter: ' + mention + '\n\n' +
      ':busts_in_silhouette: *Reviewing*\n' +
      '• Product Owner: ' + po + '\n' +
      '• Product Tribe: ' + tribe + '\n\n' +
      'We\'ll post here when a decision is reached.';
  }

  // ── Backlog ──
  if (s === 'backlog') {
    return ':file_folder: *Initiative added to backlog*\n\n' +
      '`' + name + '`\n' +
      '_Bet: ' + tab + '_ | Submitter: ' + mention + '\n\n' +
      'Added to the backlog for consideration in a future cycle.\n\n' +
      ':speech_balloon: Questions? Reach out to *' + cbo + '*.';
  }

  // ── Generic fallback ──
  return ':arrows_counterclockwise: *Status update*\n\n' +
    '`' + name + '`\n' +
    '_Bet: ' + tab + '_ | Submitter: ' + mention + '\n\n' +
    '• Previous status: ' + old + '\n' +
    '• New status: *' + c.status + '*\n\n' +
    ':speech_balloon: Questions? Reach out to *' + cbo + '*.';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETUP — run once
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setup() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SLACK_BOT_TOKEN', 'YOUR_SLACK_BOT_TOKEN_HERE');
  props.setProperty('BOT_STATE', JSON.stringify({
    rows: {},
    userCache: {
      'Sakshi Singhal': 'U07N4V8QJ8P',
      'Miriam Velloso': 'U09G7FJ7PHR',
      'Noha Bashtar': 'ULAJ1EMRC',
      'Menna Walied': 'U074US3455E',
      'Shaheem Rafeeque': 'U04D1G8F6QJ',
      'Mohamed Atef': 'U051CEM5C9K'
    }
  }));
  props.deleteProperty('BOOTSTRAPPED');
  Logger.log('Setup complete. Now run checkIntakeStatuses() for bootstrap.');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRIGGERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'checkIntakeStatuses') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkIntakeStatuses').timeBased().everyHours(1).create();
  Logger.log('Hourly trigger created.');
}

function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'checkIntakeStatuses') ScriptApp.deleteTrigger(t);
  });
  Logger.log('All triggers removed.');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST — post a test message to the channel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testChannelPost() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('SLACK_BOT_TOKEN');
  if (!token) { Logger.log('No token. Run setup() first.'); return; }
  var ts = postToChannel_(
    ':robot_face: *Intake Bot is live!*\n\nThis is a test message. If you see this in the channel, the bot is working!',
    token, null);
  Logger.log(ts ? 'Test posted! ts=' + ts : 'Test post failed — check logs.');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESET — clear state (re-bootstrap)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function resetState() {
  var props = PropertiesService.getScriptProperties();
  var state = JSON.parse(props.getProperty('BOT_STATE') || '{}');
  var cache = state.userCache || {};
  props.setProperty('BOT_STATE', JSON.stringify({ rows: {}, userCache: cache }));
  props.deleteProperty('BOOTSTRAPPED');
  Logger.log('State reset. User cache preserved. Next run = bootstrap.');
}
