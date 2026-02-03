import React, { useState, useEffect, useRef } from 'react';
import { BrandProfile, AspectRatio, VideoStoryboardScene } from '../types';
import { generateRunwayVideo, generateSpeech, generateStoryboardStructure, generateSceneVisual } from '../services/geminiService';
import { Loader2, Clapperboard, Video, Play, Pause, Upload, Sparkles, Mic, Film, Music, BrainCircuit, Wand2, Edit2, Save } from 'lucide-react';

interface VideoStoryboardProps {
  brandProfile: BrandProfile | null;
  onDeductCredits: (amount: number) => void;
}

const VideoStoryboard: React.FC<VideoStoryboardProps> = ({ brandProfile, onDeductCredits }) => {
  // --- STATE ---
  const [scenes, setScenes] = useState<VideoStoryboardScene[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  
  // Global Inputs
  const [globalVisualPrompt, setGlobalVisualPrompt] = useState("");
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editor State
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editPromptValue, setEditPromptValue] = useState("");
  const [editVoValue, setEditVoValue] = useState("");

  // Sync editor with current scene selection
  useEffect(() => {
    if (scenes[currentSceneIndex]) {
        setEditPromptValue(scenes[currentSceneIndex].visualPrompt || "");
        setEditVoValue(scenes[currentSceneIndex].voText || "");
        setIsEditingPrompt(false);
    }
  }, [currentSceneIndex, scenes]);

  // --- STYLES FOR FALLBACK ANIMATION ---
  useEffect(() => {
    const styleId = 'storyboard-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
          @keyframes kenburns {
            0% { transform: scale(1); transform-origin: center; }
            100% { transform: scale(1.15); transform-origin: center; }
          }
          .animate-ken-burns {
            animation: kenburns 10s ease-out infinite alternate;
          }
        `;
        document.head.appendChild(style);
    }
  }, []);

  // --- ACTIONS ---

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        // Fix for Type 'unknown[]' not assignable to 'File[]'
        const files: File[] = Array.from(e.target.files).slice(0, 10) as unknown as File[]; 
        const newScenes: VideoStoryboardScene[] = files.map((file, index) => ({
            id: `scene_${Date.now()}_${index}`,
            visualPrompt: '', 
            image: {
                id: `upload_${Date.now()}_${index}`,
                file: file,
                previewUrl: URL.createObjectURL(file),
                base64: '', 
                type: 'reference',
                tag: '@img3'
            },
            videoUrl: null,
            voText: '',
            audioUrl: null,
            duration: 4, 
            isGeneratingImage: false,
            isGeneratingVideo: false,
            isGeneratingAudio: false
        }));

        newScenes.forEach(scene => {
            if (scene.image) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    scene.image!.base64 = reader.result as string;
                };
                reader.readAsDataURL(scene.image.file);
            }
        });

        setScenes(newScenes);
    }
  };

  const checkApiKey = async (): Promise<boolean> => {
    const aistudio = (window as any).aistudio;
    if (aistudio) {
        try {
            const hasKey = await aistudio.hasSelectedApiKey();
            if (!hasKey) {
                await aistudio.openSelectKey();
                return true; 
            }
            return true;
        } catch (e) {
            console.error("Key selection error", e);
            return false;
        }
    }
    return true;
  };

  const handleSaveEdit = () => {
      const updatedScenes = [...scenes];
      updatedScenes[currentSceneIndex] = {
          ...updatedScenes[currentSceneIndex],
          visualPrompt: editPromptValue,
          voText: editVoValue
      };
      setScenes(updatedScenes);
      setIsEditingPrompt(false);
  };

  // --- SMART PRODUCTION ENGINE ---
  const handleSmartProduction = async () => {
    const keyReady = await checkApiKey();
    if (!keyReady) return;

    if (!globalVisualPrompt && scenes.length === 0) {
        alert("Please provide a Global Visual Instruction or upload images.");
        return;
    }

    setIsProcessing(true);
    
    // --- STEP 1: NARRATIVE ENGINE (Gemini 2.5 Flash) ---
    // Efficiently plans the storyboard structure first.
    setProcessingStep('AI Narrative Brain: Structuring Storyboard...');
    
    // Determine scene count target
    const targetSceneCount = scenes.length > 0 ? scenes.length : 5; // Default to 5 if creating from scratch
    
    // Cost: Very low (Flash model)
    const narrativeStructure = await generateStoryboardStructure(
        globalVisualPrompt || "Create a compelling visual sequence", 
        targetSceneCount,
        scenes.length > 0
    );

    // Merge generated structure with existing scene state
    let updatedScenes: VideoStoryboardScene[] = [];
    
    if (scenes.length > 0) {
        // Map narrative to existing uploaded images
        updatedScenes = scenes.map((s, i) => ({
            ...s,
            visualPrompt: narrativeStructure[i]?.visualDescription || globalVisualPrompt,
            voText: narrativeStructure[i]?.voText || "",
        }));
    } else {
        // Create new scenes from scratch
        updatedScenes = narrativeStructure.map((n, i) => ({
            id: `gen_scene_${Date.now()}_${i}`,
            visualPrompt: n.visualDescription,
            voText: n.voText,
            image: null,
            videoUrl: null,
            audioUrl: null,
            duration: 4,
            isGeneratingImage: false,
            isGeneratingVideo: false,
            isGeneratingAudio: false
        }));
    }
    setScenes([...updatedScenes]);

    // --- STEP 2: AUDIO ENGINE (TTS) ---
    // Dynamic Duration Logic
    for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        if (scene.voText) {
            setProcessingStep(`Audio Engine: Synthesizing Scene ${i+1}/${updatedScenes.length}...`);
            updatedScenes[i].isGeneratingAudio = true;
            setScenes([...updatedScenes]);
            
            // Deduct TTS Credit (Low cost)
            onDeductCredits(1); 

            try {
                const audioUrl = await generateSpeech(scene.voText);
                if (audioUrl) {
                    updatedScenes[i].audioUrl = audioUrl;
                    await new Promise((resolve) => {
                        const audio = new Audio(audioUrl);
                        audio.onloadedmetadata = () => {
                            updatedScenes[i].duration = Math.max(3, Math.ceil(audio.duration));
                            resolve(true);
                        };
                        audio.onerror = () => resolve(true);
                    });
                }
            } catch (e) {
                console.error("Audio gen failed", e);
            }
            updatedScenes[i].isGeneratingAudio = false;
        }
    }
    setScenes([...updatedScenes]);

    // --- STEP 3: VISUAL ENGINE (Imagen 3 via Gemini) ---
    // Only runs if image is missing (Generative Mode). 
    // If uploaded, skips to save cost.
    for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        if (!scene.image && scene.visualPrompt) {
            setProcessingStep(`Visual Engine: Rendering Draft Image ${i+1}/${updatedScenes.length}...`);
            updatedScenes[i].isGeneratingImage = true;
            setScenes([...updatedScenes]);
            
            // Deduct Image Gen Credit
            onDeductCredits(5);

            try {
                let prompt = scene.visualPrompt;
                if (brandProfile) prompt += ` Style: ${brandProfile.style}`;
                
                const imageUrl = await generateSceneVisual(prompt, null, null, aspectRatio);
                if (imageUrl) {
                    updatedScenes[i].image = {
                        id: `gen_img_${Date.now()}`,
                        file: new File([], "gen.png"),
                        previewUrl: imageUrl,
                        base64: imageUrl,
                        type: 'reference',
                        tag: '@img3'
                    };
                }
            } catch (e) {
                console.error("Visual gen failed", e);
            }
            updatedScenes[i].isGeneratingImage = false;
        }
    }
    setScenes([...updatedScenes]);

    setIsProcessing(false);
    setProcessingStep('');
  };

  const handleRenderVideo = async (sceneIndex: number) => {
      const keyReady = await checkApiKey();
      if (!keyReady) return;

      const scene = scenes[sceneIndex];
      if (!scene.image) return;

      // Ensure user has opportunity to refine prompt for motion before this click
      // e.g. "Model walking towards camera" or "Model speaking '...'"

      const updatedScenes = [...scenes];
      updatedScenes[sceneIndex].isGeneratingVideo = true;
      setScenes(updatedScenes);
      
      onDeductCredits(25); // Higher cost for Video

      try {
          // Use Runway Gen-4 (External API)
          const videoUrl = await generateRunwayVideo(scene.image.base64, scene.visualPrompt, aspectRatio);
          if (videoUrl) {
              updatedScenes[sceneIndex].videoUrl = videoUrl;
          } else {
             throw new Error("Runway API returned no video");
          }
      } catch (e) {
          alert("Video render failed. Credits refunded.");
          console.error(e);
          onDeductCredits(-25);
      } finally {
          updatedScenes[sceneIndex].isGeneratingVideo = false;
          setScenes(updatedScenes);
      }
  };

  // --- PLAYER LOGIC ---

  useEffect(() => {
    if (!isPlaying) {
        if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        return;
    }

    const playScene = (index: number) => {
        if (index >= scenes.length) {
            setIsPlaying(false);
            setCurrentSceneIndex(0);
            return;
        }

        setCurrentSceneIndex(index);
        const scene = scenes[index];

        // Audio Playback Strategy
        if (scene.audioUrl) {
            if (audioRef.current) {
                audioRef.current.src = scene.audioUrl;
                audioRef.current.play().catch(e => console.log("Audio playback interrupted", e));
            }
        } else {
            if (audioRef.current) audioRef.current.pause();
        }

        // Timer for Scene Transition
        const durationMs = scene.duration * 1000;
        playbackTimerRef.current = window.setTimeout(() => {
            playScene(index + 1);
        }, durationMs);
    };

    playScene(currentSceneIndex);

    return () => {
        if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    };
  }, [isPlaying]);

  const stopPlayback = () => {
    setIsPlaying(false);
    setCurrentSceneIndex(0);
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
  };

  return (
    <div className="flex h-full bg-slate-950 text-slate-100 font-sans">
      <audio ref={audioRef} className="hidden" />
      
      {/* LEFT PANEL: CONFIGURATION */}
      <div className="w-[450px] bg-slate-900 border-r border-slate-800 flex flex-col h-full z-10 shadow-xl p-6 overflow-y-auto">
         
         <div className="mb-6">
             <div className="flex items-center gap-2 mb-2">
                 <Clapperboard className="text-green-500" size={24} />
                 <h2 className="text-2xl font-bold text-white tracking-wide">Production Engine</h2>
             </div>
             <p className="text-xs text-slate-400 leading-relaxed">
                Smart content pipeline. Uses Flash for narrative, Imagen for visuals, and <span className="text-green-400 font-bold">Runway Gen-4</span> for high-quality motion generation.
             </p>
         </div>

         {/* 1. ASSET INPUT */}
         <div className="mb-6">
             <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">1. Input Assets (Optional)</label>
             <div 
                onClick={() => fileInputRef.current?.click()}
                className="group border-2 border-dashed border-slate-700 hover:border-green-500/50 bg-slate-950 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden"
             >
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"/>
                <input 
                    type="file" 
                    multiple 
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleBulkUpload}
                    className="hidden"
                />
                <div className="bg-slate-800 group-hover:bg-green-500/20 p-3 rounded-full mb-3 transition-colors relative z-10">
                    <Upload size={20} className="text-slate-400 group-hover:text-green-400"/>
                </div>
                <p className="text-sm font-medium text-slate-300 group-hover:text-green-400 transition-colors relative z-10">
                    {scenes.length > 0 ? `${scenes.length} Images Loaded` : "Upload Images or Leave Empty"}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 relative z-10">
                    If empty, AI generates visuals from scratch.
                </p>
             </div>
         </div>

         {/* 2. ASPECT RATIO */}
         <div className="mb-6">
             <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">2. Aspect Ratio</label>
             <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                 {['1:1', '9:16', '16:9'].map(r => (
                     <button
                        key={r}
                        onClick={() => setAspectRatio(r as AspectRatio)}
                        className={`flex-1 py-2 text-[10px] font-bold rounded transition-colors ${aspectRatio === r ? 'bg-green-600 text-black shadow-lg shadow-green-900/50' : 'text-slate-500 hover:text-slate-300'}`}
                     >
                         {r}
                     </button>
                 ))}
             </div>
         </div>

         {/* 3. NARRATIVE PROMPT */}
         <div className="space-y-6">
             <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 flex justify-between tracking-wider">
                     <span>3. Concept / Narrative Instruction</span>
                     <BrainCircuit size={12} className="text-green-500"/>
                 </label>
                 <textarea 
                    value={globalVisualPrompt}
                    onChange={(e) => setGlobalVisualPrompt(e.target.value)}
                    placeholder="E.g. [VISUAL]: Close up model speaking naturally... [VO]: Halo semuanya..."
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg p-3 text-xs focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none h-24 resize-none placeholder:text-slate-600 transition-all"
                 />
             </div>
         </div>

         <div className="mt-8">
             <button 
                onClick={handleSmartProduction}
                disabled={isProcessing}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all uppercase tracking-wider text-xs shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
                {isProcessing ? (
                    <div className="flex flex-col items-center gap-1">
                        <Loader2 className="animate-spin" size={18} /> 
                        <span className="text-[10px] opacity-80">{processingStep}</span>
                    </div>
                ) : (
                    <>
                        <Wand2 size={18} /> Generate Draft Storyboard
                    </>
                )}
            </button>
            <p className="text-[9px] text-slate-500 text-center mt-2">
                Generates Structure (Free), Audio (Low Cost) & Images (if needed). Does NOT use Video Credit.
            </p>
         </div>
      </div>

      {/* RIGHT PANEL: PREVIEW PLAYER */}
      <div className="flex-1 bg-black p-8 flex flex-col items-center justify-center relative overflow-hidden">
         {/* Background Grid */}
         <div className="absolute inset-0 pointer-events-none opacity-10" 
              style={{ backgroundImage: 'linear-gradient(#22c55e 1px, transparent 1px), linear-gradient(90deg, #22c55e 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
         </div>

         {scenes.length > 0 ? (
             <div className="relative w-full max-w-4xl aspect-video bg-black border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in duration-700 z-10">
                 
                 {/* VIEWPORT */}
                 <div className="flex-1 relative bg-slate-950 overflow-hidden">
                    
                    {/* Scene Status Badge */}
                    <div className="absolute top-4 left-4 z-30 flex gap-2">
                        <span className="bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] text-slate-300 border border-slate-700">
                            Scene {currentSceneIndex + 1}/{scenes.length}
                        </span>
                        {scenes[currentSceneIndex]?.videoUrl ? (
                             <span className="bg-green-900/80 backdrop-blur px-2 py-1 rounded text-[10px] text-green-300 border border-green-500/30 flex items-center gap-1 shadow-[0_0_10px_rgba(34,197,94,0.3)]">
                                <Video size={10}/> RUNWAY GEN-4
                            </span>
                        ) : (
                            <span className="bg-slate-800/80 backdrop-blur px-2 py-1 rounded text-[10px] text-slate-300 border border-slate-600 flex items-center gap-1">
                                <Sparkles size={10}/> DRAFT PREVIEW
                            </span>
                        )}
                    </div>

                    {/* RENDER CONTENT */}
                    {scenes[currentSceneIndex]?.videoUrl ? (
                        <video 
                            src={scenes[currentSceneIndex].videoUrl!} 
                            className="w-full h-full object-contain"
                            autoPlay={isPlaying}
                            muted 
                            loop
                        />
                    ) : scenes[currentSceneIndex]?.image ? (
                        <div className="w-full h-full relative overflow-hidden bg-black">
                             <img 
                                src={scenes[currentSceneIndex].image!.previewUrl} 
                                className={`w-full h-full object-contain ${isPlaying ? 'animate-ken-burns' : ''}`}
                                style={{ transformOrigin: 'center center' }}
                            />
                             {/* Render Motion Button Overlay */}
                             <div className="absolute top-4 right-4 z-40">
                                <button 
                                    onClick={() => handleRenderVideo(currentSceneIndex)}
                                    disabled={scenes[currentSceneIndex].isGeneratingVideo}
                                    className="bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1 transition-all hover:scale-105"
                                >
                                    {scenes[currentSceneIndex].isGeneratingVideo ? <Loader2 size={10} className="animate-spin"/> : <Video size={10}/>}
                                    GENERATE RUNWAY (25Cr)
                                </button>
                             </div>
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-700">
                            <Clapperboard size={48} className="mb-2 opacity-50"/>
                            <p className="text-sm font-mono">SCENE EMPTY</p>
                        </div>
                    )}

                    {/* SUBTITLE LAYER */}
                    <div className="absolute bottom-12 left-0 right-0 flex justify-center z-40 px-8">
                        {scenes[currentSceneIndex]?.voText && (
                            <div className="bg-black/70 backdrop-blur-sm px-6 py-3 rounded-xl border border-white/10 shadow-2xl">
                                <p className="text-white text-lg font-medium text-center drop-shadow-md">
                                    {scenes[currentSceneIndex].voText}
                                </p>
                            </div>
                        )}
                    </div>
                 </div>

                 {/* SCENE EDITOR */}
                 {scenes[currentSceneIndex] && (
                     <div className="bg-slate-900/90 border-t border-slate-800 p-3 flex gap-4 text-xs z-50">
                        <div className="flex-1 space-y-1">
                            <div className="flex justify-between items-center text-slate-400">
                                <span className="font-bold uppercase text-[9px]">Visual Prompt (Motion Instruction)</span>
                                <button onClick={() => isEditingPrompt ? handleSaveEdit() : setIsEditingPrompt(true)} className="hover:text-white">
                                    {isEditingPrompt ? <Save size={12}/> : <Edit2 size={12}/>}
                                </button>
                            </div>
                            {isEditingPrompt ? (
                                <textarea 
                                    value={editPromptValue} 
                                    onChange={(e) => setEditPromptValue(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white h-12 outline-none resize-none"
                                />
                            ) : (
                                <p className="text-slate-300 line-clamp-2 h-8">{scenes[currentSceneIndex].visualPrompt}</p>
                            )}
                        </div>
                        <div className="flex-1 space-y-1 border-l border-slate-800 pl-4">
                            <div className="flex justify-between items-center text-slate-400">
                                <span className="font-bold uppercase text-[9px]">Voice Over</span>
                            </div>
                             {isEditingPrompt ? (
                                <textarea 
                                    value={editVoValue} 
                                    onChange={(e) => setEditVoValue(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white h-12 outline-none resize-none"
                                />
                            ) : (
                                <p className="text-slate-300 line-clamp-2 h-8 italic">{scenes[currentSceneIndex].voText}</p>
                            )}
                        </div>
                     </div>
                 )}

                 {/* CONTROLLER */}
                 <div className="h-16 bg-slate-900 border-t border-slate-800 flex items-center px-4 gap-4 z-50">
                    <button 
                        onClick={() => isPlaying ? stopPlayback() : setIsPlaying(true)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${isPlaying ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-black'}`}
                    >
                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1"/>}
                    </button>

                    <div className="flex-1 flex gap-1 h-8 bg-black/20 p-1 rounded-lg">
                        {scenes.map((scene, idx) => (
                            <div 
                                key={scene.id} 
                                onClick={() => { stopPlayback(); setCurrentSceneIndex(idx); }}
                                className={`h-full rounded cursor-pointer transition-all relative overflow-hidden group ${idx === currentSceneIndex ? 'bg-green-600 ring-1 ring-white' : 'bg-slate-800 hover:bg-slate-700'}`}
                                style={{ width: `${(100 / scenes.length)}%` }}
                            >
                                {scene.image && (
                                    <img src={scene.image.previewUrl} className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-60" />
                                )}
                                <span className="absolute left-1 top-0.5 text-[8px] text-white font-bold z-10">{idx+1}</span>
                                {scene.videoUrl && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-green-400 rounded-full shadow-[0_0_5px_#4ade80]"></div>}
                                <div className="absolute bottom-0 left-0 h-0.5 bg-white/50 transition-all" style={{ width: idx < currentSceneIndex ? '100%' : '0%' }}></div>
                            </div>
                        ))}
                    </div>

                    <div className="text-[10px] text-slate-400 font-mono flex flex-col items-end leading-tight">
                        <span>TOTAL TIME</span>
                        <span className="text-white font-bold">{scenes.reduce((acc, s) => acc + s.duration, 0)}s</span>
                    </div>
                 </div>
             </div>
         ) : (
            <div className="flex flex-col items-center justify-center text-slate-600 opacity-50">
                <BrainCircuit size={64} className="mb-4 text-green-900"/>
                <p className="font-mono text-sm">PRODUCTION ENGINE IDLE</p>
            </div>
         )}
         
         <div className="absolute bottom-4 left-0 right-0 text-center">
             <p className="text-[10px] text-slate-500 font-mono">
                 AI BRAIN: GEMINI 2.5 FLASH • VISUALS: IMAGEN • MOTION: RUNWAY GEN-4
             </p>
         </div>
      </div>
    </div>
  );
};

export default VideoStoryboard;