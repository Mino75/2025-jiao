// service-worker.js

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
// CONFIGURABLE PARAMETERS - Override with environment variables
const CONFIG = {
  CACHE_NAME: self.SW_CACHE_NAME || 'shiro-v2',
  TEMP_CACHE_NAME: self.SW_TEMP_CACHE_NAME || 'shiro-temp-v2',
  FIRST_TIME_TIMEOUT: parseInt(self.SW_FIRST_TIME_TIMEOUT) || 30000, // 30 seconds
  RETURNING_USER_TIMEOUT: parseInt(self.SW_RETURNING_USER_TIMEOUT) || 5000, // 5 seconds
  ENABLE_LOGS: self.SW_ENABLE_LOGS !== 'false' // true by default, false if set to 'false'
};

// Extract app name from current cache name dynamically
function getAppPrefix(cacheName) {
  // Extract everything before the first hyphen
  // 'sakafokana-v2' → 'sakafokana'
  // 'dia-v1' → 'dia'
  // 'faritany-temp-v3' → 'faritany'
  return cacheName.split('-')[0];
}

const LIVE_CACHE = CONFIG.CACHE_NAME;
const TEMP_CACHE = CONFIG.TEMP_CACHE_NAME;

const ASSETS = [
  '/',
  '/index.html',
  '/main.js',
  '/styles.js',
  '/manifest.json',
  '/icon-512.png',
  '/icon-192.png',
  '/favicon.ico'
];

// Logging helper
function log(message) {
  if (CONFIG.ENABLE_LOGS) {
    console.log(`Service Worker: ${message}`);
  }
}

// Install: Download all assets into a temporary cache.
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  self.skipWaiting(); // Force immediate activation
  
  event.waitUntil(
    caches.open(TEMP_CACHE).then(tempCache => {
      return Promise.all(
        ASSETS.map(url => {
          return fetch(url).then(response => {
            if (!response.ok) {
              throw new Error(`Failed to fetch ${url}: ${response.status}`);
            }
            console.log(`Service Worker: Cached ${url}`);
            return tempCache.put(url, response.clone());
          }).catch(error => {
            console.error(`Service Worker: Failed to cache ${url}:`, error);
            // Continue with other assets even if one fails
            return null;
          });
        })
      );
    })
  );
});

// Activate: Replace live cache ONLY if ALL assets are staged
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    (async () => {
      const tempCache = await caches.open(TEMP_CACHE);
      const cachedRequests = await tempCache.keys();
      
      // ALL ASSETS ARE CRITICAL - Strict verification
      if (cachedRequests.length === ASSETS.length) {
        console.log('Service Worker: ALL assets staged successfully, updating live cache');
        
        // Complete atomic replacement
        await caches.delete(LIVE_CACHE);
        const liveCache = await caches.open(LIVE_CACHE);
        
        // Copy ALL assets from temp cache to live cache
        for (const request of cachedRequests) {
          const response = await tempCache.match(request);
          await liveCache.put(request, response);
        }
        
        // Clean temp cache
        await caches.delete(TEMP_CACHE);

        // Clean up old version caches
        const allCacheNames = await caches.keys();
        const currentAppPrefix = getAppPrefix(LIVE_CACHE); // Extract 'sakafokana' dynamically
        const oldCaches = allCacheNames.filter(cacheName => 
          cacheName.startsWith(currentAppPrefix + '-') &&  // Dynamic prefix!
          cacheName !== LIVE_CACHE && 
          cacheName !== TEMP_CACHE
        );
        
        console.log(`Service Worker: Deleting ${oldCaches.length} old caches:`, oldCaches);
        await Promise.all(oldCaches.map(cacheName => caches.delete(cacheName)));

        
        // Notify clients that new version is ready
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({ action: 'reload', message: 'App updated - all assets ready' });
        });
        
        console.log('Service Worker: Cache replacement completed successfully');
      } else {
        // FAILURE: Not all assets → Keep old version
        console.error(`Service Worker: Incomplete staging - expected ${ASSETS.length}, got ${cachedRequests.length}. Keeping old cache.`);
        await caches.delete(TEMP_CACHE);
      }
      
      // Take control of all open tabs immediately
      await self.clients.claim();
    })()
  );
});

// ROBUST STRATEGY: NETWORK FIRST WITH FULL APP CACHE FALLBACK
self.addEventListener('fetch', event => {
  // Only handle same-origin requests, let browser handle external domains naturally
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(handleFetch(event.request));
  }
  // External domains like analytics.kahiether.com pass through automatically
});

