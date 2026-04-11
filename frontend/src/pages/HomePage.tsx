import React from 'react';
import { Link } from 'react-router-dom';

export const HomePage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center">
        <div className="mb-2">
          <img
            src={`${process.env.PUBLIC_URL}/assets/logo.png`}
            alt="MarkerMate Logo"
            className="mx-auto h-64 w-auto transform hover:scale-105 transition-transform duration-300"
          />
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-2 font-playful">
          Welcome to MarkerMate
        </h1>
        <p className="text-2xl text-gray-600 mb-6 font-playful">
          Offline Version
        </p>
        <p className="text-xl text-gray-700 mb-12 font-handwritten">
          Automate the grading of handwritten English assessments with AI-powered analysis
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            to="/upload"
            className="btn-primary text-xl px-12 py-4 inline-block"
          >
            Grade Papers
          </Link>
          <Link
            to="/upload-rubric"
            className="btn-secondary text-xl px-12 py-4 inline-block"
          >
            Upload Rubric
          </Link>
        </div>
      </div>
    </div>
  );
};
