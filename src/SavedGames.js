import React, {useEffect, useState} from 'react';
import Modal from 'react-modal';
import './SavedGames.css'

Modal.setAppElement('#root');
//main funtion of the page
//imported props from App.js
const SavedGames = ({gameData, setGameData, handleEdit, handleNewGame}) => {
    const [activeTab, setActiveTab] = useState('All');//holds the state of the current status tab
    const [selectedGame, setSelectedGame] = useState(null);//handles a game being clicked on
    const [sortOption, setSortOption] = useState("none");//handles the sort option being used
    const [sortModalOpen, setSortModalOpen] = useState(false);//handles the opening and closing of the sort modal
    const [groupBy, setGroupBy] = useState("none");//handles how games are grouped in the sort options
    const [searchQuery, setSearchQuery] = useState(""); // search within current status tab

    //loads in the saved or default sort congururations from sortConfig.json
    useEffect(() => {
        fetch("http://localhost:5000/sortConfig")
            .then(res => res.json())
            .then(data => {setSortOption(data.sortOption || "none");
                setGroupBy(data.groupBy || "none")
            })
            .catch(err => console.error("Failed to load config:", err))
    }, []);

    //sets the list of games filtered by the status tabs
    const filteredGames = activeTab === "All" ? gameData : activeTab === "Playing" ? gameData.filter(game => game.status === "Playing" || (game.status === "Finished" && game.replayStatus === "Replaying"))
      : gameData.filter(game => game.status === activeTab);

    // apply collection search (only within current status-filtered list)
    const sourceGames = searchQuery.trim()
      ? filteredGames.filter(g => (g.title || g.name || "").toLowerCase().includes(searchQuery.toLowerCase()))
      : filteredGames;

    //sorts games based on the sort option selected
    let sortedGames;

    // priority order helper
    const PRIORITY_ORDER = ["Very Low","Low","Normal","High","Very High"];
    const priorityValue = (p) => {
      const idx = PRIORITY_ORDER.indexOf(p);
      return idx === -1 ? PRIORITY_ORDER.indexOf("Normal") : idx;
    };

    //sorts games based on rating
    if (sortOption === "rating-asc" || sortOption === "rating-desc") {
      const ratedGames = sourceGames.filter(
        (g) => g.rating !== null && g.rating !== undefined && g.rating !== "N/A" && g.rating !== ""
      );
      //places unrated games at the end of the list
      const unratedGames = sourceGames.filter(
        (g) => g.rating === null || g.rating === undefined || g.rating === "N/A" || g.rating === ""
      );

      const sortedRatedGames = ratedGames.sort((a, b) =>
        sortOption === "rating-asc"
          ? Number(a.rating) - Number(b.rating)
          : Number(b.rating) - Number(a.rating)
      );

      sortedGames = [...sortedRatedGames, ...unratedGames];

    } else if (sortOption === "priority-asc" || sortOption === "priority-desc") {
      // Sort by priority (ascending = Very Low -> Very High, descending = Very High -> Very Low)
      sortedGames = [...sourceGames].sort((a, b) => {
        const diff = priorityValue(a.priority || "Normal") - priorityValue(b.priority || "Normal");
        return sortOption === "priority-asc" ? diff : -diff;
      });
    } else {
      //sorts games based on title or release date
      sortedGames = [...sourceGames].sort((a, b) => {
        if (sortOption === "title-asc") return (a.title || "").localeCompare(b.title || "");
        if (sortOption === "title-desc") return (b.title || "").localeCompare(a.title || "");

        if (sortOption === "release-date-asc") {
          return new Date(a.releaseDate || 0).getTime() - new Date(b.releaseDate || 0).getTime();
        }
        if (sortOption === "release-date-desc") {
          return new Date(b.releaseDate || 0).getTime() - new Date(a.releaseDate || 0).getTime();
        }

        return 0;
      });
    }

    //arrays of games grouped by platform, region, franchise, or series
    const platformGroups = {};
    const regionGroups = {};
    const franchiseGroups = {};
    const seriesGroups = {};

    if (groupBy) {
      //groups by platform
      if (groupBy === "platform") {
        sortedGames.forEach((game) => {
          const platform = game.platform || "Unknown Platform";
            if (!platformGroups[platform]) {
                platformGroups[platform] = [];
            }
            platformGroups[platform].push(game);
        });
      } 
      //groups by region
      else if (groupBy === "region") {
        sortedGames.forEach((game) => {
          const region = game.region || "Unknown Region";
            if (!regionGroups[region]) {
              regionGroups[region] = [];
            }
            regionGroups[region].push(game);
        });
      } 
      //groups by franchise
      else if (groupBy === "franchise") {
        sortedGames.forEach((game) => {
          const franchises = Array.isArray(game.franchise) && game.franchise.length > 0 ? game.franchise : ["No Franchise"];
          franchises.forEach((franchise) => {
            if (!franchiseGroups[franchise]) franchiseGroups[franchise] = [];
            franchiseGroups[franchise].push(game); 
          })
        });
      }
      //groups by series
      else if (groupBy === "series") {
        sortedGames.forEach((game) => {
          const seriesList = Array.isArray(game.series) && game.series.length > 0 ? game.series : ["No Series"];
          seriesList.forEach((series) => {
            if (!seriesGroups[series]) seriesGroups[series] = [];
            seriesGroups[series].push(game); 
          })
        });
      }
    }
    //fetches saved games via a Restful API
    useEffect(() => {
        fetch('http://localhost:5000/savedGames')
          .then(res => res.json())
          .then(data => setGameData(data))
          .catch(err => console.error('Failed to load saved entries:', err));
    }, [setGameData]);

    //handles deleting entries from the saved games
    const handleDelete = (id) => {
        const confirmDelete = window.confirm("Are you sure?");
        if (!confirmDelete) return;

        setGameData(prevGames => {
            const newGames = prevGames.filter(game => game.id !== id);
            console.log('Updated game list after deletion:', newGames);
            return newGames;
        });

        fetch(`http://localhost:5000/savedGames/${id}`, {
            method: 'DELETE',
        })
            .then(res => res.json())
            .then(() => console.log('Deleted successfully'))
            .catch (err => console.error('Failed to delete entry:', err));
    };

    //formats the play time to be displayed in hours:minutes
    const formatPlayTime = (time) => {
        if (!time || !time.includes(":")) return "N/A";
        const [hh, mm] = time.split(":");
        return `${parseInt(hh)}h ${parseInt(mm)}m`;
    };

    //displays dates so that the month is a word not a number
    const formatDate = (dateString) => {
      if (!dateString) return "N/A";
      // Parse as local date (YYYY-MM-DD)
      const [year, month, day] = dateString.split("-");
      if (!year || !month || !day) return "N/A";
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    };

    //jsx for page
    return (
        <div className="saved-games-container">
          <div className="saved-games-header">
            {/*new game and sort buttons*/}
            <button onClick={handleNewGame}>Add Entry From Scratch</button>
            <button onClick={() => setSortModalOpen(true)} className="sort-button">Sort</button>
            {/* collection search (only searches current tab results) */}
            <input
              type="text"
              placeholder={`Search ${activeTab === "All" ? "collection" : activeTab}`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{marginLeft: 12, padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc'}}
            />
            <button onClick={() => setSearchQuery("")} style={{marginLeft:8}}>Clear</button>
            {/*status tabs*/}
            <div className="status-tabs">
              {["All", "Backlog", "Playing", "Finished", "Dropped", "Wishlist"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`status-tab ${tab} ${activeTab === tab ? "active" : ""}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          {/*sort modal display*/}
          {sortModalOpen && (
            <Modal
              isOpen={sortModalOpen}
              onRequestClose={() => setSortModalOpen(false)}
              className="sort-modal"
            >
              <h3>Sort Collection</h3>
              <label>
                Sort By:
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="title-asc">Title Ascending</option>
                  <option value="title-desc">Title Descending</option>
                  <option value="release-date-asc">Release Date Ascending</option>
                  <option value="release-date-desc">Release Date Descending</option>
                  <option value="rating-asc">Rating Ascending</option>
                  <option value="rating-desc">Rating Descending</option>
                  <option value="priority-asc">Priority Ascending</option>
                  <option value="priority-desc">Priority Descending</option>
                </select>
              </label>
              <label>
                Group By:
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="platform">Platform</option>
                  <option value="region">Region</option>
                  <option value="franchise">Franchise</option>
                  <option value="series">Series</option>
                </select>
              </label>
              <button
                onClick={() => {
                  fetch("http://localhost:5000/sortConfig", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({sortOption, groupBy}),
                  }).then(() => setSortModalOpen(false));
                }}
              >
                Apply
              </button>
            </Modal>
          )}

          <div className="saved-games-body">
            <div className="saved-games-content">
              <div className="game-list-section">
                {/*display when grouped by platform*/}
                {groupBy === "platform" ? (
                  <div className="group-by-grid">
                    {Object.entries(platformGroups)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([platform, games]) => (
                        <div key={platform} className="group-by-selection">
                          <h2>{platform}</h2>
                          {/*display of grid of saved games in collection*/}
                          <div className="saved-games-grid">
                            {games.map((game) => (
                              <div
                                key={game.id}
                                className={`saved-game-card status-${game.status} ${
                                  selectedGame?.id === game.id ? "selected" : ""
                                }`}
                              >
                                <div className="image-wrapper">
                                  <h3 className="card-title">{game.title}</h3>
                                  <img
                                    src={game.coverUrl || '/default-cover.png'}
                                    className="game-cover"
                                    alt={game.title}
                                    onClick={() =>
                                      setSelectedGame(
                                        game.id === selectedGame?.id ? null : game
                                      )
                                    }
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
                                <p>Release Date: {game.releaseDate ? formatDate(game.releaseDate) : "TBD"}</p>
                                <p>Region: {game.region || "N/A"}</p>
                                <p>Rating: {game.rating || "N/A"}</p>
                                <div className="card-buttons">
                                  <button onClick={() => handleEdit(game)}>Edit</button>
                                  <button
                                    onClick={() => handleDelete(game.id)}
                                    style={{ marginLeft: "8px" }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                  //display when grouped by region
                ) : groupBy === "region" ? (
                  <div className="group-by-grid">
                    {Object.entries(regionGroups)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([region, games]) => (
                        <div key={region} className="group-by-selection">
                          <h2>{region}</h2>
                          {/*display of grid of saved games in collection*/}
                          <div className="saved-games-grid">
                            {games.map((game) => (
                              <div
                                key={game.id}
                                className={`saved-game-card status-${game.status} ${
                                  selectedGame?.id === game.id ? "selected" : ""
                                }`}
                              >
                                <div className="image-wrapper">
                                  <h3 className="card-title">{game.title}</h3>
                                  <img
                                    src={game.coverUrl || '/default-cover.png'}
                                    className="game-cover"
                                    alt={game.title}
                                    onClick={() =>
                                      setSelectedGame(
                                        game.id === selectedGame?.id ? null : game
                                      )
                                    }
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
                                <p>Release Date: {game.releaseDate ? formatDate(game.releaseDate) : "TBD"}</p>
                                <p>Region: {game.region || "N/A"}</p>
                                <p>Rating: {game.rating || "N/A"}</p>
                                <div className="card-buttons">
                                  <button onClick={() => handleEdit(game)}>Edit</button>
                                  <button
                                    onClick={() => handleDelete(game.id)}
                                    style={{ marginLeft: "8px" }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                  //display when grouped by franchise
                ) : groupBy === "franchise" ? (
                  <div className="group-by-grid">
                    {Object.entries(franchiseGroups)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([franchise, games]) => (
                        <div key={franchise} className="group-by-selection">
                          <h2>{franchise}</h2>
                          {/*display of grid of saved games in collection*/}
                          <div className="saved-games-grid">
                            {games.map((game) => (
                              <div
                                key={game.id}
                                className={`saved-game-card status-${game.status} ${
                                  selectedGame?.id === game.id ? "selected" : ""
                                }`}
                              >
                                <div className="image-wrapper">
                                  <h3 className="card-title">{game.title}</h3>
                                  <img
                                    src={game.coverUrl || '/default-cover.png'}
                                    className="game-cover"
                                    alt={game.title}
                                    onClick={() =>
                                      setSelectedGame(
                                        game.id === selectedGame?.id ? null : game
                                      )
                                    }
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
                                <p>Release Date: {game.releaseDate ? formatDate(game.releaseDate) : "TBD"}</p>
                                <p>Region: {game.region || "N/A"}</p>
                                <p>Rating: {game.rating || "N/A"}</p>
                                <div className="card-buttons">
                                  <button onClick={() => handleEdit(game)}>Edit</button>
                                  <button
                                    onClick={() => handleDelete(game.id)}
                                    style={{ marginLeft: "8px" }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                  //display when grouped by series
                ) : groupBy === "series" ? (
                  <div className="group-by-grid">
                    {Object.entries(seriesGroups)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([series, games]) => (
                        <div key={series} className="group-by-selection">
                          <h2>{series}</h2>
                          {/*display of grid of saved games in collection*/}
                          <div className="saved-games-grid">
                            {games.map((game) => (
                              <div
                                key={game.id}
                                className={`saved-game-card status-${game.status} ${
                                  selectedGame?.id === game.id ? "selected" : ""
                                }`}
                              >
                                <div className="image-wrapper">
                                  <h3 className="card-title">{game.title}</h3>
                                  <img
                                    src={game.coverUrl || '/default-cover.png'}
                                    className="game-cover"
                                    alt={game.title}
                                    onClick={() =>
                                      setSelectedGame(
                                        game.id === selectedGame?.id ? null : game
                                      )
                                    }
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
                                <p>Release Date: {game.releaseDate ? formatDate(game.releaseDate) : "TBD"}</p>
                                <p>Region: {game.region || "N/A"}</p>
                                <p>Rating: {game.rating || "N/A"}</p>
                                <div className="card-buttons">
                                  <button onClick={() => handleEdit(game)}>Edit</button>
                                  <button
                                    onClick={() => handleDelete(game.id)}
                                    style={{ marginLeft: "8px" }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  //display when grouped by none
                  //display of grid of saved games in collection
                  <div
                    className={`saved-games-grid ${
                      selectedGame ? "with-sidebar" : ""
                    }`}
                  >
                    {sortedGames.map((game) => (
                      <div
                        key={game.id}
                        className={`saved-game-card status-${game.status} ${
                          selectedGame?.id === game.id ? "selected" : ""
                        }`}
                      >
                        <div className="image-wrapper">
                          <h3 className="card-title">{game.title}</h3>
                          <img
                            src={game.coverUrl || '/default-cover.png'}
                            className="game-cover"
                            alt={game.title}
                            onClick={() =>
                              setSelectedGame(
                                game.id === selectedGame?.id ? null : game
                              )
                            }
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
                        <p>Release Date: {game.releaseDate ? formatDate(game.releaseDate) : "TBD"}</p>
                        <p>Region: {game.region || "N/A"}</p>
                        <p>Rating: {game.rating || "N/A"}</p>
                        <div className="card-buttons">
                          <button onClick={() => handleEdit(game)}>Edit</button>
                          <button
                            onClick={() => handleDelete(game.id)}
                            style={{ marginLeft: "8px" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/*game details side bar*/}
            <div className="game-details-sidebar">
              {selectedGame ? (
                <>
                  <h3>{selectedGame.title}</h3>
                  <img
                    src={selectedGame.coverUrl || '/default-cover.png'}
                    alt={selectedGame.title}
                    className="sidebar-cover"
                  />
                  <p>Status: {selectedGame.status}</p>
                  <p>Replay Status: {selectedGame.replayStatus}</p>
                  <p>Priority: {selectedGame.priority || "Normal"}</p>
                  <p>Platform: {selectedGame.platform}</p>
                  <p>Region: {selectedGame.region || "N/A"}</p>
                  <p>Release Date: {selectedGame.releaseDate ? formatDate(selectedGame.releaseDate) : "TBD"}</p>
                  <p>
                    Publisher:{" "}
                    {Array.isArray(selectedGame.publisher)
                      ? selectedGame.publisher.join(", ")
                      : selectedGame.publisher || "N/A"}
                  </p>
                  <p>
                    Developer:{" "}
                    {Array.isArray(selectedGame.developer)
                      ? selectedGame.developer.join(", ")
                      : selectedGame.developer || "N/A"}
                  </p>
                  <p>
                    Franchise:{" "}
                    {Array.isArray(selectedGame.franchise)
                      ? selectedGame.franchise.join(", ")
                      : selectedGame.franchise || "N/A"}
                  </p>
                  <p>
                    Series:{" "}
                    {Array.isArray(selectedGame.series)
                      ? selectedGame.series.join(", ")
                      : selectedGame.series || "N/A"}
                  </p>
                  <p>Play Time: {formatPlayTime(selectedGame.playTime)}</p>
                  <p>
                    Replay Times:{" "}
                    {selectedGame.replayTimes?.length > 0 ? (
                      <ul style={{ marginTop: "4px", paddingLeft: "20px" }}>
                        {selectedGame.replayTimes.map((rt) => (
                          <li key={rt.id}>
                            {rt.hours.padStart(1, "0")}:{rt.minutes.padStart(2, "0")}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "N/A"
                    )}
                  </p>
                  <p>
                    To-Do List:{" "}
                    {selectedGame.todoList?.length > 0
                      ? selectedGame.todoList.map((t) => t.text).join(", ")
                      : "N/A"}
                  </p>
                  <p>Finished Date: {formatDate(selectedGame.finishedDate) || "N/A"}</p>
                  <p>Rating: {selectedGame.rating || "N/A"}</p>
                  <p>Review: {selectedGame.review || "N/A"}</p>
                  <p>Notes: {selectedGame.notes || "N/A"}</p>
                </>
              ) : (
                <p className="empty-sidebar">Select a game to view details</p>
              )}
            </div>
          </div>
        </div>
      );  
};

export default SavedGames;