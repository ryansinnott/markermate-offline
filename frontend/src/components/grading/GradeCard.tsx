import React, { useState } from 'react';
import { Edit, Save, X, AlertTriangle } from 'lucide-react';

interface Grade {
  criterion: string;
  score: number;
  maxScore: number;
  feedback: string;
}

interface GradingResult {
  studentId: number;
  studentName?: string;
  originalName?: string;
  filename?: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  criteria?: Grade[];
  grades?: Grade[];
  summary: string;
  ocrWarnings?: string[];
  analysis?: string;
  transcription?: string;
  gradingSuccess?: boolean;
}

interface GradeCardProps {
  result: GradingResult;
  onEditGrade: (criterion: string, newScore: number) => void;
}

export const GradeCard: React.FC<GradeCardProps> = ({ result, onEditGrade }) => {
  const [editingCriterion, setEditingCriterion] = useState<string | null>(null);
  const [editScore, setEditScore] = useState<number>(0);

  const startEdit = (criterion: string, currentScore: number) => {
    setEditingCriterion(criterion);
    setEditScore(currentScore);
  };

  const saveEdit = () => {
    if (editingCriterion) {
      onEditGrade(editingCriterion, editScore);
      setEditingCriterion(null);
    }
  };

  const cancelEdit = () => {
    setEditingCriterion(null);
    setEditScore(0);
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 80) return 'text-blue-600';
    if (percentage >= 70) return 'text-yellow-600';
    if (percentage >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="card p-6 overflow-visible">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{result.originalName || `Student ${result.studentId}`}</h2>
          <p className="text-sm text-gray-600">ID: {result.studentId}</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold ${getScoreColor(result.percentage)}`}>
            {result.percentage}%
          </p>
          <p className="text-sm text-gray-600">
            {result.totalScore}/{result.maxScore} points
          </p>
        </div>
      </div>


      {/* Criteria Table */}
      <div className="mb-4 overflow-visible">
        <div className="min-w-full overflow-x-auto">
          <table className="w-full text-sm table-auto border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 font-medium text-gray-900">Criterion</th>
              <th className="text-center py-3 px-2 font-medium text-gray-900">Score</th>
              <th className="text-center py-3 px-2 font-medium text-gray-900">Max</th>
              <th className="text-left py-3 px-2 font-medium text-gray-900">Feedback</th>
              <th className="text-center py-3 px-2 font-medium text-gray-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(result.grades || result.criteria || []).map((criterion, index) => (
              <tr key={index} className="border-b border-gray-100">
                <td className="py-4 px-2 font-medium text-gray-900">
                  {criterion.criterion}
                </td>
                <td className="py-4 px-2 text-center">
                  {editingCriterion === criterion.criterion ? (
                    <input
                      type="number"
                      value={editScore}
                      onChange={(e) => setEditScore(Number(e.target.value))}
                      min={0}
                      max={criterion.maxScore}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                    />
                  ) : (
                    <span className={getScoreColor((criterion.score / criterion.maxScore) * 100)}>
                      {criterion.score}
                    </span>
                  )}
                </td>
                <td className="py-4 px-2 text-center text-gray-600">
                  {criterion.maxScore}
                </td>
                <td className="py-4 px-2 text-gray-700">
                  {criterion.feedback}
                </td>
                <td className="py-4 px-2 text-center">
                  {editingCriterion === criterion.criterion ? (
                    <div className="flex justify-center space-x-1">
                      <button
                        onClick={saveEdit}
                        className="p-1 text-green-600 hover:text-green-800"
                        title="Save"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1 text-gray-600 hover:text-gray-800"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(criterion.criterion, criterion.score)}
                      className="p-1 text-blue-600 hover:text-blue-800"
                      title="Edit score"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
        <p className="text-gray-700 text-sm leading-relaxed">
          {result.summary}
        </p>
      </div>
    </div>
  );
};