const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Load your OAuth2 credentials
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_id, client_secret, redirect_uris } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

// You must manually generate and store a refresh token once
// Set refresh token from a safe place (e.g., env variable or JSON file)
oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

async function sendTopUpEmail(details) {
  const accessToken = await oAuth2Client.getAccessToken();

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: 'imagic.studio.2@gmail.com',
      clientId: client_id,
      clientSecret: client_secret,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken.token
    }
  });

  const mailOptions = {
    from: 'Top-Up Service <imagic.studio.2@gmail.com>',
    to: 'imagic.studio.2@gmail.com',
    subject: '✅ Top-Up Successful',
    html: `
      <h3>Top-Up Details</h3>
      <ul>
        <li><strong>Operator ID:</strong> ${details.operatorId}</li>
        <li><strong>Amount:</strong> ${details.amount}</li>
        <li><strong>Recipient Phone:</strong> ${details.recipientPhone}</li>
        <li><strong>Sender Phone:</strong> ${details.senderPhone}</li>
        <li><strong>Recipient Email:</strong> ${details.recipientEmail}</li>
        <li><strong>Transaction ID:</strong> ${details.transactionId}</li>
      </ul>
    `
  };

  const result = await transport.sendMail(mailOptions);
  return result;
}

module.exports = { sendTopUpEmail };
