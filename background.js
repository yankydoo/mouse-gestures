// background.js - Service worker for the extension
const DEFAULT_GESTURES = {
  'down-right': { action: 'closeTab', description: 'Close current tab' },
  'left': { action: 'back', description: 'Go back' },
  'right': { action: 'forward', description: 'Go forward' },
  'up-left': { action: 'newTab', description: 'Open new tab' },
  'down-up': { action: 'reload', description: 'Reload page' }
};

// Initialize default gestures on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  chrome.storage.local.get('gestures', (data) => {
    if (!data.gestures) {
      console.log('Setting default gestures');
      chrome.storage.local.set({ gestures: DEFAULT_GESTURES });
    } else {
      console.log('Existing gestures found:', data.gestures);
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message, 'from tab:', sender.tab.id);
  
  if (message.type === 'gesturePerformed') {
    console.log('Gesture performed:', message.gesture);
    handleGesture(message.gesture, sender.tab.id);
    // Send a response to avoid "The message port closed before a response was received" error
    sendResponse({status: 'Processing gesture: ' + message.gesture});
  }
  
  return true; // Keep the message channel open for sendResponse
});

// Handle the gesture actions
function handleGesture(gesture, tabId) {
  chrome.storage.local.get('gestures', (data) => {
    const gestureConfig = data.gestures[gesture];
    if (!gestureConfig) return;

    switch (gestureConfig.action) {
      case 'back':
        chrome.tabs.sendMessage(tabId, { action: 'back' });
        break;
      case 'forward':
        chrome.tabs.sendMessage(tabId, { action: 'forward' });
        break;
      case 'reload':
        chrome.tabs.reload(tabId);
        break;
      case 'closeTab':
        chrome.tabs.remove(tabId);
        break;
      case 'newTab':
        chrome.tabs.create({ active: true });
        break;
      case 'scrollUp':
        chrome.tabs.sendMessage(tabId, { action: 'scrollUp' });
        break;
      case 'scrollDown':
        chrome.tabs.sendMessage(tabId, { action: 'scrollDown' });
        break;
      case 'scrollTop':
        chrome.tabs.sendMessage(tabId, { action: 'scrollTop' });
        break;
      case 'scrollBottom':
        chrome.tabs.sendMessage(tabId, { action: 'scrollBottom' });
        break;
      // Add more actions as needed
    }
  });
}