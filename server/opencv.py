import cv2
import mediapipe as mp
from multiprocessing import Process

mp_draw = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles
mp_pose = mp.solutions.pose


def get_pose(img):
    imgRGB = cv2.cvtColor(img.copy(), cv2.COLOR_BGR2RGB)
    imgRGB.flags.writeable = False  # perf optimization
    pose = mp_pose.Pose()
    results = pose.process(imgRGB)
    imgRGB.flags.writeable = True
    return results


def draw_position(img, results):
    if results.pose_landmarks:
        mp_draw.draw_landmarks(
            img,
            results.pose_landmarks,
            mp_pose.POSE_CONNECTIONS,
            landmark_drawing_spec=(
                mp_drawing_styles.get_default_pose_landmarks_style()
            )
        )


def run():
    gst_in = 'filesrc location=/app/orga_1_1.mp4 ! queue ! decodebin ! videoconvert ! appsink'
    cap_send = cv2.VideoCapture(gst_in, cv2.CAP_GSTREAMER)

    if not cap_send.isOpened():
        print('send: VideoCapture not opened')
        exit(0)

    i = 0
    while True:
        ret, frame = cap_send.read()

        if not ret:
            print('empty frame')
            break

        # results = get_pose(frame)
        # draw_position(frame, results)

        # cv2.imwrite(f'/app/output_{i}.png', frame)
        cv2.imshow('receive', frame)
        cv2.moveWindow('receive', 0, 0)
        cv2.setWindowProperty('receive', cv2.WND_PROP_TOPMOST, 2)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

        i += 1
        i %= 10

    cap_send.release()


if __name__ == '__main__':
    # run()
    s = Process(target=run)
    s.start()
    s.join()
    cv2.destroyAllWindows()
