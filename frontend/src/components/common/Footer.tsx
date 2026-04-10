import React from 'react';
import { ExternalLink } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-100 border-t border-gray-200 mt-12">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-sm text-gray-600">
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSeN3iTossoBneHc5-QAdSwP4GhAzqKdO8bo2JMs1L8ouR38Ww/viewform?usp=dialog"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-orange-600 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Report Issues</span>
          </a>
        </div>
        <div className="text-center mt-4 text-xs text-gray-500">
          MarkerMate - Beta Version
        </div>
      </div>
    </footer>
  );
};

export default Footer;
