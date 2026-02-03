import { GoogleGenAI, Type, Modality } from "@google/genai";
import { BrandProfile, StudioStyle, VideoScene, AspectRatio } from "../types";

// Helper to convert base64 string to standard base64 for API if needed, 
// though the SDK handles inlineData well.
const cleanBase64 = (b64: string) => b64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

// Helper to get fresh instance with potentially updated key
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// PCM to WAV Converter
const pcmToWav = (pcmData: Uint8Array, sampleRate: number): Blob => {
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // Bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM data
  const pcmBytes = new Uint8Array(pcmData.buffer);
  for (let i = 0; i < dataSize; i++) {
    view.setUint8(44 + i, pcmBytes[i]);
  }

  return new Blob([view], { type: 'audio/wav' });
};

const base64ToUint8Array = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const generateSpeech = async (text: string): Promise<string | null> => {
    const ai = getAI();
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                }
            }
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const pcmData = base64ToUint8Array(base64Audio);
            const wavBlob = pcmToWav(pcmData, 24000); // Gemini TTS default is 24kHz
            return URL.createObjectURL(wavBlob);
        }
        return null;
    } catch (e) {
        console.error("TTS Error", e);
        return null;
    }
};

// Updated interface for analysis result
interface AnalysisResult {
  description: string;
  usp: string;
  productCategory: string; // e.g., 'Skincare', 'Footwear', 'Beverage'
  targetGender: string; // e.g., 'Feminine', 'Masculine', 'Unisex'
}

export const analyzeProductDetails = async (imageBase64: string): Promise<AnalysisResult> => {
  const ai = getAI();
  const cleanedImage = cleanBase64(imageBase64);

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: cleanedImage } },
        { text: "Analyze this product image. Identify the visual description, suggest a USP, categorize the product type (e.g., Skincare, Shoes, Apparel), and determine the likely target gender style (Feminine, Masculine, or Unisex)." }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          usp: { type: Type.STRING },
          productCategory: { type: Type.STRING },
          targetGender: { type: Type.STRING }
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return { description: "Analysis failed", usp: "High Quality", productCategory: "General", targetGender: "Unisex" };
  }
};

// --- NARRATIVE ENGINE (Gemini 2.5 Flash) ---
export interface StoryboardStructure {
    visualDescription: string;
    voText: string;
    shotType: string;
}

