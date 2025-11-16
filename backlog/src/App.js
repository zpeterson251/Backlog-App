import React, { useState, useEffect } from 'react';
import SavedGames from './SavedGames';
import { fetchSavedGames } from './services/github';

const App = () => {
    const [gameData, setGameData] = useState([]);

    const handleEdit = (game) => {
        // Logic for editing a game
    };

    const handleNewGame = () => {
        // Logic for adding a new game
    };

    useEffect(() => {
        const loadGames = async () => {
            const games = await fetchSavedGames();
            setGameData(games);
        };
        loadGames();
    }, []);

    return (
        <div>
            <h1>Game Collection</h1>
            <SavedGames 
                gameData={gameData} 
                setGameData={setGameData} 
                handleEdit={handleEdit} 
                handleNewGame={handleNewGame} 
            />
        </div>
    );
};

export default App;