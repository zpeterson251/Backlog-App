import axios from 'axios';

const GITHUB_API_URL = 'https://api.github.com';

// Function to fetch user repositories
export const fetchUserRepos = async (username) => {
    try {
        const response = await axios.get(`${GITHUB_API_URL}/users/${username}/repos`);
        return response.data;
    } catch (error) {
        console.error('Error fetching user repositories:', error);
        throw error;
    }
};

// Function to fetch a specific repository
export const fetchRepo = async (owner, repo) => {
    try {
        const response = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching repository:', error);
        throw error;
    }
};

// Function to create a new repository
export const createRepo = async (token, repoData) => {
    try {
        const response = await axios.post(`${GITHUB_API_URL}/user/repos`, repoData, {
            headers: {
                Authorization: `token ${token}`,
                'Content-Type': 'application/json',
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error creating repository:', error);
        throw error;
    }
};

// Function to delete a repository
export const deleteRepo = async (token, owner, repo) => {
    try {
        await axios.delete(`${GITHUB_API_URL}/repos/${owner}/${repo}`, {
            headers: {
                Authorization: `token ${token}`,
            },
        });
    } catch (error) {
        console.error('Error deleting repository:', error);
        throw error;
    }
};