export const generateStoryboardStructure = async (
    globalPrompt: string,
    sceneCount: number,
    hasImages: boolean
): Promise<StoryboardStructure[]> => {
    const ai = getAI();
    
    // Using Flash as the "Narrative Brain" - High Efficiency, Low Cost
    const systemInstruction = `You are a Professional Video Director AI. 
    Your task is to structure a video storyboard.
    
    Inputs:
    - Concept: ${globalPrompt}
    - Scene Count: ${sceneCount}
    - Has User Images: ${hasImages} (If true, describe how the uploaded image should be framed. If false, describe a new image to generate).

    Output JSON Array (Max ${sceneCount} items).
    IMPORTANT: Keep texts concise to ensure valid JSON output.
    1. visualDescription: Visual prompt for Video Generation (English, Photorealistic, 8k, Describe Motion/Action). Max 40 words.
    2. voText: Voice Over script (Bahasa Indonesia). Max 20 words.
    3. shotType: Camera angle (e.g. Close Up, Wide Shot).
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: "Generate storyboard structure.",
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            visualDescription: { type: Type.STRING },
                            voText: { type: Type.STRING },
                            shotType: { type: Type.STRING }
                        }
                    }
                }
            }
        });
        
        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.error("Narrative Engine Failed", e);
        // Fallback if JSON parsing fails - return empty array to prevent app crash
        return [];
    }
}

export const generateCreativePrompt = async (
  productDescription: string,
  modelType: string, // e.g. "Female Model", "Male Model", "Auto"
  mood: string,
  pose: string,
  background: string,
  brandProfile: BrandProfile | null,
  analysisData: AnalysisResult | null
): Promise<string> => {
  const ai = getAI();
  
  // Determine Model & Style Context based on Auto-Detect or User Selection
  let derivedModelContext = modelType;
  let derivedAction = pose;

  // Logic to make the template flexible based on analysis
  if (analysisData) {
     if (modelType === 'Auto-Detect based on Product') {
        derivedModelContext = analysisData.targetGender === 'Masculine' ? 'Male Model' : 
                              analysisData.targetGender === 'Feminine' ? 'Female Model' : 'Professional Model (Neutral)';
     }
     
     // Smart Action Adaptation
     if (pose.includes("Smart Adaptive") || pose === "Let AI Decide (Auto)") {
        if (analysisData.productCategory.toLowerCase().includes('shoe') || analysisData.productCategory.toLowerCase().includes('footwear')) {
            derivedAction = "Low angle shot, showing the model's legs/feet walking or dynamic movement with the shoes.";
        } else if (analysisData.productCategory.toLowerCase().includes('skincare') || analysisData.productCategory.toLowerCase().includes('cosmetic')) {
            derivedAction = "Close up portrait, model holding product near face, flawless skin texture.";
        } else if (analysisData.productCategory.toLowerCase().includes('clothing') || analysisData.productCategory.toLowerCase().includes('fashion')) {
            derivedAction = "Medium or Full shot, model wearing the product, confident fashion pose.";
        } else if (analysisData.productCategory.toLowerCase().includes('beverage') || analysisData.productCategory.toLowerCase().includes('food')) {
            derivedAction = "Model holding the item ready to consume/drink, enjoying the moment.";
        } else {
            derivedAction = "Natural interaction with the product in a lifestyle setting.";
        }
     }
  }

  let systemInstruction = `You are an Adaptive Creative Director. 
  Your goal is to generate a high-quality Image Prompt in **Indonesian (Bahasa Indonesia)** that perfectly fits the Product Type and Model Gender.

  **ADAPTIVE LOGIC (INTERNAL THOUGHT PROCESS):**
  1. **Analyze Product Category**: (${analysisData?.productCategory || 'General'}). 
     - If Shoes -> Focus on feet/legs.
     - If Skincare -> Focus on face/skin.
     - If Fashion -> Focus on outfit fit.
  2. **Analyze Model Context**: (${derivedModelContext}).
     - If Female -> Use feminine styling adjectives (elegant, soft, chic).
     - If Male -> Use masculine styling adjectives (sharp, bold, rugged).
  3. **Visual Cohesion**: Ensure the model's outfit MATCHES the product. (e.g. Don't put a model in a suit if the product is a gym bottle. Put them in sportswear).

  STRICT FORMULA (Output Sequence):
  "[Deskripsi Objek (Model + Pakaian Sesuai Produk)] + [Deskripsi Aksi Adaptif] + [Deskripsi Setting] + [Deskripsi Gaya] + [Kualitas Output]"
  
  REFERENCE EXAMPLE:
  "@img2 wanita muda mengenakan dress musim panas putih yang flowy, memegang botol sunscreen @img1. Aksi mengoleskan sedikit krim ke bahu dengan lembut. Pastikan ukuran botol proporsional. Framing medium shot. Latar belakang pantai tropis buram. Pencahayaan matahari alami (golden hour), estetik, fotorealistik 8k."
  
  MANDATORY RULES:
  1. **Tags**: Use '@img1' (Product) and '@img2' (Model).
  2. **Clothing Intelligence**: You MUST invent the model's outfit based on the '${mood}' and Product Category. (e.g. Product is Sneakers -> Model wears streetwear/joggers. Product is Lipstick -> Model wears evening gown/top).
  3. **Proportions**: Include "Pastikan ukuran produk terlihat proporsional, tidak membesar."
  4. **Language**: Indonesian.
  
  Inputs:
  - Product Info: ${productDescription}
  - Category: ${analysisData?.productCategory}
  - Model Type: ${derivedModelContext}
  - Action/Pose: ${derivedAction}
  - Environment: ${background}
  - Mood: ${mood}
  
  Output only the final prompt string.`;

  if (brandProfile) {
    systemInstruction += ` Brand Style: ${brandProfile.style}, Tone: ${brandProfile.tone}.`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate the adaptive prompt in Indonesian.`,
    config: {
      systemInstruction: systemInstruction,
    }
  });

  return response.text || "Gagal membuat prompt.";
};

