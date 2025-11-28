import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { ImageItem, OutputFormat, AiResolution, AspectRatio } from '../types';

/**
 * Gallery State Interface
 */
interface GalleryState {
    images: ImageItem[];
    selectedIds: Set<string>;
    bulkConfig: {
        format: OutputFormat;
        resolution: AiResolution;
        aspectRatio: AspectRatio;
    };
    globalProcessing: boolean;
}

/**
 * Action Types
 */
type GalleryAction =
    | { type: 'ADD_IMAGE'; payload: ImageItem }
    | { type: 'ADD_IMAGES'; payload: ImageItem[] }
    | { type: 'UPDATE_IMAGE'; payload: { id: string; updates: Partial<ImageItem> } }
    | { type: 'REMOVE_IMAGE'; payload: string }
    | { type: 'TOGGLE_SELECT'; payload: string }
    | { type: 'SELECT_ALL' }
    | { type: 'DESELECT_ALL' }
    | { type: 'SET_BULK_CONFIG'; payload: Partial<GalleryState['bulkConfig']> }
    | { type: 'SET_GLOBAL_PROCESSING'; payload: boolean };

/**
 * Initial State
 */
const initialState: GalleryState = {
    images: [],
    selectedIds: new Set(),
    bulkConfig: {
        format: OutputFormat.PNG,
        resolution: AiResolution.RES_2K,
        aspectRatio: AspectRatio.SQUARE
    },
    globalProcessing: false
};

/**
 * Reducer Function
 */
function galleryReducer(state: GalleryState, action: GalleryAction): GalleryState {
    switch (action.type) {
        case 'ADD_IMAGE':
            return {
                ...state,
                images: [...state.images, action.payload]
            };

        case 'ADD_IMAGES':
            return {
                ...state,
                images: [...state.images, ...action.payload]
            };

        case 'UPDATE_IMAGE':
            return {
                ...state,
                images: state.images.map(img =>
                    img.id === action.payload.id
                        ? { ...img, ...action.payload.updates }
                        : img
                )
            };

        case 'REMOVE_IMAGE':
            const newSelectedIds = new Set(state.selectedIds);
            newSelectedIds.delete(action.payload);
            return {
                ...state,
                images: state.images.filter(img => img.id !== action.payload),
                selectedIds: newSelectedIds
            };

        case 'TOGGLE_SELECT':
            const updatedSelectedIds = new Set(state.selectedIds);
            if (updatedSelectedIds.has(action.payload)) {
                updatedSelectedIds.delete(action.payload);
            } else {
                updatedSelectedIds.add(action.payload);
            }
            return {
                ...state,
                selectedIds: updatedSelectedIds
            };

        case 'SELECT_ALL':
            return {
                ...state,
                selectedIds: new Set(state.images.map(img => img.id))
            };

        case 'DESELECT_ALL':
            return {
                ...state,
                selectedIds: new Set()
            };

        case 'SET_BULK_CONFIG':
            return {
                ...state,
                bulkConfig: { ...state.bulkConfig, ...action.payload }
            };

        case 'SET_GLOBAL_PROCESSING':
            return {
                ...state,
                globalProcessing: action.payload
            };

        default:
            return state;
    }
}

/**
 * Context Interface with Actions
 */
interface GalleryContextValue extends GalleryState {
    addImage: (image: ImageItem) => void;
    addImages: (images: ImageItem[]) => void;
    updateImage: (id: string, updates: Partial<ImageItem>) => void;
    removeImage: (id: string) => void;
    toggleSelect: (id: string) => void;
    selectAll: () => void;
    deselectAll: () => void;
    setBulkConfig: (config: Partial<GalleryState['bulkConfig']>) => void;
    setGlobalProcessing: (processing: boolean) => void;
    getSelectedImages: () => ImageItem[];
    removeSelected: () => void;
}

/**
 * Create Context
 */
const GalleryContext = createContext<GalleryContextValue | undefined>(undefined);

/**
 * Provider Props
 */
interface GalleryProviderProps {
    children: ReactNode;
}

/**
 * Provider Component
 */
export const GalleryProvider: React.FC<GalleryProviderProps> = ({ children }) => {
    const [state, dispatch] = useReducer(galleryReducer, initialState);

    const contextValue: GalleryContextValue = {
        ...state,

        addImage: (image) => {
            dispatch({ type: 'ADD_IMAGE', payload: image });
        },

        addImages: (images) => {
            dispatch({ type: 'ADD_IMAGES', payload: images });
        },

        updateImage: (id, updates) => {
            dispatch({ type: 'UPDATE_IMAGE', payload: { id, updates } });
        },

        removeImage: (id) => {
            dispatch({ type: 'REMOVE_IMAGE', payload: id });
        },

        toggleSelect: (id) => {
            dispatch({ type: 'TOGGLE_SELECT', payload: id });
        },

        selectAll: () => {
            dispatch({ type: 'SELECT_ALL' });
        },

        deselectAll: () => {
            dispatch({ type: 'DESELECT_ALL' });
        },

        setBulkConfig: (config) => {
            dispatch({ type: 'SET_BULK_CONFIG', payload: config });
        },

        setGlobalProcessing: (processing) => {
            dispatch({ type: 'SET_GLOBAL_PROCESSING', payload: processing });
        },

        getSelectedImages: () => {
            return state.images.filter(img => state.selectedIds.has(img.id));
        },

        removeSelected: () => {
            state.selectedIds.forEach(id => {
                dispatch({ type: 'REMOVE_IMAGE', payload: id });
            });
        }
    };

    return (
        <GalleryContext.Provider value={contextValue}>
            {children}
        </GalleryContext.Provider>
    );
};

/**
 * Custom Hook to Use Gallery Context
 */
export const useGallery = (): GalleryContextValue => {
    const context = useContext(GalleryContext);
    if (!context) {
        throw new Error('useGallery must be used within a GalleryProvider');
    }
    return context;
};
