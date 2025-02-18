import React, { useState } from 'react';
import { DocumentService } from '../services/DocumentService';
import { useAuth } from '../contexts/AuthContext';
import { ClearanceLevel } from '../types';

const DocumentUpload: React.FC = () => {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [classification, setClassification] = useState<ClearanceLevel>('NATO RESTRICTED');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('classification', classification);
      formData.append('author', user?.name || 'Unknown');

      await DocumentService.createDocument(formData);
      setFile(null);
      setTitle('');
      setClassification('NATO RESTRICTED');
    } catch (err) {
      setError('Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium mb-4">Upload Document</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Classification
          </label>
          <select
            value={classification}
            onChange={(e) => setClassification(e.target.value as ClearanceLevel)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          >
            <option value="NATO RESTRICTED">NATO RESTRICTED</option>
            <option value="NATO CONFIDENTIAL">NATO CONFIDENTIAL</option>
            <option value="NATO SECRET">NATO SECRET</option>
            <option value="COSMIC TOP SECRET">COSMIC TOP SECRET</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Document File
          </label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mt-1 block w-full"
            accept=".pdf,.doc,.docx"
            required
          />
        </div>

        {error && (
          <div className="text-red-600 text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={uploading || !file || !title}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
            ${uploading 
              ? 'bg-gray-400' 
              : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {uploading ? 'Uploading...' : 'Upload Document'}
        </button>
      </form>
    </div>
  );
};

export default DocumentUpload; 