export const generateVideoScript = async (
  productDescription: string,
  usp: string,
  mood: string,
  sceneCount: number,
  brandProfile: BrandProfile | null
): Promise<VideoScene[]> => {
  const ai = getAI();

  let systemInstruction = `You are an expert Commercial Director. 
  Create a ${sceneCount}-scene video storyboard for a short ad (Reels/TikTok style).
  
  **NARRATIVE CONSISTENCY:**
  - Ensure the Story flows logically from Scene 1 to Scene ${sceneCount}.
  - **CONSISTENT VISUALS:** The model, setting, and lighting MUST be described consistently across all scenes. If Scene 1 is a "Modern Kitchen", Scene 2 must also be there (or a logical transition).
  
  **OUTPUT REQUIREMENTS:**
  1. Generate exactly ${sceneCount} scenes.
  2. VO Language: Indonesian.
  3. Duration: Recommend duration (3s, 5s, etc) summing to max 30-45s.
  4. **Visual Parameters:** Explicitly define the Shot Type (e.g., Close-Up), Angle, and specific Action.
  
  **VISUAL PROMPT FORMAT (visualPrompt field):**
  "Shot: [SHOT_TYPE]. Angle: [ANGLE]. Subject: [Consistent Model Description] [ACTION] with [PRODUCT]. Setting: [Consistent Background]. Lighting: [MOOD]. High Quality, 8k."
  
  *NOTE:* Do not use @img1 tags in 'shotType', 'cameraAngle', or 'actionDescription' fields. Use them in 'visualPrompt' if needed.
  `;

  if (brandProfile) {
    systemInstruction += ` Brand Style: ${brandProfile.style}, Tone: ${brandProfile.tone}.`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Product: ${productDescription}. USP: ${usp}. Mood: ${mood}. Generate ${sceneCount} scenes.`,
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
             sceneNumber: { type: Type.INTEGER },
             shotType: { type: Type.STRING },
             cameraAngle: { type: Type.STRING },
             actionDescription: { type: Type.STRING },
             visualPrompt: { type: Type.STRING },
             voiceOver: { type: Type.STRING },
             duration: { type: Type.NUMBER }
          }
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse video script", e);
    return [];
  }
};

export const generateSceneVisual = async (
  scenePrompt: string,
  img1Base64: string | null,
  img2Base64: string | null,
  ratio: '1:1' | '9:16' | '16:9'
): Promise<string | null> => {
  const ai = getAI();
  const parts: any[] = [];

  if (img1Base64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanBase64(img1Base64) } });
  }
  if (img2Base64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanBase64(img2Base64) } });
  }

  // Refine prompt for image generation specifically
  const robustPrompt = `${scenePrompt}. Photorealistic, 8k, seamless composition.`;
  parts.push({ text: robustPrompt });

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: parts },
        config: { imageConfig: { aspectRatio: ratio } }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    return null;
  } catch (e) {
    console.error("Scene visual generation failed", e);
    return null;
  }
};

// --- RUNWAY GEN-4 VIDEO GENERATION ---
// Using REST API signature based on the provided SDK image
export const generateRunwayVideo = async (
  imageBase64: string,
  promptText: string,
  ratio: AspectRatio
): Promise<string | null> => {
  
  // Map internal ratio to Runway's string format
  let runwayRatio = '1280:768'; // Default Landscape
  if (ratio === '9:16') runwayRatio = '768:1280';
  if (ratio === '1:1') runwayRatio = '1024:1024';
  if (ratio === '16:9') runwayRatio = '1280:768';

  try {
    console.log("Starting Runway Gen-4 Generation...", { promptText, runwayRatio });
    
    // 1. Create Task with correct array structure for promptImage
    const createResp = await fetch('https://api.runwayml.com/v1/image_to_video', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.API_KEY}`,
            'Content-Type': 'application/json',
            'X-Runway-Version': '2024-11-06'
        },
        body: JSON.stringify({
            model: 'gen4_turbo',
            // Updated structure: Array of objects with uri and position
            promptImage: [
                {
                    uri: imageBase64,
                    position: "first"
                }
            ],
            promptText: promptText,
            ratio: runwayRatio,
            duration: 5
        })
    });

    if (!createResp.ok) {
        throw new Error(`Runway API Error: ${createResp.statusText}`);
    }

    const createData = await createResp.json();
    const taskId = createData.id;
    console.log("Runway Task ID:", taskId);

    // 2. Poll for Status
    let status = 'PENDING';
    let videoUrl = null;
    let attempts = 0;
    const maxAttempts = 60; // 5 mins max

    while (status !== 'SUCCEEDED' && status !== 'FAILED' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
        
        const statusResp = await fetch(`https://api.runwayml.com/v1/tasks/${taskId}`, {
             headers: {
                'Authorization': `Bearer ${process.env.API_KEY}`,
                'X-Runway-Version': '2024-11-06'
            }
        });
        
        if (!statusResp.ok) continue;
        
        const statusData = await statusResp.json();
        status = statusData.status;
        console.log("Runway Polling Status:", status);

        if (status === 'SUCCEEDED') {
            videoUrl = statusData.output?.[0]; // Assuming output array with URL
        }
        attempts++;
    }

    return videoUrl;
  } catch (e) {
    console.error("Runway Generation Failed", e);
    return null;
  }
}

