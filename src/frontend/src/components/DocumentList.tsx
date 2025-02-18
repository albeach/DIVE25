import React from 'react';
import { NATODocument } from '../types';
import { formatDate } from '../utils/dateUtils';

interface DocumentListProps {
  documents: NATODocument[];
  onSelect: (doc: NATODocument) => void;
  loading: boolean;
  error: string | null;
}

const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  onSelect,
  loading,
  error
}) => {
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mt-2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {documents.map((doc) => (
        <div
          key={doc.id}
          onClick={() => onSelect(doc)}
          className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <h3 className="font-medium text-gray-900">{doc.title}</h3>
          <div className="mt-1 text-sm text-gray-500">
            <span className={`inline-block px-2 py-1 rounded text-xs font-medium
              ${doc.classification === 'NATO SECRET' ? 'bg-red-100 text-red-800' : 
                doc.classification === 'NATO CONFIDENTIAL' ? 'bg-orange-100 text-orange-800' :
                'bg-blue-100 text-blue-800'}`}>
              {doc.classification}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            <p>Updated: {formatDate(doc.metadata.lastModified)}</p>
            <p>Author: {doc.metadata.author}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DocumentList; 