import { Fragment, useState } from 'react';
import { Dialog, Transition, Switch } from '@headlessui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { partnerApi } from '@services/api';
import { Partner } from '@/types';
import { classNames } from '@utils/styles';

interface ManageAccessModalProps {
  partner: Partner;
  isOpen: boolean;
  onClose: () => void;
}

export function ManageAccessModal({ 
  partner, 
  isOpen, 
  onClose 
}: ManageAccessModalProps) {
  const [formData, setFormData] = useState({
    clearanceLevel: partner.clearanceLevel,
    authorizedCOIs: [...partner.authorizedCOIs],
    status: partner.status
  });

  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => 
      partnerApi.updatePartnerAccess(partner.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      onClose();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
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
                  <div>
                    <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                      Manage Partner Access - {partner.name}
                    </Dialog.Title>
                    <div className="mt-6 space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Clearance Level
                        </label>
                        <select
                          value={formData.clearanceLevel}
                          onChange={(e) => setFormData({
                            ...formData,
                            clearanceLevel: e.target.value
                          })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-nato-blue focus:ring-nato-blue sm:text-sm"
                        >
                          <option value="UNCLASSIFIED">UNCLASSIFIED</option>
                          <option value="RESTRICTED">RESTRICTED</option>
                          <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                          <option value="SECRET">SECRET</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Status
                        </label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({
                            ...formData,
                            status: e.target.value as Partner['status']
                          })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-nato-blue focus:ring-nato-blue sm:text-sm"
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="PENDING">Pending</option>
                          <option value="INACTIVE">Inactive</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Authorized COIs
                        </label>
                        <div className="mt-2 space-y-2">
                          {['OpAlpha', 'OpBravo', 'OpGamma', 'MissionX', 'MissionZ'].map((coi) => (
                            <Switch.Group key={coi} as="div" className="flex items-center">
                              <Switch
                                checked={formData.authorizedCOIs.includes(coi)}
                                onChange={(checked) => {
                                  setFormData({
                                    ...formData,
                                    authorizedCOIs: checked
                                      ? [...formData.authorizedCOIs, coi]
                                      : formData.authorizedCOIs.filter(c => c !== coi)
                                  });
                                }}
                                className={classNames(
                                  formData.authorizedCOIs.includes(coi) ? 'bg-nato-blue' : 'bg-gray-200',
                                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors'
                                )}
                              >
                                <span className={classNames(
                                  formData.authorizedCOIs.includes(coi) ? 'translate-x-6' : 'translate-x-1',
                                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform mt-1'
                                )} />
                              </Switch>
                              <Switch.Label as="span" className="ml-3 text-sm">
                                {coi}
                              </Switch.Label>
                            </Switch.Group>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateMutation.isPending}
                      className={classNames(
                        'rounded-md px-4 py-2 text-sm font-medium text-white',
                        updateMutation.isPending
                          ? 'bg-nato-blue/70 cursor-not-allowed'
                          : 'bg-nato-blue hover:bg-nato-blue/90'
                      )}
                    >
                      {updateMutation.isPending ? 'Updating...' : 'Update Access'}
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