const db = require('../db');

// Department contact directory (stored in DB, seeded below as fallback)
const DEFAULT_CONTACTS = {
  engineering: { hr: process.env.HR_PHONE, manager: process.env.MANAGER_PHONE, hr_name: 'HR Team', manager_name: 'Engineering Manager' },
  sales:       { hr: process.env.HR_PHONE, manager: process.env.MANAGER_PHONE, hr_name: 'HR Team', manager_name: 'Sales Manager' },
  operations:  { hr: process.env.HR_PHONE, manager: process.env.MANAGER_PHONE, hr_name: 'HR Team', manager_name: 'Operations Manager' },
  general:     { hr: process.env.HR_PHONE, manager: process.env.MANAGER_PHONE, hr_name: 'HR Team', manager_name: 'Department Manager' }
};

async function getContacts(req, res) {
  const start = Date.now();
  const uvCallId = req.headers['x-ultravox-call-id'] || 'unknown';
  const callId = uvCallId;

  const { department } = req.body;
  const key = (department || 'general').toLowerCase();
  const contacts = DEFAULT_CONTACTS[key] || DEFAULT_CONTACTS['general'];

  await db.saveToolCall({
    callId,
    toolName: 'get_department_contacts',
    inputParams: req.body,
    outputResult: { hr_name: contacts.hr_name, manager_name: contacts.manager_name, department: key },
    executionTimeMs: Date.now() - start,
    success: true
  });

  console.log(`[TOOL] get_department_contacts → ${key}: HR=${contacts.hr_name}, Manager=${contacts.manager_name}`);

  return res.json({
    department: key,
    hr_contact: contacts.hr_name,
    manager_contact: contacts.manager_name,
    note: `HR is always notified. Manager is notified only with employee consent.`
  });
}

module.exports = { getContacts };
