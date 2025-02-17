import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentApi } from '@services/api';
import { useParams, useNavigate } from '@tanstack/react-router';
import { Spinner } from '@components/common/Spinner';
import { 
  ArrowLeftIcon,
  DocumentIcon,
  TrashIcon,
  PencilIcon,
  ClockIcon,
  UserIcon,
  TagIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { classNames } from '@utils/styles';

export function DocumentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: document, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => documentApi.getDocument(id)
  });

  const deleteMutation = useMutation({
    mutationFn: () => documentApi.deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      navigate({ to: '/documents' });
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-600">Document not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate({ to: '/documents' })}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back to Documents
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {/* TODO: Implement edit */}}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <PencilIcon className="-ml-1 mr-1 h-4 w-4" />
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this document?')) {
                deleteMutation.mutate();
              }
            }}
            className="inline-flex items-center px-3 py-1.5 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
          >
            <TrashIcon className="-ml-1 mr-1 h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-start space-x-6">
            <div className="flex-shrink-0">
              <DocumentIcon className="h-12 w-12 text-nato-blue" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold text-gray-900">
                {document.title}
              </h1>
              <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:space-x-6">
                <div className="mt-2 flex items-center text-sm text-gray-500">
                  <UserIcon className="mr-1.5 h-5 w-5 flex-shrink-0" />
                  {document.metadata.createdBy}
                </div>
                <div className="mt-2 flex items-center text-sm text-gray-500">
                  <ClockIcon className="mr-1.5 h-5 w-5 flex-shrink-0" />
                  Updated {format(new Date(document.metadata.lastModifiedAt), 'PPP')}
                </div>
                <div className="mt-2 flex items-center text-sm text-gray-500">
                  <TagIcon className="mr-1.5 h-5 w-5 flex-shrink-0" />
                  {document.metadata.fileType.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <span className={classNames(
              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
              {
                'bg-green-100 text-green-800': document.classification === 'UNCLASSIFIED',
                'bg-yellow-100 text-yellow-800': document.classification === 'RESTRICTED',
                'bg-orange-100 text-orange-800': document.classification === 'CONFIDENTIAL',
                'bg-red-100 text-red-800': document.classification === 'SECRET',
                'bg-purple-100 text-purple-800': document.classification === 'TOP SECRET'
              }
            )}>
              {document.classification}
            </span>
          </div>

          {document.coiTags.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-500">COI Tags</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {document.coiTags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {document.description && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-500">Description</h3>
              <p className="mt-2 text-sm text-gray-900">
                {document.description}
              </p>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-500">Version History</h3>
            <div className="mt-2 flow-root">
              <ul role="list" className="-mb-8">
                {document.versions.map((version, versionIdx) => (
                  <li key={version.id}>
                    <div className="relative pb-8">
                      {versionIdx !== document.versions.length - 1 ? (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center ring-8 ring-white">
                            {version.version}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                          <div>
                            <p className="text-sm text-gray-500">
                              Updated by <span className="font-medium text-gray-900">{version.updatedBy}</span>
                            </p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            {format(new Date(version.updatedAt), 'PPp')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 