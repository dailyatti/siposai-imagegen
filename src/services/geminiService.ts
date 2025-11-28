import { GoogleGenAI, Type } from "@google/genai";
import { AiResolution, ImageItem, AspectRatio, OutputFormat } from "../types";
import { fileToBase64, convertImageFormat } from "./imageUtils";

const MODEL_NAME = 'gemini-3-pro-image-preview';
const TEXT_MODEL = 'gemini-2.5-flash';

// Safety settings to reduce false positives and allow text removal
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

const TEXT_REMOVAL_KEYWORDS = [
  'remove text',
  'delete text',
  'no text',
  'text removal',
  'complete text removal',
  'critical priority task',
  'text detection',
  'watermark',
  'caption removal',
  'remove watermark',
  'remove logo',
  'remove caption',
  'felirat nélkül',
  'felirat nelkul',
  'töröld a szöveget',
  'torold a szoveget',
  'szöveg nélkül',
  'szoveg nelkul',
  'szöveget töröld',
  'szoveget torold',
];

const wantsTextRemoval = (prompt?: string | null) => {
  if (!prompt) return false;
  const lower = prompt.toLowerCase();
  return TEXT_REMOVAL_KEYWORDS.some(keyword => lower.includes(keyword));
};

export const processImageWithGemini = async (apiKey: string, item: ImageItem): Promise<{
  processedUrl: string;
  width: number;
  height: number;
  size: number;
}> => {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const base64Data = await fileToBase64(item.file);

    // Detect if user specifically asks for removal (supports EN + HU)
    const isRemovalRequested = wantsTextRemoval(item.userPrompt);

    let instructions = "";

    if (isRemovalRequested) {
      // TEXT REMOVAL MODE
      if (item.userPrompt?.includes("Remove all visible text")) {
        instructions = item.userPrompt;
      } else {
        instructions = `
            Create a text-free version of this image.
            Remove all visible text, watermarks, captions, logos, and signatures.
            Inpaint the areas where text was present with matching background texture and colors.
            The result should look completely natural with seamless blending.
            
            ${item.userPrompt}
            `;
      }
    } else {
      // NORMAL MODE - Preserve text
      const preservationProtocol = `
        PROTOCOL: IMMUTABLE TYPOGRAPHY & SPATIAL ANCHORING
        
        1. TEXT IDENTIFICATION: Scan the image for text overlays, logos, or captions.
        2. PRESERVATION RULE: ALL TEXT MUST BE PRESERVED.
        3. PRESERVATION RULE: Keep any existing text aligned with the original composition.
           - DO NOT CROP the text.
           - DO NOT STRETCH the text.
           - DO NOT DISTORT the font aspect ratio.
           - DO NOT INTRODUCE NEW TEXT or watermarks unless the user explicitly asked.
        
        4. RESIZING LOGIC (Smart Reframing):
           - When changing Aspect Ratio (e.g., 9:16 -> 16:9):
             - Treat the text as part of the "Central Subject".
             - Perform "Pillarboxing" / "Outpainting": Keep the text and subject centered.
             - Extend the BACKGROUND horizontally or vertically to fill the new frame.
             - The text should remain legible and proportional to the subject, NOT stretched across the whole new width.
        `;

      instructions = `
        ${preservationProtocol}
        
        USER DIRECTIVE (Creative Style): "${item.userPrompt || 'High fidelity remaster'}"
        
        STRICT CONSTRAINT:
        - The output image MUST contain the original text (if any) from the source image.
        - The text must be sharp, legible, and in the same relative position (e.g., if it was at the bottom, keep it at the bottom).
        - ONLY the background should be expanded/modified to fit the new Aspect Ratio.
        `;
    }

    const prompt = `
      Act as a world-class professional photo editor and digital artist.
      
      ${instructions}
      
      Technical Requirements:
      - Output Aspect Ratio: ${item.targetAspectRatio}
      - Output Resolution: ${item.targetResolution}
      - Quality: 8k, Photorealistic, No artifacts.
    `;

    // Try placing safetySettings in both locations to be safe
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: item.file.type, data: base64Data } },
        ],
      },
      config: {
        imageConfig: {
          imageSize: item.targetResolution as any,
          aspectRatio: item.targetAspectRatio as any,
        },
        safetySettings: SAFETY_SETTINGS, // Try inside config too
      },
      safetySettings: SAFETY_SETTINGS, // And top level
    } as any);

    let rawBase64: string | null = null;
    let failureReason = "";
    let finishReason = "";

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      finishReason = candidate.finishReason || "UNKNOWN";

      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            rawBase64 = part.inlineData.data;
            break;
          } else if (part.text) {
            failureReason += part.text;
          }
        }
      }
    }

    if (!rawBase64) {
      console.error("Gemini Response Failure:", JSON.stringify(response, null, 2));
      throw new Error(`Processing failed. Finish Reason: ${finishReason}. Message: ${failureReason || "No image data returned."}`);
    }

    const converted = await convertImageFormat(rawBase64, item.targetFormat);
    return {
      processedUrl: converted.url,
      width: converted.width,
      height: converted.height,
      size: converted.blob.size,
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const generateImageFromText = async (
  apiKey: string,
  prompt: string,
  config: { format: OutputFormat; resolution: AiResolution; aspectRatio: AspectRatio }
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
  try {
    const ai = new GoogleGenAI({ apiKey });

    const textRemovalRequested = wantsTextRemoval(prompt);
    const antiTextDirective = `
      Absolutely avoid rendering any text, watermarks, captions, UI chrome, or logos.
      If any typography would normally appear, replace it with natural background detail instead.
      This applies even for stylistic elements—keep the scene completely text-free.${textRemovalRequested ? '' : ' Only include lettering if the user explicitly asked for it.'}
    `;

    const finalPrompt = textRemovalRequested
      ? `Create a text-free image based on the user's description. ${antiTextDirective}\nUser description: ${prompt}`
      : `Generate a high-quality image based on the user's description. ${antiTextDirective}\nUser description: ${prompt}`;

    // @ts-ignore
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts: [{ text: finalPrompt }] },
      config: {
        imageConfig: {
          imageSize: config.resolution as any,
          aspectRatio: config.aspectRatio as any,
        },
        safetySettings: SAFETY_SETTINGS,
      },
      safetySettings: SAFETY_SETTINGS,
    } as any);

    let rawBase64: string | null = null;
    let failureReason = "";
    let finishReason = "";

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      finishReason = candidate.finishReason || "UNKNOWN";

      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            rawBase64 = part.inlineData.data;
            break;
          } else if (part.text) {
            failureReason += part.text;
          }
        }
      }
    }

    if (!rawBase64) throw new Error(`Generation failed. Finish Reason: ${finishReason}. Message: ${failureReason || "No image data."}`);

    const converted = await convertImageFormat(rawBase64, config.format);
    return {
      processedUrl: converted.url,
      width: converted.width,
      height: converted.height,
      size: converted.blob.size,
    };

  } catch (error) {
    console.error("Text to Image Error:", error);
    throw error;
  }
};

