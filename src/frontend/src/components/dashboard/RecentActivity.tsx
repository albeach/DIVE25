import { Document } from '@/types';
import { format } from 'date-fns';
import { classNames } from '@utils/styles';

interface RecentActivityProps {
  documents: Document[];
}

const classificationColors = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800',
  'RESTRICTED': 'bg-yellow-100 text-yellow-800',
  'CONFIDENTIAL': 'bg-orange-100 text-orange-800',
  'SECRET': 'bg-red-100 text-red-800',
  'TOP SECRET': 'bg-purple-100 text-purple-800'
};

export function RecentActivity({ documents }: RecentActivityProps) {
  if (documents.length === 0) {
    return (
      <p className="text-gray-500 text-sm">No recent activity</p>
    );
  }

  return (
    <div className="flow-root">
      <ul role="list" className="-mb-8">
        {documents.map((document, documentIdx) => (
          <li key={document.id}>
            <div className="relative pb-8">
              {documentIdx !== documents.length - 1 ? (
                <span
                  className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex space-x-3">
                <div>
                  <span className={classNames(
                    'h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white',
                    classificationColors[document.classification]
                  )}>
                    {document.classification[0]}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  <div>
                    <p className="text-sm text-gray-500">
                      Updated <span className="font-medium text-gray-900">{document.title}</span>
                    </p>
                  </div>
                  <div className="text-right text-sm whitespace-nowrap text-gray-500">
                    {format(new Date(document.metadata.lastModifiedAt), 'PPp')}
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
} 