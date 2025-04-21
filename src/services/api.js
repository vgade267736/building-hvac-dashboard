import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:8000',
});

/**
 * Upload files and start simulation
 * @param {FormData} formData - Contains idf_file and weather_file
 */
export const simulate = async (formData) => {
  const response = await API.post('/simulate', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

/**
 * Fetch simulation results
 * @param {string} runId - Simulation run ID
 */
export const getResults = async (runId) => {
  const response = await API.get(`/results/${runId}`);
  return response.data;
};