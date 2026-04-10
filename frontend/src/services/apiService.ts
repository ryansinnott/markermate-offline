import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 0, // no timeout
});

export interface FileAnalysisResult {
  success: boolean;
  analysis: string;
  fileType: 'rubric' | 'student_work';
  fileName: string;
  modelUsed: string;
  error?: string;
}

export interface RubricUploadResponse {
  success: boolean;
  sessionId: string;
  rubric: {
    filename: string;
    originalName: string;
    size: number;
    path: string;
  };
  analysis: FileAnalysisResult;
}

export interface SubmissionUploadResponse {
  success: boolean;
  submissions: Array<{
    id: number;
    filename: string;
    originalName: string;
    size: number;
    path: string;
    status: string;
    analysis: FileAnalysisResult;
  }>;
  count: number;
}

export interface GradingResult {
  studentId: number;
  studentName: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  criteria: Array<{
    criterion: string;
    score: number;
    maxScore: number;
    feedback: string;
  }>;
  summary: string;
  ocrWarnings: string[];
}

export interface GradingStatusResponse {
  success: boolean;
  sessionId: string;
  status: 'processing' | 'completed' | 'error';
  progress?: {
    current: number;
    total: number;
    stage: string;
  };
}

export interface GradingProgressResponse {
  success: boolean;
  sessionId: string;
  gradingProgress: {
    status: 'pending' | 'transcribing' | 'grading' | 'completed' | 'error';
    completedStudents: number;
    totalStudents: number;
    currentStage: string;
    percentage: number;
    error?: string;
  } | null;
  results?: {
    students: CompleteGradingResponse['students'];
    rubric: { criteria: any[] };
    summary: CompleteGradingResponse['summary'];
    yearLevel?: number;
  };
}

export interface GradingResultsResponse {
  success: boolean;
  sessionId: string;
  results: GradingResult[];
  status: string;
}

export interface StudentSubmissionData {
  name: string;
  files: File[];
}

// Saved Rubrics Types
export interface ScoringLevel {
  level: string;      // e.g., "Above Expected Standard"
  points: number;     // e.g., 3
  description: string; // Level description from rubric
}

export interface SavedRubricCriterion {
  name: string;
  description: string;
  maxScore: number;
  scoringLevels?: ScoringLevel[];  // Optional detailed scoring levels
}

export interface SavedRubricData {
  criteria: SavedRubricCriterion[];
  totalScore: number;
}

// Grid-based rubric interfaces (e.g., Year 7 Narrative Rubric style)
export interface PerformanceLevel {
  level: string;  // e.g., "Above Expected Standard", "At Expected Standard"
  color: 'green' | 'yellow' | 'orange' | 'red';
  descriptors: { [criterionName: string]: string };  // Descriptor text per criterion
}

export interface RubricCategory {
  name: string;  // e.g., "Language", "Story Development", "Writing Skills"
  criteria: string[];  // Criterion names in this category
}

export interface GridRubric {
  title: string;
  isGridFormat: true;
  categories?: RubricCategory[];  // Optional groupings
  criteria: string[];  // All column headers (criterion names)
  performanceLevels: PerformanceLevel[];  // Rows with descriptors
}

export interface ParsedRubricResult {
  isGridFormat: boolean;
  gridRubric?: GridRubric;
  flatCriteria?: SavedRubricCriterion[];
}

export interface SavedRubricListItem {
  id: string;
  rubricName: string;
  lastUsed: number;
  createdAt: number;
}

export interface SavedRubricFull {
  id: string;
  rubricName: string;
  rubricData: SavedRubricData;
  createdAt: number;
  lastUsed: number;
}

export interface CompleteGradingResponse {
  success: boolean;
  sessionId: string;
  yearLevel?: number;
  rubric: {
    success: boolean;
    criteria: Array<{
      name: string;
      description: string;
      maxScore: number;
      scoringLevels?: Array<{
        level: string;
        points: number;
        description: string;
      }>;
    }>;
  };
  students: Array<{
    studentId: number;
    studentName: string;
    transcription: string;
    analysis: string;
    gradingSuccess: boolean;
    grades: Array<{
      criterion: string;
      score: number;
      maxScore: number;
      feedback: string;
    }>;
    totalScore: number;
    maxScore: number;
    percentage: number;
    summary: string;
    fileCount?: number;
    error?: string;
  }>;
  summary: {
    totalStudents: number;
    totalFiles: number;
    averageScore: number;
    rubricAnalyzed: boolean;
    allGraded: boolean;
  };
}

class ApiService {
  // ============ FILE UPLOAD METHODS ============

