
document.addEventListener('DOMContentLoaded', () => {
    const gestureList = document.getElementById('gestureList');
    const optionsLink = document.getElementById('optionsLink');
    
    // Load and display configured gestures
    chrome.storage.local.get('gestures', (data) => {
      const gestures = data.gestures || {};
      
      // Clear current content
      gestureList.innerHTML = '';
      
      // Check if we have any gestures configured
      const configuredGestures = Object.keys(gestures);
      if (configuredGestures.length === 0) {
        gestureList.innerHTML = '<p>No gestures configured. Click "Customize Gestures" to set them up.</p>';
        return;
      }
      
      // Create a list of current gestures
      configuredGestures.forEach(gesture => {
        const item = document.createElement('div');
        item.className = 'gesture-item';
        
        const gestureName = document.createElement('span');
        gestureName.textContent = gesture;
        
        const actionName = document.createElement('span');
        actionName.textContent = gestures[gesture].description;
        
        item.appendChild(gestureName);
        item.appendChild(actionName);
        gestureList.appendChild(item);
      });
    });
    
    // Open options page when link is clicked
    optionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  });