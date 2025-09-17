const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// Disable ALL caching - force everything to be fresh
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// CORS headers for cross-origin requests
app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  next();
});

// Helper function to extract parameters from URL query string
function extractParameters(req) {
  const params = req.query;
  
  // Support both hyphenated and camelCase parameter names
  const config = {
    websiteUrl: params['website-url'] || params.websiteurl || params.websiteUrl || 'https://example.com',
    personalInfoStored: params['personalinfostored'] || params.personalInfoStored || 'no',
    enableMdQuizz: params['enablemdquizz'] || params.enableMdQuizz || 'no',
    enableJsSandbox: params['enablejssandbox'] || params.enableJsSandbox || 'no',
    enablePrivacy: params['enableprivacy'] || params.enablePrivacy || 'no'
  };
  
  // Normalize values to lowercase
  config.personalInfoStored = config.personalInfoStored.toLowerCase();
  config.enableMdQuizz = config.enableMdQuizz.toLowerCase();
  config.enableJsSandbox = config.enableJsSandbox.toLowerCase();
  config.enablePrivacy = config.enablePrivacy.toLowerCase();
  
  return config;
}

// Main endpoint for the injection script
app.get('/main.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  
  // Extract parameters from query string
  const params = extractParameters(req);
  
  // Log the request for debugging
  console.log(`[${new Date().toISOString()}] main.js requested from ${req.headers.referer || 'unknown'}`);
  console.log('Parameters:', params);
  
  try {
    // Read the main.js template file
    const mainJsPath = path.join(__dirname, 'main.js');
    let mainJs = fs.readFileSync(mainJsPath, 'utf8');
    
    // Replace placeholders with actual values
    mainJs = mainJs.replace(/\{\{WEBSITE_URL\}\}/g, params.websiteUrl);
    mainJs = mainJs.replace(/\{\{PERSONAL_INFO_STORED\}\}/g, params.personalInfoStored);
    // Inject as boolean values (true/false) not strings
    mainJs = mainJs.replace(/\{\{ENABLE_MD_QUIZZ\}\}/g, params.enableMdQuizz === 'yes' ? 'true' : 'false');
    mainJs = mainJs.replace(/\{\{ENABLE_JS_SANDBOX\}\}/g, params.enableJsSandbox === 'yes' ? 'true' : 'false');
    mainJs = mainJs.replace(/\{\{ENABLE_PRIVACY\}\}/g, params.enablePrivacy === 'yes' ? 'true' : 'false');
    
    // Add timestamp comment for debugging
    mainJs = `// Kizuna generated at ${new Date().toISOString()}\n// Config: ${JSON.stringify(params)}\n${mainJs}`;
    
    res.send(mainJs);
  } catch (error) {
    console.error('Error serving main.js:', error);
    res.status(500).send(`// Error loading Kizuna: ${error.message}`);
  }
});

// Styles endpoint
app.get('/styles.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  
  console.log(`[${new Date().toISOString()}] styles.js requested`);
  
  try {
    const stylesPath = path.join(__dirname, 'styles.js');
    const styles = fs.readFileSync(stylesPath, 'utf8');
    
    // Add timestamp for debugging
    const timestampedStyles = `// Kizuna styles loaded at ${new Date().toISOString()}\n${styles}`;
    
    res.send(timestampedStyles);
  } catch (error) {
    console.error('Error serving styles.js:', error);
    res.status(500).send(`// Error loading styles: ${error.message}`);
  }
});

// Root endpoint - serve the demo page
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  try {
    const indexPath = path.join(__dirname, 'index.html');
    res.sendFile(indexPath);
  } catch (error) {
    console.error('Error serving index.html:', error);
    res.status(500).send('<h1>Error loading page</h1>');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Kizuna Enhancement Service',
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Test endpoint to verify parameters
app.get('/test', (req, res) => {
  const params = extractParameters(req);
  res.json({
    message: 'Kizuna parameter test',
    receivedParams: req.query,
    processedParams: params,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log('================================================');
  console.log('🚀 Kizuna Enhancement Service Started');
  console.log('================================================');
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('🚫 Cache: DISABLED (all content served fresh)');
  console.log('🌐 CORS: Enabled for all origins');
  console.log('');
  console.log('📚 Available Endpoints:');
  console.log(`  GET /          - Demo page`);
  console.log(`  GET /main.js   - Injection script (with parameters)`);
  console.log(`  GET /styles.js - Styles script`);
  console.log(`  GET /health    - Health check`);
  console.log(`  GET /test      - Parameter test`);
  console.log('');
  console.log('📝 Example Usage:');
  console.log(`  <script defer src="http://localhost:${PORT}/main.js?website-url=https://yoursite.com&personalinfostored=no&enablemdquizz=yes&enablejssandbox=no&enableprivacy=yes"></script>`);
  console.log('================================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
