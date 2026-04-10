import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { apiService } from '../../services/apiService';

interface SubmissionUploadProps {
  onUpload: (success: boolean) => void;
  sessionId: string | null;
}

export const SubmissionUpload: React.FC<SubmissionUploadProps> = ({ 
  onUpload, 
  sessionId 
}) => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (files.length + acceptedFiles.length > 30) {
      setError('Maximum 30 submissions allowed per batch.');
      return;
    }
    
    setFiles(prev => [...prev, ...acceptedFiles]);
    setError(null);
  }, [files.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg']
    },
    multiple: true,
    onDropRejected: (rejectedFiles) => {
      setError('Some files were rejected. Only PDF, PNG, and JPG files are allowed.');
    }
  });

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const result = await apiService.uploadSubmissions(files);
      if (result.success) {
        onUpload(true);
        
        // Navigate to analysis page with the results
        navigate('/analysis', {
          state: {
            analysisData: {
              submissions: result.submissions
            }
          }
        });
      } else {
        setError('Upload failed. Please try again.');
        onUpload(false);
      }
    } catch (error) {
      setError('Upload failed. Please check your connection and try again.');
      onUpload(false);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const clearAll = () => {
    setFiles([]);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`upload-zone cursor-pointer ${isDragActive ? 'dragover' : ''}`}
      >
        <input {...getInputProps()} />
        <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        {isDragActive ? (
          <p className="text-blue-600 font-medium">Drop the submission files here...</p>
        ) : (
          <div>
            <p className="text-gray-600 font-medium mb-2">
              Drag & drop student submissions here, or click to select
            </p>
            <p className="text-sm text-gray-500">
              Supports PDF, PNG, and JPG files (max 30 files, 50MB each)
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Currently: {files.length}/30 files
            </p>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-gray-900">
              Selected Files ({files.length})
            </h3>
            <button
              onClick={clearAll}
              className="text-sm text-red-600 hover:text-red-800"
              disabled={uploading}
            >
              Clear All
            </button>
          </div>
          
          <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-3">
            {files.map((file, index) => (
              <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                <div className="flex items-center space-x-3">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          
          <button
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : `Upload ${files.length} Submissions`}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">Upload Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};