"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseAudioRecorderOptions {
  agentId: string;
  onTranscribed?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useAudioRecorder({ agentId, onTranscribed, onError }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isCanceledRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    setAudioLevel(0);
  }, []);

  const startRecording = useCallback(async () => {
    setRecordError(null);
    isCanceledRef.current = false;
    chunksRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = "L'accès au microphone n'est pas supporté par votre navigateur.";
      setRecordError(msg);
      onError?.(msg);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // Audio Level Analyzer for visual wave
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLevel = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animationFrameRef.current = requestAnimationFrame(updateLevel);
          };
          updateLevel();
        }
      } catch {
        // Non-fatal if audio context fails
      }

      // Determine supported mimeType
      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const shouldTranscribe = !isCanceledRef.current;
        cleanupAudio();
        setIsRecording(false);

        if (!shouldTranscribe) {
          chunksRef.current = [];
          return;
        }

        const recordedBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];

        if (recordedBlob.size === 0) {
          return;
        }

        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("file", recordedBlob, "vocal.webm");

          const res = await fetch(`/api/agents/${agentId}/chat/transcribe`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
            throw new Error(errData.error?.message || "La transcription a échoué.");
          }

          const data = (await res.json()) as { ok: boolean; text: string };
          const text = (data.text || "").trim();
          if (text) {
            onTranscribed?.(text);
          }
        } catch (err) {
          const msg = (err as Error).message || "Erreur lors de la transcription vocale.";
          setRecordError(msg);
          onError?.(msg);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250); // collect chunks every 250ms
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      cleanupAudio();
      setIsRecording(false);
      const isDenied = (err as Error).name === "NotAllowedError" || (err as Error).name === "PermissionDeniedError";
      const msg = isDenied
        ? "Accès au microphone refusé. Autorisez le micro dans les paramètres de votre navigateur."
        : "Impossible d'accéder au microphone.";
      setRecordError(msg);
      onError?.(msg);
    }
  }, [agentId, cleanupAudio, onError, onTranscribed]);

  const stopRecording = useCallback(() => {
    isCanceledRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      cleanupAudio();
      setIsRecording(false);
    }
  }, [cleanupAudio]);

  const cancelRecording = useCallback(() => {
    isCanceledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    cleanupAudio();
    setIsRecording(false);
    setDuration(0);
  }, [cleanupAudio]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return {
    isRecording,
    isTranscribing,
    duration,
    audioLevel,
    recordError,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
