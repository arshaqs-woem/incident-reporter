const db = require('../../lib/db');

const CONTACTS = {
  hr:          { name: 'HR Department',    phone: process.env.HR_PHONE      || 'on file', email: 'hr@inspireworks.com' },
  safety:      { name: 'Safety Officer',   phone: process.env.MANAGER_PHONE || 'on file', email: 'safety@inspireworks.com' },
  facilities:  { name: 'Facilities Team',  phone: process.env.MANAGER_PHONE || 'on file', email: 'facilities@inspireworks.com' },
  security:    { name: 'Security / IT',    phone: process.env.MANAGER_PHONE || 'on file', email: 'security@inspireworks.com' },
  general:     { name: 'General Manager',  phone: process.env.MANAGER_PHONE || 'on file', email: 'manager@inspireworks.com' }
};

module.exports = async function(req, res) {
  const start = Date.now();
  const { department } = req.body;

  const key = (department || 'general').toLowerCase().replace(/\s+/g, '');
  const contact = CONTACTS[key] || CONTACTS.general;

  const output = {
    department: department || 'general',
    hr_contact: CONTACTS.hr,
    department_contact: contact,
    note: 'Notifications will be sent automatically when the incident is logged.'
  };

  const recentCall = await db.query(
    `SELECT call_id FROM call_logs WHERE call_status = 'in_progress' ORDER BY call_start_time DESC LIMIT 1`
  ).catch(() => ({ rows: [] }));
  const callId = recentCall.rows[0]?.call_id || 'unknown';

  db.saveToolCall({ callId, toolName: 'get_department_contacts', inputParams: req.body, outputResult: output, executionTimeMs: Date.now() - start, success: true }).catch(() => {});

  console.log(`[TOOL] get_department_contacts → ${department}`);
  return res.json(output);
};
