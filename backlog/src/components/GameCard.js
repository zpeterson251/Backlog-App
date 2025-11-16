import React from 'react';
import './GameCard.css';

const GameCard = ({ game, onEdit, onDelete, onSelect, isSelected }) => {
    return (
        <div className={`game-card status-${game.status} ${isSelected ? "selected" : ""}`}>
            <div className="image-wrapper" onClick={onSelect}>
                <h3 className="card-title">{game.title}</h3>
                <img
                    src={game.coverUrl || '/default-cover.png'}
                    className="game-cover"
                    alt={game.title}
                />
            </div>
            <p>
                <span className={`status-dot dot-${game.status}`}></span>
                {game.status}
                {game.status === "Finished" && (
                    <span className={`replay-label ${game.replayStatus?.replace(/\s/g, '').toLowerCase()}`}>
                        {game.replayStatus || "Not Replayed"}
                    </span>
                )}
            </p>
            <p>Platform: {game.platform}</p>
            <p>Priority: {game.priority || "Normal"}</p>
            <p>Release Date: {game.releaseDate || "TBD"}</p>
            <p>Region: {game.region || "N/A"}</p>
            <p>Rating: {game.rating || "N/A"}</p>
            <div className="card-buttons">
                <button onClick={onEdit}>Edit</button>
                <button onClick={onDelete} style={{ marginLeft: "8px" }}>Delete</button>
            </div>
        </div>
    );
};

export default GameCard;