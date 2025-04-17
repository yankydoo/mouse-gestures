// content.js - Mouse gesture detection script
(() => {
    // Configuration
    const MOUSE_BUTTON = 2; // Right mouse button
    const MIN_GESTURE_LENGTH = 20; // Reduced from 30 to make detection easier
    const GESTURE_PRECISION = 20; // Increased from 10 to be more forgiving
    const DIRECTION_THRESHOLD = 35; // Angle threshold for direction detection (wider angle = more forgiving)
  
    // State variables
    let isGesturing = false;
    let gesturePoints = [];
    let overlay = null;
    let trailCanvas = null;
    let trailContext = null;
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.action) {
        case 'back':
          window.history.back();
          break;
        case 'forward':
          window.history.forward();
          break;
        case 'scrollUp':
          window.scrollBy(0, -300);
          break;
        case 'scrollDown':
          window.scrollBy(0, 300);
          break;
        case 'scrollTop':
          window.scrollTo(0, 0);
          break;
        case 'scrollBottom':
          window.scrollTo(0, document.body.scrollHeight);
          break;
      }
    });
  
    // Create the gesture overlay
    function createGestureOverlay() {
      // Create overlay container
      overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.zIndex = '999999';
      overlay.style.pointerEvents = 'none';
      
      // Create canvas for drawing the trail
      trailCanvas = document.createElement('canvas');
      trailCanvas.style.width = '100%';
      trailCanvas.style.height = '100%';
      overlay.appendChild(trailCanvas);
      
      document.body.appendChild(overlay);
      
      // Set canvas dimensions
      trailCanvas.width = window.innerWidth;
      trailCanvas.height = window.innerHeight;
      trailContext = trailCanvas.getContext('2d');
      trailContext.strokeStyle = 'rgba(0, 128, 255, 0.7)';
      trailContext.lineWidth = 4;
      trailContext.lineCap = 'round';
    }
  
    // Remove the gesture overlay
    function removeGestureOverlay() {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
        overlay = null;
        trailCanvas = null;
        trailContext = null;
      }
    }
  
    // Update the visual trail
    function updateTrail() {
      if (!trailContext || gesturePoints.length < 2) return;
      
      trailContext.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      trailContext.beginPath();
      trailContext.moveTo(gesturePoints[0].x, gesturePoints[0].y);
      
      for (let i = 1; i < gesturePoints.length; i++) {
        trailContext.lineTo(gesturePoints[i].x, gesturePoints[i].y);
      }
      
      trailContext.stroke();
    }
  
    // Determine the direction between two points with more forgiving angle ranges
    function getDirection(p1, p2) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      
      // Convert angle to 8 directions with wider ranges (more forgiving)
      const deg = angle * 180 / Math.PI;
      
      // More forgiving angle ranges with wider thresholds
      if (deg > -DIRECTION_THRESHOLD && deg <= DIRECTION_THRESHOLD) return 'right';
      if (deg > DIRECTION_THRESHOLD && deg <= 90 - DIRECTION_THRESHOLD) return 'down-right';
      if (deg > 90 - DIRECTION_THRESHOLD && deg <= 90 + DIRECTION_THRESHOLD) return 'down';
      if (deg > 90 + DIRECTION_THRESHOLD && deg <= 180 - DIRECTION_THRESHOLD) return 'down-left';
      if (deg > 180 - DIRECTION_THRESHOLD || deg <= -180 + DIRECTION_THRESHOLD) return 'left';
      if (deg > -180 + DIRECTION_THRESHOLD && deg <= -90 - DIRECTION_THRESHOLD) return 'up-left';
      if (deg > -90 - DIRECTION_THRESHOLD && deg <= -90 + DIRECTION_THRESHOLD) return 'up';
      if (deg > -90 + DIRECTION_THRESHOLD && deg <= -DIRECTION_THRESHOLD) return 'up-right';
      
      return 'unknown';
    }
  
    // Sample points from the gesture to reduce noise and improve recognition
    function samplePoints(points, numSamples = 20) {
      if (points.length <= numSamples) return points;
      
      const sampledPoints = [];
      const step = points.length / numSamples;
      
      for (let i = 0; i < numSamples; i++) {
        const index = Math.floor(i * step);
        sampledPoints.push(points[index]);
      }
      
      // Always include the last point
      sampledPoints.push(points[points.length - 1]);
      
      return sampledPoints;
    }
  
    // Simplify the gesture path to its essential directions
    function simplifyGesture(points) {
      if (points.length < 2) return '';
      
      // Sample points to reduce noise
      const sampledPoints = samplePoints(points);
      
      // Calculate the total distance of the gesture
      let totalDistance = 0;
      for (let i = 1; i < sampledPoints.length; i++) {
        const p1 = sampledPoints[i - 1];
        const p2 = sampledPoints[i];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
      }
      
      // Only recognize gestures with sufficient distance
      if (totalDistance < MIN_GESTURE_LENGTH) return '';
      
      // Find the primary direction vectors
      // We'll divide the gesture into segments and find the main direction of each segment
      
      // Step 1: Divide the gesture into segments (start, middle, end)
      const numSegments = 3;
      const segmentSize = Math.floor(sampledPoints.length / numSegments);
      const segments = [];
      
      for (let i = 0; i < numSegments; i++) {
        const start = i * segmentSize;
        const end = (i === numSegments - 1) ? sampledPoints.length - 1 : (i + 1) * segmentSize - 1;
        segments.push({
          start: sampledPoints[start],
          end: sampledPoints[end]
        });
      }
      
      // Step 2: Get the primary direction of each segment
      const directions = segments.map(segment => 
        getDirection(segment.start, segment.end)
      ).filter(dir => dir !== 'unknown');
      
      // Step 3: Combine to form the gesture - collapse sequential identical directions
      const uniqueDirections = [];
      for (let i = 0; i < directions.length; i++) {
        if (i === 0 || directions[i] !== directions[i - 1]) {
          uniqueDirections.push(directions[i]);
        }
      }
      
      // Step 4: Handle composite directions (collapse redundancies like "down-down-right" to "down-right")
      // First, extract the components of composite directions
      const dirComponents = [];
      for (const dir of uniqueDirections) {
        if (dir.includes('-')) {
          // Split composite directions like "down-right" into components
          dir.split('-').forEach(comp => {
            if (!dirComponents.includes(comp)) {
              dirComponents.push(comp);
            }
          });
        } else if (!dirComponents.includes(dir)) {
          dirComponents.push(dir);
        }
      }
      
      // For simplicity, just use the first two distinct components if we have more than 2
      const finalDirections = dirComponents.slice(0, 2);
      
      // If we have exactly 2 components, combine them
      if (finalDirections.length === 2) {
        return finalDirections.join('-');
      } 
      // If we have just 1 component, return it
      else if (finalDirections.length === 1) {
        return finalDirections[0];
      } 
      // Fallback to original algorithm for complicated cases
      else {
        return uniqueDirections.slice(0, 2).join('-');
      }
    }
  
    // Handle mousedown event
    function handleMouseDown(e) {
      if (e.button !== MOUSE_BUTTON) return;
      
      // Prevent the context menu
      e.preventDefault();
      
      isGesturing = true;
      gesturePoints = [{ x: e.clientX, y: e.clientY }];
      
      createGestureOverlay();
    }
  
    // Handle mousemove event
    function handleMouseMove(e) {
      if (!isGesturing) return;
      
      gesturePoints.push({ x: e.clientX, y: e.clientY });
      updateTrail();
    }
  
    // Handle mouseup event
    function handleMouseUp(e) {
      if (!isGesturing) return;
      
      isGesturing = false;
      
      const gesture = simplifyGesture(gesturePoints);
      
      // Only process if we have a valid gesture
      if (gesture) {
        // Log the raw and processed gesture for debugging
        const rawGesture = getRawGesture(gesturePoints);
        console.log('Raw gesture:', rawGesture);
        console.log('Simplified gesture:', gesture);
        
        chrome.runtime.sendMessage({
          type: 'gesturePerformed',
          gesture: gesture
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending gesture:', chrome.runtime.lastError);
          }
        });
      } else {
        console.log('No gesture detected or gesture too small');
      }
      
      removeGestureOverlay();
    }
    
    // Get the raw gesture for debugging purposes
    function getRawGesture(points) {
      if (points.length < 2) return '';
      
      const directions = [];
      for (let i = 1; i < points.length; i += 5) { // Sample every 5th point to reduce noise
        if (i < points.length) {
          const dir = getDirection(points[Math.max(0, i-5)], points[i]);
          if (dir !== 'unknown') {
            directions.push(dir);
          }
        }
      }
      
      // Just show the raw directions for debugging
      return directions.join(' → ');
    }
  
    // Add event listeners
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('contextmenu', (e) => {
      if (isGesturing) {
        e.preventDefault();
        return false;
      }
      return true;
    }, true);
    
    // Log that the content script has been loaded
    console.log('Private Mouse Gestures content script loaded');
  })();