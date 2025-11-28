import React, { useRef, useState, useCallback } from 'react';
import { MaskTool } from '../constants';

/**
 * Point interface for coordinates
 */
interface Point {
    x: number;
    y: number;
}

/**
 * Rectangle selection interface
 */
interface RectSelection {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Mask operation for undo/redo
 */
interface MaskOperation {
    tool: MaskTool;
    data: ImageData;
}

/**
 * Custom hook for managing mask canvas state and operations
 */
export const useMasking = (cropper: any) => {
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isMaskingMode, setIsMaskingMode] = useState(false);
    const [activeTool, setActiveTool] = useState<MaskTool>(MaskTool.BRUSH);
    const [brushSize, setBrushSize] = useState(20);
    const [maskOpacity, setMaskOpacity] = useState(0.5);
    const [isDrawing, setIsDrawing] = useState(false);

    // Rectangle selection state
    const [selectionStart, setSelectionStart] = useState<Point | null>(null);
    const [currentSelection, setCurrentSelection] = useState<RectSelection | null>(null);

    // Undo/Redo stacks
    const [undoStack, setUndoStack] = useState<MaskOperation[]>([]);
    const [redoStack, setRedoStack] = useState<MaskOperation[]>([]);

    /**
     * Initialize mask canvas
     */
    const initializeMask = useCallback(() => {
        if (maskCanvasRef.current && cropper) {
            const canvas = maskCanvasRef.current;
            const container = cropper.getContainerData();
            canvas.width = container.width;
            canvas.height = container.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = `rgba(0, 0, 0, ${maskOpacity})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
    }, [cropper, maskOpacity]);

    /**
     * Save current mask state to undo stack
     */
    const saveState = useCallback(() => {
        const canvas = maskCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            setUndoStack(prev => [...prev, { tool: activeTool, data: imageData }]);
            setRedoStack([]); // Clear redo stack on new operation
        }
    }, [activeTool]);

    /**
     * Undo last mask operation
     */
    const undoMask = useCallback(() => {
        if (undoStack.length === 0) return;

        const canvas = maskCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        // Save current state to redo stack
        const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setRedoStack(prev => [...prev, { tool: activeTool, data: currentData }]);

        // Restore previous state
        const previousOperation = undoStack[undoStack.length - 1];
        ctx.putImageData(previousOperation.data, 0, 0);
        setUndoStack(prev => prev.slice(0, -1));
    }, [undoStack, activeTool]);

    /**
     * Redo mask operation
     */
    const redoMask = useCallback(() => {
        if (redoStack.length === 0) return;

        const canvas = maskCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        // Save current state to undo stack
        const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setUndoStack(prev => [...prev, { tool: activeTool, data: currentData }]);

        // Restore next state
        const nextOperation = redoStack[redoStack.length - 1];
        ctx.putImageData(nextOperation.data, 0, 0);
        setRedoStack(prev => prev.slice(0, -1));
    }, [redoStack, activeTool]);

    /**
     * Clear entire mask
     */
    const clearMask = useCallback(() => {
        saveState();
        initializeMask();
    }, [saveState, initializeMask]);

    /**
     * Start drawing/selecting
     */
    const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        saveState();

        if (!maskCanvasRef.current) return;
        const rect = maskCanvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (activeTool === MaskTool.RECTANGLE) {
            setSelectionStart({ x, y });
            setCurrentSelection({ x, y, w: 0, h: 0 });
        } else {
            draw(e);
        }
    }, [activeTool]);

    /**
     * Stop drawing/selecting
     */
    const stopDrawing = useCallback(() => {
        setIsDrawing(false);
        const ctx = maskCanvasRef.current?.getContext('2d');

        if (activeTool === MaskTool.RECTANGLE && currentSelection && ctx) {
            // Commit rectangle to mask
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'black';
            ctx.fillRect(
                currentSelection.w > 0 ? currentSelection.x : currentSelection.x + currentSelection.w,
                currentSelection.h > 0 ? currentSelection.y : currentSelection.y + currentSelection.h,
                Math.abs(currentSelection.w),
                Math.abs(currentSelection.h)
            );

            setSelectionStart(null);
            setCurrentSelection(null);
        }

        if (ctx) ctx.beginPath();
    }, [activeTool, currentSelection]);

    /**
     * Draw on mask canvas
     */
    const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !maskCanvasRef.current) return;
        const canvas = maskCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Handle rectangle selection
        if (activeTool === MaskTool.RECTANGLE && selectionStart) {
            const w = x - selectionStart.x;
            const h = y - selectionStart.y;
            setCurrentSelection({ x: selectionStart.x, y: selectionStart.y, w, h });
            return;
        }

        // Handle brush/eraser
        if (activeTool === MaskTool.ERASER) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = `rgba(0, 0, 0, ${maskOpacity})`;
        } else if (activeTool === MaskTool.BRUSH) {
            ctx.globalCompositeOperation = 'destination-out';
        }

        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }, [isDrawing, activeTool, brushSize, maskOpacity, selectionStart]);

    /**
     * Apply mask to image and return composite blob
     */
    const applyMask = useCallback(async (): Promise<Blob | null> => {
        if (!cropper || !maskCanvasRef.current) return null;

        const baseCanvas = cropper.getCroppedCanvas({ fillColor: '#ffffff' });
        const maskCanvas = maskCanvasRef.current;
        const ctx = baseCanvas.getContext('2d');

        if (ctx) {
            const cropBox = cropper.getCropBoxData();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.drawImage(
                maskCanvas,
                cropBox.left, cropBox.top, cropBox.width, cropBox.height,
                0, 0, baseCanvas.width, baseCanvas.height
            );
        }

        return new Promise((resolve) => {
            baseCanvas.toBlob((blob: Blob | null) => resolve(blob), 'image/png');
        });
    }, [cropper]);

    return {
        // Refs
        maskCanvasRef,

        // State
        isMaskingMode,
        setIsMaskingMode,
        activeTool,
        setActiveTool,
        brushSize,
        setBrushSize,
        maskOpacity,
        setMaskOpacity,
        isDrawing,
        currentSelection,
        undoStack,
        redoStack,

        // Actions
        initializeMask,
        startDrawing,
        stopDrawing,
        draw,
        clearMask,
        undoMask,
        redoMask,
        applyMask,

        // Computed
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0
    };
};
