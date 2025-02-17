import { Document } from '@/types';
import { classNames } from '@utils/styles';
import { DocumentIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface DocumentCardProps {
  document: Document;
}

const classificationColors = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800',
  'RESTRICTED': 'bg-yellow-100 text-yellow-800',
  'CONFIDENTIAL': 'bg-orange-100 text-orange-800',
  'SECRET': 'bg-red-100 text-red-800',
  'TOP SECRET': 'bg-purple-100 text-purple-800'
};

export function DocumentCard({ document }: DocumentCardProps) {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <DocumentIcon className="h-8 w-8 text-nato-blue" />
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">{document.title}</h3>
              <p className="text-sm text-gray-500">
                Updated {format(new Date(document.metadata.lastModifiedAt), 'PPP')}
              </p>
            </div>
          </div>
          {document.classification !== 'UNCLASSIFIED' && (
            <LockClosedIcon className="h-5 w-5 text-gray-400" />
          )}
        </div>

        <div className="mt-4">
          <span className={classNames(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            classificationColors[document.classification]
          )}>
            {document.classification}
          </span>
        </div>

        {document.coiTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {document.coiTags.map(tag => (
              <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {(document.metadata.size / 1024 / 1024).toFixed(2)} MB
          </div>
          <button
            onClick={() => window.open(`/api/documents/${document.id}?download=true`)}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-nato-blue hover:bg-nato-blue/5"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
} 