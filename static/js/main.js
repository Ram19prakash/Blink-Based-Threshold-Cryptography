function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.innerHTML = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px;
        background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#4444ff'};
        color: white;
        border-radius: 5px;
        z-index: 1000;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

document.addEventListener('DOMContentLoaded', function() {
    const encryptForm = document.getElementById('encryptForm');
    if (encryptForm) {
        encryptForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData();
            const fileInput = document.getElementById('document');
            const nUsers = document.getElementById('n_users').value;
            const threshold = document.getElementById('threshold').value;
            
            if (fileInput.files.length === 0) {
                showNotification('Please select a file', 'error');
                return;
            }
            
            formData.append('document', fileInput.files[0]);
            formData.append('n_users', nUsers);
            formData.append('threshold', threshold);
            
            fetch('/upload_encrypt', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'encrypted') {
                    showNotification(`File "${fileInput.files[0].name}" encrypted! ${data.shares} shares generated`, 'success');
                    setTimeout(() => {
                        window.location.href = '/users';
                    }, 2000);
                }
            })
            .catch(error => {
                showNotification('Encryption failed', 'error');
            });
        });
    }
});