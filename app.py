from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
import os
import time
import tempfile
import cv2
from blink_capture import BlinkDetector
from crypto_utils import generate_key_from_blinks, ShamirSecretSharing, encrypt_file, decrypt_file

app = Flask(__name__)
app.secret_key = 'your-secret-key-here-make-it-strong'
app.config['UPLOAD_FOLDER'] = 'uploads'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

file_key = None
shares = {}
pending_requests = []
threshold = 3

socketio = SocketIO(app, cors_allowed_origins="*")
blink_detector = BlinkDetector()

@app.before_request
def before_request():
    if not hasattr(blink_detector, 'blink_data'):
        blink_detector.blink_data = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/start_blink_capture')
def start_blink_capture():
    return jsonify({'status': 'ready'})

@app.route('/process_blinks', methods=['POST'])
def process_blinks():
    global file_key
    try:
        blink_data = request.json['blink_data']
        file_key = generate_key_from_blinks(blink_data)
        
        # Convert key to hex for display
        key_hex = file_key.hex() if file_key else None
        
        return jsonify({
            'key_generated': True, 
            'key_length': len(file_key),
            'generated_key': key_hex
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/encrypt')
def encrypt_page():
    return render_template('encrypt.html')

@app.route('/upload_encrypt', methods=['POST'])
def upload_encrypt():
    global file_key, shares
    
    try:
        if 'document' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['document']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        n_users = int(request.form.get('n_users', 3))
        threshold = int(request.form.get('threshold', 2))
        
        if threshold > n_users:
            return jsonify({'error': 'Threshold cannot be greater than number of users'}), 400
        
        if file_key is None:
            return jsonify({'error': 'No key generated. Please complete blink capture first.'}), 400
        
        key_string = file_key.decode('utf-8')
        shares = ShamirSecretSharing.split_secret(key_string, threshold, n_users)
        
        filename = f"encrypted_{file.filename}"
        encrypted_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        encrypt_file(file, file_key, encrypted_path)
        
        session['n_users'] = n_users
        session['threshold'] = threshold
        session['encrypted_file'] = filename
        session['original_filename'] = file.filename
        
        return jsonify({
            'status': 'encrypted', 
            'shares': len(shares),
            'file_path': encrypted_path,
            'n_users': n_users,
            'threshold': threshold,
            'encrypted_file': filename
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/users')
def users_page():
    n_users = session.get('n_users', 3)
    threshold = session.get('threshold', 2)
    encrypted_file = session.get('encrypted_file', 'No file encrypted')
    original_filename = session.get('original_filename', '')
    
    return render_template('users.html', 
                         n_users=n_users, 
                         threshold=threshold,
                         encrypted_file=encrypted_file,
                         original_filename=original_filename)

@app.route('/request_access', methods=['POST'])
def request_access():
    user_id = request.json['user_id']
    
    request_info = {
        'user_id': user_id,
        'timestamp': time.time(),
        'status': 'pending'
    }
    pending_requests.append(request_info)
    
    return jsonify({'status': 'request_sent', 'request_id': len(pending_requests)})

@app.route('/get_pending_requests')
def get_pending_requests():
    return jsonify({'requests': pending_requests})

@app.route('/grant_permission', methods=['POST'])
def grant_permission():
    user_id = request.json['user_id']
    share = request.json.get('share')
    
    for req in pending_requests:
        if req['user_id'] == user_id:
            req['status'] = 'granted'
            break
    
    return jsonify({'status': 'permission_granted', 'user_id': user_id})

@app.route('/attempt_decrypt', methods=['POST'])
def attempt_decrypt():
    try:
        submitted_shares = request.json['shares']
        current_threshold = session.get('threshold', 2)
        
        if len(submitted_shares) >= current_threshold:
            return jsonify({
                'status': 'success', 
                'decrypted': True,
                'message': 'Document decrypted successfully'
            })
        else:
            return jsonify({
                'status': 'insufficient_shares', 
                'alarm': True,
                'collected': len(submitted_shares),
                'required': current_threshold
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/process_frame', methods=['POST'])
def process_frame():
    try:
        if 'frame' not in request.files:
            return jsonify({'error': 'No frame provided'}), 400
        
        frame_file = request.files['frame']
        timestamp = float(request.form.get('timestamp', 0))
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_file:
            frame_file.save(temp_file.name)
            temp_path = temp_file.name
        
        try:
            frame = cv2.imread(temp_path)
            
            if frame is None:
                return jsonify({'error': 'Could not read frame'}), 400
            
            blink_detected = blink_detector.detect_blinks(frame)
            
            result = {
                'blink_detected': blink_detected,
                'timestamp': timestamp,
                'frame_processed': True
            }
            
            if blink_detected and hasattr(blink_detector, 'blink_data') and blink_detector.blink_data:
                last_blink = blink_detector.blink_data[-1]
                result.update({
                    'duration': last_blink.get('duration', 0) * 1000,
                    'intensity': last_blink.get('intensity', 0),
                    'eye_open_interval': last_blink.get('eye_open_interval', 0) * 1000
                })
            
            return jsonify(result)
            
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            
    except Exception as e:
        print(f"Error processing frame: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/get_shares')
def get_shares():
    return jsonify({'shares': shares})

@app.route('/get_encryption_info')
def get_encryption_info():
    return jsonify({
        'n_users': session.get('n_users', 3),
        'threshold': session.get('threshold', 2),
        'encrypted_file': session.get('encrypted_file', ''),
        'original_filename': session.get('original_filename', '')
    })

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('connection_established', {'data': 'Connected'})

@socketio.on('request_permission')
def handle_permission_request(data):
    user_id = data['user_id']
    print(f"User {user_id} requested permission")
    
    emit('permission_requested', {
        'requesting_user': user_id,
        'message': f'User {user_id} is requesting access to the document'
    }, broadcast=True, include_self=False)
    
    request_info = {
        'user_id': user_id,
        'timestamp': time.time(),
        'status': 'pending'
    }
    pending_requests.append(request_info)

@socketio.on('grant_permission')
def handle_grant_permission(data):
    """Handle when a user grants permission"""
    granting_user = data['granting_user']
    requesting_user = data['requesting_user']
    
    print(f"User {granting_user} granted access to User {requesting_user}")
    
    # Notify all users
    emit('grant_permission', {
        'granting_user': granting_user,
        'requesting_user': requesting_user,
        'current_count': data['current_count'],
        'needed_count': data['needed_count'],
        'granted_users': data['granted_users']
    }, broadcast=True)

@socketio.on('threshold_met')
def handle_threshold_met(data):
    """Handle when threshold is met"""
    requesting_user = data['requesting_user']
    
    print(f"Threshold met for User {requesting_user}")
    
    # Notify all users
    emit('threshold_met', {
        'requesting_user': requesting_user,
        'granted_users': data['granted_users']
    }, broadcast=True)

@socketio.on('unauthorized_attempt')
def handle_unauthorized_attempt(data):
    """Handle unauthorized access attempts"""
    user_id = data['user_id']
    message = data['message']
    
    print(f"Unauthorized attempt by User {user_id}: {message}")
    
    # Notify all users
    emit('unauthorized_attempt', {
        'user_id': user_id,
        'message': message
    }, broadcast=True, include_self=False)



if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)