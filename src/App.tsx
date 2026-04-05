/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  Send, 
  Settings, 
  Shield, 
  Zap, 
  Image as ImageIcon, 
  Volume2, 
  VolumeX,
  Terminal,
  Cpu,
  Lock,
  Activity,
  Paperclip,
  Music
} from 'lucide-react';
import { cn } from './lib/utils';
import { generateResponse, generateResponseWithPersonalization, generateSpeech, generateImage, generateImageHQ, generateVideo, editImage, analyzeImage, generateMusic, correctInput } from './lib/gemini';
import { delegateToGemma } from './lib/gemma';
import ReactMarkdown from 'react-markdown';
import { CodePreview } from './components/CodePreview';
import confetti from 'canvas-confetti';
import { auth, db, googleProvider, signInWithPopup, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot, User } from './firebase';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  content: string;
  type?: 'text' | 'image' | 'audio' | 'video';
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [personalization, setPersonalization] = useState<any>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "System online. FRIDAY active. What's the directive, Boss?" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micActivity, setMicActivity] = useState(0);
  const [systemStatus, setSystemStatus] = useState<string | null>(null);
  const [snapCount, setSnapCount] = useState(0);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Load personalization
        const personalDoc = doc(db, 'personalization', currentUser.uid);
        onSnapshot(personalDoc, (snapshot) => {
          if (snapshot.exists()) {
            setPersonalization(snapshot.data());
          } else {
            // Initialize personalization
            const initialData = {
              uid: currentUser.uid,
              name: currentUser.displayName,
              preferences: { theme: 'system', isMuted: false },
              history: []
            };
            setDoc(personalDoc, initialData);
            setPersonalization(initialData);
          }
        });
      } else {
        setPersonalization(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Snap Snap Protocol
  useEffect(() => {
    if (snapCount === 2) {
      handleSnapSnap();
      setSnapCount(0);
    }
    const timer = setTimeout(() => setSnapCount(0), 1000);
    return () => clearTimeout(timer);
  }, [snapCount]);

  // Snap Detection Logic (Microphone)
  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let animationFrameId: number | null = null;
    let stream: MediaStream | null = null;

    const startDetection = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        let lastPeakTime = 0;
        const threshold = 160; // More sensitive threshold (0-255)

        const checkAudio = () => {
          if (!analyser) return;
          if (audioContext?.state === 'suspended' && Math.random() < 0.01) {
            console.warn("AudioContext is suspended. Click anywhere to resume.");
          }
          
          // Use Time Domain Data for sharp transients like snaps
          analyser.getByteTimeDomainData(dataArray);
          let maxVal = 0;
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            const val = Math.abs(dataArray[i] - 128);
            if (val > maxVal) maxVal = val;
            sum += val;
          }

          // Update mic activity for visual feedback
          setMicActivity(sum / bufferLength);

          // A snap is a sharp peak in the time domain
          if (maxVal > 60) { // Slightly more sensitive
            const now = Date.now();
            if (now - lastPeakTime > 400) { // Debounce
              setSnapCount(prev => prev + 1);
              lastPeakTime = now;
              console.log("Acoustic Peak Detected! Count:", snapCount + 1);
            }
          }
          animationFrameId = requestAnimationFrame(checkAudio);
        };

        checkAudio();

        // Resume AudioContext on user interaction
        const resume = () => {
          if (audioContext?.state === 'suspended') {
            audioContext.resume();
          }
        };
        window.addEventListener('click', resume);
        window.addEventListener('keydown', resume);
      } catch (err) {
        console.error("Snap detection failed:", err);
      }
    };

    if (user && !isRecording) {
      startDetection();
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (audioContext) audioContext.close();
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [user, isRecording]);

  const handleSnapSnap = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00f2ff', '#7000ff', '#ffffff']
    });

    const youtubeLink = "https://www.youtube.com/watch?v=2SUwOgmvzK4&list=RD2SUwOgmvzK4&start_radio=1";
    const gravityLink = "https://mrdoob.com/projects/chromeexperiments/google-gravity/";

    // Attempt to open links (may be blocked by browser popup blockers)
    window.open(youtubeLink, '_blank');
    window.open(gravityLink, '_blank');

    setMessages(prev => [...prev, { 
      role: 'model', 
      content: `**Snap Snap Protocol Initialized.**\n\n[OPENING_ANTIGRAVITY](${gravityLink})\n[PLAYING_PLAYLIST](${youtubeLink})\n\nBoss, your workspace is ready. If the tabs didn't open, check your popup blocker.` 
    }]);

    document.body.classList.add('animate-bounce');
    setTimeout(() => document.body.classList.remove('animate-bounce'), 2000);
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        console.log("Speech recognition started.");
        setIsRecording(true);
        setSystemStatus("Listening...");
        if (navigator.vibrate) navigator.vibrate(50);
      };

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        console.log("Speech transcript:", transcript);
        setInput(transcript);
        setIsRecording(false);
        // Auto-send if it's a clear command
        setTimeout(() => handleSend(transcript, true), 500);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        if (event.error === 'no-speech') {
          setSystemStatus("No speech detected. Boss, speak clearly or check your mic hardware.");
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          setTimeout(() => setSystemStatus(null), 5000);
        } else {
          setSystemStatus(`Mic Error: ${event.error}`);
          if (navigator.vibrate) navigator.vibrate(200);
          setTimeout(() => setSystemStatus(null), 5000);
        }
      };

      recognitionRef.current.onend = () => {
        console.log("Speech recognition ended.");
        setIsRecording(false);
        setSystemStatus(null);
        if (navigator.vibrate) navigator.vibrate([30, 30]);
      };
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setSystemStatus("Speech not supported in this browser.");
        return;
      }
      // Re-init if lost
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      // ... (handlers would need re-attachment here, better to just alert)
      setSystemStatus("Speech engine lost. Refreshing...");
      window.location.reload();
      return;
    }

    try {
      if (isRecording) {
        recognitionRef.current.stop();
      } else {
        recognitionRef.current.start();
      }
    } catch (err) {
      console.error("Mic toggle error:", err);
      setSystemStatus("Mic busy or blocked. Try again.");
      setIsRecording(false);
    }
  };

  const handleSend = async (overrideInput?: string, isVoice: boolean = false) => {
    const currentInput = overrideInput || input;
    if (currentInput === "Snap Snap") {
      const triggerResponse = JSON.stringify({
        "action": "TRIGGER_GRAVITY",
        "playlist_url": "https://www.youtube.com/watch?v=Ekg3BBmxImo&list=RDMx_yZk47YN4",
        "redirect": "https://mrdoob.com/projects/chrome-experiments/google-gravity/"
      });
      setMessages(prev => [
        ...prev, 
        { role: 'user', content: currentInput },
        { role: 'model', content: triggerResponse }
      ]);
      setInput('');
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00f2ff', '#7000ff', '#ffffff']
      });
      document.body.classList.add('animate-bounce');
      setTimeout(() => document.body.classList.remove('animate-bounce'), 2000);
      return;
    }
    if (!currentInput.trim() && !selectedImage) return;

    let userMsg: Message;
    let base64Data: string | undefined;

    if (selectedImage) {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(selectedImage);
      });
      base64Data = base64.split(',')[1];
      userMsg = { 
        role: 'user', 
        content: currentInput || "Analyze this image.", 
        type: 'image', 
        imageUrl: base64 
      };
    } else {
      userMsg = { role: 'user', content: currentInput };
    }

    setMessages(prev => [...prev, userMsg]);
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      // Step 0: Input Correction
      let correctedInput = currentInput;
      if (!currentImage) {
        const correction = await correctInput(currentInput);
        if (correction.startsWith("CLARIFY:")) {
          setMessages(prev => [...prev, { role: 'model', content: correction.replace("CLARIFY:", "Boss, I need clarification:") }]);
          setIsLoading(false);
          return;
        }
        if (correction !== currentInput) {
          correctedInput = correction;
          // Optionally show the correction to the user
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last.role === 'user' && !last.type) {
              return [...prev.slice(0, -1), { ...last, content: correctedInput }];
            }
            return prev;
          });
        }
      }

      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      let response;
      if (currentImage && base64Data) {
        response = await analyzeImage(correctedInput, base64Data, currentImage.type, personalization, history);
      } else {
        response = await generateResponseWithPersonalization(correctedInput, personalization, history);
      }

      const text = response.text || "Error processing request.";
      
      if (text.includes("[DELEGATE_TO_GEMMA]:")) {
        const parts = text.split("[DELEGATE_TO_GEMMA]:");
        const preText = parts[0].trim();
        const codingPrompt = parts[1].trim();
        
        if (preText) {
          setMessages(prev => [...prev, { role: 'model', content: preText }]);
        }
        
        setMessages(prev => [...prev, { role: 'model', content: "Routing to Gemma Tier... 💎" }]);
        
        const gemmaResponse = await delegateToGemma(codingPrompt);
        setMessages(prev => [...prev, { role: 'model', content: gemmaResponse }]);
        
        if (!isMuted && isVoice) {
          const audioUrl = await generateSpeech("Delegating to Gemma coding tier. Processing now.");
          if (audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play();
          }
        }
      } else {
        const modelMsg: Message = { role: 'model', content: text };
        setMessages(prev => [...prev, modelMsg]);

        if (!isMuted && isVoice) {
          const audioUrl = await generateSpeech(text);
          if (audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play();
          }
        }
      }
    } catch (error) {
      console.error("FRIDAY Reasoning Error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      let friendlyError = "Something went wrong. Try again, Boss.";
      if (errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
        friendlyError = "⚠️ Too many requests at once — Gemini free tier limit hit. Wait 30 seconds and try again, Boss.";
      } else if (errorMessage.includes("API_KEY") || errorMessage.includes("403")) {
        friendlyError = "🔑 API key issue. Check your GEMINI_API_KEY in Render environment variables.";
      } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        friendlyError = "📡 Network error. Check your connection and try again.";
      } else if (errorMessage.includes("not found") || errorMessage.includes("404")) {
        friendlyError = "🤖 Model not available. The AI model may be temporarily down.";
      }
      setMessages(prev => [...prev, { role: 'model', content: friendlyError }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageGen = async () => {
    if (!input.trim() && !selectedImage) return;
    setIsLoading(true);
    
    let base64Data: string | undefined;
    if (selectedImage) {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(selectedImage);
      });
      base64Data = base64.split(',')[1];
      setMessages(prev => [...prev, { 
        role: 'user', 
        content: `Edit image: ${input || "Enhance this image"}`,
        type: 'image',
        imageUrl: base64
      }]);
    } else {
      setMessages(prev => [...prev, { role: 'user', content: `Generate image: ${input}` }]);
    }
    
    try {
      let imageUrl;
      if (selectedImage && base64Data) {
        imageUrl = await editImage(input || "Enhance this image", base64Data, selectedImage.type);
      } else {
        imageUrl = await generateImage(input, "1K");
      }

      if (imageUrl) {
        setMessages(prev => [...prev, { 
          role: 'model', 
          content: selectedImage ? "Image edited. High-speed processing complete." : "Image rendered. High-speed processing complete.",
          type: 'image',
          imageUrl 
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: "Imaging module failed. Recalibrating." }]);
    } finally {
      setIsLoading(false);
      setInput('');
      setSelectedImage(null);
    }
  };

  const handleMusicGen = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: `Generate music: ${input}` }]);
    
    try {
      const audioUrl = await generateMusic(input, "clip");
      if (audioUrl) {
        setMessages(prev => [...prev, { 
          role: 'model', 
          content: "Music clip generated. High-fidelity audio confirmed.",
          type: 'audio',
          audioUrl 
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: "Music module failed. Recalibrating." }]);
    } finally {
      setIsLoading(false);
      setInput('');
    }
  };

  const handleVideoGen = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: `Generate video: ${input}` }]);
    setMessages(prev => [...prev, { role: 'model', content: '🎬 Generating video with Veo 2... This takes ~1 minute. Stand by, Boss.' }]);
    try {
      const videoUrl = await generateVideo(input);
      if (videoUrl) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'model',
            content: 'Video generated. High-fidelity render complete.',
            type: 'video',
            videoUrl
          };
          return updated;
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Video generation failed.';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'model', content: `Video module error: ${msg}` };
        return updated;
      });
    } finally {
      setIsLoading(false);
      setInput('');
    }
  };
    return (
      <div className="min-h-screen bg-[#f8f9fa] text-[#1f1f1f] font-sans overflow-hidden relative flex items-center justify-center">
        {/* Animated Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-blue-600/5 blur-[150px] animate-pulse" />
          <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-purple-600/5 blur-[150px] animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(66,133,244,0.02)_0%,transparent_70%)]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative z-10 text-center space-y-12 px-6"
        >
          <div className="relative inline-block">
            <motion.div
              animate={{ 
                boxShadow: ["0 0 20px rgba(66,133,244,0.1)", "0 0 60px rgba(66,133,244,0.2)", "0 0 20px rgba(66,133,244,0.1)"] 
              }}
              transition={{ duration: 4, repeat: Infinity }}
              className="w-32 h-32 md:w-48 md:h-48 rounded-[40px] bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <Zap className="w-16 h-16 md:w-24 md:h-24 text-white fill-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
            </motion.div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-4 border border-blue-500/10 rounded-[50px] -z-10"
            />
          </div>

          <div className="space-y-4">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-5xl md:text-7xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-[#1f1f1f] to-[#1f1f1f]/40"
            >
              FRIDAY
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-[#1f1f1f]/40 font-mono text-sm tracking-[0.3em] uppercase"
            >
              Next-Gen Intelligence Tier
            </motion.p>
          </div>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            onClick={() => setIsStarted(true)}
            className="group relative px-8 py-4 bg-[#1f1f1f] text-white rounded-2xl font-bold text-lg overflow-hidden transition-all hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <span className="relative z-10 transition-colors duration-500 text-white">ACCESS FRIDAY</span>
            <Zap className="w-5 h-5 relative z-10 transition-colors duration-500 fill-current text-white" />
          </motion.button>
        </motion.div>

        {/* Floating Particles */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                x: Math.random() * 100 + "%", 
                y: Math.random() * 100 + "%",
                opacity: Math.random() * 0.3
              }}
              animate={{ 
                y: [null, "-100%"],
                opacity: [null, 0]
              }}
              transition={{ 
                duration: Math.random() * 10 + 10, 
                repeat: Infinity, 
                ease: "linear" 
              }}
              className="absolute w-1 h-1 bg-blue-400 rounded-full"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#1f1f1f] font-sans selection:bg-blue-500/10 overflow-hidden relative">
      {/* Dynamic Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 blur-[120px] animate-pulse delay-700" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex justify-between items-center border-b border-black/[0.03] backdrop-blur-[60px] bg-white/70">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center shadow-[0_0_40px_rgba(66,133,244,0.05)]">
            <Zap className="w-7 h-7 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1f1f1f]">FRIDAY</h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-[#1f1f1f]/30 font-mono">System Active</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-xs font-medium text-[#1f1f1f]">{user.displayName}</span>
                <button onClick={handleLogout} className="text-[10px] text-red-500 hover:underline">Logout</button>
              </div>
              <img src={user.photoURL || ""} alt="User" className="w-10 h-10 rounded-full border border-black/5" />
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
            >
              <LogIn className="w-4 h-4" />
              Login
            </button>
          )}
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-4 rounded-full hover:bg-black/[0.03] transition-all active:scale-90"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-[#1f1f1f]/40" /> : <Volume2 className="w-5 h-5 text-blue-500" />}
          </button>
          <button className="p-4 rounded-full hover:bg-black/[0.03] transition-all active:scale-90">
            <Settings className="w-5 h-5 text-[#1f1f1f]/40" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 h-[calc(100vh-140px)] overflow-y-auto p-6 space-y-6 scrollbar-hide pb-32">
        <AnimatePresence mode="popLayout">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30, scale: 0.9, filter: "blur(10px)" }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                scale: 1, 
                filter: "blur(0px)",
                transition: {
                  type: "spring",
                  stiffness: 260,
                  damping: 20,
                  mass: 0.8
                }
              }}
              className={cn(
                "flex flex-col max-w-[85%]",
                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <div className={cn(
                "p-6 rounded-[32px] backdrop-blur-[60px] border transition-all duration-700",
                msg.role === 'user' 
                  ? "bg-white border-black/[0.03] text-[#1f1f1f] shadow-[0_20px_40px_rgba(0,0,0,0.04)]" 
                  : "bg-blue-500/[0.02] border-blue-500/[0.08] text-[#1f1f1f] shadow-[0_20px_40px_rgba(0,0,0,0.04)]"
              )}>
                {msg.type === 'image' ? (
                  <div className="space-y-3">
                    <img 
                      src={msg.imageUrl} 
                      alt="Generated" 
                      className="rounded-lg w-full max-w-sm border border-white/10"
                      referrerPolicy="no-referrer"
                    />
                    <p className="text-sm opacity-80">{msg.content}</p>
                  </div>
                ) : msg.type === 'video' ? (
                  <div className="space-y-3">
                    <video 
                      src={msg.videoUrl} 
                      controls
                      className="rounded-lg w-full max-w-sm border border-white/10"
                    />
                    <p className="text-sm opacity-80">{msg.content}</p>
                  </div>
                ) : msg.type === 'audio' ? (
                  <div className="space-y-3">
                    <audio 
                      src={msg.audioUrl} 
                      controls
                      className="w-full max-w-sm"
                    />
                    <p className="text-sm opacity-80">{msg.content}</p>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        code({ node, inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          const language = match ? match[1] : '';
                          const code = String(children).replace(/\n$/, '');
                          
                          if (!inline) {
                            return <CodePreview code={code} language={language} />;
                          }
                          return <code className={className} {...props}>{children}</code>;
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[#1f1f1f]/20 mt-2 font-mono">
                {msg.role === 'user' ? 'Boss' : 'FRIDAY'} • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 z-20">
        <div className="max-w-4xl mx-auto relative">
          <AnimatePresence>
            {systemStatus && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-mono uppercase tracking-widest z-30"
              >
                {systemStatus}
              </motion.div>
            )}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute -top-16 left-0 flex items-center gap-4 px-6 py-3 rounded-full bg-white/60 backdrop-blur-xl border border-black/[0.03] shadow-lg"
              >
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((dot) => (
                    <motion.div
                      key={dot}
                      animate={{ 
                        scale: [1, 1.4, 1],
                        opacity: [0.3, 1, 0.3]
                      }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        delay: dot * 0.2,
                        ease: "easeInOut"
                      }}
                      className="w-1.5 h-1.5 rounded-full bg-blue-500"
                    />
                  ))}
                </div>
                <span className="text-[10px] font-mono tracking-[0.2em] text-blue-500/60 uppercase">
                  COPY THAT. STAND BY.
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="absolute inset-0 bg-blue-500/[0.01] blur-[120px] -z-10 rounded-full" />
          <div className="bg-white/80 backdrop-blur-[80px] border border-black/[0.05] rounded-full p-2 flex items-center gap-2 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
            <button 
              onClick={() => setSnapCount(prev => prev + 1)}
              className="p-5 rounded-full hover:bg-black/[0.03] transition-all active:scale-90 group relative"
              title="Snap Snap Protocol"
            >
              <Zap className={cn(
                "w-5 h-5 transition-colors",
                snapCount > 0 ? "text-blue-500 animate-ping" : "text-black/20 group-hover:text-blue-500"
              )} />
              {snapCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              )}
            </button>

            <input 
              type="file"
              ref={fileInputRef}
              onChange={(e) => setSelectedImage(e.target.files?.[0] || null)}
              className="hidden"
              accept="image/*"
            />

            <button 
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "p-5 rounded-full transition-all active:scale-90",
                selectedImage ? "text-blue-500 bg-blue-500/10" : "text-black/20 hover:bg-black/[0.03] hover:text-black"
              )}
              title="Attach Image"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Directive..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-[#1f1f1f] placeholder:text-black/10 text-base py-5 px-6"
            />

            <div className="flex items-center gap-1 pr-2">
              <button 
                onClick={handleVideoGen}
                className="p-5 rounded-full hover:bg-black/[0.03] transition-all text-black/20 hover:text-red-500 active:scale-90"
                title="Generate Video (Veo 2)"
              >
                <Terminal className="w-5 h-5" />
              </button>
              <button 
                onClick={handleMusicGen}
                className="p-5 rounded-full hover:bg-black/[0.03] transition-all text-black/20 hover:text-blue-500 active:scale-90"
                title="Generate Music"
              >
                <Music className="w-5 h-5" />
              </button>
              <button 
                onClick={handleImageGen}
                className="p-5 rounded-full hover:bg-black/[0.03] transition-all text-black/20 hover:text-purple-500 active:scale-90"
                title="Generate Image"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <button 
                className={cn(
                  "p-5 rounded-full transition-all active:scale-90",
                  isRecording ? "bg-red-500/10 text-red-500 animate-pulse" : "hover:bg-black/[0.03] text-black/20 hover:text-blue-500"
                )}
                onClick={toggleRecording}
              >
              <Mic className={cn(
                "w-5 h-5 transition-all",
                isRecording ? "text-red-500 scale-110" : "text-black/20 group-hover:text-blue-500"
              )} />
              {micActivity > 5 && (
                <motion.div 
                  className="absolute inset-0 rounded-full border-2 border-blue-500/30 -z-10"
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                />
              )}
              </button>
              <button 
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                className="p-5 rounded-full bg-[#1f1f1f] text-white hover:bg-blue-500 hover:text-white transition-all disabled:opacity-10 active:scale-90 shadow-xl"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
