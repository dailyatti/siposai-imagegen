import React, { useRef, useState, useEffect } from 'react';
import Cropper from 'react-cropper';
import { X, Check, RotateCw, ZoomIn, ZoomOut, Sparkles, Maximize, Download, Brush, Eraser, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LoadingOverlay } from './LoadingOverlay';
import { OutputFormat } from '../types';

enum ToolType {
    BRUSH = 'BRUSH',
    ERASER = 'ERASER',
    RECTANGLE = 'RECTANGLE'
}

interface ImageEditorProps {
    imageUrl: string;
    onSave: (newUrl: string, newBlob: Blob) => void;
    onClose: () => void;
    onGenerativeFill?: (imageBlob: Blob, customPrompt?: string) => Promise<string>; // Returns new image URL
    onRemoveText?: () => void; // Callback for Remove Text button - uses remaster API instead of generative fill
}

export const ImageEditor: React.FC<ImageEditorProps> = ({ imageUrl, onSave, onClose, onGenerativeFill, onRemoveText }) => {
    const { t } = useTranslation();
    const cropperRef = useRef<HTMLImageElement>(null);
    const [cropper, setCropper] = useState<any>();
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);
    const [hasGenerated, setHasGenerated] = useState(false);

    // Masking State
    const [isMaskingMode, setIsMaskingMode] = useState(false);
    const [activeTool, setActiveTool] = useState<ToolType>(ToolType.BRUSH);
    const [brushSize, setBrushSize] = useState(20);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Rectangle Selection State
    const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
    const [currentSelection, setCurrentSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

    // Download config within editor
    const [downloadFormat, setDownloadFormat] = useState<OutputFormat>(OutputFormat.PNG);

    // Initialize mask canvas when entering mask mode
    useEffect(() => {
        if (isMaskingMode && maskCanvasRef.current && cropper) {
            const canvas = maskCanvasRef.current;
            const container = cropper.getContainerData();
            canvas.width = container.width;
            canvas.height = container.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent overlay
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
    }, [isMaskingMode, cropper]);

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        if (activeTool === ToolType.RECTANGLE && maskCanvasRef.current) {
            const rect = maskCanvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setSelectionStart({ x, y });
            setCurrentSelection({ x, y, w: 0, h: 0 });
        } else {
            draw(e);
        }
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        const ctx = maskCanvasRef.current?.getContext('2d');

        if (activeTool === ToolType.RECTANGLE && currentSelection && ctx) {
            // Commit rectangle to mask
            ctx.globalCompositeOperation = 'destination-out'; // Reveal image (create mask)
            ctx.fillStyle = 'black'; // Color doesn't matter for destination-out
            ctx.fillRect(currentSelection.x, currentSelection.y, currentSelection.w, currentSelection.h);

            setSelectionStart(null);
            setCurrentSelection(null);
        }

        if (ctx) ctx.beginPath(); // Reset path
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !maskCanvasRef.current) return;
        const canvas = maskCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (activeTool === ToolType.RECTANGLE && selectionStart) {
            const w = x - selectionStart.x;
            const h = y - selectionStart.y;
            setCurrentSelection({ x: selectionStart.x, y: selectionStart.y, w, h });
            return;
        }

        if (activeTool === ToolType.ERASER) {
            // Eraser mode: restore the dark overlay
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        } else if (activeTool === ToolType.BRUSH) {
            // Brush mode: "Erase" the dark overlay to reveal image (create mask)
            ctx.globalCompositeOperation = 'destination-out';
        }

        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const handleSave = () => {
        if (typeof cropper !== 'undefined') {
            cropper.getCroppedCanvas({
                fillColor: '#ffffff' // Ensure transparent/empty areas are white for outpainting
            }).toBlob((blob: Blob | null) => {
                if (blob) {
                    const newUrl = URL.createObjectURL(blob);
                    onSave(newUrl, blob);
                    onClose();
                }
            });
        }
    };

    const handleGenerativeFill = async (customPrompt?: string) => {
        if (!onGenerativeFill || !cropper) return;

        setIsGenerating(true);
        try {
            // 1. Get the base image from Cropper
            const baseCanvas = cropper.getCroppedCanvas({ fillColor: '#ffffff' });

            // 2. If masking mode was active, apply the mask
            if (isMaskingMode && maskCanvasRef.current) {
                const maskCanvas = maskCanvasRef.current;
                const ctx = baseCanvas.getContext('2d');

                // Create a temp canvas to scale the mask correctly to the image size
                // The maskCanvas is the size of the CONTAINER (visual), but the baseCanvas is the size of the IMAGE (actual)
                // We need to map the mask coordinates to the image coordinates.

                // Calculate scaling factors
                // This is complex because Cropper might be zoomed/panned.
                // SIMPLIFICATION: For now, we only support masking when NOT zoomed/panned extensively, 
                // OR we rely on the visual overlay.

                // Alternative: We can't easily map the visual canvas to the cropped canvas if the user has zoomed/panned.
                // STRATEGY: We will just send the CROPPED area.
                // If the user is in Mask Mode, we disable Cropper interaction (drag/zoom) to ensure alignment?
                // Yes, let's disable drag/zoom in Mask Mode.

                if (ctx) {
                    // FIX: Map mask coordinates correctly to the cropped image
                    const cropBox = cropper.getCropBoxData();

                    // The maskCanvas matches the container size.
                    // We only want the part of the mask that is inside the crop box.
                    // And we draw it onto the baseCanvas (which represents the cropped area).

                    ctx.globalCompositeOperation = 'destination-out'; // Erase where the mask is
                    ctx.drawImage(
                        maskCanvas,
                        cropBox.left, cropBox.top, cropBox.width, cropBox.height, // Source: The area of the mask inside the crop box
                        0, 0, baseCanvas.width, baseCanvas.height // Destination: The full base canvas
                    );
                }
            }

            baseCanvas.toBlob(async (blob: Blob | null) => {
                if (blob) {
                    try {
                        const newUrl = await onGenerativeFill(blob, customPrompt);
                        setCurrentImageUrl(newUrl);
                        cropper.replace(newUrl);
                        setHasGenerated(true);
                        setIsMaskingMode(false); // Exit mask mode

                        // Clear mask
                        if (maskCanvasRef.current) {
                            const ctx = maskCanvasRef.current.getContext('2d');
                            if (ctx) ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                        }
                    } catch (e) {
                        console.error(e);
                    } finally {
                        setIsGenerating(false);
                    }
                }
            }, 'image/png');

        } catch (e) {
            setIsGenerating(false);
        }
    };

    const handleImmediateDownload = () => {
        if (cropper) {
            const canvas = cropper.getCroppedCanvas({ fillColor: '#ffffff' });
            const mimeType = downloadFormat;
            const dataUrl = canvas.toDataURL(mimeType, 0.95);

            const link = document.createElement('a');
            link.href = dataUrl;
            const ext = mimeType.split('/')[1];
            link.download = `banana_outpaint_${Date.now()}.${ext}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex flex-col"
        >
            {isGenerating && <LoadingOverlay message={t('generating')} />}

            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800">
                <h3 className="text-white font-bold flex items-center gap-2"><Maximize className="w-4 h-4 text-emerald-400" /> {t('edit')}</h3>
                <div className="flex gap-2">
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 bg-[#0f172a] p-4 md:p-8 flex items-center justify-center relative overflow-hidden min-h-0">
                <div className="h-full w-full relative shadow-2xl border border-slate-800/50">
                    <Cropper
                        src={currentImageUrl}
                        style={{ height: '100%', width: '100%' }}
                        initialAspectRatio={NaN}
                        guides={!isMaskingMode}
                        ref={cropperRef}
                        onInitialized={(instance) => setCropper(instance)}
                        background={true}
                        viewMode={0}
                        dragMode={isMaskingMode ? 'none' : 'move'} // Disable drag in mask mode
                        autoCropArea={0.8}
                        checkOrientation={false}
                        cropBoxMovable={!isMaskingMode}
                        cropBoxResizable={!isMaskingMode}
                        toggleDragModeOnDblclick={!isMaskingMode}
                    />

                    {/* Masking Overlay Canvas */}
                    {isMaskingMode && (
                        <>
                            <canvas
                                ref={maskCanvasRef}
                                className={`absolute inset-0 z-20 touch-none ${activeTool === ToolType.RECTANGLE ? 'cursor-crosshair' : 'cursor-none'}`}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                            />
                            {/* Selection Overlay */}
                            {currentSelection && (
                                <div
                                    className="absolute border-2 border-dashed border-white bg-white/10 pointer-events-none z-30"
                                    style={{
                                        left: currentSelection.w > 0 ? currentSelection.x : currentSelection.x + currentSelection.w,
                                        top: currentSelection.h > 0 ? currentSelection.y : currentSelection.y + currentSelection.h,
                                        width: Math.abs(currentSelection.w),
                                        height: Math.abs(currentSelection.h)
                                    }}
                                />
                            )}
                            {/* Brush Cursor */}
                            {activeTool !== ToolType.RECTANGLE && !currentSelection && (
                                <div className="pointer-events-none fixed z-50 rounded-full border-2 border-white/50 bg-white/20" style={{
                                    width: brushSize,
                                    height: brushSize,
                                    transform: 'translate(-50%, -50%)',
                                    // We need to track mouse position globally for this, or just rely on native cursor. 
                                    // Native cursor is easier. Let's skip custom cursor for now or implement it properly later.
                                    display: 'none'
                                }} />
                            )}
                        </>
                    )}

                    {!hasGenerated && !isMaskingMode && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur px-4 py-2 rounded-full text-xs text-slate-300 pointer-events-none z-10 border border-white/10 whitespace-nowrap">
                            {t('outpaintDesc')}
                        </div>
                    )}
                </div>
            </div>

            {/* Controls */}
            <div className="bg-slate-900 border-t border-slate-800 z-50 relative shrink-0">
                <AnimatePresence>
                    {hasGenerated && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                            className="bg-emerald-950/30 border-b border-emerald-900/30 px-6 py-3 flex items-center justify-between"
                        >
                            <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                                <Sparkles className="w-4 h-4" /> {t('fillComplete')}
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={downloadFormat}
                                    onChange={(e) => setDownloadFormat(e.target.value as OutputFormat)}
                                    className="bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1.5 outline-none"
                                >
                                    <option value={OutputFormat.JPG}>JPG</option>
                                    <option value={OutputFormat.PNG}>PNG</option>
                                    <option value={OutputFormat.WEBP}>WEBP</option>
                                </select>
                                <button onClick={handleImmediateDownload} className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors">
                                    <Download className="w-3.5 h-3.5" /> {t('downloadResult')}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="p-6 flex flex-col gap-4">
                    {/* Masking Controls */}
                    {isMaskingMode && (
                        <div className="flex flex-col gap-3 pb-4 border-b border-slate-800">
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    onClick={() => setActiveTool(ToolType.BRUSH)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTool === ToolType.BRUSH ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                                >
                                    <Brush className="w-4 h-4" /> Brush
                                </button>
                                <button
                                    onClick={() => setActiveTool(ToolType.ERASER)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTool === ToolType.ERASER ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                                >
                                    <Eraser className="w-4 h-4" /> Eraser
                                </button>
                                <button
                                    onClick={() => setActiveTool(ToolType.RECTANGLE)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTool === ToolType.RECTANGLE ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                                >
                                    <Square className="w-4 h-4" /> Rect
                                </button>
                                <button
                                    onClick={() => {
                                        if (maskCanvasRef.current) {
                                            const ctx = maskCanvasRef.current.getContext('2d');
                                            if (ctx) {
                                                ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                                                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                                                ctx.fillRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                                            }
                                        }
                                    }}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-bold text-sm transition-all"
                                >
                                    <X className="w-4 h-4" /> Clear
                                </button>
                            </div>
                            <div className="flex items-center justify-center gap-4">
                                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Brush Size</span>
                                <input
                                    type="range"
                                    min="5"
                                    max="100"
                                    value={brushSize}
                                    onChange={(e) => setBrushSize(Number(e.target.value))}
                                    className="w-48 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                >
                                </input>
                                <div
                                    className={`rounded-full border-2 ${activeTool === ToolType.ERASER ? 'bg-slate-700/50 border-red-500' : 'bg-red-500/50 border-red-500'} `}
                                    style={{ width: Math.max(brushSize / 2, 12), height: Math.max(brushSize / 2, 12) }}
                                />
                                <span className="text-xs text-slate-300 font-mono">{brushSize}px</span>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
                        {/* Standard Tools */}
                        <button
                            onClick={() => setIsMaskingMode(!isMaskingMode)}
                            className={`flex flex-col items-center gap-1 transition-colors ${isMaskingMode ? 'text-emerald-400' : 'text-slate-400 hover:text-white'}`}
                        >
                            <Brush className="w-5 h-5" />
                            <span className="text-[10px]">{isMaskingMode ? 'Masking On' : 'Mask'}</span>
                        </button>

                        <div className="w-px bg-slate-700 mx-2 hidden sm:block"></div>

                        <button onClick={() => cropper?.rotate(90)} disabled={isMaskingMode} className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-colors disabled:opacity-30">
                            <RotateCw className="w-5 h-5" /> <span className="text-[10px]">Rotate</span>
                        </button>
                        <button onClick={() => cropper?.zoom(0.1)} disabled={isMaskingMode} className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-colors disabled:opacity-30">
                            <ZoomIn className="w-5 h-5" /> <span className="text-[10px]">Zoom In</span>
                        </button>
                        <button onClick={() => cropper?.zoom(-0.1)} disabled={isMaskingMode} className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-colors disabled:opacity-30">
                            <ZoomOut className="w-5 h-5" /> <span className="text-[10px]">Zoom Out</span>
                        </button>

                        <div className="w-px bg-slate-700 mx-2 hidden sm:block"></div>

                        {/* Actions */}
                        {onGenerativeFill && (
                            <>
                                <button
                                    onClick={() => handleGenerativeFill(isMaskingMode ? "Inpaint the masked area to match the background seamlessly." : undefined)}
                                    disabled={isGenerating}
                                    className={`bg-gradient-to-r ${isMaskingMode ? 'from-emerald-600 to-teal-600' : 'from-purple-600 to-indigo-600'} hover:opacity-90 text-white px-5 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg transition-all disabled:opacity-50`}
                                    title={isMaskingMode ? "Fill Masked Area" : t('genFillDesc')}
                                >
                                    <Sparkles className="w-4 h-4" /> {isMaskingMode ? 'Fill Mask' : t('genFill')}
                                </button>

                                {!isMaskingMode && (
                                    <button
                                        onClick={() => {
                                            // CRITICAL FIX: Use remaster API (processImageWithGemini) instead of generative fill
                                            // Generative fill is only for outpainting, not for removing text from inside the image
                                            if (onRemoveText) {
                                                onRemoveText();
                                                onClose(); // Close editor after triggering removal
                                            } else {
                                                // Fallback to old method if callback not provided (for backwards compatibility)
                                                handleGenerativeFill(`
CRITICAL TASK: TEXT, WATERMARK, AND CAPTION REMOVAL

STEP 1 - TEXT DETECTION:
- Scan the entire image systematically(left to right, top to bottom)
    - Detect ALL visible text including:
  * Watermarks(especially semi - transparent ones)
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

OUTPUT: Return the cleaned image with ALL text removed and backgrounds perfectly reconstructed.
`);
                                            }
                                        }}
                                        disabled={isGenerating}
                                        className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-5 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg shadow-red-900/20 transition-all disabled:opacity-50"
                                        title="Remove Text"
                                    >
                                        <X className="w-4 h-4" /> {t('removeText')}
                                    </button>
                                )}
                            </>
                        )}

                        <button
                            onClick={handleSave}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg transition-all"
                        >
                            <Check className="w-4 h-4" /> {t('applyCrop')}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