async function handleFetch(request) {
  try {
    // Check if we're offline
    if (!navigator.onLine) {
      console.log(`Service Worker: No internet - serving from cache: ${request.url}`);
      return await serveFromCache(request);
    }
    
    // Online - check if this is a first-time user (no cache)
    const hasCache = await checkIfCacheExists();
    
    if (!hasCache) {
      console.log(`Service Worker: First time user - MUST wait for network: ${request.url}`);
      return await fetchFromNetworkWithExtendedTimeout(request);
    }
    
    // Existing user with cache - try network with short timeout
    console.log(`Service Worker: Existing user - trying network with fallback: ${request.url}`);
    return await fetchFromNetworkWithFallback(request);
    
  } catch (error) {
    console.error('Service Worker: Fetch error:', error);
    return createErrorResponse(request);
  }
}

async function checkIfCacheExists() {
  try {
    const cache = await caches.open(LIVE_CACHE);
    const keys = await cache.keys();
    return keys.length > 0;
  } catch (error) {
    return false;
  }
}

async function fetchFromNetworkWithExtendedTimeout(request) {
  try {
    console.log(`Service Worker: First time user - extended network timeout: ${request.url}`);
    
    // Extended timeout for first-time users (30 seconds)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Network request timeout - first time user')), CONFIG.FIRST_TIME_TIMEOUT);
    });
    
    const networkResponse = await Promise.race([
      fetch(request),
      timeoutPromise
    ]);
    
    if (!networkResponse.ok) {
      throw new Error(`Server error: ${networkResponse.status}`);
    }
    
    // SUCCESS: Cache for future use
    console.log(`Service Worker: First time success - caching: ${request.url}`);
    const cache = await caches.open(LIVE_CACHE);
    cache.put(request, networkResponse.clone());
    
    return networkResponse;
    
  } catch (error) {
    console.error('Service Worker: First time user network failed:', error);
    
    // Return timeout error code (not server error)
    return new Response('Network timeout - connection too slow', {
      status: 408,
      statusText: 'Request Timeout'
    });
  }
}

async function serveFromCache(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Try fallback strategies for cache
  const fallbackResponse = await findFallbackInCache(request);
  if (fallbackResponse) {
    return fallbackResponse;
  }
  
  return createErrorResponse(request);
}

async function fetchFromNetworkWithFallback(request) {
  try {
    console.log(`Service Worker: Attempting network request: ${request.url}`);
    
    // Create timeout promise (5 seconds max wait)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Network request timeout')), CONFIG.RETURNING_USER_TIMEOUT);
    });
    
    // Race between network request and timeout
    const networkResponse = await Promise.race([
      fetch(request),
      timeoutPromise
    ]);
    
    // CRITICAL CHECK: Server error?
    if (!networkResponse.ok) {
      console.warn(`Service Worker: Server error ${networkResponse.status} - falling back to cache`);
      return await serveFromCache(request);
    }
    
    // NETWORK SUCCESS: Cache it and return
    console.log(`Service Worker: Network success for ${request.url} - caching response`);
    const cache = await caches.open(LIVE_CACHE);
    cache.put(request, networkResponse.clone());
    
    return networkResponse;
    
  } catch (networkError) {
    // Check if it's a timeout vs other network error
    if (networkError.message.includes('timeout')) {
      console.log('Service Worker: Network timeout - falling back to cache');
    } else {
      console.error('Service Worker: Network request failed - falling back to cache');
    }
    return await serveFromCache(request);
  }
}

// Remove background update function - not needed for network-first strategy

async function findFallbackInCache(request) {
  const cache = await caches.open(LIVE_CACHE);
  
  // Fallback strategies in priority order
  const fallbackStrategies = [
    // 1. Exact match (already tested but retry)
    request.url,
    
    // 2. If HTML page, serve index.html (SPA)
    request.destination === 'document' ? '/' : null,
    request.destination === 'document' ? '/index.html' : null,
    
    // 3. If asset, try without query string
    request.url.split('?')[0],
    
    // 4. For root requests
    request.url.endsWith('/') ? '/index.html' : null
  ].filter(Boolean);
  
  for (const fallbackUrl of fallbackStrategies) {
    const fallbackResponse = await cache.match(fallbackUrl);
    if (fallbackResponse) {
      return fallbackResponse;
    }
  }
  
  return null;
}

function createErrorResponse(request) {
  // Simple text error response - no HTML
  return new Response('Service temporarily unavailable', {
    status: 503,
    statusText: 'Service Temporarily Unavailable',
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache'
    }
  });
}

// DEBUG EVENTS (optional)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_INFO') {
    getCacheInfo().then(info => {
      event.ports[0].postMessage(info);
    });
  }
});

async function getCacheInfo() {
  const cache = await caches.open(LIVE_CACHE);
  const keys = await cache.keys();
  return {
    cacheSize: keys.length,
    cachedUrls: keys.map(req => req.url)
  };
}
