You are an autonomous senior ML engineer. Your mission is to expand our existing neural lip-sync model dataset using 3 specific talking-head YouTube videos, perform sub-word phoneme forced alignment, extract stabilized mouth crops, merge the new samples into our training manifest, and resume training from our latest checkpoint.

DO NOT ask me for code or instructions. Inspect the repository, write the necessary automation scripts in a new `scripts/` folder, run the pipeline, and start the training process yourself.

---

### Step 1: Repository Discovery & Parameter Extraction
1. Search the repository to identify:
   - Our model framework (e.g., Wav2Lip, SadTalker, MuseTalk, or custom viseme GAN/diffusion).
   - Expected input dimensions (e.g., face crop resolution 96x96 vs 256x256; audio sample rate 16kHz; video FPS 25fps; mel-spectrogram parameters like n_fft, hop_length, win_length, num_mels).
   - Dataset manifest structure (e.g., JSON, `train.txt`, `filelist.txt`, CSV).
   - The newest saved model checkpoint file (`.pth` or `.pt`) in `checkpoints/`, `runs/`, or output directories.
2. Check if required CLI tools and libraries are present: `yt-dlp`, `ffmpeg`, `whisperx`, `mediapipe`, `torch`, `torchaudio`. Install any missing packages using `pip`.

---

### Step 2: Download Target Videos & Subtitles
Write and run a script to download the video streams and subtitles into `./data/raw_videos/`:
1. **Andy Puddicombe (TED):** `https://www.youtube.com/watch?v=qzR62JJCMBQ`
2. **Keith O'Hare (English Speaking Success):** `https://www.youtube.com/watch?v=MTlVbhWMGqU`
3. **English with Lucy:** `https://www.youtube.com/watch?v=mxITDEx1_1U`

Use `yt-dlp` command flags to grab best MP4 video, audio, and all English subtitles/auto-captions:
`yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]" --write-subs --write-auto-subs --sub-langs "en.*,en" --sub-format "vtt/srt/best" -o "./data/raw_videos/%(id)s.%(ext)s" "<URL>"`

---

### Step 3: Media Standardization
Write and run a script using `ffmpeg` to process every downloaded video:
1. Extract audio to 16,000 Hz, 16-bit, single-channel mono PCM WAV:
   `ffmpeg -y -i <input.mp4> -vn -acodec pcm_s16le -ar 16000 -ac 1 ./data/standardized/<id>_16k.wav`
2. Transcode video to locked constant 25.0 FPS (1 frame = exactly 40.0ms):
   `ffmpeg -y -i <input.mp4> -r 25 -c:v libx264 -pix_fmt yuv420p -an ./data/standardized/<id>_25fps.mp4`

---

### Step 4: Sub-Word Phoneme/Viseme Forced Alignment
Do NOT use loose word-level timestamps. Write a Python script using WhisperX (or our repo's alignment engine) to compute sub-word / character / phoneme alignments against the 16kHz audio:
- Load Whisper `base` or `small` with the CTC alignment model `WAV2VEC2_ASR_LARGE_LV60K_960H`.
- Produce frame-accurate timestamps matching the 25 FPS video frames (40ms steps).
- Save alignment JSONs into `./data/alignments/<id>.json`.

---

### Step 5: Affine Face Stabilization & Mouth Cropping
Write and run a Python script using MediaPipe Face Mesh (`refine_landmarks=True`) or our repo's crop pipeline:
- Track outer eye corners and nose bridge to apply a 2D affine stabilization matrix, neutralizing camera shake and minor head tilt.
- Extract outer lip landmarks (indices 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146) and inner lip landmarks (78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95).
- Crop the lower-face / mouth patch with standard padding, resize to our project's required resolution (e.g., 96x96 or 256x256), and export numbered image frames into `./data/crops/<id>/frame_%06d.jpg`.
- Filter out non-speech segments, occlusions, or low-confidence face frames.

---

### Step 6: Dataset Manifest Update
1. Parse the extracted frames and alignment files into our repository's existing manifest format (e.g., `train_manifest.json`, `filelist.txt`, etc.).
2. Append 90% of the new valid speech segments to the training partition and 10% to the validation partition.
3. Validate that all file paths, audio spectrogram lengths, and frame indices exist and match.

---

### Step 7: Resume Training
1. Point to the latest checkpoint file identified in Step 1.
2. Ensure loss supervision includes:
   - Pixel reconstruction loss (L1) on the mouth area.
   - Perceptual loss (VGG) if present in the repo.
   - SyncNet / audio-visual contrastive loss.
   - Lip landmark / aperture geometry loss if available.
3. Launch the training command with resume flags (e.g., `--resume_from_checkpoint <path_to_latest_ckpt>`).
4. Monitor and verify the first training batch:
   - Confirm tensor shapes align across audio and visual inputs.
   - Confirm gradients update without CUDA Out-of-Memory (OOM) or NaN/Inf losses.
   - Let the training loop run.