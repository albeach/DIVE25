import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentApi } from '@services/api';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { classNames } from '@utils/styles';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentUploadModal({ isOpen, onClose }: DocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    classification: 'UNCLASSIFIED',
    coiTags: [] as string[],
    releasableTo: ['NATO']
  });

  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (data: FormData) => documentApi.createDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      onClose();
      setFile(null);
      setFormData({
        title: '',
        description: '',
        classification: 'UNCLASSIFIED',
        coiTags: [],
        releasableTo: ['NATO']
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const data = new FormData();
    data.append('file', file);
    Object.entries(formData).forEach(([key, value]) => {
      data.append(key, Array.isArray(value) ? JSON.stringify(value) : value);
    });

    uploadMutation.mutate(data);
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <form onSubmit={handleSubmit}>
                  <div className="space-y-6">
                    {/* Form fields */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Title
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-nato-blue focus:ring-nato-blue sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Classification
                      </label>
                      <select
                        value={formData.classification}
                        onChange={(e) => setFormData({ ...formData, classification: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-nato-blue focus:ring-nato-blue sm:text-sm"
                      >
                        <option value="UNCLASSIFIED">UNCLASSIFIED</option>
                        <option value="RESTRICTED">RESTRICTED</option>
                        <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                        <option value="SECRET">SECRET</option>
                        <option value="TOP SECRET">TOP SECRET</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        File
                      </label>
                      <input
                        type="file"
                        required
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="mt-1 block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-md file:border-0
                          file:text-sm file:font-medium
                          file:bg-nato-blue file:text-white
                          hover:file:cursor-pointer hover:file:bg-nato-blue/90"
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={uploadMutation.isPending}
                      className={classNames(
                        "rounded-md px-4 py-2 text-sm font-medium text-white",
                        uploadMutation.isPending
                          ? "bg-nato-blue/70 cursor-not-allowed"
                          : "bg-nato-blue hover:bg-nato-blue/90"
                      )}
                    >
                      {uploadMutation.isPending ? "Uploading..." : "Upload"}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
} 