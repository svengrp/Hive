/* Expéditeur des emails : MAIL_FROM_EMAIL (alias Zoho, ex. no-reply@hive-app.ch), sinon MAIL_USER.
   MAIL_TRANSPORT=json : aucun envoi réel. */
const test = require('node:test');
const assert = require('node:assert');

process.env.MAIL_TRANSPORT = 'json';
const mailFrom = require('../utils/mailFrom');
const sendEmail = require('../utils/sendEmail');

test('expéditeur : alias MAIL_FROM_EMAIL et nom MAIL_FROM_NAME', (t) => {
  t.after(() => { delete process.env.MAIL_FROM_EMAIL; delete process.env.MAIL_FROM_NAME; delete process.env.MAIL_USER; });
  process.env.MAIL_USER = 'compte@example.com';
  process.env.MAIL_FROM_EMAIL = 'no-reply@hive-app.ch';
  process.env.MAIL_FROM_NAME = 'Hive';
  assert.strictEqual(mailFrom(), '"Hive" <no-reply@hive-app.ch>');

  delete process.env.MAIL_FROM_EMAIL;
  delete process.env.MAIL_FROM_NAME;
  assert.strictEqual(mailFrom(), '"Hive" <compte@example.com>', 'repli sur le compte SMTP');
});

test('sendEmail part bien de l\'alias', async (t) => {
  t.after(() => { delete process.env.MAIL_FROM_EMAIL; delete process.env.MAIL_USER; });
  process.env.MAIL_USER = 'compte@example.com';
  process.env.MAIL_FROM_EMAIL = 'no-reply@hive-app.ch';
  const info = await sendEmail({ to: 'lea@example.com', subject: 'Code', html: '<p>123456</p>' });
  const message = JSON.parse(info.message);
  assert.deepStrictEqual(message.from, { address: 'no-reply@hive-app.ch', name: 'Hive' });
});
