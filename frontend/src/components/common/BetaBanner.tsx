import React, { useState, useEffect } from 'react';
import { Info, X } from 'lucide-react';

const BetaBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Check if banner was previously dismissed (in current session only)
    const dismissed = sessionStorage.getItem('betaBannerDismissed');
    if (dismissed === 'true') {
      setIsVisible(false);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem('betaBannerDismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="bg-blue-50 border-b border-blue-200">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Beta Version</span> - Free for educators. Your feedback helps improve MarkerMate!{' '}
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSeN3iTossoBneHc5-QAdSwP4GhAzqKdO8bo2JMs1L8ouR38Ww/viewform?usp=dialog"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-900 font-medium"
              >
                Report issues
              </a>
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-blue-600 hover:text-blue-800 transition-colors p-1 flex-shrink-0"
            aria-label="Dismiss banner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BetaBanner;
