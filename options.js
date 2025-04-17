
// options.js - Script for the options page
document.addEventListener('DOMContentLoaded', () => {
    const gestureTableBody = document.getElementById('gestureTableBody');
    const saveButton = document.getElementById('saveButton');
    
    const AVAILABLE_ACTIONS = [
      { id: 'back', name: 'Go back' },
      { id: 'forward', name: 'Go forward' },
      { id: 'reload', name: 'Reload page' },
      { id: 'closeTab', name: 'Close tab' },
      { id: 'newTab', name: 'New tab' },
      { id: 'scrollUp', name: 'Scroll up' },
      { id: 'scrollDown', name: 'Scroll down' },
      { id: 'scrollTop', name: 'Scroll to top' },
      { id: 'scrollBottom', name: 'Scroll to bottom' }
    ];
    
    const GESTURES = [
      'up',
      'down',
      'left',
      'right',
      'up-right',
      'up-left',
      'down-right',
      'down-left',
      'right-up',
      'right-down',
      'left-up',
      'left-down',
      'up-down',
      'down-up',
      'left-right',
      'right-left'
    ];
    
    // Load current settings
    function loadSettings() {
      chrome.storage.local.get('gestures', (data) => {
        const gestures = data.gestures || {};
        
        // Clear the table
        gestureTableBody.innerHTML = '';
        
        // Add a row for each possible gesture
        GESTURES.forEach(gesture => {
          const row = document.createElement('tr');
          
          // Gesture cell
          const gestureCell = document.createElement('td');
          gestureCell.textContent = gesture;
          row.appendChild(gestureCell);
          
          // Action cell
          const actionCell = document.createElement('td');
          const actionSelect = document.createElement('select');
          actionSelect.setAttribute('data-gesture', gesture);
          
          // Add "None" option
          const noneOption = document.createElement('option');
          noneOption.value = '';
          noneOption.textContent = 'None';
          actionSelect.appendChild(noneOption);
          
          // Add all available actions
          AVAILABLE_ACTIONS.forEach(action => {
            const option = document.createElement('option');
            option.value = action.id;
            option.textContent = action.name;
            actionSelect.appendChild(option);
          });
          
          // Set the current value
          if (gestures[gesture]) {
            actionSelect.value = gestures[gesture].action;
          }
          
          actionCell.appendChild(actionSelect);
          row.appendChild(actionCell);
          
          // Description cell
          const descCell = document.createElement('td');
          const description = (gestures[gesture] && gestures[gesture].description) || 
                             (AVAILABLE_ACTIONS.find(a => a.id === actionSelect.value) || {}).name || 
                             'No action';
          descCell.textContent = description;
          row.appendChild(descCell);
          
          // Update description when action changes
          actionSelect.addEventListener('change', () => {
            const selectedAction = AVAILABLE_ACTIONS.find(a => a.id === actionSelect.value);
            descCell.textContent = selectedAction ? selectedAction.name : 'No action';
            saveSettings();
          });
          
          gestureTableBody.appendChild(row);
        });
      });
    }
    
    // Save settings
    function saveSettings() {
      const gestures = {};
      
      // Get all select elements
      const selects = document.querySelectorAll('select[data-gesture]');
      
      selects.forEach(select => {
        const gesture = select.getAttribute('data-gesture');
        const action = select.value;
        
        if (action) {  // Only save if an action is selected
          const actionObj = AVAILABLE_ACTIONS.find(a => a.id === action);
          gestures[gesture] = {
            action: action,
            description: actionObj ? actionObj.name : 'Unknown action'
          };
        }
      });
      
      chrome.storage.local.set({ gestures: gestures }, () => {
        // Show saved message
        const saveButton = document.getElementById('saveButton');
        saveButton.textContent = 'Settings Saved!';
        setTimeout(() => {
          saveButton.textContent = 'Save Settings';
        }, 2000);
      });
    }
    
    // Initialize
    loadSettings();
    
    // Save button
    saveButton.addEventListener('click', saveSettings);
  });