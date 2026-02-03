import React, { useState, useEffect } from 'react';
import { UploadedAsset, BrandProfile, AspectRatio } from '../types';
import FileUpload from '../components/FileUpload';
import { generateCompositeImage } from '../services/geminiService';
import { Layers, Loader2, Download, FolderDown, ImagePlus, Settings2, Repeat, Square, Zap, Info } from 'lucide-react';

interface CompositionSuiteProps {
  brandProfile: BrandProfile | null;
  onDeductCredits: (amount: number) => void;
  credits: number;
}

const CompositionSuite: React.FC<CompositionSuiteProps> = ({ brandProfile, onDeductCredits, credits }) => {
  const [img1, setImg1] = useState<UploadedAsset | null>(null);
  const [img2, setImg2] = useState<UploadedAsset | null>(null);
  const [img3, setImg3] = useState<UploadedAsset | null>(null);
  const [ratio, setRatio] = useState<AspectRatio>('9:16');
  const [customPrompt, setCustomPrompt] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  // Auto Loop State
  const [isAutoLooping, setIsAutoLooping] = useState(false);
  const [loopCount, setLoopCount] = useState(0);

  const currentCost = 10 * quantity;

  // Helper for downloading
  const handleDownload = (url: string, index: number, isAuto: boolean = false) => {
    const link = document.createElement('a');
    link.href = url;
    // For auto-downloads, we add a timestamp to ensure uniqueness and prevent overwrites
    const prefix = isAuto ? `AutoLoop_${Date.now()}_` : 'Composition_Result_';
    link.download = `${prefix}${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    results.forEach((url, i) => {
      setTimeout(() => {
        handleDownload(url, i);
      }, i * 500);
    });
  };

  const handleMerge = async (append: boolean = false) => {
    const assets = [];
    if (img1) assets.push(img1);
    if (img2) assets.push(img2);
    if (img3) assets.push(img3);

    if (assets.length < 1) {
      alert("Please upload at least the product asset (@img1).");
      setIsAutoLooping(false);
      return;
    }

    setIsProcessing(true);
    if (!append) setResults([]); // Only clear if manual click
    
    onDeductCredits(10 * quantity); // Cost logic

    try {
      let promptInstruction = "Create a perfectly blended, photorealistic composition. Match lighting, shadows, and perspective seamlessly.";
      if (customPrompt) {
        promptInstruction += ` Scene Details: ${customPrompt}.`;
      }

      const urls = await generateCompositeImage(assets, promptInstruction, ratio, brandProfile, quantity);
      
      setResults(prev => append ? [...urls, ...prev] : urls); // Prepend new results if appending
    } catch (e) {
      console.error("Composition error", e);
      if (isAutoLooping) {
          setIsAutoLooping(false); // Stop loop on error
          alert("Auto Loop Stopped: Generation Failed.");
      } else {
          alert("Composition failed. Please try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto Loop Logic
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    
    if (isAutoLooping && !isProcessing) {
        // 1. Auto-Download Previous Batch
        // We check loopCount > 0 to ensure we don't try to download on the very first trigger before any generation.
        if (loopCount > 0 && results.length > 0) {
            console.log("Auto-downloading latest batch...");
            // The latest results are at the top of the array (indices 0 to quantity-1)
            const latestBatchSize = quantity; 
            for (let i = 0; i < latestBatchSize; i++) {
                if (results[i]) {
                    // Stagger downloads to prevent browser blocking
                    setTimeout(() => {
                        handleDownload(results[i], i, true);
                    }, i * 800);
                }
            }
        }

        // 2. Schedule Next Batch
        if (credits >= currentCost) {
            // Delay increased to 4s to allow downloads to initiate gracefully before UI updates with new loading state
            timeout = setTimeout(() => {
                handleMerge(true); // Call with append=true
                setLoopCount(prev => prev + 1);
            }, 4000);
        } else {
            setIsAutoLooping(false);
            console.log("Auto loop stopped: Insufficient credits");
        }
    }

    return () => clearTimeout(timeout);
  }, [isAutoLooping, isProcessing, credits, results, quantity, loopCount, currentCost]); 

  const toggleAutoLoop = () => {
      if (isAutoLooping) {
          setIsAutoLooping(false);
      } else {
          // Validation before starting
          if (!img1) {
              alert("Please upload at least the product asset (@img1) first.");
              return;
          }
          if (credits < currentCost) {
              alert("Insufficient credits to start Auto Loop.");
              return;
          }
          setLoopCount(0);
          setIsAutoLooping(true);
      }
  };

  return (
    <div className="flex h-full bg-slate-950">
        {/* Config Sidebar */}
        <div className="w-[400px] bg-slate-900 border-r border-slate-800 p-6 overflow-y-auto flex flex-col h-full relative">
            
            {/* Overlay to disable inputs during auto-loop */}
            {isAutoLooping && (
                <div className="absolute inset-0 z-20 bg-slate-900/50 backdrop-blur-[1px] cursor-not-allowed" />
            )}

            <div className="mb-6 relative z-30">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="text-indigo-500" />
                    Composition
                </h2>
                <p className="text-slate-400 text-xs mt-1">Blend products into scenes seamlessly.</p>
            </div>

            <div className="space-y-6 flex-1 relative z-10">
                
                {/* Panel: Source Images */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <ImagePlus size={14} className="text-indigo-400"/> Source Images
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-1">
                             <FileUpload label="PRODUCT" tag="@img1" asset={img1} onUpload={setImg1} onRemove={() => setImg1(null)} variant="compact" />
                        </div>
                        <div className="col-span-1">
                             <FileUpload label="MODEL" tag="@img2" asset={img2} onUpload={setImg2} onRemove={() => setImg2(null)} variant="compact" />
                        </div>
                        <div className="col-span-2">
                             <FileUpload label="STYLE / EXTRA" tag="@img3" asset={img3} onUpload={setImg3} onRemove={() => setImg3(null)} variant="compact" />
                        </div>
                    </div>
                </div>

                {/* Panel: Composition Settings */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-4">
                     <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Settings2 size={14} className="text-indigo-400"/> Composition Settings
                    </h3>

                    {/* Prompt */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase">Prompt Instruction</label>
                        <textarea 
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="Example: @img2 holding @img1 naturally in a modern kitchen. Soft morning light, 8k resolution."
                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg p-3 text-xs focus:ring-1 focus:ring-indigo-500 outline-none h-24 resize-none placeholder:text-slate-600"
                        />
                         <p className="text-[9px] text-slate-500 mt-1 text-right">Use tags like @img1</p>
                    </div>

                    {/* Quantity Slider */}
                    <div>
                        <div className="flex justify-between mb-2">
                             <label className="block text-[10px] font-bold text-slate-500 uppercase">Number of Images</label>
                             <span className="text-xs font-bold text-indigo-400">{quantity}</span>
                        </div>
                        <div className="flex items-center gap-3">
                             <span className="text-[10px] text-slate-600 font-bold">1</span>
                             <input 
                                type="range" min="1" max="10" step="1"
                                value={quantity}
                                onChange={(e) => setQuantity(Number(e.target.value))}
                                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <span className="text-[10px] text-slate-600 font-bold">10</span>
                        </div>
                    </div>

                    {/* Aspect Ratio */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase">Aspect Ratio</label>
                        <div className="grid grid-cols-5 gap-1">
                            {['1:1', '3:4', '4:3', '16:9', '9:16'].map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setRatio(r as AspectRatio)}
                                    className={`py-1.5 text-[9px] font-bold rounded border transition-all ${ratio === r ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

            </div>

            <div className="mt-4 space-y-3 relative z-30">
                <button 
                    onClick={() => handleMerge(false)}
                    disabled={isProcessing || !img1 || isAutoLooping}
                    className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white py-3 rounded-lg font-bold shadow-lg shadow-indigo-900/20 flex justify-center items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                    {isProcessing && !isAutoLooping ? <Loader2 className="animate-spin" /> : (
                        <>
                           <span>Generate Batch</span>
                           <span className="bg-indigo-900/50 text-indigo-200 text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/30 font-mono group-hover:bg-indigo-900/80">{currentCost} Cr</span>
                        </>
                    )}
                </button>

                {/* Auto Generate Loop Button */}
                <div className="relative">
                    <button 
                        onClick={toggleAutoLoop}
                        disabled={isProcessing && !isAutoLooping} // Disable clicking if a manual process is running
                        className={`w-full py-3 rounded-lg font-bold shadow-lg flex justify-center items-center gap-2 transition-all ${
                            isAutoLooping 
                            ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-900/20' 
                            : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-900/20'
                        }`}
                    >
                        {isAutoLooping ? (
                            <>
                                <Square size={16} className="fill-current" /> Stop Auto Loop
                            </>
                        ) : (
                            <>
                                <Repeat size={16} /> Auto Generate Loop
                            </>
                        )}
                    </button>
                    
                    {!isAutoLooping && (
                         <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-slate-300 text-[10px] px-2 py-1 rounded border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                            Runs continuously until stopped or credits deplete
                        </div>
                    )}
                </div>

                {isAutoLooping && (
                    <div className="bg-slate-950 border border-amber-900/30 rounded-lg p-3 animate-in slide-in-from-top-2">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-amber-500 text-xs font-bold uppercase flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                                Auto-Pilot Active
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">Cost/Batch: {currentCost}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-300 bg-slate-900/50 p-2 rounded">
                            <span>Batch Count: <span className="text-white font-bold">{loopCount}</span></span>
                            <span>Credits: <span className="text-white font-bold">{credits.toLocaleString()}</span></span>
                        </div>
                        {isProcessing ? (
                            <div className="mt-2 text-[10px] text-slate-500 text-center flex items-center justify-center gap-1">
                                <Loader2 size={10} className="animate-spin"/> Processing Batch...
                            </div>
                        ) : (
                             <div className="mt-2 text-[10px] text-green-500 text-center flex items-center justify-center gap-1 animate-pulse">
                                <Download size={10}/> Downloading & Next Batch...
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Results Gallery */}
        <div className="flex-1 p-8 overflow-y-auto bg-slate-950">
            {results.length > 0 ? (
                <div className="h-full flex flex-col">
                    <div className="flex justify-between items-center mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800/50 backdrop-blur-sm sticky top-0 z-40">
                        <h3 className="text-white font-bold text-sm flex items-center gap-2">
                            Result Gallery <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-xs">({results.length})</span>
                        </h3>
                        <div className="flex gap-2">
                             <button className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 flex items-center gap-1 transition-colors">
                                <Download size={12} /> Save One
                             </button>
                             <button 
                                onClick={handleDownloadAll}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-900/20"
                            >
                                <FolderDown size={12} /> Download All
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-min">
                        {results.map((url, idx) => (
                            <div key={idx} className="group relative bg-black rounded-xl overflow-hidden border border-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-500 fill-mode-forwards">
                                <div className={`aspect-[${ratio.replace(':', '/')}] w-full relative`}>
                                     <img src={url} alt={`Composed ${idx}`} className="w-full h-full object-cover" />
                                     <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                         <div className="bg-indigo-500 text-white p-1 rounded-full shadow-lg">
                                             <Download size={12} />
                                         </div>
                                     </div>
                                </div>
                                <button 
                                    onClick={() => handleDownload(url, idx)}
                                    className="absolute inset-0 w-full h-full bg-transparent border-2 border-transparent hover:border-indigo-500/50 rounded-xl transition-all"
                                />
                                {/* Label for latest batch */}
                                {idx < quantity && isAutoLooping && (
                                     <div className="absolute top-2 left-2 bg-amber-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold shadow-lg animate-pulse">
                                         NEW
                                     </div>
                                )}
                                {/* Checked Indicator Simulation */}
                                <div className="absolute bottom-2 right-2 bg-indigo-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 scale-0 group-hover:scale-100 transition-all shadow-lg">
                                    <Download size={14} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 border-2 border-dashed border-slate-900 rounded-2xl bg-slate-900/20">
                    <div className="w-24 h-24 bg-slate-900 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                        <Layers size={48} className="text-slate-700" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-400">Composition Canvas</h3>
                    <p className="text-sm max-w-xs mt-2 text-slate-500 mb-6">
                        Upload your Product and other assets to blend them into a unified scene.
                    </p>
                    <div className="flex gap-4 opacity-50">
                        <div className="flex items-center gap-1 text-[10px] bg-slate-900 px-2 py-1 rounded text-amber-500">
                             <Repeat size={10} /> Auto-Loop Ready
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default CompositionSuite;