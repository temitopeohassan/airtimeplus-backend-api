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
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'https://airtimeplus-miniapp.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'],
  credentials: true
}));

app.use(express.json()); // Parse JSON bodies

// Validate required environment variables
const requiredEnvVars = {
  RELOADLY_CLIENT_ID: process.env.RELOADLY_CLIENT_ID,
  RELOADLY_CLIENT_SECRET: process.env.RELOADLY_CLIENT_SECRET,
  MONGODB_URI: process.env.MONGODB_URI,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN
};

// Check for missing environment variables
const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// Log environment variables status (without exposing values)
console.log('✅ Environment variables loaded:', {
  RELOADLY_CLIENT_ID: requiredEnvVars.RELOADLY_CLIENT_ID ? '✓ Set' : '✗ Missing',
  RELOADLY_CLIENT_SECRET: requiredEnvVars.RELOADLY_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
  MONGODB_URI: requiredEnvVars.MONGODB_URI ? '✓ Set' : '✗ Missing',
  TWILIO_ACCOUNT_SID: requiredEnvVars.TWILIO_ACCOUNT_SID ? '✓ Set' : '✗ Missing',
  TWILIO_AUTH_TOKEN: requiredEnvVars.TWILIO_AUTH_TOKEN ? '✓ Set' : '✗ Missing'
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

// Reloadly: Get fresh authentication token
async function getReloadlyToken() {
  if (!process.env.RELOADLY_CLIENT_ID || !process.env.RELOADLY_CLIENT_SECRET) {
    throw new Error('Reloadly credentials are not properly configured');
  }

  const url = 'https://auth.reloadly.com/oauth/token';
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.RELOADLY_CLIENT_ID,
      client_secret: process.env.RELOADLY_CLIENT_SECRET,
      grant_type: 'client_credentials',
      audience: 'https://topups-sandbox.reloadly.com'
    })
  };

  try {
    console.log('🔄 Getting fresh authentication token from Reloadly...');
    
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Reloadly authentication failed:', {
        status: response.status,
        statusText: response.statusText,
        error: data
      });
      throw new Error(`Authentication failed: ${data.message || 'Unknown error'}`);
    }

    if (!data.access_token) {
      console.error('❌ No access token in response:', data);
      throw new Error('No access token received from Reloadly');
    }

    console.log('✅ Reloadly authentication successful');
    return data.access_token;
  } catch (err) {
    console.error('❌ Error getting Reloadly authentication token:', err.message);
    throw err;
  }
}

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

  try {
    // Get fresh authentication token
    const accessToken = await getReloadlyToken();
    if (!accessToken) {
      throw new Error('Failed to get authentication token');
    }

    const url = 'https://topups-sandbox.reloadly.com/topups';
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/com.reloadly.topups-v1+json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        operatorId,
        amount,
        useLocalAmount: true,
        recipientEmail,
        recipientPhone: {
          countryCode: 'NG',
          number: recipientPhone
        },
        senderPhone: {
          countryCode: 'NG',
          number: senderPhone
        }
      })
    };

    console.log('🔄 Sending request to Reloadly API...');
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Reloadly API error:', {
        status: response.status,
        statusText: response.statusText,
        error: data
      });
      throw new Error(data.message || 'Failed to process topup');
    }

    console.log('✅ Reloadly API response:', JSON.stringify(data, null, 2));
    res.json(data);
  } catch (err) {
    console.error('❌ Error processing top-up:', err.message);
    res.status(500).json({ 
      error: 'Failed to process topup',
      details: err.message 
    });
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
