/**
 * Type-safe constants and enums for BananaAI Remaster
 * PhD-level refactoring: Centralized source of truth
 */

// Re-export enums from types.ts for backwards compatibility
export { OutputFormat, ProcessingStatus, AiResolution, AspectRatio, NamingPattern } from '../types';

/**
 * Mask Tool Enum (new addition)
 */
export enum MaskTool {
  BRUSH = 'BRUSH',
  ERASER = 'ERASER',
  RECTANGLE = 'RECTANGLE',
  LASSO = 'LASSO'
}

/**
 * Prompts Library
 */
export const PROMPTS = {
  REMOVE_TEXT: `CRITICAL TASK: TEXT, WATERMARK, AND CAPTION REMOVAL

STEP 1 - TEXT DETECTION:
- Scan the entire image systematically (left to right, top to bottom)
- Detect ALL visible text including:
  * Watermarks (especially semi-transparent ones)
  * Captions and subtitles
  * Logos with text
  * Small copyright notices
  * Overlaid text of any color
  * Curved or stylized text

STEP 2 - CONTENT ANALYSIS:
- Analyze the BACKGROUND behind each detected text element
- Identify the textures, colors, and patterns that would naturally exist there

STEP 3 - INTELLIGENT INPAINTING:
- Remove ALL detected text by regenerating the background
- Match the local context precisely:
  * If text is on sky → generate sky texture
  * If text is on concrete → generate concrete texture
  * If text is on skin → generate skin texture
  * If text is on water → generate water texture
- Ensure seamless blending at all edges
- Preserve natural lighting and shadows
- DO NOT leave any rectangular patches or artifacts

STEP 4 - VERIFICATION:
- The final image must look completely natural
- No traces of removed text should be visible
- The inpainted areas must be indistinguishable from the original background

OUTPUT: Return the cleaned image with ALL text removed and backgrounds perfectly reconstructed.`,

  INPAINT_MASKED: "Inpaint the masked area to match the background seamlessly.",

  NEGATIVE_PROMPT_TEXT: "NEGATIVE PROMPT: text, watermark, caption, logo, signature, writing, letters, words, typography"
} as const;

/**
 * UI Constants
 */
export const UI_CONSTANTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'] as const,
  DEFAULT_BRUSH_SIZE: 20,
  MIN_BRUSH_SIZE: 5,
  MAX_BRUSH_SIZE: 100,
  DEFAULT_MASK_OPACITY: 0.5,
  ANIMATION_DURATION: 300,
  TOAST_DURATION: 3000
} as const;

/**
 * Keyboard Shortcuts
 */
export const KEYBOARD_SHORTCUTS = {
  TOGGLE_MASKING: 'KeyM',
  BRUSH_TOOL: 'KeyB',
  ERASER_TOOL: 'KeyE',
  RECTANGLE_TOOL: 'KeyR',
  LASSO_TOOL: 'KeyL',
  UNDO: 'KeyZ',
  REDO: 'KeyY',
  SAVE: 'KeyS',
  DELETE: 'Delete'
} as const;

/**
 * ARIA Labels for Accessibility
 */
export const ARIA_LABELS = {
  UPLOAD_ZONE: 'Upload images by dragging and dropping or clicking',
  REMOVE_IMAGE: 'Remove image from gallery',
  EDIT_IMAGE: 'Open image editor',
  DOWNLOAD_IMAGE: 'Download processed image',
  SELECT_IMAGE: 'Select image for bulk operations',
  QUICK_REMOVE_TEXT: 'Quick remove text from image',
  MASK_BRUSH: 'Brush tool for masking',
  MASK_ERASER: 'Eraser tool for masking',
  MASK_RECTANGLE: 'Rectangle selection tool',
  CLEAR_MASK: 'Clear all masks',
  UNDO_MASK: 'Undo last mask operation',
  REDO_MASK: 'Redo mask operation'
} as const;
