import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FileText, Eye, AlertCircle, CheckCircle } from 'lucide-react';

interface FileAnalysis {
  success: boolean;
  analysis: string;
  fileType: 'rubric' | 'student_work';
  fileName: string;
  modelUsed: string;
  transcription?: string;
  error?: string;
}

interface AnalysisData {
  rubric?: {
    filename: string;
    analysis: FileAnalysis;
  };
  submissions?: Array<{
    id: number;
    filename: string;
    originalName: string;
    analysis: FileAnalysis;
  }>;
}

export const AnalysisPage: React.FC = () => {
  const location = useLocation();
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

  useEffect(() => {
    // Get analysis data from navigation state
    if (location.state?.analysisData) {
      setAnalysisData(location.state.analysisData);
    }
  }, [location]);

  const formatAnalysis = (analysis: string) => {
    // Split by numbered points and format
    return analysis.split('\n').map((line, index) => {
      if (line.trim().match(/^\d+\./)) {
        return (
          <div key={index} className="font-medium text-gray-900 mt-3 mb-1">
            {line.trim()}
          </div>
        );
      } else if (line.trim()) {
        return (
          <div key={index} className="text-gray-700 ml-4 mb-1">
            {line.trim()}
          </div>
        );
      }
      return null;
    });
  };

  if (!analysisData) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <AlertCircle className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">No Analysis Data</h1>
        <p className="text-gray-600">Please upload files first to see analysis results.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          <Eye className="inline h-8 w-8 mr-2" />
          AI Transcription & Analysis Results
        </h1>
        <p className="text-lg text-gray-600">
          Claude AI transcription and analysis of your uploaded student work
        </p>
      </div>

      <div className="space-y-8">
        {/* Rubric Analysis */}
        {analysisData.rubric && (
          <div className="card p-6">
            <div className="flex items-center mb-4">
              <FileText className="h-6 w-6 text-blue-600 mr-3" />
              <h2 className="text-xl font-bold text-gray-900">
                Rubric Analysis
              </h2>
              {analysisData.rubric.analysis?.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 ml-2" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 ml-2" />
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>File: {analysisData.rubric.filename}</span>
                <span>Model: {analysisData.rubric.analysis?.modelUsed}</span>
              </div>
            </div>

            {analysisData.rubric.analysis?.success ? (
              <div className="prose max-w-none">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  {formatAnalysis(analysisData.rubric.analysis.analysis)}
                </div>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">
                  <strong>Analysis Failed:</strong> {analysisData.rubric.analysis?.error}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Student Work Analysis */}
        {analysisData.submissions && analysisData.submissions.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center mb-6">
              <FileText className="h-6 w-6 text-green-600 mr-3" />
              <h2 className="text-xl font-bold text-gray-900">
                Student Work Analysis ({analysisData.submissions.length} files)
              </h2>
            </div>

            <div className="space-y-6">
              {analysisData.submissions.map((submission, index) => (
                <div key={submission.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Student {submission.id}: {submission.originalName}
                    </h3>
                    {submission.analysis?.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>File: {submission.filename}</span>
                      <span>Model: {submission.analysis?.modelUsed}</span>
                    </div>
                  </div>


                  {/* Analysis Section */}
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                      <Eye className="h-5 w-5 text-blue-600 mr-2" />
                      AI Analysis
                    </h4>
                    {submission.analysis?.success ? (
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        {formatAnalysis(submission.analysis.analysis)}
                      </div>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-red-800">
                          <strong>Analysis Failed:</strong> {submission.analysis?.error}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-8 card p-6 bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          Analysis Summary
        </h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-blue-800">Rubric Files:</span>
            <span className="text-blue-700 ml-2">
              {analysisData.rubric ? 1 : 0} analyzed
            </span>
          </div>
          <div>
            <span className="font-medium text-blue-800">Student Files:</span>
            <span className="text-blue-700 ml-2">
              {analysisData.submissions?.length || 0} analyzed
            </span>
          </div>
          <div>
            <span className="font-medium text-blue-800">AI Model:</span>
            <span className="text-blue-700 ml-2">Claude 3.5 Sonnet</span>
          </div>
          <div>
            <span className="font-medium text-blue-800">Success Rate:</span>
            <span className="text-blue-700 ml-2">
              {(() => {
                const total = (analysisData.rubric ? 1 : 0) + (analysisData.submissions?.length || 0);
                const successful = (analysisData.rubric?.analysis?.success ? 1 : 0) + 
                                 (analysisData.submissions?.filter(s => s.analysis?.success).length || 0);
                return total > 0 ? `${Math.round((successful / total) * 100)}%` : '0%';
              })()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};