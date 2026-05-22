require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const rateRoutes = require('./routes/rate');

const app = express();
const PORT = process.env.PORT || 5000;

// Allow requests from the React dev server and production frontend
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
}));

app.use(express.json());

// Prevent the frontend from hammering the DAT API — max 30 quote requests per minute per IP
const quoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});

app.use('/api/rate', quoteLimiter, rateRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`DAT mock mode: ${process.env.DAT_USE_MOCK === 'true' ? 'ON' : 'OFF'}`);
});
