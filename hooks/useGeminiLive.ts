import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { LiveSessionState, VoiceName, AudioVolumeState } from '../types';
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from '../utils/audioUtils';

// Constants
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const BUFFER_SIZE = 4096;

export const useGeminiLive = () => {
  const [state, setState] = useState<LiveSessionState>({
    isConnected: false,
    isConnecting: false,
    error: null,
  });
  
  const [volumes, setVolumes] = useState<AudioVolumeState>({
    inputVolume: 0,
    outputVolume: 0,
  });

  // Refs for audio context and processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Analyzer refs for visualization
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Stop session function (cleanup)
  const disconnect = useCallback(async () => {
    // 1. Close audio contexts
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (outputContextRef.current) {
      await outputContextRef.current.close();
      outputContextRef.current = null;
    }

    // 2. Stop all active audio sources
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) { /* ignore */ }
    });
    activeSourcesRef.current.clear();

    // 3. Stop analyzing
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 4. Update state
    setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
    setVolumes({ inputVolume: 0, outputVolume: 0 });
  }, []);

  // Update volume levels for visualization
  const updateVolumes = useCallback(() => {
    let inputVol = 0;
    let outputVol = 0;

    if (inputAnalyserRef.current) {
      const dataArray = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
      inputAnalyserRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
      inputVol = avg / 255;
    }

    if (outputAnalyserRef.current) {
      const dataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
      outputAnalyserRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
      outputVol = avg / 255;
    }

    setVolumes({ inputVolume: inputVol, outputVolume: outputVol });
    animationFrameRef.current = requestAnimationFrame(updateVolumes);
  }, []);


  const connect = useCallback(async (voiceName: VoiceName) => {
    if (!process.env.API_KEY) {
      setState(prev => ({ ...prev, error: "API Key not found in environment" }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isConnecting: true, error: null }));

      // --- 1. Setup Audio Input (Microphone) ---
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE,
      });
      audioContextRef.current = inputCtx;
      
      const source = inputCtx.createMediaStreamSource(stream);
      inputSourceRef.current = source;
      
      const processor = inputCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyserRef.current = inputAnalyser;
      
      source.connect(inputAnalyser); // For visualization
      source.connect(processor);
      processor.connect(inputCtx.destination);

      // --- 2. Setup Audio Output (Speaker) ---
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE,
      });
      outputContextRef.current = outputCtx;

      const outputGain = outputCtx.createGain();
      outputGainRef.current = outputGain;

      const outputAnalyser = outputCtx.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyserRef.current = outputAnalyser;

      outputGain.connect(outputAnalyser);
      outputAnalyser.connect(outputCtx.destination);

      nextStartTimeRef.current = 0;

      // Start volume visualization loop
      updateVolumes();

      // --- 3. Initialize Gemini Client ---
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // We use a promise wrapper to ensure we have the session before sending data
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: "You are Serenity, a warm, empathetic, and professional AI therapist. Your goal is to provide a safe, non-judgmental space for users to express their feelings. Listen actively, validate their emotions, and offer gentle, constructive guidance or coping strategies. Maintain a calm, soothing, and supportive tone. Keep your responses concise and natural, like a real conversation. Do not provide medical diagnoses. If a user expresses intent of self-harm or danger to others, firmly but gently encourage them to seek immediate professional emergency help.",
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));

            // Start processing audio
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
          },
          onmessage: async (message: LiveServerMessage) => {
             // Handle audio output
             const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio && outputCtx && outputGain) {
                const audioBytes = base64ToUint8Array(base64Audio);
                const audioBuffer = await decodeAudioData(audioBytes, outputCtx, OUTPUT_SAMPLE_RATE, 1);
                
                // Gapless playback logic
                const currentTime = outputCtx.currentTime;
                if (nextStartTimeRef.current < currentTime) {
                  nextStartTimeRef.current = currentTime;
                }
                
                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputGain);
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                
                activeSourcesRef.current.add(source);
                source.onended = () => {
                  activeSourcesRef.current.delete(source);
                };
             }

             // Handle interruption
             if (message.serverContent?.interrupted) {
               console.log("Interrupted by user");
               activeSourcesRef.current.forEach(s => {
                 try { s.stop(); } catch(e){}
               });
               activeSourcesRef.current.clear();
               nextStartTimeRef.current = 0;
             }
          },
          onclose: () => {
             console.log("Gemini Live Session Closed");
             disconnect();
          },
          onerror: (err) => {
             console.error("Gemini Live Error", err);
             setState(prev => ({ ...prev, error: "Connection error occurred." }));
             disconnect();
          }
        }
      });

    } catch (err) {
      console.error("Failed to connect", err);
      setState(prev => ({ ...prev, isConnecting: false, error: "Failed to access microphone or connect." }));
    }
  }, [disconnect, updateVolumes]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    volumes,
    connect,
    disconnect,
  };
};
