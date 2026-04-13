function buildHrMessage(id, severity, type, inc, notifyManager) {
  if (type === 'maintenance' && severity === 'LOW') {
    return `[InspireWorks] Maintenance needed #${id}: ${inc.what} at ${inc.where_it_happened}. Please action.`;
  }
  if (type === 'safety') {
    let msg = `[InspireWorks] SAFETY INCIDENT #${id} (${severity})\nWhat: ${inc.what}\nWhere: ${inc.where_it_happened}`;
    if (inc.when_it_happened) msg += `\nWhen: ${inc.when_it_happened}`;
    if (inc.injured && inc.injured.toLowerCase() !== 'none') msg += `\nInjured: ${inc.injured}`;
    if (inc.witnesses) msg += `\nWitnesses: ${inc.witnesses}`;
    msg += `\nManager notified: ${notifyManager ? 'Yes' : 'No'}`;
    return msg;
  }
  if (type === 'interpersonal') {
    let msg = `[InspireWorks] INTERPERSONAL REPORT #${id} (${severity})\nDetails: ${inc.what}\nLocation: ${inc.where_it_happened}`;
    if (inc.when_it_happened) msg += `\nWhen: ${inc.when_it_happened}`;
    if (inc.witnesses) msg += `\nInvolved/Witnesses: ${inc.witnesses}`;
    msg += `\nManager notified: ${notifyManager ? 'Yes' : 'No'}`;
    msg += `\nHandle with confidentiality.`;
    return msg;
  }
  if (type === 'security') {
    let msg = `[InspireWorks] SECURITY INCIDENT #${id} (${severity})\nWhat: ${inc.what}\nWhere: ${inc.where_it_happened}`;
    if (inc.when_it_happened) msg += `\nDetected: ${inc.when_it_happened}`;
    msg += `\nManager notified: ${notifyManager ? 'Yes' : 'No'}`;
    msg += `\nReview immediately.`;
    return msg;
  }
  let msg = `[InspireWorks] Maintenance Issue #${id} (${severity})\nWhat: ${inc.what}\nWhere: ${inc.where_it_happened}`;
  if (inc.when_it_happened) msg += `\nWhen: ${inc.when_it_happened}`;
  return msg;
}

function buildManagerMessage(id, severity, type, inc) {
  if (type === 'maintenance' && severity === 'LOW') return null;
  if (type === 'safety') {
    let msg = `[InspireWorks] Action required — Safety Incident #${id} (${severity})\n${inc.what} at ${inc.where_it_happened}`;
    if (inc.injured && inc.injured.toLowerCase() !== 'none') msg += `\nInjury reported: ${inc.injured}`;
    return msg;
  }
  if (type === 'interpersonal') {
    return `[InspireWorks] Interpersonal matter #${id} reported in your team. Please contact HR before taking any action. Details shared with HR.`;
  }
  if (type === 'security') {
    return `[InspireWorks] Security incident #${id} (${severity}) — ${inc.what} at ${inc.where_it_happened}. Coordinate with HR immediately.`;
  }
  return `[InspireWorks] Incident #${id} (${severity}) needs attention: ${inc.what} at ${inc.where_it_happened}.`;
}

module.exports = { buildHrMessage, buildManagerMessage };
