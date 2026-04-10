import React from 'react';
import { GridRubric, RubricCategory } from '../../services/apiService';

interface RubricGridDisplayProps {
  rubric: GridRubric;
  onEdit?: (rubric: GridRubric) => void;
  editable?: boolean;
}

const levelColors: Record<string, { bg: string; border: string; text: string }> = {
  green: { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-800' },
  yellow: { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-800' },
  orange: { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800' },
  red: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-800' },
};

export const RubricGridDisplay: React.FC<RubricGridDisplayProps> = ({
  rubric,
  onEdit,
  editable = false
}) => {
  const { title, criteria, performanceLevels, categories } = rubric;

  // Get criteria grouped by category for header rendering
  const getCriteriaWithCategories = (): { criterion: string; category?: string }[] => {
    if (!categories || categories.length === 0) {
      return criteria.map(c => ({ criterion: c }));
    }

    const result: { criterion: string; category?: string }[] = [];
    categories.forEach(cat => {
      cat.criteria.forEach(c => {
        result.push({ criterion: c, category: cat.name });
      });
    });
    return result;
  };

  const criteriaWithCategories = getCriteriaWithCategories();

  // Get category spans for header row
  const getCategorySpans = (): { name: string; span: number }[] => {
    if (!categories || categories.length === 0) return [];
    return categories.map(cat => ({
      name: cat.name,
      span: cat.criteria.length
    }));
  };

  const categorySpans = getCategorySpans();

  const handleDescriptorChange = (
    levelIndex: number,
    criterion: string,
    newValue: string
  ) => {
    if (!onEdit || !editable) return;

    const updatedLevels = [...performanceLevels];
    updatedLevels[levelIndex] = {
      ...updatedLevels[levelIndex],
      descriptors: {
        ...updatedLevels[levelIndex].descriptors,
        [criterion]: newValue
      }
    };

    onEdit({
      ...rubric,
      performanceLevels: updatedLevels
    });
  };

  return (
    <div className="overflow-x-auto">
      {/* Title */}
      <h2 className="text-xl font-bold text-gray-900 mb-4 text-center">
        {title}
      </h2>

      <div className="min-w-max">
        <table className="w-full border-collapse border border-gray-300">
          {/* Category Header Row (if categories exist) */}
          {categorySpans.length > 0 && (
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gray-50 p-2 min-w-[120px]"></th>
                {categorySpans.map((cat, idx) => (
                  <th
                    key={idx}
                    colSpan={cat.span}
                    className="border border-gray-300 bg-blue-600 text-white p-2 text-center font-semibold"
                  >
                    {cat.name}
                  </th>
                ))}
                <th className="border border-gray-300 bg-gray-50 p-2 min-w-[100px]"></th>
              </tr>
            </thead>
          )}

          {/* Criteria Header Row */}
          <thead>
            <tr>
              <th className="border border-gray-300 bg-gray-100 p-2 text-left font-semibold text-gray-700 min-w-[120px]">
                Indicator
              </th>
              {criteriaWithCategories.map((item, idx) => (
                <th
                  key={idx}
                  className="border border-gray-300 bg-gray-100 p-2 text-center font-semibold text-gray-700 min-w-[150px] max-w-[200px]"
                >
                  <div className="text-sm">
                    {idx + 1}. {item.criterion}
                  </div>
                </th>
              ))}
              <th className="border border-gray-300 bg-gray-100 p-2 text-center font-semibold text-gray-700 min-w-[100px]">
                Capability
              </th>
            </tr>
          </thead>

          {/* Performance Level Rows */}
          <tbody>
            {performanceLevels.map((level, levelIdx) => {
              const colors = levelColors[level.color] || levelColors.yellow;

              return (
                <tr key={levelIdx}>
                  {/* Level Name Column */}
                  <td className={`border border-gray-300 p-2 font-medium ${colors.bg} ${colors.text}`}>
                    <div className="text-sm whitespace-nowrap">
                      {level.level}
                    </div>
                  </td>

                  {/* Descriptor Cells */}
                  {criteriaWithCategories.map((item, criterionIdx) => {
                    const descriptor = level.descriptors[item.criterion] || '';

                    return (
                      <td
                        key={criterionIdx}
                        className={`border ${colors.border} p-2 text-sm align-top ${colors.bg}`}
                      >
                        {editable ? (
                          <textarea
                            value={descriptor}
                            onChange={(e) => handleDescriptorChange(levelIdx, item.criterion, e.target.value)}
                            className={`w-full min-h-[80px] p-1 text-sm border border-gray-300 rounded resize-y ${colors.bg}`}
                          />
                        ) : (
                          <div className={`${colors.text} text-xs leading-relaxed`}>
                            {descriptor || <span className="italic text-gray-400">No descriptor</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Level Indicator Column */}
                  <td className={`border border-gray-300 p-2 ${colors.bg} ${colors.text}`}>
                    <div className="text-xs font-medium text-center">
                      {level.level.split(' ').slice(0, 2).join(' ')}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 justify-center">
        {performanceLevels.map((level, idx) => {
          const colors = levelColors[level.color] || levelColors.yellow;
          return (
            <div key={idx} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${colors.bg} ${colors.border} border`}></div>
              <span className="text-sm text-gray-600">{level.level}</span>
            </div>
          );
        })}
      </div>

      {/* Total Criteria Count */}
      <div className="mt-4 text-center text-sm text-gray-600">
        {criteria.length} criteria across {performanceLevels.length} performance levels
      </div>
    </div>
  );
};

export default RubricGridDisplay;
