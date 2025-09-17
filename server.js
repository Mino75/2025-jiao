/**
 *  CACHE STRATEGY REQUIREMENTS
 * ===================================
 * 
 * GOAL: "Get once, always work, update if possible"
 * 
 * CONTEXT: Adapt to Network conditions 
 * - Very slow network connections in some areas
 * - Network can cut at any moment during fetch
 * - Users need reliable offline experience
 * - This is a microservice - all cached  declaredfiles are critical
 * 
 * STRATEGY: Adaptive Network-First with Smart Timeouts
 * 
 * 1. FIRST FETCH (New User / No Cache)
 *    - HIGH TIMEOUT (20-30 seconds)
 *    - Purpose: Ensure we get a complete working version cached
 *    - Behavior: Wait longer to accommodate slow networks
 *    - Fallback: If timeout/failure, show error (no cache available)
 * 
 * 2. SUBSEQUENT FETCHES (Returning User / Has Cache)
 *    - SHORT TIMEOUT (3-5 seconds)
 *    - Purpose: Don't block user experience while trying to update
 *    - Behavior: Quick network attempt, fast fallback to cache
 *    - Fallback: Serve cached version immediately on timeout/failure
 * 
 * 3. NETWORK FAILURE HANDLING
 *    - Any network timeout or connection cut -> serve from cache
 *    - Cache always serves the last working version
 *    - No partial updates - either complete success or use cache
 * 
 * 4. CRITICAL FILES POLICY
 *    - ALL manifest files are critical (no optional resources)
 *    - Failed fetch on any critical file = fallback to cached version
 *    - Never serve a mix of new/old files (consistency requirement)
 * 
 * 5. CACHE MANAGEMENT
 *    - Complete atomic updates only (all files or none)
 *    - Old cache versions must be cleaned up properly
 *    - Cache corruption protection (verify all files present)
 * 
 * 6. USER EXPERIENCE PRIORITIES
 *    - Reliability > Speed (app must always work)
 *    - Offline capability is essential
 *    - Background updates when possible, no blocking
 *    - Clear feedback when updates are available
 * 
 * IMPLEMENTATION NOTES:
 * - Detect first-time vs returning users by cache presence
 * - Use different timeout strategies to adapt to worst and best conditions (what can do more can do less)
 * - Implement proper service worker lifecycle management
 * - Ensure cache consistency and cleanup
 * - Handle challenging network conditions gracefully
 */

// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();


// CACHE VERSION MANAGEMENT - Change this to deploy new version
const CACHE_VERSION = process.env.CACHE_VERSION || 'v2';
const APP_NAME = process.env.APP_NAME || 'jiao';

// Cache Lock Rescue - Intercept main.js to inject rescue code
app.get('/main.js', (req, res) => {
  try {
    // Read the actual main.js file (your existing game/app code)
    let jsContent = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    
    // Inject ONLY the rescue detection code at the beginning
    const rescueCode = `
// Cache Lock Rescue - Check for ${CACHE_VERSION} users and free older versions
if ('serviceWorker' in navigator) {
  caches.keys().then(cacheNames => {
    const hasCurrentVersion = cacheNames.some(name => name.includes('-${CACHE_VERSION}'));
    
    if (!hasCurrentVersion && cacheNames.length > 0) {
      // Old version detected - unregister and reload
      console.log('Cache lock detected - rescuing to ${CACHE_VERSION}...');
      navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) {
            reg.unregister().then(() => location.reload());
          } else {
            location.reload(); // ← This handles missing SW
          }
        }).catch(() => {
          location.reload(); // ← This handles SW errors
        });
      //return; 
    }
    
    // Current version users or new users - normal service worker registration
    navigator.serviceWorker.register('/service-worker.js', {updateViaCache: 'none'});
  });
}
`;
    
    // Prepend rescue code to your existing main.js
    const finalContent = rescueCode + '\n\n' + jsContent;
    
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(finalContent);
    
  } catch (error) {
    console.error('Error serving main.js:', error);
    res.status(500).send('Error loading main.js');
  }
});

// Service Worker with cache-busting headers and version injection
app.get('/service-worker.js', (req, res) => {
  try {
    // Read your service-worker.js file
    let swContent = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
    
    // Inject current version into service worker
    const versionInjection = `
// Version injected by server
self.SW_CACHE_NAME = self.SW_CACHE_NAME || '${APP_NAME}-${CACHE_VERSION}';
self.SW_TEMP_CACHE_NAME = self.SW_TEMP_CACHE_NAME || '${APP_NAME}-temp-${CACHE_VERSION}';
self.SW_FIRST_TIME_TIMEOUT = '${process.env.SW_FIRST_TIME_TIMEOUT || '20000'}'; // Reduced from 30s
self.SW_RETURNING_USER_TIMEOUT = '${process.env.SW_RETURNING_USER_TIMEOUT || '5000'}';
self.SW_ENABLE_LOGS = '${process.env.SW_ENABLE_LOGS || 'true'}';
`;
    
    swContent = versionInjection + '\n' + swContent;
    
    // Cache-busting headers
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(swContent);
    
  } catch (error) {
    console.error('Error serving service worker:', error);
    res.status(500).send('Error loading service worker');
  }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
