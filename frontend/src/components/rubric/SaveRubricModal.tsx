import React, { useState } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { SavedRubricCriterion, SavedRubricData } from '../../services/apiService';

interface SaveRubricModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rubricName: string, rubricData: SavedRubricData) => Promise<void>;
  initialCriteria: SavedRubricCriterion[];
  error?: string;
}

export const SaveRubricModal: React.FC<SaveRubricModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialCriteria,
  error: externalError
}) => {
  const [rubricName, setRubricName] = useState('');
  const [criteria, setCriteria] = useState<SavedRubricCriterion[]>(initialCriteria);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCriterionChange = (
    index: number,
    field: keyof SavedRubricCriterion,
    value: string | number
  ) => {
    const updated = [...criteria];
    if (field === 'maxScore') {
      updated[index] = { ...updated[index], [field]: Number(value) || 0 };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setCriteria(updated);
  };

  const handleAddCriterion = () => {
    setCriteria([
      ...criteria,
      { name: '', description: '', maxScore: 4 }
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    if (criteria.length <= 1) {
      setError('At least one criterion is required');
      return;
    }
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    // Validate
    if (!rubricName.trim()) {
      setError('Please enter a rubric name');
      return;
    }

    const invalidCriteria = criteria.find(
      c => !c.name.trim() || !c.description.trim() || c.maxScore <= 0
    );
    if (invalidCriteria) {
      setError('All criteria must have a name, description, and max score greater than 0');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const totalScore = criteria.reduce((sum, c) => sum + c.maxScore, 0);
      await onSave(rubricName.trim(), { criteria, totalScore });
    } catch (err: any) {
      setError(err.message || 'Failed to save rubric');
    } finally {
      setSaving(false);
    }
  };

  const totalScore = criteria.reduce((sum, c) => sum + c.maxScore, 0);
  const displayError = error || externalError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Save Rubric</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Error display */}
          {displayError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {displayError}
            </div>
          )}

          {/* Rubric name input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rubric Name
            </label>
            <input
              type="text"
              value={rubricName}
              onChange={(e) => setRubricName(e.target.value)}
              placeholder="e.g., Year 10 Creative Writing"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Criteria list */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Grading Criteria
              </label>
              <span className="text-sm text-gray-500">
                Total: {totalScore} points
              </span>
            </div>

            <div className="space-y-4">
              {criteria.map((criterion, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Criterion name */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Criterion Name
                        </label>
                        <input
                          type="text"
                          value={criterion.name}
                          onChange={(e) =>
                            handleCriterionChange(index, 'name', e.target.value)
                          }
                          placeholder="e.g., Creative Language"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Description
                        </label>
                        <textarea
                          value={criterion.description}
                          onChange={(e) =>
                            handleCriterionChange(index, 'description', e.target.value)
                          }
                          placeholder="e.g., Uses figurative language effectively"
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                        />
                      </div>

                      {/* Max score */}
                      <div className="w-32">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Max Score
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={criterion.maxScore}
                          onChange={(e) =>
                            handleCriterionChange(index, 'maxScore', e.target.value)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemoveCriterion(index)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove criterion"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add criterion button */}
            <button
              onClick={handleAddCriterion}
              className="mt-4 flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add Criterion
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Rubric'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveRubricModal;
