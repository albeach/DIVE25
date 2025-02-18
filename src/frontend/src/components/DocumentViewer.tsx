import React, { useState } from 'react';
import { NATODocument } from '../types';
import SecurityBanner from './SecurityBanner';

interface DocumentViewerProps {
  document: NATODocument;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ document }) => {
  const [isMetadataVisible, setIsMetadataVisible] = useState(false);

  return (
    <div className="border rounded-lg shadow-sm bg-white">
      <SecurityBanner classification={document.classification} />
      
      <div className="p-6">
        <div className="flex justify-between items-start">
          <h2 className="text-2xl font-bold text-gray-900">{document.title}</h2>
          <button
            onClick={() => setIsMetadataVisible(!isMetadataVisible)}
            className="text-gray-500 hover:text-gray-700"
          >
            {isMetadataVisible ? 'Hide Metadata' : 'Show Metadata'}
          </button>
        </div>

        {isMetadataVisible && (
          <div className="mt-4 p-4 bg-gray-50 rounded">
            <h3 className="font-medium text-gray-900">Metadata</h3>
            <dl className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Author</dt>
                <dd className="text-sm text-gray-900">{document.metadata.author}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Version</dt>
                <dd className="text-sm text-gray-900">{document.metadata.version}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Created</dt>
                <dd className="text-sm text-gray-900">
                  {new Date(document.metadata.dateCreated).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Modified</dt>
                <dd className="text-sm text-gray-900">
                  {new Date(document.metadata.lastModified).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-6 prose max-w-none">
          {document.content}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer; 