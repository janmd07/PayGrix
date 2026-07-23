const fs = require('fs');
const path = require('path');

const wsUrl = process.env.AGY_BROWSER_WS_URL;
if (!wsUrl) {
  console.error('AGY_BROWSER_WS_URL environment variable is not defined!');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please specify the output screenshot filename as an argument!');
  process.exit(1);
}

const filename = args[0];
const targetPath = path.resolve('C:\\Users\\JAAN MD\\.gemini\\antigravity\\brain\\98dfdc3d-4a41-49fb-be5d-4be781a1c2b7', filename);

console.log('Connecting to browser WS:', wsUrl);
const ws = new WebSocket(wsUrl);
let messageId = 1;
const pendingRequests = new Map();
let pageLoadedResolve = null;

const pageLoadedPromise = new Promise((resolve) => {
  pageLoadedResolve = resolve;
});

function sendCommand(method, params = {}, sessionId = undefined) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    const message = { id, method, params };
    if (sessionId) {
      message.sessionId = sessionId;
    }
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify(message));
  });
}

ws.onopen = async () => {
  try {
    console.log('Connected to DevTools browser WebSocket');

    // Get list of targets
    console.log('Fetching targets...');
    const targetsResult = await sendCommand('Target.getTargets');
    const targets = targetsResult.targetInfos;
    
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) {
      throw new Error('No page target found in browser!');
    }

    const targetId = pageTarget.targetId;
    const originalUrl = pageTarget.url;
    console.log(`Using page target ID: ${targetId}, original URL: ${originalUrl}`);

    // Attach to the page target
    console.log('Attaching to page target...');
    const attachResult = await sendCommand('Target.attachToTarget', {
      targetId: targetId,
      flatten: true
    });
    const sessionId = attachResult.sessionId;
    console.log('Attached to target. Session ID:', sessionId);

    // Enable Page events
    console.log('Enabling Page domain...');
    await sendCommand('Page.enable', {}, sessionId);

    // Override Device Metrics to 1600x900
    console.log('Overriding device metrics to 1600x900...');
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    }, sessionId);

    // Navigate to localhost:3000/bridge
    console.log('Navigating to http://localhost:3000/bridge...');
    await sendCommand('Page.navigate', {
      url: 'http://localhost:3000/bridge'
    }, sessionId);

    // Wait for the Page.loadEventFired or a timeout of 10s
    console.log('Waiting for page load event...');
    await Promise.race([
      pageLoadedPromise,
      new Promise(resolve => setTimeout(resolve, 15000))
    ]);
    console.log('Page loaded or timed out waiting for load event');

    // Wait an additional 5 seconds for animations/layouts to settle
    console.log('Waiting 5 seconds for animations and layouts to settle...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get body text and location for diagnostics
    try {
      await sendCommand('Runtime.enable', {}, sessionId);
      const urlResult = await sendCommand('Runtime.evaluate', {
        expression: 'window.location.href'
      }, sessionId);
      console.log('Current URL in browser:', urlResult.result?.value);
      
      const evalResult = await sendCommand('Runtime.evaluate', {
        expression: 'document.body.innerHTML'
      }, sessionId);
      console.log('--- Page HTML content diagnostic ---');
      console.log(evalResult.result?.value || '(empty/null)');
      console.log('------------------------------------');
    } catch (e) {
      console.error('Failed to run diagnostics:', e);
    }

    // Capture screenshot
    console.log('Capturing page screenshot...');
    const screenshotResult = await sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    }, sessionId);

    // Save screenshot
    const screenshotBuffer = Buffer.from(screenshotResult.data, 'base64');
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      console.log('Creating directory:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, screenshotBuffer);
    console.log('Screenshot successfully saved to:', targetPath);

    // Navigate back to original URL
    if (originalUrl && originalUrl !== 'about:blank' && !originalUrl.startsWith('data:')) {
      console.log(`Navigating back to original URL: ${originalUrl}...`);
      await sendCommand('Page.navigate', { url: originalUrl }, sessionId);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('Automation complete!');
    ws.close();
  } catch (error) {
    console.error('Error during automation:', error);
    ws.close();
    process.exit(1);
  }
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.id) {
    const req = pendingRequests.get(data.id);
    if (req) {
      pendingRequests.delete(data.id);
      if (data.error) {
        req.reject(data.error);
      } else {
        req.resolve(data.result);
      }
    }
  } else if (data.method) {
    if (data.method === 'Page.loadEventFired') {
      console.log('Received Page.loadEventFired');
      if (pageLoadedResolve) {
        pageLoadedResolve();
      }
    }
  }
};

ws.onerror = (err) => {
  console.error('WS Error:', err);
};

ws.onclose = () => {
  console.log('WebSocket connection closed');
};
