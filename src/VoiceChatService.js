/**
 * VoiceChatService.js
 *
 * Class: VoiceChatService
 * Purpose: Manages microphone audio capture, volume threshold detection, audio recording
 *          in ~2KB chunks, and transmission to the backend server.
 */

export class VoiceChatService {
  /**
   * Creates a VoiceChatService instance.
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.apiEndpoint='/api/players'] - Base API endpoint
   * @param {number} [options.threshold=0.05] - Volume activation threshold (0 to 1)
   * @param {Function} [options.onSpeakingChange] - Callback when speaking state changes
   */
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint ?? '/api/players';
    this.threshold = options.threshold ?? 0.05;
    this.onSpeakingChange = options.onSpeakingChange ?? (() => {});

    this.guid = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.currentChunkSize = 0;
    this.targetChunkBytes = 2048; // ~2KB
    this._animationFrameId = null;
  }

  /**
   * Initializes microphone access and starts monitoring/recording.
   * @param {string} guid - Player GUID
   */
  async init(guid) {
    this.guid = guid;
    if (this.isListening) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      this.isListening = true;
      this.startRecorder();
      this.startMonitoring();
    } catch (error) {
      console.warn('Microphone access unavailable or denied:', error);
    }
  }

  startRecorder() {
    if (!this.mediaStream) return;
    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType: 'audio/webm' });
      this.audioChunks = [];
      this.currentChunkSize = 0;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0 && this.isSpeaking) {
          this.audioChunks.push(event.data);
          this.currentChunkSize += event.data.size;

          if (this.currentChunkSize >= this.targetChunkBytes) {
            this.flushChunk();
          }
        }
      };

      this.mediaRecorder.start(100);
    } catch (error) {
      console.warn('Failed to start MediaRecorder:', error);
    }
  }

  flushChunk() {
    if (this.audioChunks.length === 0 || !this.guid) return;
    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
    this.audioChunks = [];
    this.currentChunkSize = 0;

    const reader = new FileReader();
    reader.onloadend = () => {
      const audioBase64 = reader.result;
      if (typeof audioBase64 === 'string') {
        this.sendVoiceChunk(audioBase64);
      }
    };
    reader.readAsDataURL(blob);
  }

  async sendVoiceChunk(audioBase64) {
    if (!this.guid || audioBase64.length > 3000) return;
    try {
      await fetch(`${this.apiEndpoint}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guid: this.guid, audioBase64 }),
      });
    } catch (error) {
      // Network error ignored
    }
  }

  startMonitoring() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const checkLevel = () => {
      if (!this.analyser || !this.isListening) return;
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length / 255;

      const speaking = average >= this.threshold;
      if (speaking !== this.isSpeaking) {
        this.isSpeaking = speaking;
        this.onSpeakingChange(this.isSpeaking);
      }

      this._animationFrameId = requestAnimationFrame(checkLevel);
    };
    checkLevel();
  }

  /**
   * Sets the volume activation threshold.
   * @param {number} value - Threshold between 0 and 1
   */
  setThreshold(value) {
    this.threshold = Math.max(0, Math.min(1, Number(value) || 0.05));
  }

  stop() {
    this.isListening = false;
    this.isSpeaking = false;
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