export const processGenerativeFill = async (
  apiKey: string,
  imageBlob: Blob,
  format: OutputFormat = OutputFormat.PNG,
  customPrompt?: string
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const buffer = await imageBlob.arrayBuffer();
    const base64Data = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

    const defaultPrompt = `
      TASK: SEAMLESS TEXTURE EXTRAPOLATION (OUTPAINTING).
      
      1. VOID DETECTION: Treat white (#FFFFFF) pixels around the edge as NULL space.
      2. CONTINUATION: Extend the image texture, lighting, and noise into the void.
      3. SEAMLESS: The border between original and new must be invisible.
      4. NO DISTORTION: Do not stretch the original content.
    `;

    const prompt = customPrompt || defaultPrompt;

    // Enhanced Text Removal Logic
    let finalPrompt = prompt;
    const promptLower = (customPrompt || "").toLowerCase();
    if (promptLower.includes("remove") && (promptLower.includes("text") || promptLower.includes("watermark") || promptLower.includes("caption"))) {
      finalPrompt += `
        
        NEGATIVE PROMPT (THINGS TO EXCLUDE):
        text, watermark, letters, characters, subtitles, captions, copyright, signature, logo, writing, typography, numbers, date, time, branding.
        
        INSTRUCTION:
        Ensure the area where text was removed is filled with natural background texture matching the surrounding area. Seamless blending. High fidelity.
        `;
    }

    // @ts-ignore
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { text: finalPrompt },
          { inlineData: { mimeType: 'image/png', data: base64Data } },
        ],
      },
      config: {
        imageConfig: {
          imageSize: '2K',
        },
        safetySettings: SAFETY_SETTINGS,
      },
      safetySettings: SAFETY_SETTINGS,
    } as any);

    let rawBase64: string | null = null;
    let failureReason = "";
    let finishReason = "";

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      finishReason = candidate.finishReason || "UNKNOWN";

      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            rawBase64 = part.inlineData.data;
            break;
          } else if (part.text) {
            failureReason += part.text;
          }
        }
      }
    }

    if (!rawBase64) throw new Error(`Generative Fill failed. Finish Reason: ${finishReason}. Message: ${failureReason || "No image data."}`);

    const converted = await convertImageFormat(rawBase64, format);
    return {
      processedUrl: converted.url,
      width: converted.width,
      height: converted.height,
      size: converted.blob.size,
    };

  } catch (error) {
    console.error("Generative Fill Error:", error);
    throw error;
  }
};

