You are an autonomous senior ML engineer. Your mission is to expand our existing Lip-Reading / Visual Speech Recognition (VSR) model dataset using 3 specific talking-head YouTube videos, extract aligned video-clip-to-text training pairs, update our dataset manifests, and resume model training from our latest saved checkpoint.

### Core Problem & Task Definition
Our task is Visual Speech Recognition (Video In -> Text Out):
- The model accepts a sequence of silent, cropped video frames of a speaker's mouth (T x C x H x W) and predicts the text transcript of what was spoken.
- The transcript is our ground-truth label. Every sentence spoken on camera serves as supervised training data mapping visual lip movement directly to text tokens (via CTC Loss, Cross-Entropy, or Sequence-to-Sequence decoding).

DO NOT ask me for code or instructions. Inspect the repository, write the required automation scripts into a `scripts/` folder, execute the data pipeline, and launch the resumed training run yourself.

---

### Step 1: Repository Discovery & Input Specification
1. Inspect the codebase to identify:
   - Our model architecture (e.g., Auto-AVSR, LipNet, AV-HuBERT, Conformer, or 3D-ResNet visual front-end with CTC / Transformer decoder).
   - Expected visual input tensor format (Grayscale vs. RGB; input crop resolution like 88x88, 96x96, or 112x112; target frame rate locked to 25.0 FPS).
   - Target text tokenizer / vocabulary format (e.g., SentencePiece BPE tokens, character vocab, or phoneme dictionary).
   - Loss function (e.g., nn.CTCLoss, Cross-Entropy).
   - The latest saved model checkpoint (.pth or .pt) in `checkpoints/`, `runs/`, or output folders.
2. Check for required libraries (`yt-dlp`, `ffmpeg`, `mediapipe`, `opencv-python`, `torch`, `torchaudio`). Install any missing packages using `pip`.

---

### Step 2: Download Target Videos & Verified Subtitles
Write and run a script to download the target videos and their verbatim English captions into `./data/raw_videos/`:
1. **Andy Puddicombe (TED):** `https://www.youtube.com/watch?v=qzR62JJCMBQ`
2. **Keith O'Hare (English Speaking Success):** `https://www.youtube.com/watch?v=MTlVbhWMGqU`
3. **Lucy Bella Earl (English with Lucy):** `https://www.youtube.com/watch?v=mxITDEx1_1U`

Download command specification:
`yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]" --write-subs --write-auto-subs --sub-langs "en.*,en" --sub-format "vtt/srt/best" -o "./data/raw_videos/%(id)s.%(ext)s" "<URL>"`

---

### Step 3: Media Standardization & Subtitle Parsing
1. Transcode downloaded videos to a locked constant 25.0 FPS (1 frame = 40.0 ms) using `ffmpeg`:
   `ffmpeg -y -i <input.mp4> -r 25 -c:v libx264 -pix_fmt yuv420p -an ./data/standardized/<id>_25fps.mp4`
2. Write a Python script to parse the `.vtt` / `.srt` subtitle files into discrete utterance segments:
   - Extract `{ start_time, end_time, text }` for each sentence.
   - Clean the text: convert to uppercase, strip punctuation (or match the tokenizer rules found in Step 1), and remove bracketed sound annotations (e.g., `[Applause]`, `[Music]`).
   - Filter segments: discard sentences shorter than 0.5 seconds or longer than 15.0 seconds to prevent sequence memory overflows.

---

### Step 4: Mouth-Region Extraction & Stabilization
Write a Python script using MediaPipe Face Mesh (`refine_landmarks=True`) or OpenCV:
1. For each utterance segment `[start_time, end_time]`:
   - Slice the exact frame range `[start_frame, end_frame]`.
   - Detect face landmarks and isolate the mouth region using inner/outer lip contours.
   - Apply rigid affine stabilization using the eyes and nose bridge to neutralize head movement.
   - Crop the mouth region with consistent padding, resize to our project's required input resolution (e.g., 88x88 or 96x96), and convert to Grayscale/RGB as expected by our visual front-end.
2. Save the sliced utterance segments either as `.mp4` video clips, `.npz` / `.pt` tensor files, or numbered frame directories in `./data/processed_clips/<id>/`.

---

### Step 5: Manifest Creation & Tokenization
1. Create or append entries to our repository's training and validation manifests (`train_manifest.json`, `train.csv`, or `filelist.txt`):
   - Entry format: `{ "video_path": "...", "num_frames": 75, "text": "VERIFIED WORDS SPOKEN" }`
2. Tokenize the text using our existing tokenizer / vocab file.
3. Split the newly processed segments: 90% into the training split, 10% into the validation split.

---

### Step 6: Resume Model Training
1. Point to our most recent checkpoint found in Step 1.
2. Run the training command configured with our updated manifests and resume flag:
   - E.g.: `python train.py --resume_from_checkpoint <path_to_latest_ckpt> --train_manifest data/train_manifest.json --val_manifest data/val_manifest.json`
3. Verify the first batch execution:
   - Confirm tensor dimensions match: `[Batch_Size, Temporal_Frames, Channels, Height, Width]` for visual input, and token indices/lengths for target text.
   - Confirm CTC Loss or Cross-Entropy calculates valid finite loss values (no `NaN` or `Inf`).
   - Confirm training progresses smoothly without CUDA Out-of-Memory (OOM) errors.