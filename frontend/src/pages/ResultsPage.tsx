import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { apiService } from '../services/apiService';
import { GradeCard } from '../components/grading/GradeCard';

export const ResultsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [results, setResults] = useState<any[]>([]);
  const [rubricData, setRubricData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    loadResults();
  }, [location]);

  const loadResults = async () => {
    try {
      // First, try to get data from React Router navigation state
      if (location.state) {
        const { gradingResults, rubric, summary, sessionId: stateSessionId } = location.state as any;
        if (gradingResults && rubric) {
          setResults(gradingResults);
          setRubricData(rubric);
          setSessionId(stateSessionId || Date.now().toString());
          setLoading(false);
          return;
        }
      }

      // Fallback: Try to fetch from API using sessionId from URL
      const urlParams = new URLSearchParams(window.location.search);
      const sessionIdParam = urlParams.get('sessionId');

      if (sessionIdParam) {
        try {
          const response = await apiService.getResultsBySessionId(sessionIdParam);
          if (response.success && response.results) {
            setSessionId(sessionIdParam);
            setRubricData(response.rubric);
            setResults(response.results);
            setLoading(false);
            return;
          }
        } catch (apiError) {
          console.error('Failed to fetch results from API:', apiError);
          // Session may have expired - fall through to error state
        }
      }

      setError('No grading data found. The session may have expired. Please start a new grading session.');
      setLoading(false);
    } catch (err) {
      console.error('Failed to load grading data:', err);
      setError('Failed to load grading data');
      setLoading(false);
    }
  };

  const exportGrades = (format: 'csv' | 'json') => {
    try {
      if (format === 'csv') {
        const csvData = results.map(result => ({
          'Student ID': result.studentId,
          'Original Name': result.originalName,
          'Total Score': result.totalScore,
          'Max Score': result.maxScore,
          'Percentage': result.percentage + '%',
          'Summary': result.summary,
          ...result.grades.reduce((acc: any, grade: any) => {
            acc[grade.criterion] = grade.score;
            return acc;
          }, {})
        }));
        
        const csvContent = [
          Object.keys(csvData[0]).join(','),
          ...csvData.map(row => Object.values(row).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grades-${sessionId}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        const data = { sessionId, rubric: rubricData, results };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grades-report-${sessionId}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      setError('Failed to export grades');
    }
  };

  const handleGradeEdit = async (studentId: number, criterion: string, newScore: number) => {
    try {
      setResults(prevResults => 
        prevResults.map(result => {
          if (result.studentId === studentId) {
            const updatedGrades = result.grades.map((grade: any) => 
              grade.criterion === criterion ? { ...grade, score: newScore } : grade
            );
            const newTotalScore = updatedGrades.reduce((sum: number, grade: any) => sum + grade.score, 0);
            const maxScore = updatedGrades.reduce((sum: number, grade: any) => sum + grade.maxScore, 0);
            const newPercentage = Math.round((newTotalScore / maxScore) * 100);
            
            return {
              ...result,
              grades: updatedGrades,
              totalScore: newTotalScore,
              percentage: newPercentage
            };
          }
          return result;
        })
      );
    } catch (error) {
      setError('Failed to update grade');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card-playful p-8 text-center">
          <p className="text-red-600 mb-6 text-lg font-handwritten">{error}</p>
          <div className="space-x-4">
            <button onClick={loadResults} className="btn-primary">
              Retry
            </button>
            <button
              onClick={() => navigate('/upload')}
              className="btn-secondary"
            >
              Start New Grading
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 font-playful">
            Grading Results
          </h1>
          <p className="text-gray-600">
            {results.length} submissions graded
          </p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={() => exportGrades('csv')}
            className="btn-secondary flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => exportGrades('json')}
            className="btn-secondary flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <div className="card-playful p-4 text-center">
          <p className="text-2xl font-bold text-blue-600 font-playful">
            {results.length}
          </p>
          <p className="text-sm text-gray-600">Total Students</p>
        </div>
        <div className="card-playful p-4 text-center">
          <p className="text-2xl font-bold text-green-600 font-playful">
            {results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / results.length) : 0}%
          </p>
          <p className="text-sm text-gray-600">Average Score</p>
        </div>
        <div className="card-playful p-4 text-center">
          <p className="text-2xl font-bold text-purple-600 font-playful">
            {results.length > 0 ? Math.max(...results.map(r => r.percentage)) : 0}%
          </p>
          <p className="text-sm text-gray-600">Highest Score</p>
        </div>
        <div className="card-playful p-4 text-center">
          <p className="text-2xl font-bold text-orange-600 font-playful">
            {results.length > 0 ? Math.min(...results.map(r => r.percentage)) : 0}%
          </p>
          <p className="text-sm text-gray-600">Lowest Score</p>
        </div>
      </div>

      {/* Results Grid */}
      <div className="space-y-6">
        {results.map((result) => (
          <GradeCard
            key={result.studentId}
            result={result}
            onEditGrade={(criterion, newScore) => 
              handleGradeEdit(result.studentId, criterion, newScore)
            }
          />
        ))}
      </div>

      {results.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-gray-600 mb-4">No grading results found</p>
          <button
            onClick={() => navigate('/upload')}
            className="btn-primary"
          >
            Start New Grading Session
          </button>
        </div>
      )}
    </div>
  );
};