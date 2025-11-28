from cryptography.fernet import Fernet
import hashlib
import base64

class ShamirSecretSharing:
    
    @staticmethod
    def split_secret(secret: str, threshold: int, num_shares: int):
        shares = {}
        
        for i in range(1, num_shares + 1):
            share_data = f"share_{i}_{secret}_{threshold}"
            share_hash = hashlib.sha256(share_data.encode()).hexdigest()[:32]
            shares[i] = f"{i}-{share_hash}-{threshold}"
            
        return shares
    
    @staticmethod
    def combine_shares(shares):
        if not shares:
            raise ValueError("No shares provided")
        
        share_parts = shares[0].split('-')
        if len(share_parts) >= 2:
            return share_parts[1]
        raise ValueError("Invalid share format")

def generate_key_from_blinks(blink_data):
    if not blink_data:
        raise ValueError("No blink data provided")
    
    pattern_elements = []
    for blink in blink_data:
        timing = blink.get('timestamp', 0)
        duration = blink.get('duration', 0)
        intensity = blink.get('intensity', 0)
        pattern_elements.append(f"{timing}_{duration}_{intensity}")
    
    pattern_str = "|".join(pattern_elements)
    
    key_material = pattern_str.encode()
    for _ in range(1000):
        key_material = hashlib.sha256(key_material).digest()
    
    fernet_key = base64.urlsafe_b64encode(key_material[:32])
    return fernet_key

def encrypt_file(file, key, output_path):
    fernet = Fernet(key)
    file_content = file.read()
    encrypted_content = fernet.encrypt(file_content)
    with open(output_path, 'wb') as f:
        f.write(encrypted_content)

def decrypt_file(encrypted_path, key):
    fernet = Fernet(key)
    with open(encrypted_path, 'rb') as f:
        encrypted_content = f.read()
    return fernet.decrypt(encrypted_content)