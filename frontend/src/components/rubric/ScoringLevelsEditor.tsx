import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { SavedRubricCriterion, ScoringLevel } from '../../services/apiService';

interface ScoringLevelsEditorProps {
  criteria: SavedRubricCriterion[];
  onChange: (criteria: SavedRubricCriterion[]) => void;
  disabled?: boolean;
}

const defaultScoringLevels: ScoringLevel[] = [
  { level: 'Above Expected Standard', points: 3, description: '' },
  { level: 'At Expected Standard', points: 2, description: '' },
  { level: 'Working Towards Expected Standard', points: 1, description: '' },
  { level: 'Insufficient Evidence', points: 0, description: '' },
];

export const ScoringLevelsEditor: React.FC<ScoringLevelsEditorProps> = ({
  criteria,
  onChange,
  disabled = false,
}) => {
  // Calculate total score from all criteria
  const totalScore = criteria.reduce((sum, c) => sum + c.maxScore, 0);

  // Update a criterion field
  const updateCriterion = (index: number, field: keyof SavedRubricCriterion, value: any) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };

    // If updating scoring levels, also update maxScore to the highest points value
    if (field === 'scoringLevels' && Array.isArray(value)) {
      const maxPoints = Math.max(...value.map((l: ScoringLevel) => l.points), 0);
      updated[index].maxScore = maxPoints;
    }

    onChange(updated);
  };

  // Update a specific scoring level within a criterion
  const updateScoringLevel = (
    criterionIndex: number,
    levelIndex: number,
    field: keyof ScoringLevel,
    value: string | number
  ) => {
    const criterion = criteria[criterionIndex];
    const levels = [...(criterion.scoringLevels || [])];
    levels[levelIndex] = { ...levels[levelIndex], [field]: value };

    // Update maxScore to the highest points value
    const maxPoints = Math.max(...levels.map(l => l.points), 0);

    const updated = [...criteria];
    updated[criterionIndex] = {
      ...criterion,
      scoringLevels: levels,
      maxScore: maxPoints,
    };
    onChange(updated);
  };

  // Add a new scoring level to a criterion
  const addScoringLevel = (criterionIndex: number) => {
    const criterion = criteria[criterionIndex];
    const levels = criterion.scoringLevels || [];
    const newLevel: ScoringLevel = {
      level: 'New Level',
      points: 0,
      description: '',
    };
    updateCriterion(criterionIndex, 'scoringLevels', [...levels, newLevel]);
  };

  // Remove a scoring level from a criterion
  const removeScoringLevel = (criterionIndex: number, levelIndex: number) => {
    const criterion = criteria[criterionIndex];
    const levels = (criterion.scoringLevels || []).filter((_, i) => i !== levelIndex);
    updateCriterion(criterionIndex, 'scoringLevels', levels);
  };

  // Add a new criterion
  const addCriterion = () => {
    const newCriterion: SavedRubricCriterion = {
      name: 'New Criterion',
      description: '',
      maxScore: 3,
      scoringLevels: [...defaultScoringLevels],
    };
    onChange([...criteria, newCriterion]);
  };

  // Remove a criterion
  const removeCriterion = (index: number) => {
    onChange(criteria.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Criteria Cards */}
      {criteria.map((criterion, criterionIndex) => (
        <div
          key={criterionIndex}
          className="bg-gray-50 border border-gray-200 rounded-lg p-4 relative"
        >
          {/* Delete Criterion Button */}
          {!disabled && criteria.length > 1 && (
            <button
              onClick={() => removeCriterion(criterionIndex)}
              className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="Delete criterion"
            >
              <Trash2 size={18} />
            </button>
          )}

          {/* Criterion Header */}
          <div className="flex items-start gap-4 mb-4 pr-8">
            <div className="flex-1">
              {/* Criterion Name */}
              <input
                type="text"
                value={criterion.name}
                onChange={(e) => updateCriterion(criterionIndex, 'name', e.target.value)}
                disabled={disabled}
                className="text-lg font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none w-full mb-2"
                placeholder="Criterion Name"
              />

              {/* Criterion Description */}
              <input
                type="text"
                value={criterion.description}
                onChange={(e) => updateCriterion(criterionIndex, 'description', e.target.value)}
                disabled={disabled}
                className="text-sm text-gray-600 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                placeholder="Brief description of this criterion"
              />
            </div>

            {/* Max Score Badge */}
            <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap">
              {criterion.maxScore} pts max
            </div>
          </div>

          {/* Scoring Levels */}
          {criterion.scoringLevels && criterion.scoringLevels.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-gray-700 text-sm mb-3">Scoring Levels:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {criterion.scoringLevels.map((level, levelIndex) => (
                  <div
                    key={levelIndex}
                    className="bg-white rounded-lg p-3 border border-gray-200 relative group"
                  >
                    {/* Remove Level Button */}
                    {!disabled && criterion.scoringLevels!.length > 1 && (
                      <button
                        onClick={() => removeScoringLevel(criterionIndex, levelIndex)}
                        className="absolute -top-2 -right-2 p-1 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove level"
                      >
                        <X size={14} />
                      </button>
                    )}

                    {/* Level Name & Points */}
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <input
                        type="text"
                        value={level.level}
                        onChange={(e) =>
                          updateScoringLevel(criterionIndex, levelIndex, 'level', e.target.value)
                        }
                        disabled={disabled}
                        className="font-medium text-xs text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none flex-1 min-w-0"
                        placeholder="Level name"
                      />
                      <div className="flex items-center bg-gray-100 rounded px-2 py-1 shrink-0">
                        <input
                          type="number"
                          value={level.points}
                          onChange={(e) =>
                            updateScoringLevel(
                              criterionIndex,
                              levelIndex,
                              'points',
                              parseInt(e.target.value) || 0
                            )
                          }
                          disabled={disabled}
                          className="w-8 text-xs text-center bg-transparent border-none focus:outline-none"
                          min="0"
                        />
                        <span className="text-xs text-gray-600">pts</span>
                      </div>
                    </div>

                    {/* Level Description */}
                    <textarea
                      value={level.description}
                      onChange={(e) =>
                        updateScoringLevel(criterionIndex, levelIndex, 'description', e.target.value)
                      }
                      disabled={disabled}
                      className="w-full text-xs text-gray-600 bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none rounded p-1 resize-none"
                      placeholder="Description for this level..."
                      rows={3}
                    />
                  </div>
                ))}

                {/* Add Level Button */}
                {!disabled && (
                  <button
                    onClick={() => addScoringLevel(criterionIndex)}
                    className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-blue-600 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg p-3 transition-colors min-h-[100px]"
                  >
                    <Plus size={16} />
                    <span>Add Level</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Show "Add Scoring Levels" if none exist */}
          {(!criterion.scoringLevels || criterion.scoringLevels.length === 0) && !disabled && (
            <button
              onClick={() => updateCriterion(criterionIndex, 'scoringLevels', [...defaultScoringLevels])}
              className="mt-3 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              <Plus size={16} />
              Add Scoring Levels
            </button>
          )}
        </div>
      ))}

      {/* Add Criterion Button */}
      {!disabled && (
        <button
          onClick={addCriterion}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 hover:border-blue-400 text-gray-500 hover:text-blue-600 rounded-lg transition-colors"
        >
          <Plus size={20} />
          <span>Add Criterion</span>
        </button>
      )}

      {/* Total Score Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <span className="font-medium text-blue-900">Total Maximum Score</span>
          <span className="text-xl font-bold text-blue-700">{totalScore} points</span>
        </div>
      </div>
    </div>
  );
};

export default ScoringLevelsEditor;