export const processCompositeGeneration = async (
  apiKey: string,
  images: ImageItem[],
  prompt: string,
  config: { format: OutputFormat; resolution: AiResolution; aspectRatio: AspectRatio }
): Promise<{ processedUrl: string; width: number; height: number; size: number }> => {
  try {
    const ai = new GoogleGenAI({ apiKey });

    const parts: any[] = [
      {
        text: `
    TASK: COMPOSITE IMAGE MERGER.
        USER DIRECTIVE: "${prompt || 'Merge these images seamlessly.'}"

    RULES:
    1. SPATIAL TYPOGRAPHY: If user asks to move text(up / down / left / right), use pixel coordinates to place it accurately.
        2. CONTENT PRESERVATION: Keep faces and text from source images intact.
        3. OUTPAINTING: If aspect ratios differ, fill the background, do not stretch.

      OUTPUT:
    - Aspect Ratio: ${config.aspectRatio}
    - Resolution: ${config.resolution}
    `}
    ];

    const batch = images.slice(0, 4);
    for (const img of batch) {
      let mimeType = img.file.type;
      let b64 = await fileToBase64(img.file);

      if (mimeType === 'image/svg+xml') {
        try {
          const { blob } = await convertImageFormat(b64, OutputFormat.PNG, 'image/svg+xml');
          b64 = await fileToBase64(new File([blob], "converted.png", { type: "image/png" }));
          mimeType = 'image/png';
        } catch (e) { console.warn("SVG rasterize failed", e); }
      }

      parts.push({
        inlineData: { mimeType: mimeType, data: b64 }
      });
    }

    // @ts-ignore
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts },
      config: {
        imageConfig: {
          imageSize: config.resolution as any,
          aspectRatio: config.aspectRatio as any,
        },
        safetySettings: SAFETY_SETTINGS,
      },
      safetySettings: SAFETY_SETTINGS,
    } as any);

    let rawBase64: string | null = null;
    let failureReason = "";
    let finishReason = "";

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      finishReason = candidate.finishReason || "UNKNOWN";

      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            rawBase64 = part.inlineData.data;
            break;
          } else if (part.text) {
            failureReason += part.text;
          }
        }
      }
    }

    if (!rawBase64) throw new Error(`Composite failed. Finish Reason: ${finishReason}. Message: ${failureReason || "No composite data."}`);

    const converted = await convertImageFormat(rawBase64, config.format);
    return {
      processedUrl: converted.url,
      width: converted.width,
      height: converted.height,
      size: converted.blob.size,
    };

  } catch (error) {
    console.error("Composite Error:", error);
    throw error;
  }
};

export const extractTextFromImages = async (apiKey: string, images: ImageItem[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const batch = images.slice(0, 5);
    const parts: any[] = [{
      text: `
    TASK: PROFESSIONAL OCR.
      - Extract ALL visible text.
      - Detect curved, stylized, and background text.
      - Output: PURE PLAIN TEXT ONLY.No markdown, no bold, no separators.
      `
    }];

    for (const img of batch) {
      let blob = img.file;
      if (img.processedUrl) {
        try {
          const r = await fetch(img.processedUrl);
          blob = await r.blob() as File;
        } catch (e) { }
      }
      const b64 = await fileToBase64(blob);
      parts.push({ inlineData: { mimeType: img.file.type, data: b64 } });
    }

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: { parts },
    });

    return response.text || "No text found.";
  } catch (error) {
    console.error("OCR Error", error);
    return "OCR Failed.";
  }
};

export const enhancePrompt = async (apiKey: string, originalPrompt: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: {
        parts: [{
          text: `
    Act as a professional prompt engineer for AI image generation. 
          Enhance the following prompt to be more descriptive, artistic, and specific. 
          Focus on lighting, style, camera angle, and details.

      Original: "${originalPrompt}"
          
          Output ONLY the enhanced prompt.
        ` }]
      },
    });
    return response.text?.trim() || originalPrompt;
  } catch (error) {
    console.error("Prompt Enhancement Error:", error);
    return originalPrompt;
  }
};
