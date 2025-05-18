const express = require('express');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit'); // For rate limiting

const app = express();
const PORT = process.env.PORT || 3000;

// Set secure HTTP headers
app.use(helmet());

// Configure a strict Content Security Policy (CSP)
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // 'unsafe-inline' can be removed if external CSS is used
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"]
    }
  })
);

// Global rate limiter: limits each IP to 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // maximum requests per IP in this window
  message: "Too many requests from this IP, please try again after 15 minutes"
});
app.use(limiter);

// Parse JSON bodies with a size limit (to mitigate DoS attacks with large payloads)
app.use(bodyParser.json({ limit: '100kb' }));

// Serve static assets from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database (creates pastebin.db if it does not exist)
const db = new sqlite3.Database('./pastebin.db', (err) => {
  if (err) {
    console.error("Database connection error:", err.message);
  } else {
    console.log("Connected to SQLite database.");
    db.run(`CREATE TABLE IF NOT EXISTS pastes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

// Helper function to generate a unique 8-character hexadecimal ID for each paste
function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

// API endpoint to create a new paste with input validation
app.post('/api/paste', (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Invalid content.' });
  }
  
  // Enforce a maximum content length (e.g., no more than 10,000 characters)
  if (content.length > 10000) {
    return res.status(400).json({ error: 'Content too long. Maximum 10,000 characters allowed.' });
  }
  
  const id = generateId();
  const stmt = db.prepare("INSERT INTO pastes (id, content) VALUES (?, ?)");
  stmt.run(id, content, function(err) {
    if (err) {
      console.error("Error inserting paste:", err);
      return res.status(500).json({ error: 'Database error.' });
    }
    // Return both the paste id and the full URL for easy sharing
    res.status(201).json({ id, url: `${req.protocol}://${req.get('host')}/${id}` });
  });
  stmt.finalize();
});

// API endpoint to retrieve paste data as JSON
app.get('/api/paste/:id', (req, res) => {
  const { id } = req.params;
  db.get("SELECT * FROM pastes WHERE id = ?", [id], (err, row) => {
    if (err) {
      console.error("Error retrieving paste:", err);
      return res.status(500).json({ error: 'Database error.' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Paste not found.' });
    }
    res.json({ id: row.id, content: row.content, created_at: row.created_at });
  });
});

// Web route to render a paste (basic HTML layout)
app.get('/:id', (req, res) => {
  const { id } = req.params;
  db.get("SELECT * FROM pastes WHERE id = ?", [id], (err, row) => {
    if (err) {
      console.error("Error rendering paste:", err);
      return res.status(500).send("Database error.");
    }
    if (!row) {
      return res.status(404).send("Paste not found.");
    }
    // Escape HTML to prevent XSS attacks
    const escapedContent = row.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Paste ${row.id}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; padding: 0; }
            pre { background-color: #f4f4f4; padding: 15px; border: 1px solid #ddd; }
          </style>
      </head>
      <body>
          <h1>Paste ${row.id}</h1>
          <pre>${escapedContent}</pre>
          <p>Created at: ${new Date(row.created_at).toLocaleString()}</p>
          <a href="/">Back to Home</a>
      </body>
      </html>
    `);
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Pastebin service running on port ${PORT}`);
});