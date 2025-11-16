import React, {useState, useEffect, useRef} from "react";
import ReactModal from "react-modal";
import {BrowserRouter as Router, Routes, Route, Link} from 'react-router-dom';
import SavedGames from "./SavedGames";
import Statistics from "./Statistics";
import platforms from './platforms.json';
import {filterSafeGames} from './safeSearch';
import './App.css';

//Sets the root for ReactModal
ReactModal.setAppElement('#root');
//Prevents ReactModal from keeping the default style it assigns
ReactModal.defaultStyles = {};

//Map of region names and the corresponding ids
const REGION_MAP = {
  1: "Europe",
  2: "North America",
  3: "Australia",
  4: "New Zealand",
  5: "Japan",
  6: "China",
  7: "Asia",
  8: "Worldwide",
  9: "Korea",
  10: "Brazil",
  11: "Other"
};

//Maps platform names to the corresponding ids from platforms.json
const PLATFORM_MAP = Object.fromEntries(Array.isArray(platforms) ? platforms.map(({ id, name }) => [id, name]) : []);

//Converts the PLATFORM_MAP into a two dimensional list for the suggestions in the modal
const PLATFORM_LIST = Object.entries(PLATFORM_MAP).map(([id, name]) => ({
  id: Number(id),
  name
}));

