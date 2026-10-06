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
    this.onMutedChange = options.onMutedChange ?? (() => {});

    this.guid = null;
    this.sessionTokenKey = options.sessionTokenKey ?? 'thirdpersoncontroller-player-session-token';
    this.sessionToken = typeof localStorage !== 'undefined' ? localStorage.getItem(this.sessionTokenKey) : null;
    this.isListening = false;
    this.isMuted = false;
    this.isSpeaking = false;
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.mediaSourceNode = null;
    this.mediaRecorder = null;
    this.captureNode = null;
    this.audioChunks = [];
    this.currentChunkSize = 0;
    this.targetChunkBytes = 2048; // ~2KB
    this.recorderMimeType = null;
    this.targetSampleRate = 16000;
    this.chunkDurationMs = 250;
    this.pcmChunkBuffer = [];
    this.pcmChunkSampleCount = 0;
    this._animationFrameId = null;
  }

  /**
   * Initializes microphone access and starts monitoring/recording.
   * @param {string} guid - Player GUID
   */
  async init(guid) {
    this.guid = guid;
    if (typeof localStorage !== 'undefined') {
      this.sessionToken = localStorage.getItem(this.sessionTokenKey) ?? this.sessionToken;
    }
    if (this.isListening) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.mediaSourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.mediaSourceNode.connect(this.analyser);

      this.isListening = true;
      this.startRecorder();
      this.startMonitoring();
    } catch (error) {
      console.warn('Microphone access unavailable or denied:', error);
    }
  }

  startRecorder() {
    if (!this.mediaStream) return;

    // Prefer raw PCM capture for cross-browser decode reliability in remote playback.
    if (this.audioContext?.createScriptProcessor && this.mediaSourceNode) {
      const inputSampleRate = this.audioContext.sampleRate || 48000;
      const samplesPerChunk = Math.max(1, Math.floor(this.targetSampleRate * (this.chunkDurationMs / 1000)));

      this.captureNode = this.audioContext.createScriptProcessor(2048, 1, 1);
      this.captureNode.onaudioprocess = (event) => {
        if (this.isMuted || !this.isSpeaking) {
          this.pcmChunkBuffer = [];
          this.pcmChunkSampleCount = 0;
          return;
        }

        const input = event.inputBuffer.getChannelData(0);
        const downsampled = this.downsampleToRate(input, inputSampleRate, this.targetSampleRate);
        if (downsampled.length === 0) return;

        this.pcmChunkBuffer.push(downsampled);
        this.pcmChunkSampleCount += downsampled.length;

        if (this.pcmChunkSampleCount < samplesPerChunk) {
          return;
        }

        const pcm = new Float32Array(this.pcmChunkSampleCount);
        let offset = 0;
        for (const part of this.pcmChunkBuffer) {
          pcm.set(part, offset);
          offset += part.length;
        }

        this.pcmChunkBuffer = [];
        this.pcmChunkSampleCount = 0;

        const wavBytes = this.encodePcm16Wav(pcm, this.targetSampleRate);
        const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const audioBase64 = reader.result;
          if (typeof audioBase64 === 'string') {
            this.sendVoiceChunk(audioBase64);
          }
        };
        reader.readAsDataURL(wavBlob);
      };

      this.mediaSourceNode.connect(this.captureNode);
      // Keep processor running without audible local playback.
      this.captureNode.connect(this.audioContext.destination);
      return;
    }

    try {
      const preferredMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
      ];
      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
      this.recorderMimeType = mimeType || null;
      const options = mimeType ? { mimeType } : {};
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0 && this.isSpeaking) {
          const blob = event.data;
          const effectiveMimeType = blob.type || this.recorderMimeType || '';
          if (!effectiveMimeType.startsWith('audio/')) {
            console.warn('Voice chunk ignored because MIME type is not playable audio:', effectiveMimeType || '(empty)');
            return;
          }

          const audioBlob = blob.type ? blob : new Blob([blob], { type: effectiveMimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const audioBase64 = reader.result;
            if (typeof audioBase64 === 'string') {
              this.sendVoiceChunk(audioBase64);
            }
          };
          reader.readAsDataURL(audioBlob);
        }
      };

      this.mediaRecorder.start(250);
    } catch (error) {
      console.warn('Failed to start MediaRecorder:', error);
    }
  }

  downsampleToRate(input, inputRate, outputRate) {
    if (outputRate >= inputRate) {
      return new Float32Array(input);
    }

    const sampleRateRatio = inputRate / outputRate;
    const newLength = Math.max(1, Math.round(input.length / sampleRateRatio));
    const result = new Float32Array(newLength);
    let sourceIndex = 0;

    for (let i = 0; i < newLength; i++) {
      const nextSourceIndex = Math.min(input.length, Math.round((i + 1) * sampleRateRatio));
      let sum = 0;
      let count = 0;
      for (let j = sourceIndex; j < nextSourceIndex; j++) {
        sum += input[j];
        count++;
      }
      result[i] = count > 0 ? (sum / count) : 0;
      sourceIndex = nextSourceIndex;
    }

    return result;
  }

  encodePcm16Wav(float32Samples, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = float32Samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeAscii = (offset, value) => {
      for (let i = 0; i < value.length; i++) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < float32Samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Samples[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    return buffer;
  }

  getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (this.sessionToken) {
      headers['X-Session-Token'] = this.sessionToken;
    }
    return headers;
  }

  async sendVoiceChunk(audioBase64) {
    if (!this.guid || this.isMuted) return;
    try {
      await fetch(`${this.apiEndpoint}/voice`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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

      if (this.isMuted) {
        if (this.isSpeaking) {
          this.isSpeaking = false;
          this.onSpeakingChange(this.isSpeaking);
        }
        this._animationFrameId = requestAnimationFrame(checkLevel);
        return;
      }

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

  setMuted(value) {
    const nextMuted = Boolean(value);
    if (this.isMuted === nextMuted) {
      return this.isMuted;
    }

    this.isMuted = nextMuted;
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.onSpeakingChange(this.isSpeaking);
    }
    this.onMutedChange(this.isMuted);
    return this.isMuted;
  }

  toggleMuted() {
    return this.setMuted(!this.isMuted);
  }

  stop() {
    this.isListening = false;
    this.isSpeaking = false;
    this.isMuted = false;
    this.onMutedChange(this.isMuted);
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.captureNode) {
      this.captureNode.disconnect();
      this.captureNode.onaudioprocess = null;
      this.captureNode = null;
    }
    if (this.mediaSourceNode) {
      this.mediaSourceNode.disconnect();
      this.mediaSourceNode = null;
    }
    this.pcmChunkBuffer = [];
    this.pcmChunkSampleCount = 0;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
