import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DocumentService } from '../services/DocumentService';
import { NATODocument } from '../types';
import DocumentList from '../components/DocumentList';
import DocumentViewer from '../components/DocumentViewer';
import SecurityBanner from '../components/SecurityBanner';

const Documents: React.FC = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<NATODocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<NATODocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const docs = await DocumentService.getDocuments();
        setDocuments(docs);
      } catch (err) {
        setError('Failed to load documents');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  return (
    <div className="space-y-6">
      <SecurityBanner 
        clearanceLevel={user?.clearanceLevel} 
        classification={selectedDoc?.classification}
      />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <DocumentList 
            documents={documents}
            onSelect={setSelectedDoc}
            loading={loading}
            error={error}
          />
        </div>
        
        <div className="md:col-span-2">
          {selectedDoc ? (
            <DocumentViewer document={selectedDoc} />
          ) : (
            <div className="p-4 text-center text-gray-500">
              Select a document to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Documents; 