// --- BULK GENERATION SERVICE ---
export const generateBulkVariations = async (
  mode: 'photo' | 'video',
  quantity: number,
  baseData: {
    productDescription: string;
    modelDescription?: string;
    mood: string;
    pose?: string; // For Photo
    sceneCount?: number; // For Video
    usp?: string; // For Video
  },
  brandProfile: BrandProfile | null
): Promise<any[]> => {
  const ai = getAI();

  if (mode === 'photo') {
    let systemInstruction = `You are a Bulk Prompt Generator.
    Task: Generate ${quantity} distinct image prompts in **Indonesian** following this STRICT structure:
    
    Structure: [Deskripsi Objek] + [Deskripsi Aksi] + [Deskripsi Setting] + [Deskripsi Gaya] + [Kualitas Output]
    
    RULES:
    1. Use '@img1' for product and '@img2' for model.
    2. Include "Pastikan ukuran produk proporsional" in every prompt.
    3. KEEP POSE EXACTLY: "${baseData.pose}". 
    4. VARY: Background, Lighting, Camera Angle, and CRITICALLY: The Model's Clothing (Outfit).
    5. Output in Indonesian.
    
    Inputs:
    Product: ${baseData.productDescription}
    Model: ${baseData.modelDescription}
    Mood: ${baseData.mood}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate ${quantity} variations now.`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              variationId: { type: Type.INTEGER },
              prompt: { type: Type.STRING }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } else {
    // VIDEO MODE - Enhanced system instruction for motion
    let systemInstruction = `You are a Professional Commercial Cinematographer.
    Task: Generate ${quantity} DIFFERENT high-motion video ad concepts.

    Constraints:
    1. Each Script Scenes: ${baseData.sceneCount}.
    2. VO Language: Indonesian (Natural & Persuasive).
    3. VISUAL PROMPT FORMAT: English, visually descriptive for video generation.

    VISUAL PROMPT RULES (visualPrompt):
    - Use active verbs: "Model is lifting the product", "Talking naturally", "Smiling and gesturing".
    - Add camera instructions: "Camera slowly zooms in", "Dynamic lighting", "Cinematic motion".
    - Do NOT use negative constraints like "no text", focus on what IS visible.
    - Focus on the model's expression while speaking the [VO_TEXT].

    Example: "Close up shot, the model is enthusiastically talking about @img1 while holding it, natural hand gestures, soft kitchen lighting, high quality realistic movement."
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Product: ${baseData.productDescription}. USP: ${baseData.usp}. Mood: ${baseData.mood}. Generate ${quantity} full scripts.`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              scriptId: { type: Type.INTEGER },
              conceptName: { type: Type.STRING },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                     sceneNumber: { type: Type.INTEGER },
                     visualPrompt: { type: Type.STRING },
                     voiceOver: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  }
};

