const mongoose = require('mongoose');

const UserInfoSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  operatorId: String,
  recipientEmail: String,
  recipientPhone: {
    countryCode: String,
    number: String
  },
  senderPhone: {
    countryCode: String,
    number: String
  }
}, { timestamps: true });

module.exports = mongoose.model('UserInfo', UserInfoSchema);
