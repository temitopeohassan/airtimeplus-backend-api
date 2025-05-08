// index.js

const express = require('express');
const mongoose = require('mongoose');
const twilio = require('twilio');
const fetch = require('node-fetch');
const UserInfo = require('./models/UserInfo');
const servicesData = require('./data.json'); // Import JSON data
require('dotenv').config();

const app = express();
app.use(express.json()); // Parse JSON bodies

// Debug environment variables
console.log('Environment variables loaded:', {
  mongoDbUri: process.env.MONGODB_URI ? 'Set' : 'Not set',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set',
});

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI;
console.log('Attempting to connect to MongoDB...');

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected successfully');
}).catch(err => {
  console.error('MongoDB connection error details:', err);
});

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Root route
app.get('/', (req, res) => {
  res.send('<h1>AirtimePlus Backend API Server Is Running</h1>');
});

// ✅ Services Data Endpoint
app.get('/services-data', (req, res) => {
  res.json(servicesData);
});

// Twilio: Create verify service
app.get('/create-service', async (req, res) => {
  try {
    const service = await client.verify.v2.services.create({
      friendlyName: 'My First Verify Service',
    });
    res.json({ sid: service.sid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Twilio: Send verification code
app.post('/send-verification', async (req, res) => {
  const { to } = req.body;
  try {
    const verification = await client.verify.v2
      .services(process.env.VERIFY_SERVICE_SID)
      .verifications.create({ channel: 'sms', to });
    res.json({ status: verification.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Twilio: Check verification code
app.post('/check-verification', async (req, res) => {
  const { to, code } = req.body;
  try {
    const verificationCheck = await client.verify.v2
      .services(process.env.VERIFY_SERVICE_SID)
      .verificationChecks.create({ to, code });
    res.json({ status: verificationCheck.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reloadly: Send airtime top-up
app.post('/send-topup', async (req, res) => {
  const { operatorId, amount, recipientPhone, senderPhone, recipientEmail } = req.body;

  const url = 'https://topups-sandbox.reloadly.com/topups';
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/com.reloadly.topups-v1+json',
      Authorization: `Bearer ${process.env.RELOADLY_AUTH_TOKEN}`
    },
    body: JSON.stringify({
      operatorId: operatorId || '535',
      amount: amount || '5.00',
      useLocalAmount: true,
      customIdentifier: 'This is example identifier 130',
      recipientEmail: recipientEmail || 'peter@nauta.com.cu',
      recipientPhone: recipientPhone || { countryCode: 'GB', number: '447951731337' },
      senderPhone: senderPhone || { countryCode: 'CA', number: '11231231231' }
    })
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Store or update user info
app.post('/submit-user-info', async (req, res) => {
  const { operatorId, recipientEmail, recipientPhone, senderPhone, walletAddress } = req.body;

  try {
    let userInfo = await UserInfo.findOne({ walletAddress: walletAddress.toLowerCase() });

    if (userInfo) {
      userInfo.operatorId = operatorId;
      userInfo.recipientEmail = recipientEmail;
      userInfo.recipientPhone = recipientPhone;
      userInfo.senderPhone = senderPhone;
      await userInfo.save();
    } else {
      userInfo = await UserInfo.create({
        walletAddress: walletAddress.toLowerCase(),
        operatorId,
        recipientEmail,
        recipientPhone,
        senderPhone
      });
    }

    res.status(201).json({ message: 'User info saved', userInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all user info
app.get('/user-info', async (req, res) => {
  try {
    const users = await UserInfo.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user info by wallet address
app.get('/user-info/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const user = await UserInfo.findOne({ walletAddress: walletAddress.toLowerCase() });
    res.json(user || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