export const generateStudioImage = async (
  imageBase64: string,
  style: StudioStyle,
  ratio: '1:1' | '9:16' | '16:9',
  brandProfile: BrandProfile | null,
  quantity: number = 1
): Promise<string[]> => {
  const ai = getAI();
  const cleanedImage = cleanBase64(imageBase64);
  
  let prompt = `Create a professional studio photography shot of this product. Style: ${style}. High resolution, 8k, photorealistic.`;
  
  if (brandProfile) {
    prompt += ` Brand Style: ${brandProfile.style}, Lighting: ${brandProfile.tone}, Contrast: ${brandProfile.contrast}.`;
  }

  const generatedUrls: string[] = [];
  
  // PARALLEL EXECUTION OPTIMIZATION
  // We process in batches of 4 to speed up generation significantly while avoiding rate limits.
  const BATCH_SIZE = 4;
  
  // Helper for single generation
  const generateSingle = async (index: number) => {
    try {
        const variationPrompt = index > 0 ? `${prompt} (Variation ${index+1}, slightly different angle or lighting nuance)` : prompt;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: cleanedImage } },
              { text: variationPrompt }
            ]
          },
          config: { imageConfig: { aspectRatio: ratio } }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        return null;
    } catch (error) {
        console.error(`Generation error (Item ${index+1}):`, error);
        return null;
    }
  };

  for (let i = 0; i < quantity; i += BATCH_SIZE) {
      const batchPromises = [];
      for (let j = 0; j < BATCH_SIZE && i + j < quantity; j++) {
          batchPromises.push(generateSingle(i + j));
      }
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(res => {
          if (res) generatedUrls.push(res);
      });
  }

  if (generatedUrls.length === 0) {
      throw new Error("No image generated");
  }

  return generatedUrls;
};

export const generateCompositeImage = async (
  images: { base64: string; tag: string }[],
  promptInstruction: string,
  ratio: '1:1' | '9:16' | '16:9',
  brandProfile: BrandProfile | null,
  quantity: number = 1
): Promise<string[]> => {
  const ai = getAI();

  const parts: any[] = images.map(img => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: cleanBase64(img.base64)
    }
  }));

  let finalPrompt = `Compose these images into a single cohesive scene. ${promptInstruction}. Seamless blending, photorealistic, perfect lighting match.`;

  if (brandProfile) {
    finalPrompt += ` Apply brand style: ${brandProfile.style}, ${brandProfile.tone} lighting.`;
  }

  parts.push({ text: finalPrompt });

  const generatedUrls: string[] = [];

  // PARALLEL EXECUTION OPTIMIZATION
  // Instead of waiting for one image to finish before starting the next, we fire requests in parallel.
  // Batch size limited to 4 to prevent browser/API congestion.
  const BATCH_SIZE = 4;

  const generateSingleVariation = async (index: number) => {
     try {
        const variationPrompt = index > 0 ? `${finalPrompt} (Variation ${index+1}, try a slightly different angle or composition arrangement)` : finalPrompt;
        
        // We must copy parts array to avoid reference issues if we modified it (though here we just append text)
        // Actually, we need to replace the last text part for variations, or just append distinct instruction.
        // For simplicity and safety, we reconstruct the parts for variations.
        const currentParts = [
            ...parts.slice(0, parts.length - 1), // All images
            { text: variationPrompt } // The prompt with variation note
        ];

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: currentParts },
          config: {
            imageConfig: {
              aspectRatio: ratio
            }
          }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        return null;
    } catch (error) {
        console.error(`Composite generation error (Item ${index+1}):`, error);
        return null;
    }
  };

  // Execution Loop with Batching
  for (let i = 0; i < quantity; i += BATCH_SIZE) {
      const batchPromises = [];
      // Create a batch of promises
      for (let j = 0; j < BATCH_SIZE && i + j < quantity; j++) {
          batchPromises.push(generateSingleVariation(i + j));
      }
      
      // Wait for the current batch to finish all requests in parallel
      const batchResults = await Promise.all(batchPromises);
      
      // Collect valid results
      batchResults.forEach(res => {
          if (res) generatedUrls.push(res);
      });
  }

  if (generatedUrls.length === 0) {
      throw new Error("No composite images generated");
  }

  return generatedUrls;
};