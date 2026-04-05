import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32); // Must be 32 bytes
const IV_LENGTH = 16;

function encrypt(text: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;;

  // Security & Optimization Middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for easier integration with external scripts if needed
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression()); // Gzip compression
  app.use(cors()); // Enable CORS
  app.use(express.json({ limit: '10mb' })); // Increase limit for image uploads

  // Rate Limiting: 100 requests per minute per IP
  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later."
  });
  app.use('/api/', limiter);

  // Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Secure API Routes
  app.get('/api/config', (req, res) => {
    // Never expose the real key to the client
    res.json({ status: 'active', tier: '3.0_FLASH' });
  });

  app.post('/api/secure-data', (req, res) => {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });
    const encrypted = encrypt(data);
    res.json({ encrypted });
  });

  app.post('/api/decrypt-data', (req, res) => {
    const { encrypted } = req.body;
    if (!encrypted) return res.status(400).json({ error: 'No encrypted data provided' });
    try {
      const decrypted = decrypt(encrypted);
      res.json({ decrypted });
    } catch (e) {
      res.status(500).json({ error: 'Decryption failed' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Serve static files with caching
    app.use(express.static(distPath, {
      maxAge: '1d', // Cache static assets for 1 day
      etag: true,
    }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FRIDAY Backend Online: http://localhost:${PORT}`);
  });
}

startServer();
