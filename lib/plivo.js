const plivo = require('plivo');

const client = new plivo.Client(
  process.env.PLIVO_AUTH_ID,
  process.env.PLIVO_AUTH_TOKEN
);

async function sendSms(to, text) {
  return client.messages.create({
    src: process.env.PLIVO_NUMBER,
    dst: to,
    text
  });
}

module.exports = { sendSms };
