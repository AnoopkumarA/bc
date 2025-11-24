
import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, ResumeContext, AnswerLength, ResponseSegment } from '../types';
import { MODEL_NAME } from '../constants';
import { createPcmBlob, downsampleBuffer, decodeAudioData, convertPCMToAudioBuffer } from '../utils/audioUtils';

interface UseLiveSessionProps {
  context: ResumeContext;
}

export const useLiveSession = ({ context }: UseLiveSessionProps) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const connectionStateRef = useRef<ConnectionState>(ConnectionState.DISCONNECTED);
  
  const [segments, setSegments] = useState<ResponseSegment[]>([]);
  const [answerLength, setAnswerLength] = useState<AnswerLength>(AnswerLength.MEDIUM);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);

  // We use a promise reference to prevent race conditions in the audio processor
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sessionRef = useRef<any>(null);
  
  const isSessionActive = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Audio Playback State
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Throttling for volume updates
  const lastVolumeTimeRef = useRef<number>(0);

  const updateConnectionState = (state: ConnectionState) => {
    console.log(`Connection State Changing to: ${state}`);
    setConnectionState(state);
    connectionStateRef.current = state;
  };

  const constructSystemInstruction = (ctx: ResumeContext, length: AnswerLength) => {
    const lengthPrompt = 
      length === AnswerLength.SHORT ? "Keep answers very short, 1-2 sentences max." :
      length === AnswerLength.LONG ? "Provide detailed, comprehensive answers with examples." :
      "Provide balanced, 2-3 sentence answers.";

    return `You are an expert interview coach acting as the candidate. 
    Your GOAL is to help the user pass the interview by answering questions in real-time.
    
    CONTEXT:
    Candidate Resume Summary: ${ctx.resumeText.slice(0, 20000)}
    Target Role: ${ctx.jobTitle} at ${ctx.company}
    Job Description Summary: ${ctx.jobDescription.slice(0, 10000)}

    INSTRUCTIONS:
    1. Listen carefully to the interviewer (via system audio).
    2. When a question is asked, answer it immediately and confidently in the first person ("I...").
    3. Use the resume context to provide factual answers.
    4. ${lengthPrompt}
    5. Do not be verbose. Get straight to the point.
    `;
  };

  const connect = async () => {
    const API_KEY = process.env.REACT_APP_API_KEY || process.env.API_KEY || window.electron?.env?.API_KEY || '';
    
    if (!API_KEY) {
      alert("API Key is missing. Please ensure REACT_APP_API_KEY is set in your .env file.");
      updateConnectionState(ConnectionState.ERROR);
      return;
    }

    try {
      updateConnectionState(ConnectionState.CONNECTING);
      
      // 1. Capture System Audio
      console.log("Requesting system audio stream...");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true, 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            } 
        });
      } catch (e: any) {
          console.error("getDisplayMedia error:", e);
          if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
              console.log("Permission denied for screen capture");
              updateConnectionState(ConnectionState.DISCONNECTED);
              return;
          }
          if (e.message === 'Not supported' || e.name === 'NotSupportedError') {
             throw new Error("Screen capture is not supported. If running in Electron, the main process must handle screen permission requests.");
          }
          throw e;
      }

      console.log("Stream acquired", stream.getTracks());
      
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach(track => track.stop());
        alert("No system audio track found. Please ensure you check 'Share system audio' or 'Share tab audio' in the screen selection dialog.");
        updateConnectionState(ConnectionState.DISCONNECTED);
        return;
      }

      mediaStreamRef.current = stream;
      
      // Handle the video track
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
          videoTracks[0].onended = () => {
              console.log("Stream ended by user or system");
              disconnect();
          };
      }

      // 2. Initialize Audio Context
      const AudioContextCls = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextCls(); 
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
      }

      const ai = new GoogleGenAI({ apiKey: API_KEY });
      
      const config = {
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: constructSystemInstruction(context, answerLength),
        },
        callbacks: {
          onopen: () => {
            console.log("Session Opened");
            isSessionActive.current = true;
            nextStartTimeRef.current = 0;
          },
          onmessage: handleMessage,
          onclose: (event: CloseEvent) => {
            console.log("Session Closed", event.code, event.reason);
            isSessionActive.current = false;
            updateConnectionState(ConnectionState.DISCONNECTED);
            cleanupAudio();
          },
          onerror: (err: any) => {
            console.error("Session Error", err);
            isSessionActive.current = false;
            updateConnectionState(ConnectionState.ERROR);
          }
        }
      };

      // 3. Establish Live Connection
      // We store the promise itself to use in the audio callback
      const sessionPromise = ai.live.connect(config);
      sessionPromiseRef.current = sessionPromise;
      
      const session = await sessionPromise;
      sessionRef.current = session;
      
      // Explicitly check if it wasn't closed during the await
      if (connectionStateRef.current === ConnectionState.CONNECTING || connectionStateRef.current === ConnectionState.CONNECTED) {
          isSessionActive.current = true;
          updateConnectionState(ConnectionState.CONNECTED);
          startAudioStreaming();
      } else {
          // If we disconnected while connecting
          session.close();
      }

    } catch (error: any) {
      console.error("Connection failed", error);
      cleanupAudio();
      updateConnectionState(ConnectionState.ERROR);
      
      let message = "Failed to connect.";
      if (error.message) {
          if (error.message.includes("network") || error.message.includes("fetch") || error.message.includes("WebSocket")) {
              message = "Network error: Unable to reach AI service. Please check your internet connection and API key.";
          } else {
              message = error.message;
          }
      }
      alert(message);
    }
  };

  const startAudioStreaming = () => {
    if (!audioContextRef.current || !mediaStreamRef.current) return;

    const ctx = audioContextRef.current;
    sourceRef.current = ctx.createMediaStreamSource(mediaStreamRef.current);
    processorRef.current = ctx.createScriptProcessor(4096, 1, 1);

    processorRef.current.onaudioprocess = (e) => {
      // Cast to Float32Array to resolve type mismatch with ArrayBufferLike vs ArrayBuffer
      const inputData = e.inputBuffer.getChannelData(0) as Float32Array;
      
      // Calculate volume for UI with Throttling
      const now = Date.now();
      if (now - lastVolumeTimeRef.current > 50) { 
          let sum = 0;
          for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
          const rms = Math.sqrt(sum / inputData.length);
          setVolumeLevel(isNaN(rms) ? 0 : rms);
          lastVolumeTimeRef.current = now;
      }

      // CRITICAL: Use the sessionPromise to ensure we send to the active session
      // and avoid race conditions or stale closures.
      if (sessionPromiseRef.current) {
        // Downsample if needed (Gemini prefers 16kHz)
        let pcmData = inputData;
        if (ctx.sampleRate !== 16000) {
            pcmData = downsampleBuffer(inputData, ctx.sampleRate, 16000);
        }

        const pcmBlob = createPcmBlob(pcmData, 16000);

        sessionPromiseRef.current.then((session) => {
            if (isSessionActive.current) {
                try {
                    session.sendRealtimeInput({ media: pcmBlob });
                } catch (err: any) {
                     // Suppress "WebSocket is already in CLOSING or CLOSED state"
                     // This happens when the server disconnects but the script processor
                     // is still running for a few milliseconds.
                     const msg = err.message || "";
                     if (
                         msg.includes("Closing") || 
                         msg.includes("Closed") ||
                         msg.includes("CLOSING") || 
                         msg.includes("CLOSED")
                     ) {
                        isSessionActive.current = false;
                     } else {
                         console.error("Error sending audio:", err);
                     }
                }
            }
        }).catch(err => {
            // Session initialization failed, ignore audio chunks
        });
      }
    };

    // Feedback Loop Prevention
    const muteGain = ctx.createGain();
    muteGain.gain.value = 0;

    sourceRef.current.connect(processorRef.current);
    processorRef.current.connect(muteGain);
    muteGain.connect(ctx.destination);
  };

  const handleMessage = async (msg: LiveServerMessage) => {
    if (!audioContextRef.current) return;

    // 1. Handle Audio Output (Playback)
    const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
        try {
            const audioData = decodeAudioData(base64Audio);
            const buffer = await convertPCMToAudioBuffer(audioData, audioContextRef.current);
            
            const ctx = audioContextRef.current;
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            
            const currentTime = ctx.currentTime;
            if (nextStartTimeRef.current < currentTime) {
                nextStartTimeRef.current = currentTime;
            }
            
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            
            audioSourcesRef.current.add(source);
            source.onended = () => {
                audioSourcesRef.current.delete(source);
            };

        } catch (e) {
            console.error("Error playing audio response:", e);
        }
    }

    // 2. Handle Transcription
    let text = '';
    let role: 'user' | 'model' = 'model';

    if (msg.serverContent?.inputTranscription) {
        text = msg.serverContent.inputTranscription.text ?? '';
        role = 'user';
    } else if (msg.serverContent?.outputTranscription) {
        text = msg.serverContent.outputTranscription.text ?? '';
        role = 'model';
    }

    if (text) {
        setSegments((prev) => {
            const newSegments = [...prev];
            const lastSegment = newSegments[newSegments.length - 1];

            if (!lastSegment || lastSegment.role !== role || lastSegment.isComplete) {
                newSegments.push({
                    id: Date.now().toString() + Math.random().toString().slice(2),
                    role: role,
                    text: text,
                    isComplete: false
                });
            } else {
                newSegments[newSegments.length - 1] = {
                    ...lastSegment,
                    text: lastSegment.text + text
                };
            }
            return newSegments;
        });
    }

    // 3. Handle Turn Completion / Interruption
    const isTurnComplete = msg.serverContent?.turnComplete;
    const isInterrupted = msg.serverContent?.interrupted;

    if (isInterrupted) {
        audioSourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) {}
        });
        audioSourcesRef.current.clear();
        nextStartTimeRef.current = 0;

        setSegments((prev) => {
             if (prev.length === 0) return prev;
             const newSegments = [...prev];
             newSegments[newSegments.length - 1].isComplete = true;
             return newSegments;
        });
    }

    if (isTurnComplete) {
        setSegments((prev) => {
            if (prev.length === 0) return prev;
            const lastSegment = prev[prev.length - 1];
            if (!lastSegment.isComplete) {
                const newSegments = [...prev];
                newSegments[newSegments.length - 1] = {
                    ...lastSegment,
                    isComplete: true
                };
                return newSegments;
            }
            return prev;
        });
    }
  };

  const disconnect = () => {
    isSessionActive.current = false;
    if (sessionRef.current) {
       try {
         // @ts-ignore
         sessionRef.current.close?.(); 
       } catch (e) {}
    }
    cleanupAudio();
    updateConnectionState(ConnectionState.DISCONNECTED);
  };

  const cleanupAudio = () => {
    isSessionActive.current = false;
    sessionPromiseRef.current = null;
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    audioSourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) {}
    });
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
      }
    }
    
    sourceRef.current = null;
    processorRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    setVolumeLevel(0);
  };

  const updateLength = (len: AnswerLength) => {
    setAnswerLength(len);
    if (sessionRef.current && isSessionActive.current) {
       sessionRef.current.sendRealtimeInput({ 
           content: [{ parts: [{ text: `Instructions Update: Please provide ${len.toLowerCase()} answers from now on.` }] }]
       });
    }
  };

  const clearSegments = () => setSegments([]);

  useEffect(() => {
    return () => {
        disconnect();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connect,
    disconnect,
    connectionState,
    segments,
    answerLength,
    updateLength,
    volumeLevel,
    clearSegments
  };
};
