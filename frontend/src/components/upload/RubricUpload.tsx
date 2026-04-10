import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { apiService } from '../../services/apiService';

interface RubricUploadProps {
  onUpload: (success: boolean, sessionId?: string) => void;
}

export const RubricUpload: React.FC<RubricUploadProps> = ({ onUpload }) => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg']
    },
    maxFiles: 1,
    onDropRejected: (rejectedFiles) => {
      setError('Invalid file type. Only PDF, PNG, and JPG files are allowed.');
    }
  });

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const result = await apiService.uploadRubric(file);
      if (result.success) {
        onUpload(true, result.sessionId);
        
        // Navigate to analysis page with the results
        navigate('/analysis', {
          state: {
            analysisData: {
              rubric: {
                filename: result.rubric.filename,
                analysis: result.analysis
              }
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

  const removeFile = () => {
    setFile(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          {...getRootProps()}
          className={`upload-zone cursor-pointer ${isDragActive ? 'dragover' : ''}`}
        >
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          {isDragActive ? (
            <p className="text-blue-600 font-medium">Drop the rubric file here...</p>
          ) : (
            <div>
              <p className="text-gray-600 font-medium mb-2">
                Drag & drop your rubric here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Supports PDF, PNG, and JPG files (max 50MB)
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-gray-300 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <button
              onClick={removeFile}
              className="text-gray-400 hover:text-red-500 transition-colors"
              disabled={uploading}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn-primary mt-4 w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload Rubric'}
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