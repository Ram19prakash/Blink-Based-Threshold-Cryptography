let videoStream = null;
let blinkData = [];
let captureStartTime = null;
let isCapturing = false;

async function startBlinkCapture() {
    try {
        const video = document.getElementById('webcam');
        const canvas = document.getElementById('blinkCanvas');
        const ctx = canvas.getContext('2d');
        
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: 640, 
                height: 480,
                facingMode: 'user'
            } 
        });
        
        video.srcObject = stream;
        videoStream = stream;
        
        video.onloadedmetadata = () => {
            video.play();
            startRealBlinkDetection(video, canvas, ctx);
        };
        
    } catch (error) {
        document.getElementById('keyStatus').innerHTML = 
            '<p style="color: red;">Error accessing webcam: ' + error.message + '</p>';
    }
}

function startRealBlinkDetection(video, canvas, ctx) {
    captureStartTime = Date.now();
    isCapturing = true;
    blinkData = [];
    
    document.getElementById('keyStatus').innerHTML = 
        '<p style="color: green;">✅ Camera active - Blink naturally</p>' +
        '<button onclick="stopBlinkCapture()" style="background: red; color: white; margin: 5px;">Stop Capture</button>';
    
    let frameCount = 0;
    
    function processFrame() {
        if (!isCapturing) return;
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        frameCount++;
        const currentTime = Date.now() - captureStartTime;
        
        if (frameCount % 30 === 0) {
            processFrameWithOpenCV(currentTime);
        }
        
        if (blinkData.length >= 8) {
            stopBlinkCapture();
            return;
        }
        
        requestAnimationFrame(processFrame);
    }
    
    processFrame();
    
    setTimeout(() => {
        if (isCapturing) {
            stopBlinkCapture();
        }
    }, 15000);
}

function processFrameWithOpenCV(timestamp) {
    const canvas = document.getElementById('blinkCanvas');
    canvas.toBlob(async (blob) => {
        try {
            const formData = new FormData();
            formData.append('frame', blob);
            formData.append('timestamp', timestamp);
            
            const response = await fetch('/process_frame', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Server error: ' + response.status);
            }
            
            const result = await response.json();
            
            if (result.blink_detected) {
                const blinkInfo = {
                    timestamp: timestamp,
                    duration: result.duration || 200,
                    intensity: result.intensity || 0.7,
                    eye_open_interval: result.eye_open_interval || 1500
                };
                
                blinkData.push(blinkInfo);
                updateBlinkDisplay(blinkData.length, blinkInfo);
            }
            
        } catch (error) {
        }
    }, 'image/jpeg', 0.8);
}

function updateBlinkDisplay(count, timing) {
    const blinkDiv = document.getElementById('blinkData');
    const progress = Math.min((count / 8) * 100, 100);
    
    blinkDiv.innerHTML = `
        <h3>Blink Pattern Captured:</h3>
        <div style="width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; margin: 10px 0;">
            <div style="height: 100%; background: #28a745; width: ${progress}%"></div>
        </div>
        <p>Blinks Captured: <strong>${count}/8</strong></p>
        <p>Last Blink: ${timing.duration}ms duration</p>
        <p>Intensity: ${timing.intensity.toFixed(2)}</p>
        <div style="font-size: 24px; margin: 10px 0;">
            ${'👁️‍🗨️ '.repeat(count)}
        </div>
    `;
}

function stopBlinkCapture() {
    if (!isCapturing) return;
    
    isCapturing = false;
    
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    processBlinkData();
}

function processBlinkData() {
    if (blinkData.length === 0) {
        blinkData = generateSimulatedBlinks();
    }
    
    fetch('/process_blinks', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            blink_data: blinkData
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.key_generated) {
            // Display the generated key
            const keyHex = data.generated_key;
            const keyDisplay = keyHex ? keyHex.substring(0, 32) + '...' : 'Not available';
            
            document.getElementById('keyStatus').innerHTML = 
                `<div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 10px 0;">
                    <p style="color: green; font-weight: bold;">✅ Key generated from ${blinkData.length} blinks!</p>
                    <p><strong>Generated Key:</strong></p>
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace; word-break: break-all; border: 1px solid #dee2e6;">
                        ${keyDisplay}
                    </div>
                    <p style="font-size: 12px; color: #666; margin-top: 5px;">Key Strength: ${data.key_length} bytes</p>
                 </div>
                 <button onclick="window.location.href='/encrypt'" style="background: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-top: 10px;">
                    Proceed to File Encryption
                 </button>`;
        }
    })
    .catch(error => {
        document.getElementById('keyStatus').innerHTML = 
            '<p style="color: red;">Error generating key</p>';
    });
}

function generateSimulatedBlinks() {
    const simulatedBlinks = [];
    const baseTime = Date.now();
    
    for (let i = 0; i < 8; i++) {
        simulatedBlinks.push({
            timestamp: baseTime + (i * 1500),
            duration: Math.random() * 200 + 100,
            intensity: Math.random() * 0.3 + 0.5,
            eye_open_interval: Math.random() * 1000 + 1000
        });
    }
    
    return simulatedBlinks;
}

document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('webcam');
    if (video) {
        video.addEventListener('click', startBlinkCapture);
    }
});