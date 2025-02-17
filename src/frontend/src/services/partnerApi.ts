import api from './api';
import { Partner } from '@/types';

export const partnerApi = {
    getPartners: async () => {
        const response = await api.get<Partner[]>('/api/partners');
        return response.data;
    },

    getPartner: async (id: string) => {
        const response = await api.get<Partner>(`/api/partners/${id}`);
        return response.data;
    },

    updatePartnerAccess: async (id: string, data: {
        clearanceLevel?: string;
        authorizedCOIs?: string[];
        status?: 'ACTIVE' | 'PENDING' | 'INACTIVE';
    }) => {
        const response = await api.put<Partner>(`/api/partners/${id}/access`, data);
        return response.data;
    },

    getFederationMap: async () => {
        const response = await api.get('/api/partners/federation-map');
        return response.data;
    }
}; 