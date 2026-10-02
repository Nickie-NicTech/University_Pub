import axios from 'axios';

const API = axios.create({
<<<<<<< HEAD
    baseURL: 'https://backend-production-bf00a.up.railway.app/api/',
=======
    baseURL: 'http://localhost:8000/api/',
>>>>>>> 532f38b (add new files and initial commit)
});

// Automatically inject access token into headers if available
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default API;
