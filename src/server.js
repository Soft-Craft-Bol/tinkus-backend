const app = require('./app');
const express = require('express');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
