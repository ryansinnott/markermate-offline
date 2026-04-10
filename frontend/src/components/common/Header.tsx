import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Header: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="bg-gradient-to-r from-orange-50 to-purple-50 shadow-lg border-b-2 border-orange-200">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 transform hover:scale-105 transition-transform">
            <img
              src={`${process.env.PUBLIC_URL}/assets/logo.png`}
              alt="MarkerMate Logo"
              className="h-10 w-auto"
            />
            <span className="text-2xl font-bold text-gray-900 font-playful">MarkerMate</span>
          </Link>

          <nav className="flex items-center space-x-4">
            <Link
              to="/"
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all transform hover:scale-105 font-playful ${
                isActive('/')
                  ? 'bg-orange-200 text-orange-800 shadow-md'
                  : 'text-gray-700 hover:bg-orange-100 hover:text-orange-700'
              }`}
            >
              Home
            </Link>
            <Link
              to="/upload"
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all transform hover:scale-105 font-playful ${
                isActive('/upload')
                  ? 'bg-orange-200 text-orange-800 shadow-md'
                  : 'text-gray-700 hover:bg-orange-100 hover:text-orange-700'
              }`}
            >
              Grade Papers
            </Link>
            <Link
              to="/upload-rubric"
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all transform hover:scale-105 font-playful ${
                isActive('/upload-rubric')
                  ? 'bg-purple-200 text-purple-800 shadow-md'
                  : 'text-gray-700 hover:bg-purple-100 hover:text-purple-700'
              }`}
            >
              Upload Rubric
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};
