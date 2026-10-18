import json, sys
from faster_whisper import WhisperModel

audio, out, model_name = sys.argv[1], sys.argv[2], sys.argv[3]
model = WhisperModel(model_name, device='cpu', compute_type='int8')
segments, _ = model.transcribe(audio, language='en', word_timestamps=True, vad_filter=False,
                               condition_on_previous_text=False, beam_size=5)
words = []
for seg in segments:
    for w in seg.words:
        words.append({'start': round(w.start, 3), 'end': round(w.end, 3), 'word': w.word.strip(), 'p': round(w.probability, 3)})
json.dump(words, open(out, 'w', encoding='utf-8'))
print('words', len(words), 'first start', words[0]['start'] if words else None, 'last end', words[-1]['end'] if words else None)
