import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { UploadPage } from './pages/UploadPage';
import { UploadRubricPage } from './pages/UploadRubricPage';
import { ResultsPage } from './pages/ResultsPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { Header } from './components/common/Header';
import BetaBanner from './components/common/BetaBanner';
import Footer from './components/common/Footer';
import './assets/styles/index.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <BetaBanner />
        <main className="container mx-auto px-4 py-8 flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/upload-rubric" element={<UploadRubricPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/results" element={<ResultsPage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
