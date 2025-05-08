// index.js

const express = require('express');
const mongoose = require('mongoose');
const twilio = require('twilio');
const cors = require('cors');
const fetch = require('node-fetch');
const UserInfo = require('./models/UserInfo');
const servicesData = require('./data.json'); // Import JSON data
require('dotenv').config();

const app = express();

// Configure CORS with specific options
app.use(cors({
  origin: ['http://localhost:3000', 'https://airtimeplus-miniapp.vercel.app/'], // Add your frontend URLs
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

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
  console.log('📡 GET / - Root endpoint called');
  res.send('<h1>AirtimePlus Backend API Server Is Running</h1>');
});

// ✅ Services Data Endpoint
app.get('/services-data', (req, res) => {
  console.log('📡 GET /services-data - Services data requested');
  console.log('📦 Response data:', JSON.stringify(servicesData, null, 2));
  res.json(servicesData);
});

// Twilio: Create verify service
app.get('/create-service', async (req, res) => {
  console.log('📡 GET /create-service - Creating verify service');
  try {
    const service = await client.verify.v2.services.create({
      friendlyName: 'My First Verify Service',
    });
    console.log('✅ Verify service created:', service.sid);
    res.json({ sid: service.sid });
  } catch (err) {
    console.error('❌ Error creating verify service:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Twilio: Send verification code
app.post('/send-verification', async (req, res) => {
  const { to } = req.body;
  console.log('📡 POST /send-verification - Sending verification to:', to);
  try {
    const verification = await client.verify.v2
      .services(process.env.VERIFY_SERVICE_SID)
      .verifications.create({ channel: 'sms', to });
    console.log('✅ Verification sent:', verification.status);
    res.json({ status: verification.status });
  } catch (err) {
    console.error('❌ Error sending verification:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Twilio: Check verification code
app.post('/check-verification', async (req, res) => {
  const { to, code } = req.body;
  console.log('📡 POST /check-verification - Checking verification for:', to);
  try {
    const verificationCheck = await client.verify.v2
      .services(process.env.VERIFY_SERVICE_SID)
      .verificationChecks.create({ to, code });
    console.log('✅ Verification check result:', verificationCheck.status);
    res.json({ status: verificationCheck.status });
  } catch (err) {
    console.error('❌ Error checking verification:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reloadly: Send airtime top-up
app.post('/send-topup', async (req, res) => {
  const { operatorId, amount, recipientPhone, senderPhone, recipientEmail } = req.body;
  console.log('📡 POST /send-topup - Processing top-up request');
  console.log('📦 Request data:', {
    operatorId,
    amount,
    recipientPhone,
    senderPhone,
    recipientEmail
  });

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
    console.log('🔄 Sending request to Reloadly API...');
    const response = await fetch(url, options);
    const data = await response.json();
    console.log('✅ Reloadly API response:', JSON.stringify(data, null, 2));
    res.json(data);
  } catch (err) {
    console.error('❌ Error processing top-up:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Store or update user info
app.post('/submit-user-info', async (req, res) => {
  const { operatorId, recipientEmail, recipientPhone, senderPhone, walletAddress } = req.body;
  console.log('📡 POST /submit-user-info - Processing user info submission');
  console.log('📦 Request data:', {
    operatorId,
    recipientEmail,
    recipientPhone,
    senderPhone,
    walletAddress
  });

  try {
    let userInfo = await UserInfo.findOne({ walletAddress: walletAddress.toLowerCase() });

    if (userInfo) {
      console.log('📝 Updating existing user info for wallet:', walletAddress);
      userInfo.operatorId = operatorId;
      userInfo.recipientEmail = recipientEmail;
      userInfo.recipientPhone = recipientPhone;
      userInfo.senderPhone = senderPhone;
      await userInfo.save();
    } else {
      console.log('📝 Creating new user info for wallet:', walletAddress);
      userInfo = await UserInfo.create({
        walletAddress: walletAddress.toLowerCase(),
        operatorId,
        recipientEmail,
        recipientPhone,
        senderPhone
      });
    }

    console.log('✅ User info saved successfully');
    res.status(201).json({ message: 'User info saved', userInfo });
  } catch (err) {
    console.error('❌ Error saving user info:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get all user info
app.get('/user-info', async (req, res) => {
  console.log('📡 GET /user-info - Fetching all user info');
  try {
    const users = await UserInfo.find().sort({ createdAt: -1 });
    console.log(`✅ Found ${users.length} users`);
    res.json(users);
  } catch (err) {
    console.error('❌ Error fetching user info:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get user info by wallet address
app.get('/user-info/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;
  console.log('📡 GET /user-info/:walletAddress - Fetching user info for wallet:', walletAddress);
  try {
    const user = await UserInfo.findOne({ walletAddress: walletAddress.toLowerCase() });
    console.log('✅ User info found:', user ? 'Yes' : 'No');
    res.json(user || null);
  } catch (err) {
    console.error('❌ Error fetching user info:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});
