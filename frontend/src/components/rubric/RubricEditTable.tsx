import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SavedRubricCriterion } from '../../services/apiService';

interface RubricEditTableProps {
  criteria: SavedRubricCriterion[];
  onChange: (criteria: SavedRubricCriterion[]) => void;
  disabled?: boolean;
}

export const RubricEditTable: React.FC<RubricEditTableProps> = ({
  criteria,
  onChange,
  disabled = false
}) => {
  const handleCriterionChange = (
    index: number,
    field: keyof SavedRubricCriterion,
    value: string | number
  ) => {
    const updated = [...criteria];
    if (field === 'maxScore') {
      updated[index] = { ...updated[index], [field]: Number(value) || 0 };
    } else {
      updated[index] = { ...updated[index], [field]: value as string };
    }
    onChange(updated);
  };

  const handleAddCriterion = () => {
    onChange([
      ...criteria,
      { name: '', description: '', maxScore: 4 }
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    if (criteria.length <= 1) {
      return; // Keep at least one criterion
    }
    onChange(criteria.filter((_, i) => i !== index));
  };

  const totalScore = criteria.reduce((sum, c) => sum + (c.maxScore || 0), 0);

  return (
    <div className="space-y-4">
      {/* Table Header */}
      <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-2 bg-gray-100 rounded-t-lg font-medium text-sm text-gray-700">
        <div className="col-span-3">Criterion Name</div>
        <div className="col-span-6">Description</div>
        <div className="col-span-2">Max Points</div>
        <div className="col-span-1">Actions</div>
      </div>

      {/* Table Rows */}
      <div className="space-y-3">
        {criteria.map((criterion, index) => (
          <div
            key={index}
            className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            {/* Criterion Name */}
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-500 mb-1 md:hidden">
                Criterion Name
              </label>
              <input
                type="text"
                value={criterion.name}
                onChange={(e) => handleCriterionChange(index, 'name', e.target.value)}
                placeholder="e.g., Creative Language"
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Description */}
            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-gray-500 mb-1 md:hidden">
                Description
              </label>
              <input
                type="text"
                value={criterion.description}
                onChange={(e) => handleCriterionChange(index, 'description', e.target.value)}
                placeholder="e.g., Uses figurative language effectively"
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Max Points */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1 md:hidden">
                Max Points
              </label>
              <input
                type="number"
                min="1"
                value={criterion.maxScore}
                onChange={(e) => handleCriterionChange(index, 'maxScore', e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Actions */}
            <div className="md:col-span-1 flex items-center justify-end md:justify-center">
              <button
                onClick={() => handleRemoveCriterion(index)}
                disabled={disabled || criteria.length <= 1}
                className="p-2 text-gray-400 hover:text-red-500 disabled:hover:text-gray-400 disabled:cursor-not-allowed transition-colors"
                title={criteria.length <= 1 ? 'At least one criterion required' : 'Delete criterion'}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Button and Total */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleAddCriterion}
          disabled={disabled}
          className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
        >
          <Plus size={18} />
          Add New Criterion
        </button>

        <div className="text-sm font-medium text-gray-700">
          Total Score: <span className="text-blue-600">{totalScore} points</span>
        </div>
      </div>
    </div>
  );
};

export default RubricEditTable;
