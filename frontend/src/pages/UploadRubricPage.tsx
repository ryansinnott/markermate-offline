import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Save } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { apiService, SavedRubricCriterion, GridRubric, ScoringLevel } from '../services/apiService';
import ScoringLevelsEditor from '../components/rubric/ScoringLevelsEditor';

export const UploadRubricPage: React.FC = () => {
  // File upload state
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Criteria state (shown after analysis)
  const [criteria, setCriteria] = useState<SavedRubricCriterion[]>([]);
  const [showCriteria, setShowCriteria] = useState(false);

  // Grid rubric state
  const [gridRubric, setGridRubric] = useState<GridRubric | null>(null);
  const [isGridFormat, setIsGridFormat] = useState(false);

  // Save state
  const [rubricName, setRubricName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg']
    },
    multiple: false,
    onDrop: async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setRubricFile(file);
        setAnalyzeError(null);
        setSaveSuccess(false);
        await analyzeRubric(file);
      }
    }
  });

  const analyzeRubric = async (file: File) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setShowCriteria(false);
    setGridRubric(null);
    setIsGridFormat(false);

    try {
      // Use the existing rubric upload endpoint which analyzes the rubric
      const response = await apiService.uploadRubric(file);

      if (response.success && response.analysis) {
        // Try to parse as JSON first (new format with grid detection)
        const analysisText = response.analysis.analysis;
        const parsedResult = parseAnalysisResponse(analysisText);

        if (parsedResult.isGridFormat && parsedResult.gridRubric) {
          // Convert grid format to flat criteria with scoring levels
          const convertedCriteria = convertGridToFlatCriteria(parsedResult.gridRubric);
          setCriteria(convertedCriteria);
          setGridRubric(parsedResult.gridRubric);
          setIsGridFormat(true);
          setShowCriteria(true);
        } else if (parsedResult.flatCriteria && parsedResult.flatCriteria.length > 0) {
          // It's already flat format
          setCriteria(parsedResult.flatCriteria);
          setIsGridFormat(false);
          setShowCriteria(true);
        } else {
          // Fallback to legacy parsing
          const extractedCriteria = parseAnalysisToCriteria(analysisText);
          setCriteria(extractedCriteria);
          setIsGridFormat(false);
          setShowCriteria(true);
        }
      } else {
        setAnalyzeError('Failed to analyze rubric. Please try again.');
      }
    } catch (error: any) {
      console.error('Error analyzing rubric:', error);
      setAnalyzeError(error.message || 'Failed to analyze rubric. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Parse AI response which may be JSON (new format) or text (legacy)
  const parseAnalysisResponse = (analysisText: string): {
    isGridFormat: boolean;
    gridRubric?: GridRubric;
    flatCriteria?: SavedRubricCriterion[]
  } => {
    console.log('[DEBUG] parseAnalysisResponse called');
    console.log('[DEBUG] Raw analysis text (first 500 chars):', analysisText.substring(0, 500));

    try {
      // Try to parse as JSON
      let parsed = null;

      // First try direct parsing
      try {
        parsed = JSON.parse(analysisText);
        console.log('[DEBUG] Direct JSON parse successful');
      } catch {
        // Try to extract JSON from code blocks or surrounding text
        const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
          console.log('[DEBUG] Code block JSON parse successful');
        } else {
          // Try to find JSON object/array in the text
          const jsonStartIndex = analysisText.search(/[\{\[]/);
          const jsonEndIndex = Math.max(analysisText.lastIndexOf('}'), analysisText.lastIndexOf(']'));
          if (jsonStartIndex !== -1 && jsonEndIndex > jsonStartIndex) {
            parsed = JSON.parse(analysisText.substring(jsonStartIndex, jsonEndIndex + 1));
            console.log('[DEBUG] Extracted JSON parse successful');
          }
        }
      }

      if (!parsed) {
        console.log('[DEBUG] No JSON parsed, returning empty');
        return { isGridFormat: false };
      }

      console.log('[DEBUG] Parsed object keys:', Object.keys(parsed));
      console.log('[DEBUG] isGridFormat:', parsed.isGridFormat);
      console.log('[DEBUG] Has criteria:', !!parsed.criteria);
      console.log('[DEBUG] Has performanceLevels:', !!parsed.performanceLevels);

      // Check if it's a grid format
      if (parsed.isGridFormat === true && parsed.criteria && parsed.performanceLevels) {
        console.log('[DEBUG] Detected GRID format');
        console.log('[DEBUG] Criteria list:', parsed.criteria);
        console.log('[DEBUG] Performance levels count:', parsed.performanceLevels.length);

        // Log descriptor keys for first performance level
        if (parsed.performanceLevels[0]?.descriptors) {
          console.log('[DEBUG] First performance level descriptor keys:', Object.keys(parsed.performanceLevels[0].descriptors));
          console.log('[DEBUG] First performance level first descriptor:', Object.entries(parsed.performanceLevels[0].descriptors)[0]);
        }

        return {
          isGridFormat: true,
          gridRubric: {
            title: parsed.title || 'Uploaded Rubric',
            isGridFormat: true,
            categories: parsed.categories,
            criteria: parsed.criteria,
            performanceLevels: parsed.performanceLevels.map((level: any) => ({
              level: level.level,
              color: level.color || 'yellow',
              descriptors: level.descriptors || {}
            }))
          }
        };
      }

      // Check if it's a flat format (array of criteria or object with criteria array)
      const criteriaArray = Array.isArray(parsed) ? parsed : parsed.criteria;
      if (criteriaArray && Array.isArray(criteriaArray)) {
        console.log('[DEBUG] Detected FLAT format');
        console.log('[DEBUG] Criteria count:', criteriaArray.length);

        // Log first criterion details
        if (criteriaArray[0]) {
          console.log('[DEBUG] First criterion:', criteriaArray[0].name);
          console.log('[DEBUG] First criterion has scoringLevels:', !!criteriaArray[0].scoringLevels);
          if (criteriaArray[0].scoringLevels) {
            console.log('[DEBUG] First criterion scoring levels count:', criteriaArray[0].scoringLevels.length);
            console.log('[DEBUG] First scoring level:', criteriaArray[0].scoringLevels[0]);
          }
        }

        const flatCriteria: SavedRubricCriterion[] = criteriaArray.map((c: any) => ({
          name: c.name || 'Unnamed',
          description: c.description || '',
          maxScore: c.maxScore || 4,
          // Extract scoring levels with their descriptions from the AI response
          scoringLevels: c.scoringLevels?.map((level: any) => ({
            level: level.level || 'Level',
            points: level.points ?? 0,
            description: level.description || ''
          }))
        }));
        return { isGridFormat: false, flatCriteria };
      }

      console.log('[DEBUG] No recognized format, returning empty');
      return { isGridFormat: false };
    } catch (error) {
      console.log('[DEBUG] JSON parsing failed:', error);
      console.log('JSON parsing failed, falling back to text parsing');
      return { isGridFormat: false };
    }
  };

  // Parse AI analysis text to extract criteria
  // This is a simplified parser - the actual format depends on the AI output
  const parseAnalysisToCriteria = (analysisText: string): SavedRubricCriterion[] => {
    // Try to extract criteria from numbered points or bullet points
    const lines = analysisText.split('\n').filter(line => line.trim());
    const criteria: SavedRubricCriterion[] = [];

    // Look for patterns like "1. Criterion Name - Description" or "Criterion: Description"
    for (const line of lines) {
      // Skip empty lines and headers
      if (!line.trim() || line.includes('Rubric') || line.includes('Assessment')) continue;

      // Try to match numbered items: "1. Name: Description" or "1. Name - Description"
      const numberedMatch = line.match(/^\d+[\.\)]\s*([^:\-]+)[\:\-]\s*(.+)/);
      if (numberedMatch) {
        criteria.push({
          name: numberedMatch[1].trim(),
          description: numberedMatch[2].trim(),
          maxScore: 4 // Default score
        });
        continue;
      }

      // Try to match bullet items: "• Name: Description" or "- Name: Description"
      const bulletMatch = line.match(/^[\•\-\*]\s*([^:\-]+)[\:\-]\s*(.+)/);
      if (bulletMatch) {
        criteria.push({
          name: bulletMatch[1].trim(),
          description: bulletMatch[2].trim(),
          maxScore: 4
        });
        continue;
      }
    }

    // If no criteria found, create default ones
    if (criteria.length === 0) {
      return [
        { name: 'Content', description: 'Quality and relevance of content', maxScore: 4 },
        { name: 'Structure', description: 'Organization and logical flow', maxScore: 4 },
        { name: 'Language', description: 'Grammar, spelling, and expression', maxScore: 4 }
      ];
    }

    return criteria;
  };

  // Convert grid rubric to flat criteria with scoring levels
  const convertGridToFlatCriteria = (grid: GridRubric): SavedRubricCriterion[] => {
    console.log('[DEBUG] Converting grid rubric to flat criteria');
    console.log('[DEBUG] Grid criteria:', grid.criteria);
    console.log('[DEBUG] Performance levels:', grid.performanceLevels);

    // Map performance level colors to point values (or use index-based scoring)
    const levelPoints: { [key: string]: number } = {};
    grid.performanceLevels.forEach((level, index) => {
      // Assign points based on reverse index (highest first)
      levelPoints[level.level] = grid.performanceLevels.length - 1 - index;
    });

    // Helper function to find descriptor with flexible key matching
    const findDescriptor = (descriptors: { [key: string]: string }, criterionName: string): string => {
      // First try exact match
      if (descriptors[criterionName]) {
        return descriptors[criterionName];
      }

      // Try case-insensitive match with trimmed whitespace
      const normalizedTarget = criterionName.toLowerCase().trim();
      for (const [key, value] of Object.entries(descriptors)) {
        if (key.toLowerCase().trim() === normalizedTarget) {
          return value;
        }
      }

      // Try partial match (criterion name contains key or vice versa)
      for (const [key, value] of Object.entries(descriptors)) {
        const normalizedKey = key.toLowerCase().trim();
        if (normalizedKey.includes(normalizedTarget) || normalizedTarget.includes(normalizedKey)) {
          return value;
        }
      }

      console.log(`[DEBUG] No descriptor found for criterion "${criterionName}". Available keys:`, Object.keys(descriptors));
      return '';
    };

    return grid.criteria.map((criterionName) => {
      // Build scoring levels from performance levels
      const scoringLevels: ScoringLevel[] = grid.performanceLevels.map((perfLevel) => {
        const description = findDescriptor(perfLevel.descriptors || {}, criterionName);
        console.log(`[DEBUG] Criterion "${criterionName}" at level "${perfLevel.level}": description = "${description.substring(0, 50)}..."`);
        return {
          level: perfLevel.level,
          points: levelPoints[perfLevel.level],
          description,
        };
      });

      // Sort by points descending
      scoringLevels.sort((a, b) => b.points - a.points);

      const maxScore = Math.max(...scoringLevels.map((l) => l.points), 0);

      return {
        name: criterionName,
        description: '', // Grid format doesn't have separate descriptions
        maxScore,
        scoringLevels,
      };
    });
  };

  const handleSave = async () => {
    // Validate
    if (!rubricName.trim()) {
      setSaveError('Please enter a rubric name');
      return;
    }

    const invalidCriterion = criteria.find(
      c => !c.name.trim() || c.maxScore <= 0
    );
    if (invalidCriterion) {
      setSaveError('All criteria must have a name and max score greater than 0');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const totalScore = criteria.reduce((sum, c) => sum + c.maxScore, 0);
      const response = await apiService.saveRubric(rubricName.trim(), {
        criteria,
        totalScore
      });

      if (response.success) {
        setSaveSuccess(true);
        // Clear form after successful save
        setRubricName('');
        setCriteria([]);
        setShowCriteria(false);
        setRubricFile(null);
      } else {
        setSaveError(response.error || 'Failed to save rubric');
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        setSaveError('A rubric with this name already exists. Please choose a different name.');
      } else {
        setSaveError(error.message || 'Failed to save rubric');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setRubricFile(null);
    setCriteria([]);
    setShowCriteria(false);
    setRubricName('');
    setSaveError(null);
    setSaveSuccess(false);
    setAnalyzeError(null);
    setGridRubric(null);
    setIsGridFormat(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Upload & Save Rubrics
        </h1>
        <p className="text-lg text-gray-600">
          Upload a rubric PDF, review the extracted criteria, and save it for future use
        </p>
      </div>

      <div className="space-y-8">
        {/* Success Message */}
        {saveSuccess && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-3" />
              <div>
                <p className="font-medium text-green-800">Rubric saved successfully!</p>
                <p className="text-sm text-green-700">
                  You can now use this rubric when grading essays on the Upload page.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Upload Section */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Upload className="h-6 w-6 text-green-600 mr-3" />
            <h2 className="text-xl font-semibold">Upload Rubric PDF</h2>
          </div>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-green-400 bg-green-50'
                : 'border-gray-300 hover:border-green-400 hover:bg-green-50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            {isDragActive ? (
              <p className="text-green-600 font-medium">Drop your rubric here...</p>
            ) : (
              <div>
                <p className="text-gray-600 mb-2">
                  Drag & drop your rubric here, or click to select
                </p>
                <p className="text-sm text-gray-500">
                  Supports PDF, PNG, JPG (max 50MB)
                </p>
              </div>
            )}
          </div>

          {/* Selected File */}
          {rubricFile && (
            <div className="mt-4 flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <FileText className="h-5 w-5 text-green-600 mr-2" />
                <span className="text-sm text-gray-900">{rubricFile.name}</span>
                <span className="text-xs text-gray-500 ml-2">
                  ({(rubricFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
              {!isAnalyzing && !showCriteria && (
                <button
                  onClick={() => analyzeRubric(rubricFile)}
                  className="text-sm text-green-600 hover:text-green-700"
                >
                  Re-analyze
                </button>
              )}
            </div>
          )}

          {/* Analyzing Indicator */}
          {isAnalyzing && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                <div>
                  <p className="text-sm font-medium text-blue-800">Analyzing rubric...</p>
                  <p className="text-sm text-blue-600">
                    AI is extracting grading criteria from your rubric
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {analyzeError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                <p className="text-sm text-red-700">{analyzeError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Criteria Editor Section */}
        {showCriteria && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <CheckCircle className="h-6 w-6 text-green-600 mr-3" />
                <h2 className="text-xl font-semibold">
                  {isGridFormat ? 'Grid Rubric Extracted' : 'Edit Grading Criteria'}
                </h2>
              </div>
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Start Over
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              {isGridFormat
                ? 'Your grid-based rubric has been successfully extracted. Review the criteria and performance levels below.'
                : 'Review and edit the extracted criteria below. You can modify names, descriptions, and point values, or add/remove criteria as needed.'}
            </p>

            {/* Rubric Name Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rubric Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={rubricName}
                onChange={(e) => setRubricName(e.target.value)}
                placeholder="e.g., Year 10 Creative Writing"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            {/* Card-based Scoring Levels Editor */}
            <ScoringLevelsEditor
              criteria={criteria}
              onChange={setCriteria}
              disabled={isSaving}
            />

            {/* Save Error */}
            {saveError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                  <p className="text-sm text-red-700">{saveError}</p>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSave}
                disabled={isSaving || !rubricName.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <Save size={20} />
                {isSaving ? 'Saving...' : 'Save Rubric'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadRubricPage;
