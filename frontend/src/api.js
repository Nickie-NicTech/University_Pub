import axios from 'axios';

const API = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL
        || (import.meta.env.DEV
            ? '/api/'
            : 'https://backend-production-bf00a.up.railway.app/api/'),
});

let refreshRequest;

API.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

API.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const requestUrl = originalRequest?.url || '';
        if (
            error.response?.status !== 401
            || !originalRequest
            || originalRequest._retry
            || requestUrl.includes('token/')
        ) {
            return Promise.reject(error);
        }

        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
            localStorage.removeItem('access_token');
            window.dispatchEvent(new Event('auth:expired'));
            return Promise.reject(error);
        }

        originalRequest._retry = true;
        try {
            if (!refreshRequest) {
                refreshRequest = axios.post(
                    'token/refresh/',
                    { refresh: refreshToken },
                    { baseURL: API.defaults.baseURL },
                )
                    .then(({ data }) => {
                        if (!data.access) {
                            throw new Error('Token refresh response did not include an access token.');
                        }
                        localStorage.setItem('access_token', data.access);
                        return data.access;
                    })
                    .finally(() => {
                        refreshRequest = null;
                    });
            }
            const accessToken = await refreshRequest;
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return API(originalRequest);
        } catch (refreshError) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.dispatchEvent(new Event('auth:expired'));
            return Promise.reject(refreshError);
        }
    },
);

export default API;
