import axios from 'axios';
import { useAuth } from '@hooks/useAuth';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor
api.interceptors.request.use(
    async (config) => {
        const { user, refreshToken } = useAuth();

        if (user?.token) {
            config.headers.Authorization = `Bearer ${user.token}`;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const { refreshToken, logout } = useAuth();

        if (error.response?.status === 401) {
            try {
                await refreshToken();
                return api(error.config);
            } catch (refreshError) {
                logout();
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export const documentApi = {
    getDocuments: async (params?: any) => {
        const response = await api.get('/api/documents', { params });
        return response.data;
    },

    getDocument: async (id: string) => {
        const response = await api.get(`/api/documents/${id}`);
        return response.data;
    },

    createDocument: async (data: FormData) => {
        const response = await api.post('/api/documents', data, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    },

    updateDocument: async (id: string, data: FormData) => {
        const response = await api.put(`/api/documents/${id}`, data, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    },

    deleteDocument: async (id: string) => {
        await api.delete(`/api/documents/${id}`);
    }
};

export default api; 