function App() {
  //React local states
  const [games, setGames] = useState([]);//Holds list of games from api from search or home page
  const [loading, setLoading] = useState(true);//Loading spinner
  const [error, setError] = useState(null);//Error when fetching from the api
  const [gameData, setGameData] = useState([]);//Sets data from the saved games
  const [modalOpen, setModalOpen] = useState(false);//Sets the modal open or closed
  const [editingGame, setEditingGame] = useState(null);//Sets the game entry in an editing state
  const [formErrors, setFormErrors] = useState({});//Sets an error for the form in the modal
  const [isFormValid, setIsFormValid] = useState(false);//Sets the form as valid or not
  const [originalFormData, setOriginalFormData] = useState(null);//Holds the default form data
  const [isFormDirty, setIsFormDirty] = useState(false);//Sets the form as dirty or not
  const [platformSuggestions, setPlatformSuggestions] = useState([]);//Holds the suggestions from the platform field
  const [searchQuery, setSearchQuery] = useState("");//Holds the search input
  const [submittedQuery, setSubmittedQuery] = useState("");//Search is submitted
  const [searchPage, setSearchPage] = useState(0);//Controls pagination after search
  const [hasMoreResults, setHasMoreResults] = useState(true);//Determines if there are more results to load in a search
  const [optionsOpen, setOptionsOpen] = useState(false);//Sets the options modal open or not
  const [optionsChanged, setOptionsChanged] = useState(false);//Saves the options if changed
  const [safeSearchEnabled, setSafeSearchEnabled] = useState(true);//Sets safe search enabled or not

  //Default form data for the modal
  const [formData, setFormData] = useState({
    status: 'Backlog',
    replayStatus: "Not Replaying",
    title: '',
    platform: '',
    region: '',
    releaseDate: '',
    publisher: '',
    developer: '',
    franchise: '',
    series: '',
    hours: '',
    minutes: '',
    replayTimes: [],
    todoList: [],
    finishedDate: '',
    rating: '',
    review: '',
    notes: '',
    coverFile: null,
    coverPreview: null,
    igdbCoverUrl: '',
    priority: 'Normal' // added priority default
  });

  //Debounces release date updating
  const debounceTimeout = useRef(null);

  //Handles closing the options modal
  const handleOptionsClose = () => {
    if (optionsChanged) {
      const confirmClose = window.confirm("Save changes before closing");
      if (!confirmClose) return;
    }
    setOptionsOpen(false);
  };

  //Validates the main modal
  const validateForm = (data = formData) => {
    const errors = {};

    if (!data.title?.trim()) errors.title = "Title is required";
    if (!data.platform?.trim()) errors.platform = "Platform is required";
    if (data.status !== "Wishlist" && !data.releaseDate?.trim()) errors.releaseDate = "Release Date is required";

    //Checks if the rating is between 1-100
    const ratingNum = Number(data.rating);
    if (data.rating?.trim() !== "" && (isNaN(ratingNum) || ratingNum<1 || ratingNum>100)) {
        errors.rating = "Rating must be an integer from 1-100";
      }

    //Checks if the play time is a number using regex
    //Checks if the hours is 5 digits and if minutes is between 00 and 59
    const h = data.hours.trim();
    const m  = data.minutes.trim();
    if (h || m) {
      if (!/^\d{1,5}$/.test(h)) {
        errors.hours = "Hours must be a number up to 5 digits";
      }
      if (!/^\d{1,2}$/.test(m) || Number(m) > 59) {
        errors.minutes = "Minutes must be between 00 and 59";
      }
    }

    //Checks for any amount of form errors
    setFormErrors(errors);
    const valid = Object.keys(errors).length === 0;
    setIsFormValid(valid);
    return valid;
  };

  //Adds item to to-do list
  const addTodo = () => {
    setFormData(f => ({
      ...f,
      todoList: [
        ...f.todoList,
        {id: crypto.randomUUID(), text: "", completed: false}
      ]
    }));
  };

  //Deletes an item from the to-do list
  const removeTodo = i => setFormData(f => ({
    ...f, todoList: f.todoList.filter((_, j) => j !== i)
  }));

  //Moves the position of a to-do list item up or down
  const moveTodo = (from, to) => {
    setFormData(f => {
      const list = [...f.todoList];
      const [item] = list.splice(from, 1);
      list.splice(to,0,item);
      return {...f, todoList: list};
    });
  };

  //Updates the to-do field
  const updateTodo = (i, updates) => {
    setFormData(f => {
      const list = [...f.todoList];
      list[i] = {...list[i], updates};
      return {...f, todoList: list};
    });
  };

  //Fetch for popular games from api
  useEffect(() => {
    fetch("http://localhost:5000/games")
      .then(res => res.json())
      .then(data => {
        setGames(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching games:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  //Fetch saved games
  useEffect(() => {
    fetch('http://localhost:5000/savedGames')
      .then(res => res.json())
      .then(data => setGameData(data))
      .catch(err => console.error('Failed to load saved entries:', err));
  }, []);

  //Enables or disables fields based on status
  const isFieldEnabled = (field) => {
    const state = formData.status;
    if (["Playing", "Finished", "Dropped"].includes(state) && field === "playTime")
      return true;
    if (state === "Finished" && ["finishedDate", "rating", "review"].includes(field))
      return true;
    return false;
  };

  //Handles search queries
  const handleSearch = async (reset = false) => {
    const query = submittedQuery.trim();
    if (!query) return;
    
    const nextPage = reset ? 0 : searchPage + 1;
    const limit = reset ? 30 :10;
    const offset = nextPage * limit;

    console.log(`[Search] Query: ${query}, Offset: ${offset}, Limit: ${limit}, Reset: ${reset}`);

    try {
      const res = await fetch(`http://localhost:5000/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
      const data = await res.json();
      console.log(`[Search] Results returned: ${data.length}`);
      const filteredData = filterSafeGames(data, safeSearchEnabled);
      if (reset) {
        setGames(filteredData);
      } else {
        setGames(prev => [...prev, ...filteredData]);
      }
      setSearchPage(nextPage);
      setHasMoreResults(data.length === limit);
    } catch (err) {
      console.error("Search failed:", err);
    }
  };

  //Handles change in search query
  useEffect(() => {
    if (submittedQuery.trim()) {
      setGames([]);
      setSearchPage(0);
      setHasMoreResults(true);
      handleSearch(true);
    }
  //This comment disbales React's linter for the line below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[submittedQuery]);

  //Handles adding a replay time
  const handleAddReplayTime = () => {
    const h = formData.replayHours?.trim() || '';
    const m = formData.replayMinutes?.trim() || '';

    const tempForm = {hours:h,minutes:m};
    const errors = {};
    validateForm(tempForm);

    //Validates the time fields
    if (h || m) {
      if (!/^\d{1,5}$/.test(h)) {
        errors.hours = "Hours must be a number up to 5 digits";
      }
      if (!/^\d{1,2}$/.test(m) || Number(m) > 59) {
        errors.minutes = "Minutes must be between 00  and 59";
      }
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(prev => ({...prev, ...errors}));
      return;
    }

    //Adds new replay time
    const newEntry = {
      id: crypto.randomUUID(),
      hours: h,
      minutes: m
    };

    //Updates the form
    setFormData(f => ({
      ...f,
      replayTimes: [...(f.replayTimes || []), newEntry],
      replayHours: '',
      replayMinutes: ''
    }));
    setFormErrors(prev => {
      const next = {...prev};
      delete next.replayHours;
      delete next.replayMinutes;
      return next;
    });
  };

  //Handles editing of a new or existing entry
  const handleEdit = async (game) => {
    try {
      //Fetches details to autofill on a new entry
      const response = await fetch(`http://localhost:5000/gameDetails/${game.id}`);
      const data = await response.json();
      console.log(data);

      //Sets the initial form data for a new entry or existing entry
      const [hours = '', minutes = ''] = (data.playTime || game.playTime || '').split(":");
      const initial = {
        id: game.id,
        status: game.status || "Backlog",
        replayStatus: game.replayStatus || "Not Replaying",
        title: game.title || game.name || data.title || "",
        platform: game.platform || data.platform || "",
        region: game.region || data.region || "",
        releaseDate: game.releaseDate || data.releaseDate || "",
        publisher: game.publisher || (Array.isArray(data.publisher) ? data.publisher.join(', ') : data.publisher) || "",
        developer: game.developer || (Array.isArray(data.developer) ? data.developer.join(', ') : data.developer) || "",
        franchise: game.franchise || (Array.isArray(data.franchise) ? data.franchise.join(', ') : data.franchise) || "",
        series: game.series || (Array.isArray(data.series) ? data.series.join(', ') : data.series) || "",
        hours,
        minutes,
        replayTimes: game.replayTimes || [],
        todoList: game.todoList || [],
        finishedDate: game.finishedDate || "",
        rating: game.rating?.toString() || "",
        review: game.review || "",
        notes: game.notes || "",
        coverFile: null,
        coverPreview: null,
        coverUrl: game.cover?.url ? `https:${game.cover.url.replace('t_thumb', 't_cover_big')}` : "",
        igdbCoverUrl: game.cover?.url ? `https:${game.cover.url.replace('t_thumb', 't_cover_big')}` : "",
        priority: game.priority || "Normal" // preserve priority or default
      };
      console.log("Initial form data:", initial)
      console.log("About to open modal");

      //Sets the states needed
      setEditingGame(game);
      setFormData(initial);
      setOriginalFormData(initial);
      setIsFormDirty(false);
      validateForm(initial);
      setModalOpen(true);
    } catch (error) {
      console.error("Error fetching game details:", error);
    }
  };

  //Handles form data when an entry is created from scratch
  const handleNewGame = () => {
    const initial = {
      id: crypto.randomUUID(),
      status: "Backlog",
      replayStatus: "Not Replaying",
      title: "",
      platform: "",
      region: "",
      releaseDate: "",
      publisher: "",
      developer: "",
      franchise: "",
      series: "",
      hours: "",
      minutes: "",
      replayTimes: [],
      replayHours: "",
      replayMinutes: "",
      todoList: [],
      finishedDate: "",
      rating: "",
      review: "",
      notes: "",
      coverFile: null,
      coverPreview: null,
      igdbCoverUrl: "",
      priority: "Normal" // default priority for new entries
    };
    setEditingGame(null);
    setFormData(initial);
    setOriginalFormData(initial);
    setIsFormDirty(false);
    validateForm(initial);
    setModalOpen(true);
  };

  //Splits and trims strings seperated by commas and converts them into an array
  const splitAndTrim = (str) => {
    if (Array.isArray(str)) return str.map(s => s.trim()).filter(Boolean);
    if (typeof str === 'string') {
      return str.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  //Handles saving form data into an entry in gameData.json
  const handleSave = async () => {
    if (!validateForm()) return;
    
    //Checks if this a new entry or replacing an existing entry
    const existsInSaved = gameData.some((g) => g.id === formData.id);
    const gameId = existsInSaved ? formData.id : crypto.randomUUID();
    const isEditing = existsInSaved;
    const localCoverUrl = `http://localhost:5000/covers/${gameId}.jpg`;

    //Sets the fields to save and their defaults if they have them
    const newGameEntry = {
      id: gameId,
      status: formData.status || "Backlog",
      replayStatus: formData.replayStatus || "Not Replaying",
      title: formData.title?.trim() || "",
      platform: formData.platform.trim() || "",
      region: formData.region.trim() || "",
      releaseDate: formData.releaseDate?.trim() || "",
      publisher: splitAndTrim(formData.publisher) || "",
      developer: splitAndTrim(formData.developer) || "",
      franchise: splitAndTrim(formData.franchise) || "",
      series: splitAndTrim(formData.series) || "",
      playTime: (formData.hours && formData.minutes) ? `${formData.hours.padStart(1,'0')}:${formData.minutes.padStart(2,'0')}` : "",
      replayTimes: formData.replayTimes || [],
      todoList: formData.todoList || [],
      finishedDate: formData.finishedDate?.trim() || "",
      rating: formData.rating?.trim() || "",
      review: formData.review || "",
      notes: formData.notes || "",
      coverUrl: formData.coverPreview ? localCoverUrl : formData.igdbCoverUrl || editingGame?.coverUrl ||"",
      priority: formData.priority || "Normal" // include priority when saving
    };

    //Uploads a custom cover if it is provided
    if (formData.coverFile) {
      const formDataToUpload = new FormData();
      formDataToUpload.append("cover", formData.coverFile);
      formDataToUpload.append("id", gameId);

      try {
        const uploadRes = await fetch("http://localhost:5000/uploadCover", {
          method: "POST",
          body: formDataToUpload
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
        console.log("Custom cover uploaded");
      } catch (err) {
        console.error("Upload error:", err);
      }
    }

    //Saves a new or existing entry
    const url = 'http://localhost:5000/savedGames';
    const method = isEditing ? 'PUT' : 'POST';
    fetch(url, {
      method,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newGameEntry)
    })
    .then(res => res.json())
    .then(data => {
      setGameData(prev => editingGame ? prev.map(g => g.id === editingGame.id ? data : g) : [...prev, data]);
      console.log(editingGame ? 'Updated in backend' : 'Saved to backend', data);
    })
    .catch(err => console.error('Failed to save entry:', err));

    setModalOpen(false);
  };

  //Handles cancel editing
  const handleCancel = () => {
    if (isFormDirty) {
      const confirmLeave = window.confirm("Close unsaved changes?");
      if (!confirmLeave) return;
    }
    setModalOpen(false);
  };

  //Fetches an updated release date based on region and/or platform
  const fetchUpdatedReleaseDate = async (platformName, regionLabel) => {
    const matchedPlatform = PLATFORM_LIST.find(p => platformName && p.name.toLowerCase() === platformName.toLowerCase());

    console.log("fetchUpdatedReleaseDate →", platformName, "matched to", matchedPlatform);

    const platformId = matchedPlatform?.id || "";
    const selectedRegionID = Object.entries(REGION_MAP).find(([id,label]) => label === regionLabel)?.[0] || 8;

    if (!editingGame?.id) return;

    try {
      const response = await fetch(`http://localhost:5000/gameDetails/${editingGame.id}?platform=${platformId}&region=${selectedRegionID}`);
      const data = await response.json();
      console.log("Updated release date result:", data);
      setFormData(prev => ({
          ...prev,
          releaseDate: data.releaseDate || prev.releaseDate,
      }));
    } catch (err) {
      console.error("Failed to fetch updated release date:", err);
    }
  };
  
  //Handles change in the form fields
  const handleInputChange = async (e) => {
    const {name, value} = e.target;
    const updatedForm = {...formData, [name]: value}
    setFormData(updatedForm);
    validateForm(updatedForm);

    console.log(`Input change: ${name} = ${value}`);

    //Updates platform suggestions
    if (name === 'platform') {
      console.log("platform change detected");
      const suggestions = PLATFORM_LIST.filter(p => 
        p.name.toLowerCase().includes(value.toLowerCase())
      );
      setPlatformSuggestions(suggestions.slice(0,5));

      //Updates release date based on platform
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      debounceTimeout.current = setTimeout(() => {
        fetchUpdatedReleaseDate(value, updatedForm.region);
      }, 500);
    }

    //Updates release date based on region
    if (name === 'region') {
      console.log("region change detected");
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      debounceTimeout.current = setTimeout(() => {
        fetchUpdatedReleaseDate(updatedForm.platform, value);
      }, 500);
    }

    //Opens confirmation window if their are unsaved changes when cancelling
    if (name === 'status' && formData.status !== value) {
      const confirmStateChange = window.confirm(
        "Changing game status may clear fields like Rating, Review, Play Time, or Finished Date if they're not valid for the new state. Continue?"
      );
      if (!confirmStateChange)
        return;
      const clearedForm = {...formData, status: value};
      if (!["Playing", "Finished", "Dropped"].includes(value)) {
        clearedForm.hours = "";
        clearedForm.minutes = "";
      }
      if (value !== "Finished") {
        clearedForm.finishedDate = "";
        clearedForm.rating = "";
        clearedForm.review = "";
        clearedForm.replayStatus = "Not Replaying";
      }
      setFormData(clearedForm);
    }

    //Checks if the form is dirty
    if (originalFormData) {
      const dirty = Object.keys(updatedForm).some(
        (key) => updatedForm[key] !== originalFormData[key]
      );
      setIsFormDirty(dirty);
    }
  };

  //jsx for page
  return (
    <Router>
      {/*logo with link to home page*/}
      <header className="banner">
        <Link to="/" className="logo-link">
          <img src="/logo.png" alt="Game Backlog Logo" className="logo-img" />
          <span className="logo-text"></span>
        </Link>
      </header>
      {/*nav bar*/}
      <nav className="navbar">
        <Link to="/" className="nav-link">
          Home
        </Link>
        <Link to="/saved" className="nav-link">
          Collection
        </Link>
        <Link to="/stats" className="nav-link">
          Statistics
        </Link>
        <div className="nav-options" style={{marginLeft:"auto", display:"flex", alignItems:"center"}}>
          <button onClick={() => setOptionsOpen(true)} className="options-button">
            <span role="img" aria-label="gear">⚙️</span>Options
          </button>
        </div>
      </nav>
    {/*defines routes for navigating pages*/}
    <Routes>
      {/*home page*/}
      <Route path="/" element={
        <MainPage
          games={games}
          gameData={gameData}
          loading={loading}
          error={error}
          handleNewGame={handleNewGame}
          handleEdit={handleEdit}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          handleSearch={handleSearch}
          hasMoreResults={hasMoreResults}
          setSubmittedQuery={setSubmittedQuery}
          />
      }/>
      {/*collection page*/}
      <Route path="/saved" element={
        <SavedGames
          gameData={gameData}
          setGameData={setGameData}
          handleEdit={handleEdit}
          handleNewGame={handleNewGame}
        />
      }/>
      {/*statistics page*/}
      <Route path="/stats" element={
        <Statistics
          gameData={gameData}
        />
      }/>
    </Routes>
    {/*options modal*/}
    <ReactModal isOpen={optionsOpen} onRequestClose={() => handleOptionsClose()} className="options-modal" overlayClassName="modal-overlay" contentLabel="Options Menu"
      style={{content:{right:'20px',top:'60px',width:'300px',height:'auto',position:'absolute',borderRadius:'8px',backgroundColor:'#1c1c1c',color:'white'}}}>
        <h3>Settings</h3>
        <label style={{display:'block',marginBottom:'10px'}}>
          <input type='checkbox' checked={safeSearchEnabled} onChange={(e) => {setSafeSearchEnabled(e.target.checked); setOptionsChanged(true);}}/>
          Enable Safe Search
        </label>
        <button onClick={handleOptionsClose}>Close</button>
      </ReactModal>
      {/*edit modal*/}
      <ReactModal isOpen={modalOpen} onRequestClose={() => setModalOpen(false)} shouldCloseOnOverlayClick={false} contentLabel="Edit Game">
        <h2>{editingGame ? "Edit Game" : "Add New Game"}</h2>
        <form onSubmit={(e) => {e.preventDefault(); handleSave();}}>
          <div className="modal-form-grid">
            <div className="modal-form-column">
              <label>
                Status:
                <select name="status" value={formData.status} onChange={handleInputChange}>
                  {["Backlog", "Playing", "Finished", "Dropped", "Wishlist"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Replay Status:
                <select name="replayStatus" value={formData.replayStatus} onChange={handleInputChange} disabled={formData.status !== "Finished"} style={{opacity: formData.status === "Finished" ? 1 : 0.5, pointerEvents: formData.status === "Finished" ? "auto" : "none"}}>
                  {["Not Replaying", "Replaying", "Replayed"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Title:
                <input type="text" name="title" value={formData.title} onChange={handleInputChange}/><br/>
              </label>
              <label>
                Platform:
                <div className="platform-suggestion-container" onBlur={() => setTimeout(() => setPlatformSuggestions([]), 100)} onFocus={() => {}} tableIndex={-1}>
                  <input type="text" name="platform" value={formData.platform} onChange={handleInputChange} 
                    onBlur={() => setTimeout(() => setPlatformSuggestions([]), 100)} onFocus={() => {}} autoComplete="off"/>
                  {platformSuggestions.length > 0 && (
                    <ul className="platform-suggestions">
                      {platformSuggestions.map((platform) => (
                        <li key={platform.id} onClick={() => {
                          setFormData(prev => ({...prev, platform: platform.name}));
                          fetchUpdatedReleaseDate(platform.name, formData.region);
                          setPlatformSuggestions([]);
                        }}
                        >{platform.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </label>
              <label>
                Region:
                  <select name="region" value={formData.region} onChange={handleInputChange}>
                    <option value="">Select Region</option>
                    {Object.entries(REGION_MAP).map(([key, label]) => (
                      <option key={key} value={label}>{label}</option>
                    ))}
                  </select><br/>
              </label>
              <label>
                Release Date:
                <input type="date" name="releaseDate" value={formData.releaseDate} onChange={handleInputChange}/><br/>
              </label>
              <label>
                Publisher:
                <input type="text" name="publisher" value={formData.publisher} onChange={handleInputChange}/><br/>
              </label>
              <label>
                Developer:
                <input type="text" name="developer" value={formData.developer} onChange={handleInputChange}/><br/>
              </label>
              <label>
                Franchise:
                <input type="text" name="franchise" value={formData.franchise} onChange={handleInputChange}/><br/>
              </label>
              <label>
                Series:
                <input type="text" name="series" value={formData.series} onChange={handleInputChange}/><br/>
              </label>
              <label>
                Priority:
                <select name="priority" value={formData.priority} onChange={handleInputChange}>
                  {["Very High","High","Normal","Low","Very Low"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Play Time:
                <div style={{display:"inline-flex", alignItems:"center"}}>
                  <input type="text" name="hours" value={formData.hours} onChange={handleInputChange} maxLength={5} placeholder="00000" style={{width:"60px", textAlign:"right", opacity:isFieldEnabled("playTime") ? 1:0.5}} disabled={!isFieldEnabled("playTime")}/>
                  <span style={{margin:"0 5px"}}>:</span>
                  <input type="text" name="minutes" value={formData.minutes} onChange={handleInputChange} maxLength={2} placeholder="00" style={{width:"30px", textAlign:"left", opacity:isFieldEnabled("playTime") ? 1:0.5}} disabled={!isFieldEnabled("playTime")}/>
                </div>
                {(formErrors.hours || formErrors.minutes) &&(
                  <div syle={{color:"red", fontSize:"0.9em"}}>
                    {formErrors.hours || formErrors.minutes}
                  </div>
                )}<br/>
              </label>
              <label>
                Finished Date:
                <input type="date" name="finishedDate" value={formData.finishedDate} onChange={handleInputChange} disabled={!isFieldEnabled("finishedDate")} style={{opacity:isFieldEnabled("finishedDate") ? 1:0.5}}/><br/>
              </label>
              <label>
                Rating:
                <input type="number" name="rating" value={formData.rating} onChange={handleInputChange} disabled={!isFieldEnabled("rating")} style={{opacity:isFieldEnabled("rating") ? 1:0.5}}/>
                {formErrors.rating && (
                  <div style={{fontSize:"0.9em"}}>{formErrors.rating}</div>
                )}<br/>
              </label>
            </div>
            <div className="modal-form-column">
              <label>
                {formData.coverPreview ? "Custom Cover Preview:" : editingGame?.cover?.url ? "Change Cover Image:" : "Upload Cover Image"}
                <input type="file" name="coverFile" accept="image/jpeg,image/png"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setFormData(prev => ({
                        ...prev,
                        coverFile: file,
                        coverPreview: URL.createObjectURL(file)
                      }));
                    }
                  }}
                />
                {formData.coverPreview && (
                  <div style={{marginBottom:"10px"}}>
                    <img src={formData.coverPreview} alt="Preview" style={{maxHeight:"200px", marginTop:"10px", borderRadius:"8px"}}/>
                  </div>
                )}
                {!formData.coverPreview && editingGame?.cover?.url && (
                  <div style={{marginBottom:"10px"}}>
                    <img
                      src={`https:${editingGame.cover.url.replace('t_thumb', 't_cover_big')}`}
                      alt="IGDB Cover"
                      style={{maxHeight:"200px", marginTop:"10px", borderRadius:"8px"}}
                    />
                  </div>
                )}
                {!formData.coverPreview && !editingGame?.cover?.url && (
                  <div style={{marginBottom:"10px", fontStyle:"italic"}}>
                    No cover available.
                  </div>
                )}
                {formData.coverPreview && formData.igdbCoverUrl && (
                  <button type="button" onClick={() => 
                    setFormData(prev => ({
                      ...prev,
                      coverFile: null,
                      coverPreview: null
                    }))
                  }
                  style={{marginTop:"10px", marginBottom:"10px"}}
                >
                  Revert to IGDB Cover
                </button>
                )}
              </label>
              <label>
                Add Replay Time:
                <div style={{ display: "inline-flex", alignItems: "center" }}>
                  <input
                    type="text"
                    name="replayHours"
                    value={formData.replayHours || ""}
                    onChange={handleInputChange}
                    maxLength={5}
                    placeholder="00000"
                    style={{
                      width: "60px",
                      textAlign: "right",
                      opacity: formData.status === "Finished" ? 1 : 0.5,
                      pointerEvents: formData.status === "Finished" ? "auto" : "none"
                    }}
                    disabled={formData.status !== "Finished"}
                  />
                  <span style={{ margin: "0 5px" }}>:</span>
                  <input
                    type="text"
                    name="replayMinutes"
                    value={formData.replayMinutes || ""}
                    onChange={handleInputChange}
                    maxLength={2}
                    placeholder="00"
                    style={{
                      width: "30px",
                      textAlign: "left",
                      opacity: formData.status === "Finished" ? 1 : 0.5,
                      pointerEvents: formData.status === "Finished" ? "auto" : "none"
                    }}
                    disabled={formData.status !== "Finished"}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddReplayTime}
                  disabled={formData.status !== "Finished"}
                  style={{
                    marginLeft: "10px",
                    opacity: formData.status === "Finished" ? 1 : 0.5,
                    pointerEvents: formData.status === "Finished" ? "auto" : "none"
                  }}
                >
                  Save Replay Time
                </button>
              </label>
              {formData.status === "Finished" && formData.replayTimes.length > 0 && (
                <div style={{marginTop: "10px", marginBottom: "10px"}}>
                  <strong>Saved Replay Times:</strong>
                  <ul style={{marginTop: "5px"}}>
                    {formData.replayTimes.map((rt) => (
                      <li key={rt.id} style={{marginBottom: "4px"}}>
                        {rt.hours.padStart(1, '0')}:{rt.minutes.padStart(2, '0')}
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((f) => ({
                              ...f,
                              replayTimes: f.replayTimes.filter((t) => t.id !== rt.id),
                            }))
                          }
                          style={{marginLeft: "10px", color: "red"}}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label>
                To-Do List:
                <div className="todo-list-container" style={{width:"100%", maxHeight:3*32, overflowY:"auto", border:"1px solid #ccc", padding:"8px", marginBottom:"8px"}}>
                  {formData.todoList.map((todo,i) => (
                    <div key={todo.id} style={{display:"flex", alignItems:"center", marginTop:"4px"}}>
                      <input type="checkbox" checked={todo.completed} onChange={() => updateTodo(i, {completed: !todo.completed})}/>
                      <input type="text" checked={todo.text} onChange={e => updateTodo(i, {text: e.target.value})} placeholder="Task description" style={{flex:1, margin:"0 8px"}}/>
                      <button type="button" disabled={i===0} onClick={() => moveTodo(i,i-i)}>Shift Item Up</button>
                      <button type="button" disabled={i===formData.todoList.length-1} onClick={() => moveTodo(i,i+i)}>Shift Item Down</button>
                      <button type="button" onClick={() => removeTodo(i)} style={{marginLeft:"4px", color:"red"}}>Delete Item</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addTodo}>Add Item</button>
              </label>
              <label>
                Review:<br/>
                <textarea name="review" value={formData.review} onChange={handleInputChange} rows="6" style={{width:"50%", fontFamily:"inherit", fontSize:"1em", opacity:isFieldEnabled("review") ? 1:0.5}} disabled={!isFieldEnabled("review")}></textarea><br/>
              </label>
              <label>
                Notes:<br/>
                <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows="6" style={{width:"50%", fontFamily:"inherit", fontSize:"1em"}}></textarea><br/>
              </label>
            </div>
          </div>
          <label>
            <button type="submit" disabled={!isFormValid}>Save</button>
            <button type="button" onClick={handleCancel} style={{marginLeft: "10px"}}>Cancel</button>
          </label>
        </form>
      </ReactModal>
    </Router>
  );
}
//home page display
const MainPage = ({games, gameData, loading, error, handleNewGame, handleEdit, searchQuery, setSearchQuery, handleSearch, hasMoreResults, setSubmittedQuery}) => (
  <div>
    <button onClick={handleNewGame}>Add Entry From Scratch</button>
    <input type="text" placeholder="Search for a game title" style={{marginLeft:'50px'}} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => {if (e.key === "Enter") {setSubmittedQuery(searchQuery); handleSearch(true)}}}/>
    <button onClick={() => {setSubmittedQuery(searchQuery); handleSearch(true);}}>Search</button>
    {loading && <p style={{textAlign:"center"}}>Loading Games...</p>}
    {error && <p style={{color: "red"}}>Error: {error}</p>}
    <div className="game-grid">
      {games.map((game) => {
        const isSaved = gameData.some(saved => saved.id === game.id);
        return (
          <div
            key={game.id} className={`game-entry ${isSaved ? 'saved': ''}`} 
          >
            <h3>{game.name}</h3>
            <img src={game.cover?.url ? `https:${game.cover?.url.replace('t_thumb', 't_cover_big')}` : "default-cover.png"} 
              alt={game.name} 
              style={{height:'375px', width:'100%', display:'block', marginBottom:'10px', borderRadius: '8px', boxShadow:'0 2px 8px rgba(0,0,0,0.2)'}}/>
            <button onClick={() => handleEdit(game)}>Add to Backlog</button>
          </div>
        );
      })}
    </div>
    {hasMoreResults && (
      <div style={{textAlign:"center", marginTop:"20px"}}>
        <button onClick={() => {console.log("Load More clicked"); handleSearch(false);}}>Load More</button>
      </div>
    )}
  </div>
);


export default App;
