import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, CheckCircle, Upload, FileText, X, Plus, Users, ChevronDown, Trash2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { apiService, StudentSubmissionData, SavedRubricListItem, SavedRubricCriterion } from '../services/apiService';

interface StudentSubmission {
  id: string;
  name: string;
  files: File[];
}

// Helper to format relative time
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  return new Date(timestamp).toLocaleDateString();
};

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [yearLevel, setYearLevel] = useState<number>(7);
  const [students, setStudents] = useState<StudentSubmission[]>([]);
  const [currentStudentName, setCurrentStudentName] = useState('');
  const [currentStudentFiles, setCurrentStudentFiles] = useState<File[]>([]);
  const [isGrading, setIsGrading] = useState(false);
  const [gradingProgress, setGradingProgress] = useState<{
    sessionId: string;
    completedStudents: number;
    totalStudents: number;
    percentage: number;
  } | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [gradingElapsed, setGradingElapsed] = useState(0);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Saved rubrics state
  const [savedRubrics, setSavedRubrics] = useState<SavedRubricListItem[]>([]);
  const [loadingSavedRubrics, setLoadingSavedRubrics] = useState(true);
  const [selectedRubricId, setSelectedRubricId] = useState<string>('');
  const [loadedRubric, setLoadedRubric] = useState<{
    id: string;
    name: string;
    criteria: SavedRubricCriterion[];
    totalScore: number;
  } | null>(null);

  // Delete confirmation state
  const [deletingRubricId, setDeletingRubricId] = useState<string | null>(null);

  // Computed: is rubric ready?
  const isRubricReady = loadedRubric !== null;

  // Fetch saved rubrics on mount
  useEffect(() => {
    fetchSavedRubrics();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const fetchSavedRubrics = async () => {
    try {
      setLoadingSavedRubrics(true);
      const response = await apiService.getSavedRubrics();
      if (response.success) {
        setSavedRubrics(response.rubrics);
      }
    } catch (error) {
      console.error('Failed to fetch saved rubrics:', error);
    } finally {
      setLoadingSavedRubrics(false);
    }
  };

  const handleLoadRubric = async (rubricId: string) => {
    if (!rubricId) {
      setSelectedRubricId('');
      setLoadedRubric(null);
      return;
    }

    try {
      const response = await apiService.loadRubric(rubricId);
      if (response.success) {
        setLoadedRubric({
          id: response.id,
          name: response.rubricName,
          criteria: response.rubricData.criteria,
          totalScore: response.rubricData.totalScore
        });
        setSelectedRubricId(rubricId);
        // Refresh the list to update last_used
        fetchSavedRubrics();
      }
    } catch (error) {
      console.error('Failed to load rubric:', error);
      alert('Failed to load rubric. Please try again.');
    }
  };

  const handleDeleteRubric = async (rubricId: string) => {
    try {
      const response = await apiService.deleteRubric(rubricId);
      if (response.success) {
        // Clear selection if we deleted the selected rubric
        if (selectedRubricId === rubricId) {
          setSelectedRubricId('');
          setLoadedRubric(null);
        }
        // Refresh list
        fetchSavedRubrics();
      }
    } catch (error) {
      console.error('Failed to delete rubric:', error);
      alert('Failed to delete rubric. Please try again.');
    } finally {
      setDeletingRubricId(null);
    }
  };

  const addStudent = () => {
    if (!currentStudentName.trim() || currentStudentFiles.length === 0) {
      alert('Please enter a student name and upload at least one file');
      return;
    }

    const newStudent: StudentSubmission = {
      id: Date.now().toString(),
      name: currentStudentName.trim(),
      files: [...currentStudentFiles]
    };

    setStudents([...students, newStudent]);
    setCurrentStudentName('');
    setCurrentStudentFiles([]);
  };

  const removeStudent = (studentId: string) => {
    setStudents(students.filter(s => s.id !== studentId));
  };

  // Stop progress animation helper
  const stopProgressAnimation = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const performCompleteGrading = async () => {
    if (!isRubricReady || !loadedRubric) {
      alert('Please select a rubric first');
      return;
    }
    if (students.length === 0) {
      alert('Please add at least one student');
      return;
    }

    setIsGrading(true);
    setGradingElapsed(0);
    elapsedTimerRef.current = setInterval(() => {
      setGradingElapsed(prev => prev + 1);
    }, 1000);

    // Initialize progress with starting state
    // Estimate ~15 seconds per student for grading
    const totalStudentCount = students.length;
    const estimatedTimePerStudent = 15000; // 15 seconds per student
    const totalEstimatedTime = totalStudentCount * estimatedTimePerStudent;
    let currentProgress = 0;

    setGradingProgress({
      sessionId: '',
      completedStudents: 0,
      totalStudents: totalStudentCount,
      percentage: 0
    });

    // Start progress animation - increment gradually to 90% over estimated time
    const progressIncrement = 90 / (totalEstimatedTime / 500); // Update every 500ms
    pollingIntervalRef.current = setInterval(() => {
      currentProgress = Math.min(currentProgress + progressIncrement, 90);
      const estimatedCompleted = Math.floor((currentProgress / 100) * totalStudentCount);
      setGradingProgress(prev => prev ? {
        ...prev,
        completedStudents: estimatedCompleted,
        percentage: Math.round(currentProgress)
      } : null);
    }, 500);

    try {
      // Convert students to the API format
      const studentsData: StudentSubmissionData[] = students.map(student => ({
        name: student.name,
        files: student.files
      }));

      // Call the API - this blocks until grading is complete
      const result = await apiService.completeGradingWithCriteria(
        loadedRubric.criteria,
        studentsData,
        yearLevel
      );

      // Stop the progress animation
      stopProgressAnimation();

      if (result.success) {
        // Update progress to 100%
        setGradingProgress({
          sessionId: result.sessionId,
          completedStudents: totalStudentCount,
          totalStudents: totalStudentCount,
          percentage: 100
        });

        // Small delay to show 100% before navigating
        await new Promise(resolve => setTimeout(resolve, 400));

        navigate('/results', {
          state: {
            sessionId: result.sessionId,
            gradingResults: result.students,
            rubric: result.rubric,
            summary: result.summary,
            yearLevel: yearLevel
          }
        });
      } else {
        alert('Grading failed: Please check your files and try again.');
      }
    } catch (error) {
      console.error('Grading error:', error);
      stopProgressAnimation();
      alert('Grading failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGrading(false);
      setGradingProgress(null);
    }
  };

  // Dropzone for current student files
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg']
    },
    multiple: true,
    onDrop: (acceptedFiles: File[]) => {
      setCurrentStudentFiles(prev => [...prev, ...acceptedFiles]);
    }
  });

  // Remove file from current student
  const removeCurrentStudentFile = (index: number) => {
    setCurrentStudentFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          AI Grading Workflow
        </h1>
      </div>

      <div className="space-y-8">
        {/* Year Level Selection */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Users className="h-6 w-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold">Select Year Level</h2>
          </div>
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Year Level:</label>
            <select
              value={yearLevel}
              onChange={(e) => setYearLevel(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={7}>Year 7</option>
              <option value={8}>Year 8</option>
              <option value={9}>Year 9</option>
              <option value={10}>Year 10</option>
              <option value={11}>Year 11</option>
              <option value={12}>Year 12</option>
            </select>
            <span className="text-sm text-gray-500">
              This will adjust grading standards and expectations
            </span>
          </div>
        </div>

        {/* Step 1: Select Rubric */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium mr-3">
              1
            </span>
            <h2 className="text-xl font-semibold">Select Rubric</h2>
            {isRubricReady && (
              <CheckCircle className="h-5 w-5 text-green-600 ml-2" />
            )}
          </div>

          {loadingSavedRubrics ? (
            <div className="text-sm text-gray-500">Loading saved rubrics...</div>
          ) : savedRubrics.length === 0 ? (
            <div className="p-4 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">
                No saved rubrics yet.
              </p>
              <Link
                to="/upload-rubric"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Create one in Upload Rubric page →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <select
                  value={selectedRubricId}
                  onChange={(e) => handleLoadRubric(e.target.value)}
                  className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                >
                  <option value="">Select a rubric...</option>
                  {savedRubrics.map((rubric) => (
                    <option key={rubric.id} value={rubric.id}>
                      {rubric.rubricName} (Last used: {formatRelativeTime(rubric.lastUsed)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              </div>

              {/* Loaded rubric details */}
              {loadedRubric && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-blue-900">{loadedRubric.name}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-blue-700">
                        {loadedRubric.totalScore} pts
                      </span>
                      <button
                        onClick={() => setDeletingRubricId(loadedRubric.id)}
                        className="p-1 text-blue-400 hover:text-red-500 transition-colors"
                        title="Delete rubric"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-blue-600">
                    {loadedRubric.criteria.length} criteria: {loadedRubric.criteria.map(c => c.name).join(', ')}
                  </div>
                </div>
              )}

              {/* Delete confirmation */}
              {deletingRubricId && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800 mb-2">
                    Delete this rubric? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteRubric(deletingRubricId)}
                      className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeletingRubricId(null)}
                      className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Student Submissions */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mr-3 ${
              isRubricReady
                ? 'bg-blue-600 text-white'
                : 'bg-gray-300 text-gray-600'
            }`}>
              2
            </span>
            <h2 className="text-xl font-semibold">Upload Student Essays</h2>
          </div>

          {!isRubricReady ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-yellow-400" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-yellow-800">
                    Please select a rubric first
                  </p>
                  <p className="text-sm text-yellow-700">
                    Please select a rubric above.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Current Student Input */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-3">Add Student</h3>

                {/* Student Name */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Student Name
                  </label>
                  <input
                    type="text"
                    value={currentStudentName}
                    onChange={(e) => setCurrentStudentName(e.target.value)}
                    placeholder="Enter student name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* File Upload */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Files (can upload multiple files per student)
                  </label>
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input {...getInputProps()} />
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    {isDragActive ? (
                      <p className="text-blue-600">Drop files here...</p>
                    ) : (
                      <div>
                        <p className="text-gray-600 mb-1">Drag & drop files here, or click to select</p>
                        <p className="text-sm text-gray-500">PDF, PNG, JPG (max 50MB each)</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Current Student Files */}
                {currentStudentFiles.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Files for {currentStudentName || 'this student'} ({currentStudentFiles.length})
                    </label>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {currentStudentFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span className="text-sm text-gray-900">{file.name}</span>
                            <span className="text-xs text-gray-500">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                          </div>
                          <button
                            onClick={() => removeCurrentStudentFile(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Student Button */}
                <button
                  onClick={addStudent}
                  disabled={!currentStudentName.trim() || currentStudentFiles.length === 0}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Student</span>
                </button>
              </div>

              {/* Added Students List */}
              {students.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Students Added ({students.length})</h3>
                  <div className="space-y-3">
                    {students.map((student) => (
                      <div key={student.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{student.name}</h4>
                          <button
                            onClick={() => removeStudent(student.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="text-sm text-gray-600">
                          {student.files.length} file{student.files.length !== 1 ? 's' : ''}: {student.files.map(f => f.name).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 3: Grade Papers */}
        {isRubricReady && students.length > 0 && (
          <div className="card p-6 bg-green-50 border-green-200">
            <h3 className="text-lg font-semibold text-green-900 mb-2">
              Ready for AI Grading!
            </h3>
            <p className="text-green-800 mb-4">
              Using "{loadedRubric?.name}" rubric with {students.length} student{students.length !== 1 ? 's' : ''} added.
              Grading will be optimized for Year {yearLevel} standards.
            </p>
            <button
              onClick={performCompleteGrading}
              disabled={isGrading}
              className={`px-6 py-3 rounded-lg font-medium ${
                isGrading
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {isGrading ? 'Processing with AI...' : 'Grade Papers'}
            </button>
            {isGrading && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      Grading in progress — {Math.floor(gradingElapsed / 60)}:{String(gradingElapsed % 60).padStart(2, '0')} elapsed
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      AI is transcribing and grading each page sequentially. This can take 2-5 minutes per image. Please don't close the tab.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
