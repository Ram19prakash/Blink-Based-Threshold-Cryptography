import cv2
import time
import numpy as np
import mediapipe as mp

class BlinkDetector:
    def __init__(self):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        self.LEFT_EYE = [362, 385, 387, 263, 373, 380]
        self.RIGHT_EYE = [33, 160, 158, 133, 153, 144]
        
        self.blink_data = []
        self.eye_open = True
        self.last_blink_time = time.time()
        self.last_ear = 0.0
        
    def eye_aspect_ratio(self, landmarks, eye_indices):
        try:
            points = [landmarks[i] for i in eye_indices]
            
            vert1 = np.linalg.norm(np.array(points[1]) - np.array(points[5]))
            vert2 = np.linalg.norm(np.array(points[2]) - np.array(points[4]))
            horiz = np.linalg.norm(np.array(points[0]) - np.array(points[3]))
            
            if horiz == 0:
                return 0.0
                
            ear = (vert1 + vert2) / (2.0 * horiz)
            return ear
            
        except Exception as e:
            return 0.0
        
    def detect_blinks(self, frame):
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb_frame)
        
        blink_detected = False
        current_time = time.time()
        
        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            h, w = frame.shape[:2]
            
            landmark_points = []
            for lm in landmarks:
                x, y = int(lm.x * w), int(lm.y * h)
                landmark_points.append((x, y))
            
            left_ear = self.eye_aspect_ratio(landmark_points, self.LEFT_EYE)
            right_ear = self.eye_aspect_ratio(landmark_points, self.RIGHT_EYE)
            
            if left_ear > 0 and right_ear > 0:
                ear = (left_ear + right_ear) / 2.0
                self.last_ear = ear
                
                if ear < 0.2:
                    if self.eye_open:
                        blink_detected = True
                        blink_duration = current_time - self.last_blink_time
                        
                        blink_info = {
                            'timestamp': current_time,
                            'duration': 0,
                            'intensity': max(0.1, 1 - (ear / 0.2)),
                            'eye_open_interval': max(100, blink_duration * 1000)
                        }
                        self.blink_data.append(blink_info)
                        
                    self.eye_open = False
                else:
                    if not self.eye_open and self.blink_data:
                        blink_duration = current_time - self.last_blink_time
                        self.blink_data[-1]['duration'] = max(50, blink_duration * 1000)
                    
                    self.eye_open = True
                    self.last_blink_time = current_time
        else:
            self.eye_open = True
            self.last_ear = 0.3
        
        return blink_detected
        
    def get_blink_pattern(self):
        return self.blink_data
    
    def get_blink_count(self):
        return len(self.blink_data)
        
    def reset_blink_data(self):
        self.blink_data = []
        self.eye_open = True
        self.last_blink_time = time.time()
        self.last_ear = 0.0
        
    def get_current_ear(self):
        return self.last_ear
        
    def release(self):
        self.face_mesh.close()

def test_blink_detection():
    detector = BlinkDetector()
    cap = cv2.VideoCapture(0)
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        blink_detected = detector.detect_blinks(frame)
        
        ear = detector.get_current_ear()
        cv2.putText(frame, f"EAR: {ear:.3f}", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        blink_count = detector.get_blink_count()
        cv2.putText(frame, f"Blinks: {blink_count}", (10, 60), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        if blink_detected:
            cv2.putText(frame, "BLINK!", (10, 90), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
        cv2.imshow('Blink Detection Test', frame)
        
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('r'):
            detector.reset_blink_data()
    
    cap.release()
    cv2.destroyAllWindows()
    detector.release()

if __name__ == "__main__":
    test_blink_detection()