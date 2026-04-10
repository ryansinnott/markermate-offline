import React from 'react';
import { Link } from 'react-router-dom';

export const HomePage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center">
        <div className="mb-8">
          <img
            src={`${process.env.PUBLIC_URL}/assets/logo.png`}
            alt="MarkerMate Logo"
            className="mx-auto h-32 w-auto transform hover:scale-105 transition-transform duration-300"
          />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-6 font-playful">
          Welcome to MarkerMate
        </h1>
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

        <div className="mt-8">
          <p className="text-gray-600 font-handwritten">
            Let's connect!{' '}
            <a
              href="https://www.linkedin.com/in/ryainovation/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:text-purple-700 font-semibold underline decoration-2 decoration-purple-300"
            >
              Find me on LinkedIn
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