  async uploadRubric(file: File): Promise<RubricUploadResponse> {
    const formData = new FormData();
    formData.append('rubric', file);

    const response = await api.post('/rubric/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 0, // no timeout
    });

    return response.data;
  }

  async uploadSubmissions(files: File[]): Promise<SubmissionUploadResponse> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('submissions', file);
    });

    const response = await api.post('/submissions/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  async startGrading(sessionId: string, rubricPath: string, submissions: any[]): Promise<any> {
    const response = await api.post('/grading/start', {
      sessionId,
      rubricPath,
      submissions,
    });

    return response.data;
  }

  async getGradingStatus(sessionId: string): Promise<GradingStatusResponse> {
    const response = await api.get(`/grading/status/${sessionId}`);
    return response.data;
  }

  async getGradingProgress(sessionId: string): Promise<GradingProgressResponse> {
    const response = await api.get(`/complete-grading/status/${sessionId}`);
    return response.data;
  }

  async getGradingResults(sessionId: string): Promise<GradingResultsResponse> {
    const response = await api.get(`/grading/results/${sessionId}`);
    return response.data;
  }

  async modifyGrade(
    sessionId: string,
    studentId: number,
    criterion: string,
    newScore: number
  ): Promise<any> {
    const response = await api.put('/grading/modify', {
      sessionId,
      studentId,
      criterion,
      newScore,
    });

    return response.data;
  }

  async exportGrades(sessionId: string, format: 'csv' | 'json'): Promise<any> {
    if (format === 'csv') {
      const response = await api.get(`/export/csv/${sessionId}`, {
        responseType: 'blob',
      });
      return response.data;
    } else {
      const response = await api.get(`/export/report/${sessionId}`);
      return response.data;
    }
  }

  async completeGrading(
    rubricFile: File,
    students: StudentSubmissionData[],
    yearLevel: number
  ): Promise<CompleteGradingResponse> {
    const formData = new FormData();

    // Add rubric file
    formData.append('rubric', rubricFile);

    // Add year level
    formData.append('yearLevel', yearLevel.toString());

    // Add students and their files
    students.forEach((student, studentIndex) => {
      formData.append(`students[${studentIndex}][name]`, student.name);
      student.files.forEach((file) => {
        formData.append(`students[${studentIndex}][files]`, file);
      });
    });

    const response = await api.post('/complete-grading/upload-and-grade', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 0, // no timeout
    });

    return response.data;
  }

  async completeGradingWithCriteria(
    criteria: SavedRubricCriterion[],
    students: StudentSubmissionData[],
    yearLevel: number
  ): Promise<CompleteGradingResponse> {
    const formData = new FormData();

    // Add criteria as JSON string
    formData.append('criteria', JSON.stringify(criteria));

    // Add year level
    formData.append('yearLevel', yearLevel.toString());

    // Add students and their files
    students.forEach((student, studentIndex) => {
      formData.append(`students[${studentIndex}][name]`, student.name);
      student.files.forEach((file) => {
        formData.append(`students[${studentIndex}][files]`, file);
      });
    });

    const response = await api.post('/complete-grading/grade-with-criteria', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 0, // no timeout
    });

    return response.data;
  }

  async healthCheck(): Promise<any> {
    const response = await api.get('/health');
    return response.data;
  }

  // Fetch grading results by session ID (for page refresh recovery)
  async getResultsBySessionId(sessionId: string): Promise<{
    success: boolean;
    sessionId: string;
    results: any[];
    rubric: {
      criteria: any[];
    };
    summary: any;
    error?: string;
  }> {
    const response = await api.get(`/complete-grading/results/${sessionId}`);
    return response.data;
  }

  // Saved Rubrics - Backend API (persisted in SQLite)

  async saveRubric(rubricName: string, rubricData: SavedRubricData): Promise<{
    success: boolean;
    id: string;
    rubricName: string;
    error?: string;
  }> {
    const response = await api.post('/rubrics/save', { rubricName, rubricData });
    return response.data;
  }

  async getSavedRubrics(): Promise<{
    success: boolean;
    rubrics: SavedRubricListItem[];
  }> {
    const response = await api.get('/rubrics');
    return response.data;
  }

  async loadRubric(id: string): Promise<{
    success: boolean;
    id: string;
    rubricName: string;
    rubricData: SavedRubricData;
    createdAt: number;
    lastUsed: number;
    error?: string;
  }> {
    const response = await api.get(`/rubrics/${id}`);
    return response.data;
  }

  async deleteRubric(id: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const response = await api.delete(`/rubrics/${id}`);
    return response.data;
  }
}

export const apiService = new ApiService();