import sys
import os

def transcribe(wav_path):
    if not os.path.exists(wav_path):
        sys.stderr.write(f"File not found: {wav_path}\n")
        sys.exit(1)

    # pyrefly: ignore [missing-import]
    import speech_recognition as sr
    r = sr.Recognizer()

    with sr.AudioFile(wav_path) as source:
        audio_data = r.record(source)

    # 1. Try local whisper
    try:
        text = r.recognize_whisper(audio_data, model="base")
        if text and text.strip():
            sys.stdout.write(text.strip())
            return
    except Exception as e:
        pass

    # 2. Try Google Web Speech API (free, built-in fallback)
    try:
        text = r.recognize_google(audio_data)
        if text and text.strip():
            sys.stdout.write(text.strip())
            return
    except Exception as e:
        sys.stderr.write(f"Transcription failed: {e}\n")
        sys.exit(1)

    sys.stderr.write("No speech detected\n")
    sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python transcribe.py <path_to_wav>\n")
        sys.exit(1)
    transcribe(sys.argv[1])
