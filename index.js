// index.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');
const UserInfo = require('./models/UserInfo');
const servicesData = require('./data.json');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = {
  API_CLIENT_ID: process.env.API_CLIENT_ID,
  API_CLIENT_SECRET: process.env.API_CLIENT_SECRET,
  MONGODB_URI: process.env.MONGODB_URI
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
  API_CLIENT_ID: requiredEnvVars.API_CLIENT_ID ? '✓ Set' : '✗ Missing',
  API_CLIENT_SECRET: requiredEnvVars.API_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
  MONGODB_URI: requiredEnvVars.MONGODB_URI ? '✓ Set' : '✗ Missing'
});

const app = express();

// Configure CORS with specific options
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'https://airtimeplus-app.vercel.app',
    'https://airtimeplus.xyz',
    'https://airtimeplus-miniapp.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: false,
  maxAge: 86400
}));

app.use(express.json()); // Parse JSON bodies

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

// Get fresh authentication token
async function getReloadlyToken() {
  if (!process.env.API_CLIENT_ID || !process.env.API_CLIENT_SECRET) {
    throw new Error('API credentials are not properly configured');
  }

  const url = 'https://auth.reloadly.com/oauth/token';
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.API_CLIENT_ID,
      client_secret: process.env.API_CLIENT_SECRET,
      grant_type: 'client_credentials',
      audience: 'https://topups.reloadly.com'
    })
  };

  try {
    console.log('🔄 Getting fresh authentication token...');
    
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Authentication failed:', {
        status: response.status,
        statusText: response.statusText,
        error: data
      });
      throw new Error(`Authentication failed: ${data.message || 'Unknown error'}`);
    }

    if (!data.access_token) {
      console.error('❌ No access token in response:', data);
      throw new Error('No access token received');
    }

    console.log('✅ Authentication successful');
    return data.access_token;
  } catch (err) {
    console.error('❌ Error getting authentication token:', err.message);
    throw err;
  }
}

// Send airtime top-up
app.post('/send-topup', async (req, res) => {
  const { operatorId, amount, recipientPhone, senderPhone, recipientEmail, countryCode } = req.body;
  console.log('📡 POST /send-topup - Processing top-up request');
  console.log('📦 Request data:', {
    operatorId,
    amount,
    recipientPhone,
    senderPhone,
    recipientEmail,
    countryCode
  });

  try {
    // Get fresh authentication token
    const accessToken = await getReloadlyToken();
    if (!accessToken) {
      throw new Error('Failed to get authentication token');
    }

    const url = 'https://topups.reloadly.com/topups';
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
          countryCode: selectedCountry.country_code,
          number: recipientPhone
        },
        senderPhone: {
          countryCode: 'NG',
          number: senderPhone
        }
      })
    };

    console.log('🔄 Sending request to API...');
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API error:', {
        status: response.status,
        statusText: response.statusText,
        error: data
      });
      throw new Error(data.message || 'Failed to process topup');
    }

    console.log('✅ API response:', JSON.stringify(data, null, 2));
    res.json(data);
  } catch (err) {
    console.error('❌ Error processing top-up:', err.message);
    res.status(500).json({ 
      error: 'Failed to process topup',
      details: err.message 
    });
  }
});


// Submit transaction failure report
app.post('/submit-failure-report', async (req, res) => {
  const { tx_hash, address, usdc_amount, timestamp } = req.body;
  console.log('📡 POST /submit-failure-report - Processing failure report');
  console.log('📦 Failure Report Details:', {
    transactionHash: tx_hash,
    walletAddress: address,
    usdcAmount: usdc_amount,
    timestamp: timestamp
  });

  try {
    // Log the failure report to console
    console.log('❌ Transaction Failure Report:');
    console.log('----------------------------------------');
    console.log(`Transaction Hash: ${tx_hash}`);
    console.log(`Wallet Address: ${address}`);
    console.log(`USDC Amount: ${usdc_amount}`);
    console.log(`Timestamp: ${timestamp}`);
    console.log('----------------------------------------');

    res.status(200).json({ 
      message: 'Failure report received successfully',
      receivedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error processing failure report:', err.message);
    res.status(500).json({ 
      error: 'Failed to process failure report',
      details: err.message 
    });
  }
});

// Start server
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});
