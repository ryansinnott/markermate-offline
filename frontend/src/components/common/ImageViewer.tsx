import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface ImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  mimetype?: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
  mimetype
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  if (!isOpen) return null;

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.1));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const isPDF = mimetype === 'application/pdf';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="relative w-full h-full max-w-7xl max-h-screen p-4">
        {/* Header */}
        <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center">
          <h3 className="text-white text-lg font-semibold bg-black bg-opacity-50 px-3 py-1 rounded">
            {title}
          </h3>
          <div className="flex items-center space-x-2">
            {!isPDF && (
              <>
                <button
                  onClick={handleZoomOut}
                  className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white p-2 rounded-lg transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-5 w-5" />
                </button>
                <span className="text-white bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white p-2 rounded-lg transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
                <button
                  onClick={handleRotate}
                  className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white p-2 rounded-lg transition-colors"
                  title="Rotate"
                >
                  <RotateCw className="h-5 w-5" />
                </button>
                <button
                  onClick={handleReset}
                  className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-3 py-2 rounded-lg transition-colors text-sm"
                  title="Reset View"
                >
                  Reset
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition-colors"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div 
          className="w-full h-full flex items-center justify-center overflow-hidden"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {isPDF ? (
            <iframe
              src={imageUrl}
              className="w-full h-full bg-white rounded-lg"
              title={title}
            />
          ) : (
            <img
              src={imageUrl}
              alt={title}
              className="max-w-none cursor-move select-none"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out'
              }}
              onMouseDown={handleMouseDown}
              draggable={false}
              onLoad={() => {
                // Reset view when image loads
                handleReset();
              }}
            />
          )}
        </div>

        {/* Instructions */}
        {!isPDF && (
          <div className="absolute bottom-4 left-4 text-white text-sm bg-black bg-opacity-50 px-3 py-2 rounded">
            Click and drag to pan • Scroll to zoom • Use controls to zoom and rotate
          </div>
        )}
      </div>
    </div>
  );
};