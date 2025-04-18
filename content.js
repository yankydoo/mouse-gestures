(() => {
    // Configuration
    const MOUSE_BUTTON = 2; // Right mouse button
    const MIN_GESTURE_LENGTH = 20; // Minimum pixel length to consider
    const GESTURE_PRECISION = 20; // Precision for direction detection
    const DIRECTION_THRESHOLD = 35; // Angle threshold for direction detection
    const PREVIEW_DELAY = 200; // Milliseconds to wait before showing preview popover
    const MOVEMENT_THRESHOLD = 5; // Pixels of movement to consider "still"
    const GESTURE_DISCARD_TIMEOUT = 500; // Milliseconds to wait before hiding discarded gesture
    const DIRECTION_CHANGE_THRESHOLD = 4; // Maximum number of direction changes to accept
  
    // State variables
    let isGesturing = false;
    let gesturePoints = [];
    let overlay = null;
    let trailCanvas = null;
    let trailContext = null;
    let previewPopover = null;
    let previewTimeout = null;
    let discardTimeout = null;
    let lastMoveTime = 0;
    let lastPosition = { x: 0, y: 0 };
    let showGesturePreview = true; // Default, will be updated from storage
    let gestureDiscarded = false;
    
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
    
    // Load settings
    chrome.storage.local.get('showGesturePreview', (data) => {
      showGesturePreview = data.showGesturePreview !== false; // Default to true if not set
    });
    
    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.showGesturePreview) {
        showGesturePreview = changes.showGesturePreview.newValue;
      }
    });
  
    // Determine the direction between two points
    function getDirection(p1, p2) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      
      // Convert angle to 8 directions
      const deg = angle * 180 / Math.PI;
      
      // Use direction thresholds for consistent detection
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
      
      // Also remove the preview popover if it exists
      removePreviewPopover();
      
      // Clear any discard timeouts
      if (discardTimeout) {
        clearTimeout(discardTimeout);
        discardTimeout = null;
      }
    }
    
    // Show discard message in popover and schedule hiding
    function showDiscardedGestureMessage(x, y, reason) {
      // Clear any existing timeouts
      if (discardTimeout) {
        clearTimeout(discardTimeout);
      }
      
      // Create or update popover with discard message
      if (!previewPopover) {
        createPreviewPopover("Gesture discarded", x, y, true);
      } else {
        previewPopover.textContent = "Gesture discarded";
        previewPopover.style.backgroundColor = 'rgba(200, 0, 0, 0.8)'; // Red background for discarded gestures
      }
      
      // Set timeout to hide everything after delay
      discardTimeout = setTimeout(() => {
        removeGestureOverlay();
        gestureDiscarded = false;
      }, GESTURE_DISCARD_TIMEOUT);
      
      gestureDiscarded = true;
    }
    
    // Create the preview popover
    function createPreviewPopover(gesture, x, y, isDiscarded = false) {
      // Remove existing popover if there is one
      removePreviewPopover();
      
      // Create the popover element
      previewPopover = document.createElement('div');
      previewPopover.style.position = 'fixed';
      previewPopover.style.left = `${x}px`;
      previewPopover.style.top = `${y + 20}px`; // Position below the cursor
      previewPopover.style.backgroundColor = isDiscarded ? 'rgba(200, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.8)';
      previewPopover.style.color = 'white';
      previewPopover.style.padding = '8px 12px';
      previewPopover.style.borderRadius = '4px';
      previewPopover.style.fontSize = '14px';
      previewPopover.style.fontFamily = 'Arial, sans-serif';
      previewPopover.style.zIndex = '10000000';
      previewPopover.style.pointerEvents = 'none';
      previewPopover.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
      previewPopover.style.transition = 'opacity 0.2s ease-in-out';
      
      if (isDiscarded) {
        previewPopover.textContent = gesture; // For discarded gestures, message is passed directly
        document.body.appendChild(previewPopover);
        
        // Center horizontally on cursor, making sure it stays on screen
        const popoverWidth = previewPopover.offsetWidth;
        const leftPos = Math.max(10, Math.min(x - popoverWidth / 2, window.innerWidth - popoverWidth - 10));
        previewPopover.style.left = `${leftPos}px`;
      } else {
        // Get action description for this gesture
        chrome.storage.local.get('gestures', (data) => {
          const gestures = data.gestures || {};
          const gestureConfig = gestures[gesture];
          
          if (gestureConfig && gestureConfig.action) {
            previewPopover.textContent = `${gesture}: ${gestureConfig.description}`;
          } else {
            previewPopover.textContent = `${gesture}: No action assigned`;
            previewPopover.style.backgroundColor = 'rgba(150, 150, 150, 0.8)'; // Gray out unassigned gestures
          }
          
          // Add to the document
          document.body.appendChild(previewPopover);
          
          // Center horizontally on cursor, making sure it stays on screen
          const popoverWidth = previewPopover.offsetWidth;
          const leftPos = Math.max(10, Math.min(x - popoverWidth / 2, window.innerWidth - popoverWidth - 10));
          previewPopover.style.left = `${leftPos}px`;
        });
      }
    }
    
    // Remove the preview popover
    function removePreviewPopover() {
      if (previewPopover && previewPopover.parentNode) {
        previewPopover.parentNode.removeChild(previewPopover);
        previewPopover = null;
      }
      
      // Clear any pending preview timeouts
      if (previewTimeout) {
        clearTimeout(previewTimeout);
        previewTimeout = null;
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
  
    // Sample points from the gesture to reduce noise and improve recognition
    function samplePoints(points, numSamples = 40) {
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
  
    // Get significant segments of the gesture
    function getSignificantSegments(points) {
      // We'll divide the gesture into three segments and find the dominant direction in each
      const sampledPoints = samplePoints(points);
      
      if (sampledPoints.length < 6) return []; // Need enough points for meaningful analysis
      
      // Calculate total gesture length
      let totalDistance = 0;
      for (let i = 1; i < sampledPoints.length; i++) {
        const p1 = sampledPoints[i - 1];
        const p2 = sampledPoints[i];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
      }
      
      // If gesture is too short, don't process it
      if (totalDistance < MIN_GESTURE_LENGTH) return [];
      
      // Divide into three equal segments (approximately)
      const segmentSize = Math.floor(sampledPoints.length / 3);
      
      const segments = [
        {
          start: 0,
          end: segmentSize,
          points: sampledPoints.slice(0, segmentSize)
        },
        {
          start: segmentSize,
          end: segmentSize * 2,
          points: sampledPoints.slice(segmentSize, segmentSize * 2)
        },
        {
          start: segmentSize * 2,
          end: sampledPoints.length,
          points: sampledPoints.slice(segmentSize * 2)
        }
      ];
      
      // For each segment, determine dominant direction
      segments.forEach(segment => {
        if (segment.points.length < 2) {
          segment.direction = 'unknown';
          return;
        }
        
        // Get direction between first and last point of segment
        segment.direction = getDirection(
          segment.points[0],
          segment.points[segment.points.length - 1]
        );
        
        // If unknown, try intermediate points
        if (segment.direction === 'unknown' && segment.points.length >= 4) {
          segment.direction = getDirection(
            segment.points[Math.floor(segment.points.length / 4)],
            segment.points[Math.floor(segment.points.length * 3 / 4)]
          );
        }
      });
      
      return segments.filter(segment => segment.direction !== 'unknown');
    }
    
    // Check if the gesture is too complex
    function isTooComplex(points) {
      // Sample points to get consistent number for analysis
      const sampledPoints = samplePoints(points, 60); // Use more samples for detailed analysis
      
      if (sampledPoints.length < 10) return false; // Too short to be complex
      
      // 1. Calculate direction changes
      const directions = [];
      
      // Get directions between consecutive points, but with a step to reduce noise
      const step = 4; // Skip points to reduce noise
      for (let i = step; i < sampledPoints.length; i += step) {
        const dir = getDirection(sampledPoints[i - step], sampledPoints[i]);
        if (dir !== 'unknown') directions.push(dir);
      }
      
      // Count unique direction segments (runs of the same direction)
      let uniqueDirections = 0;
      let currentDirection = null;
      
      for (const dir of directions) {
        if (dir !== currentDirection) {
          uniqueDirections++;
          currentDirection = dir;
        }
      }
      
      // If there are too many direction changes, it's complex
      if (uniqueDirections > DIRECTION_CHANGE_THRESHOLD) {
        console.log('Too many direction changes:', uniqueDirections, '- discarding as complex');
        return true;
      }
      
      // 2. Check for specific complex patterns
      
      // Check if gesture touches all four quadrants (circular motion)
      const hasUp = directions.some(d => d.includes('up'));
      const hasDown = directions.some(d => d.includes('down'));
      const hasLeft = directions.some(d => d.includes('left'));
      const hasRight = directions.some(d => d.includes('right'));
      
      // If touches all four quadrants/directions with many changes, likely complex
      if (hasUp && hasDown && hasLeft && hasRight && uniqueDirections > 3) {
        console.log('Touches all directions with multiple changes - discarding as complex');
        return true;
      }
      
      // 3. Check for self-intersections (zigzag or scribble)
      // This is a simple approximation - true intersection detection would be more complex
      
      // Calculate bounding box of gesture
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      sampledPoints.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
      
      const width = maxX - minX;
      const height = maxY - minY;
      const diagonal = Math.sqrt(width * width + height * height);
      
      // If total path length is much longer than diagonal, likely complex
      let pathLength = 0;
      for (let i = 1; i < sampledPoints.length; i++) {
        const dx = sampledPoints[i].x - sampledPoints[i-1].x;
        const dy = sampledPoints[i].y - sampledPoints[i-1].y;
        pathLength += Math.sqrt(dx * dx + dy * dy);
      }
      
      // If path is much longer than diagonal, likely has loops/self-intersections
      if (pathLength > diagonal * 2.5 && diagonal > 50) { // Avoid false positives on tiny gestures
        console.log('Path much longer than diagonal - likely has loops/intersections');
        return true;
      }
      
      return false;
    }
  
    // Process the gesture to identify its pattern
    function processGesture(points) {
      // First check if it's too complex - if so, discard immediately
      if (isTooComplex(points)) {
        return '';
      }
      
      // Get the significant segments of the gesture
      const segments = getSignificantSegments(points);
      
      if (segments.length === 0) return ''; // Not enough clear segments
      if (segments.length === 1) return segments[0].direction; // Single clear direction
      
      // For multi-segment gestures, create a composite pattern
      // But first, deduplicate consecutive identical directions
      const directions = [];
      let lastDirection = null;
      
      segments.forEach(segment => {
        if (segment.direction !== lastDirection) {
          directions.push(segment.direction);
          lastDirection = segment.direction;
        }
      });
      
      // If we have a clear 2 or 3 segment pattern, return it
      if (directions.length >= 2 && directions.length <= 3) {
        return directions.join('-');
      }
      
      // If more than 3 segments, something might be wrong
      // Default to just using first and last segment
      if (directions.length > 3) {
        return `${directions[0]}-${directions[directions.length - 1]}`;
      }
      
      // Fallback - use start to end direction
      return getDirection(points[0], points[points.length - 1]);
    }
  
    // Handle mousedown event
    function handleMouseDown(e) {
      if (e.button !== MOUSE_BUTTON) return;
      
      // Prevent the context menu
      e.preventDefault();
      
      isGesturing = true;
      gesturePoints = [{ x: e.clientX, y: e.clientY }];
      lastPosition = { x: e.clientX, y: e.clientY };
      gestureDiscarded = false;
      
      createGestureOverlay();
    }
  
    // Handle mousemove event
    function handleMouseMove(e) {
      if (!isGesturing) return;
      
      const currentPosition = { x: e.clientX, y: e.clientY };
      gesturePoints.push(currentPosition);
      updateTrail();
      
      // If preview is enabled and the gesture hasn't been discarded, handle preview popover
      if (showGesturePreview && !gestureDiscarded) {
        // Calculate distance moved since last position
        const distance = lastPosition.x !== 0 ? 
          Math.sqrt(Math.pow(currentPosition.x - lastPosition.x, 2) + 
                   Math.pow(currentPosition.y - lastPosition.y, 2)) : 0;
        
        // If movement is minimal, start/continue the preview timer
        if (distance < MOVEMENT_THRESHOLD) {
          // If we don't have a timeout running, start one
          if (!previewTimeout) {
            previewTimeout = setTimeout(() => {
              // Get current gesture
              const currentGesture = processGesture(gesturePoints);
              
              if (currentGesture) {
                createPreviewPopover(currentGesture, currentPosition.x, currentPosition.y);
              } else if (gesturePoints.length > 10) {
                // Gesture is complex enough to be discarded
                showDiscardedGestureMessage(currentPosition.x, currentPosition.y);
              }
              
              previewTimeout = null;
            }, PREVIEW_DELAY);
          }
        } else {
          // If there was significant movement, clear the timeout and remove any existing popover
          if (!gestureDiscarded) {
            removePreviewPopover();
          }
        }
        
        lastPosition = currentPosition;
      }
    }
  
    // Handle mouseup event
    function handleMouseUp(e) {
      if (!isGesturing) return;
      
      isGesturing = false;
      
      const gesture = processGesture(gesturePoints);
      const lastPosition = gesturePoints[gesturePoints.length - 1];
      
      // Check if gesture was discarded
      if (!gesture && gesturePoints.length > 10) {
        // Show discard message if not already shown
        if (!gestureDiscarded) {
          showDiscardedGestureMessage(lastPosition.x, lastPosition.y);
        }
        return; // Don't remove the overlay yet, it will be removed by the timeout
      }
      
      // Only process if we have a valid gesture and not discarded
      if (gesture && !gestureDiscarded) {
        // Log the processed gesture
        console.log('Detected gesture:', gesture);
        
        // Check if the gesture is actually configured with an action
        chrome.storage.local.get('gestures', (data) => {
          const gestures = data.gestures || {};
          
          // Only process the gesture if it's configured with an action
          if (gestures[gesture] && gestures[gesture].action) {
            console.log('Executing gesture:', gesture, 'with action:', gestures[gesture].action);
            
            chrome.runtime.sendMessage({
              type: 'gesturePerformed',
              gesture: gesture
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error sending gesture:', chrome.runtime.lastError);
              }
            });
          } else {
            console.log('Gesture', gesture, 'detected but not configured with any action');
          }
        });
      } else {
        console.log('No gesture detected or gesture too small/complex');
      }
      
      // Remove the gesture overlay if not already handled by discard timeout
      if (!gestureDiscarded) {
        removeGestureOverlay();
      }
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
    
    // Handle window resize - ensure the preview is removed if window is resized during a gesture
    window.addEventListener('resize', () => {
      if (previewPopover) {
        removePreviewPopover();
      }
    });
    
    // Log that the content script has been loaded
    console.log('Private Mouse Gestures content script loaded');
  })();