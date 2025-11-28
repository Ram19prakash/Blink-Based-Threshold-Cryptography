let collectedShares = [];
let userShares = {};
let permissionRequestedBy = null;
let permissionGivers = [];
let nUsers;
let threshold;
const socket = io();

function initializeConfig() {
    const container = document.getElementById('userContainer');
    nUsers = parseInt(container.getAttribute('data-n-users')) || 3;
    threshold = parseInt(container.getAttribute('data-threshold')) || 2;
}

function initializeUserShares() {
    fetch('/get_shares')
        .then(response => response.json())
        .then(data => {
            if (data.shares && Object.keys(data.shares).length > 0) {
                userShares = data.shares;
                console.log('Shares loaded successfully:', userShares);
            } else {
                console.log('No shares from backend, generating fallback shares');
                generateFallbackShares();
            }
        })
        .catch(error => {
            console.error('Error loading shares:', error);
            generateFallbackShares();
        });
}

function generateFallbackShares() {
    userShares = {};
    for (let i = 1; i <= nUsers; i++) {
        userShares[i] = `share-user-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    }
    console.log('Fallback shares generated:', userShares);
}

function openDocument(userId) {
    if (permissionRequestedBy === null) {
        showNotification('You need to ask for permission first', 'error');
        socket.emit('unauthorized_attempt', {
            user_id: userId,
            message: `User ${userId} attempted to open document without requesting permission`
        });
        return;
    }
    
    if (permissionRequestedBy !== userId) {
        showNotification(`Only User ${permissionRequestedBy} can open the document`, 'error');
        return;
    }
    
    if (permissionGivers.length < threshold) {
        const needed = threshold - permissionGivers.length;
        showNotification(`Need ${needed} more permission(s) to open document`, 'warning');
        return;
    }
    
    // Success - open document
    actuallyOpenDocument(userId);
}

function actuallyOpenDocument(userId) {
    showSuccess(`Document opened successfully for User ${userId}!`);
    
    // Simulate document opening (replace with actual implementation)
    const documentContent = `
        <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #28a745;">
            <h3 style="color: #28a745;">📄 Document: ${document.getElementById('encryptedFileName').textContent}</h3>
            <p><strong>Opened by:</strong> User ${userId}</p>
            <p><strong>Access granted by:</strong> Users ${permissionGivers.join(', ')}</p>
            <p><strong>Content:</strong> This is the decrypted document content. The file has been successfully accessed with ${permissionGivers.length} permissions.</p>
            <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                <strong>Document Security Log:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>✅ Biometric key verified</li>
                    <li>✅ Threshold cryptography satisfied</li>
                    <li>✅ ${permissionGivers.length}/${threshold} permissions granted</li>
                    <li>✅ Document decrypted successfully</li>
                </ul>
            </div>
        </div>
    `;
    
    const alarmSection = document.getElementById('alarmSection');
    alarmSection.innerHTML = documentContent;
    
    // Reset after 10 seconds
    setTimeout(() => {
        resetPermissionState();
    }, 10000);
}

function askPermission(userId) {
    if (permissionRequestedBy !== null) {
        showNotification(`User ${permissionRequestedBy} is already requesting access`, 'error');
        return;
    }
    
    // Ensure user shares are available
    if (!userShares[userId]) {
        showNotification('No share available for your user', 'error');
        return;
    }
    
    permissionRequestedBy = userId;
    permissionGivers = [userId]; // Requester automatically grants to themselves
    collectedShares = userShares[userId] ? [userShares[userId]] : [];
    
    updateStatus(userId, 'Requesting access...', 'blue');
    
    // Show progress section
    document.getElementById('accessProgress').style.display = 'block';
    
    // Notify all users via Socket.IO
    socket.emit('request_permission', { 
        user_id: userId,
        message: `User ${userId} is requesting to open the document`
    });
    
    // Update UI for all users
    updateUIForPermissionRequest();
    updateProgressDisplay();
    
    // Send to backend
    fetch('/request_access', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            user_id: userId
        })
    });
}

function grantAccess(userId) {
    if (permissionRequestedBy === null) {
        showNotification('No access request pending', 'error');
        return;
    }
    
    if (permissionGivers.includes(userId)) {
        showNotification('You have already granted access', 'info');
        return;
    }
    
    // Check if user has a share
    if (!userShares[userId]) {
        showNotification(`No share available for User ${userId}. Please wait for shares to load.`, 'error');
        console.log('Available shares:', userShares);
        return;
    }
    
    // Add to permission givers
    permissionGivers.push(userId);
    if (userShares[userId] && !collectedShares.includes(userShares[userId])) {
        collectedShares.push(userShares[userId]);
    }
    
    updateStatus(userId, `Access granted to User ${permissionRequestedBy} ✓`, 'green');
    
    // Update UI and progress
    updateProgressDisplay();
    
    // Notify via Socket.IO
    socket.emit('grant_permission', {
        granting_user: userId,
        requesting_user: permissionRequestedBy,
        current_count: permissionGivers.length,
        needed_count: threshold,
        granted_users: permissionGivers
    });
    
    // Check if threshold is met
    if (permissionGivers.length >= threshold) {
        showSuccess(`Threshold reached! User ${permissionRequestedBy} can now open the document.`);
        enableOpenButton(permissionRequestedBy);
        
        // Notify all users that threshold is met
        socket.emit('threshold_met', {
            requesting_user: permissionRequestedBy,
            granted_users: permissionGivers
        });
    }
    
    // Send to backend
    fetch('/grant_permission', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            user_id: userId,
            share: userShares[userId]
        })
    });
}

function updateUIForPermissionRequest() {
    for (let i = 1; i <= nUsers; i++) {
        const userCard = document.getElementById(`user-${i}`);
        const buttons = userCard.querySelectorAll('button');
        const statusDiv = document.getElementById(`status-${i}`);
        
        if (i === permissionRequestedBy) {
            // User who requested permission
            userCard.style.background = '#fff3cd';
            userCard.style.border = '3px solid #ffc107';
            statusDiv.innerHTML = `
                <strong>You requested access</strong><br>
                <small>Waiting for permissions from other users</small>
            `;
            buttons[0].style.background = '#6c757d';
            buttons[0].innerHTML = '🔒 Open Document';
        } else {
            // Other users
            userCard.style.background = '#e3f2fd';
            userCard.style.border = '2px solid #2196f3';
            statusDiv.innerHTML = `
                <strong>User ${permissionRequestedBy} requested access</strong><br>
                <small>Click "Grant Access" to help them</small>
            `;
            buttons[0].style.background = '#6c757d';
            buttons[0].innerHTML = '🔒 Open Document';
        }
    }
    
    // Show request notification
    showNotification(`User ${permissionRequestedBy} is requesting to open the document. They need ${threshold} grants.`, 'info');
}

function updateProgressDisplay() {
    const progress = Math.min((permissionGivers.length / threshold) * 100, 100);
    const progressBar = document.getElementById('progressBar');
    const progressDetails = document.getElementById('progressDetails');
    const grantedUsers = document.getElementById('grantedUsers');
    const progressTitle = document.getElementById('progressTitle');
    
    progressBar.style.width = `${progress}%`;
    progressTitle.textContent = `Access Progress for User ${permissionRequestedBy}`;
    progressDetails.innerHTML = `
        <strong>${permissionGivers.length}/${threshold} Grants</strong> • 
        ${threshold - permissionGivers.length} more needed
    `;
    
    if (permissionGivers.length > 0) {
        grantedUsers.innerHTML = `
            <strong>Granted by:</strong> Users ${permissionGivers.join(', ')}
            ${permissionGivers.length >= threshold ? ' ✅' : ''}
        `;
    } else {
        grantedUsers.innerHTML = '<strong>Granted by:</strong> No grants yet';
    }
    
    // Update progress bar color based on progress
    if (progress >= 100) {
        progressBar.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
    } else if (progress >= 50) {
        progressBar.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
    } else {
        progressBar.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
    }
}

function enableOpenButton(userId) {
    const userCard = document.getElementById(`user-${userId}`);
    const buttons = userCard.querySelectorAll('button');
    const statusDiv = document.getElementById(`status-${userId}`);
    
    buttons[0].style.background = '#28a745';
    buttons[0].innerHTML = '✅ Open Document';
    
    statusDiv.innerHTML = `
        <strong>Access Ready! ✅</strong><br>
        <small>You can now open the document</small>
    `;
    statusDiv.style.color = 'green';
}

function showNotification(message, type = 'info') {
    const notificationArea = document.getElementById('notificationArea');
    const notification = document.createElement('div');
    
    const bgColors = {
        error: 'linear-gradient(135deg, #f8d7da, #f5c6cb)',
        success: 'linear-gradient(135deg, #d4edda, #c3e6cb)',
        warning: 'linear-gradient(135deg, #fff3cd, #ffeaa7)',
        info: 'linear-gradient(135deg, #e3f2fd, #bbdefb)'
    };
    
    const textColors = {
        error: '#721c24',
        success: '#155724',
        warning: '#856404',
        info: '#0c5460'
    };
    
    const borders = {
        error: '#dc3545',
        success: '#28a745',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    notification.innerHTML = message;
    notification.style.cssText = `
        padding: 15px;
        margin: 10px 0;
        border-radius: 10px;
        background: ${bgColors[type]};
        color: ${textColors[type]};
        font-weight: bold;
        border-left: 4px solid ${borders[type]};
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    notificationArea.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

function triggerAlarm(message) {
    const alarmSection = document.getElementById('alarmSection');
    alarmSection.innerHTML = `
        <div style="background: linear-gradient(135deg, #f8d7da, #f5c6cb); color: #721c24; padding: 15px; border-radius: 15px; text-align: center; font-weight: bold; margin: 10px 0; border-left: 4px solid #dc3545; animation: pulse 2s infinite;">
            🚨 ${message} 🚨
        </div>
    `;
    
    setTimeout(() => {
        alarmSection.innerHTML = '';
    }, 5000);
}

function showSuccess(message) {
    const alarmSection = document.getElementById('alarmSection');
    alarmSection.innerHTML = `
        <div style="background: linear-gradient(135deg, #d4edda, #c3e6cb); color: #155724; padding: 15px; border-radius: 15px; text-align: center; font-weight: bold; margin: 10px 0; border-left: 4px solid #28a745;">
            ✅ ${message}
        </div>
    `;
}

function resetPermissionState() {
    permissionRequestedBy = null;
    permissionGivers = [];
    collectedShares = [];
    
    // Hide progress section
    document.getElementById('accessProgress').style.display = 'none';
    
    // Reset all users to normal state
    for (let i = 1; i <= nUsers; i++) {
        const userCard = document.getElementById(`user-${i}`);
        const userStatus = document.getElementById(`status-${i}`);
        const buttons = userCard.querySelectorAll('button');
        
        userCard.style.background = '#f9f9f9';
        userCard.style.border = '1px solid #ddd';
        userStatus.innerHTML = 'Ready';
        userStatus.style.color = 'black';
        
        // Reset Open button to locked state
        buttons[0].style.background = '#6c757d';
        buttons[0].innerHTML = '🔒 Open Document';
    }
    
    // Clear notifications
    document.getElementById('notificationArea').innerHTML = '';
    document.getElementById('alarmSection').innerHTML = '';
}

function updateStatus(userId, message, color) {
    const statusDiv = document.getElementById(`status-${userId}`);
    if (statusDiv) {
        statusDiv.innerHTML = message;
        statusDiv.style.color = color;
    }
}

// Socket.IO event handlers
socket.on('request_permission', (data) => {
    if (data.user_id !== permissionRequestedBy) {
        permissionRequestedBy = data.user_id;
        permissionGivers = [data.user_id];
        document.getElementById('accessProgress').style.display = 'block';
        updateUIForPermissionRequest();
        updateProgressDisplay();
    }
});

socket.on('grant_permission', (data) => {
    if (!permissionGivers.includes(data.granting_user)) {
        permissionGivers.push(data.granting_user);
        updateProgressDisplay();
        
        showNotification(`User ${data.granting_user} granted access to User ${data.requesting_user}`, 'info');
        
        if (permissionGivers.length >= threshold) {
            showSuccess(`Threshold reached! User ${permissionRequestedBy} can now open the document.`);
            enableOpenButton(permissionRequestedBy);
        }
    }
});

socket.on('threshold_met', (data) => {
    showSuccess(`Threshold met! User ${data.requesting_user} can now open the document. Granted by: Users ${data.granted_users.join(', ')}`, 'success');
    if (permissionRequestedBy === data.requesting_user) {
        enableOpenButton(data.requesting_user);
    }
});

socket.on('unauthorized_attempt', (data) => {
    showNotification(`User ${data.user_id} attempted unauthorized access!`, 'error');
});

function generateUserCards() {
    const userContainer = document.getElementById('userContainer');
    userContainer.innerHTML = '';
    
    for (let i = 1; i <= nUsers; i++) {
        const userCard = document.createElement('div');
        userCard.className = 'user-card';
        userCard.id = `user-${i}`;
        userCard.style.cssText = `
            border: 1px solid #ddd;
            padding: 20px;
            border-radius: 15px;
            text-align: center;
            background: #f9f9f9;
            margin: 15px;
            transition: all 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.08);
        `;
        userCard.innerHTML = `
            <h3 style="color: #2c3e50; margin-bottom: 15px; font-size: 1.3rem;">User ${i}</h3>
            <button style="margin: 5px; padding: 12px 15px; cursor: pointer; background: #6c757d; color: white; border: none; border-radius: 25px; font-weight: 600; width: 100%; transition: all 0.3s ease;">🔒 Open Document</button>
            <button style="margin: 5px; padding: 12px 15px; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 25px; font-weight: 600; width: 100%; transition: all 0.3s ease;">Grant Access</button>
            <button style="margin: 5px; padding: 12px 15px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 25px; font-weight: 600; width: 100%; transition: all 0.3s ease;">Ask Permission</button>
            <div class="status" id="status-${i}" style="margin-top: 15px; padding: 10px; font-weight: bold; min-height: 50px; background: #f8f9fa; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; line-height: 1.4;">Ready</div>
        `;
        userContainer.appendChild(userCard);
    }
    
    // Add event listeners after creating cards
    for (let i = 1; i <= nUsers; i++) {
        const userCard = document.getElementById(`user-${i}`);
        const buttons = userCard.querySelectorAll('button');
        buttons[0].onclick = () => openDocument(i);  // Open Document
        buttons[1].onclick = () => grantAccess(i);   // Grant Access
        buttons[2].onclick = () => askPermission(i); // Ask Permission
    }
    
    // Initialize user shares with a small delay to ensure DOM is ready
    setTimeout(() => {
        initializeUserShares();
    }, 100);
}

document.addEventListener('DOMContentLoaded', function() {
    initializeConfig();
    generateUserCards();
});