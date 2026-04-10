import React from 'react';
import { MessageCircle } from 'lucide-react';

const FeedbackButton: React.FC = () => {
  const handleClick = () => {
    // Open Google Form in new tab
    window.open('https://docs.google.com/forms/d/e/1FAIpQLSeN3iTossoBneHc5-QAdSwP4GhAzqKdO8bo2JMs1L8ouR38Ww/viewform?usp=dialog', '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 bg-gradient-to-r from-orange-500 to-purple-600 text-white px-5 py-3 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center gap-2 z-50 group"
      aria-label="Share feedback"
    >
      <MessageCircle className="w-5 h-5" />
      <span className="font-medium">Share Feedback</span>
    </button>
  );
};

export default FeedbackButton;
