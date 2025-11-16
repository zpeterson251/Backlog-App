const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

dotenv.config();

const app = express();
//IGDB api uses port 5000
const PORT = 5000;
//Cors allows the backend and frontend to talk
app.use(cors());
//Express will parse json requests
app.use(express.json())
app.use('/covers', express.static(path.join(__dirname, 'covers')));

//Path to the json file containing local entry information
const gameDataFile = path.join(__dirname, 'gameData.json')
//Creates an empty gameData.json if it does not exist
if (!fs.existsSync(gameDataFile)) {
    fs.writeFileSync(gameDataFile, JSON.stringify([]));
}

// Retroactive migration: ensure every saved entry has a priority field
try {
  const raw = fs.readFileSync(gameDataFile, 'utf8') || '[]';
  let games = [];
  try { games = JSON.parse(raw); } catch (e) { games = []; }
  let changed = false;
  games = games.map(g => {
    if (g && g.priority === undefined) {
      changed = true;
      return { ...g, priority: 'Normal' };
    }
    return g;
  });
  if (changed) {
    fs.writeFileSync(gameDataFile, JSON.stringify(games, null, 2), 'utf8');
    console.log('Migrated gameData.json — added default priority to existing entries');
  }
} catch (err) {
  console.error('Priority migration error:', err);
}

//Creates cover folder if it does not exist
const coversDir = path.join(__dirname, 'covers');
if (!fs.existsSync(coversDir)) {
    fs.mkdirSync(coversDir)
}
//Downloads a cover from igdb and saves it in the covers folder
const downloadImage = async (url, id) => {
    const fileName = `${id}.jpg`;
    const filePath = path.join(coversDir, fileName);
    const writer = fs.createWriteStream(filePath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    console.log(`Downloading image from ${url} to ${filePath}`);
    return new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', () => resolve(fileName));
        writer.on('error', reject);
    });
};
//Uses multer to store covers temporarily in memory then ensures it is a proper file type
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req,file,cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if ([".jpg",".jpeg",".png"].includes(ext)) {
            cb(null,true);
        } else {
            cb(new Error("Only accepts .jpg, .jpeg, and .png files"))
        }
    }
})

//Function to obtain an access token from IGDB api
async function getAccessToken() {
    try {
        const response = await axios.post(
            "https://id.twitch.tv/oauth2/token",
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: "client_credentials",
            })
        );
        return response.data.access_token;
    } catch (error) {
        console.error("Error getting access token", error);
        return null;
    }
    
}

//API endpoint that fetches info from api based on IGDB rating
app.get("/games", async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
            return res.status(500).json({error: "Failed to retrieve access token"});
        }
        const response = await axios.post(
            "https://api.igdb.com/v4/games",
            "fields name, cover.url, total_rating; sort total_rating desc; limit 30;",
            {
                headers: {
                    "Client-ID": process.env.CLIENT_ID,
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "text/plain"
                },
            }
        );
        res.json(response.data)
    } catch (err) {
        console.error("Error fetching popular games:", err);
        res.status(500).json({error: "Failed to fetch popular games"});
    }
});
//Searches game by title from IGDB api
app.get("/search", async (req,res) => {
    const query = req.query.q;
    const limit =  parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    console.log(`[Backend] Search received - query: "${query}", limit: ${limit}, offset: ${offset}`);
    if (!query) return res.status(400).json({error: "Missing search query"});

    const accessToken = await getAccessToken();
    if (!accessToken) {
        return res.status(500).json({error: "Failed to retrieve access token"});
    }
    try {
        const response = await axios.post(
            "https://api.igdb.com/v4/games",
            `search "${query}"; fields name, cover.url; limit ${limit}; offset ${offset};`,
            {
                headers: {
                    "Client-ID": process.env.CLIENT_ID,
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "text/plain"
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error searching games:", error);
        res.status(500).json({error: "Failed to search game entries"})
    }
});
//Mapping of regions based on IGDB id and name
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
//Hiearchy of region ids to prioritize when autofilling details
const REGION_HIEARCHY = [
    8,2,1,5,3,4,9,10,6,7,11
]
//Gets game detail information to autofill from IGDB api
app.get("/gameDetails/:id", async (req, res) => {
    const gameID = req.params.id;
    if (!/^\d+$/.test(gameID)) {
        return res.status(200).json({
            title: "",
            platform: "",
            region: "",
            releaseDate: "",
            publisher: [],
            developer: [],
            franchise: [],
            series: []
        });
    }

    const region = req.query.region;
    const platformParam = req.query.platform;
    
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
            return res.status(500).json({ error: "Failed to retrieve access token" });
        }
        const gameResponse = await axios.post(
            "https://api.igdb.com/v4/games",
            `fields name, franchise, franchises, collection, collections, platforms.name, platforms.id, first_release_date, release_dates.*, involved_companies; where id = ${gameID};`,
            {
                headers: {
                    "Client-ID": process.env.CLIENT_ID,
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "text/plain"
                }
            }
        );
  
    const game = gameResponse.data[0];
    const regionNum = Number(region);
    const safeRegion = isNaN(regionNum) ? 8 : regionNum;
    const releaseDates = Array.isArray(game.release_dates) ? game.release_dates : [];
  
    let selectedRelease = null;
  
    if (platformParam && safeRegion) {
        const matches = releaseDates.filter(
            rd => String(rd.platform) === platformParam && rd.region === safeRegion && rd.date
        );
        if (matches.length > 0) {selectedRelease = matches.sort((a, b) => a.date - b.date)[0];}
    }
  
    if (!selectedRelease && platformParam) {
        const matches = releaseDates.filter(
            rd => String(rd.platform) === platformParam && rd.date
        );
        if (matches.length > 0) {
            selectedRelease = matches.sort((a,b) => a.date - b.date)[0];
        }
    }
  
    if (!selectedRelease && safeRegion) {
        const matches = releaseDates.filter(rd => rd.region === safeRegion && rd.date);
        if (matches.length > 0) {selectedRelease = matches.sort((a, b) => a.date - b.date)[0];}
    }
  
    if (!selectedRelease) {
        for (let r of REGION_HIEARCHY) {
            const candidates = releaseDates.filter(rd => rd.region === r && rd.date);
            const filtered = platformParam
                ? candidates.filter(rd => String(rd.platform) === platformParam)
                : candidates;
            if (filtered.length > 0) {
                selectedRelease = filtered.sort((a, b) => a.date - b.date)[0];
                break;
            }
        }
    }
  
    let releaseDate = "";
    if (selectedRelease?.date) {
        const date = new Date(selectedRelease.date * 1000);
        if (!isNaN(date)) {
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            releaseDate = `${year}-${month}-${day}`;
        } else {
            releaseDate = "";
        }
    } else if (game.first_release_date) {
        const fallbackDate = new Date(game.first_release_date * 1000);
        if (!isNaN(fallbackDate)) {
            const year = fallbackDate.getUTCFullYear();
            const month = String(fallbackDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(fallbackDate.getUTCDate()).padStart(2, '0');
            releaseDate = `${year}-${month}-${day}`;
        } else {
            releaseDate = "";
        }
    }
  
    const platformId = selectedRelease?.platform || null;
    const regionName = selectedRelease ? REGION_MAP[selectedRelease.region] || "Unknown" : "Worldwide";
  
    console.log("Game response:", game);
    console.log("Selected release:", selectedRelease);
  
    let platformName = null;
    if (Array.isArray(game.platforms)) {
        const matchedPlatform = game.platforms.find(p => String(p.id) === String(platformId));
        platformName = matchedPlatform?.name || null;
    }
    if (!platformName && platformId) {
        platformName = `Platform #${platformId}`;
    }
  
    const title = game.name || "";
    const involvedCompanyIds = game.involved_companies;
    const developers = [];
    const publishers = [];
  
    if (involvedCompanyIds && involvedCompanyIds.length > 0) {
        const companyResponse = await axios.post(
            "https://api.igdb.com/v4/involved_companies",
            `fields company.name, developer, publisher; where id = (${involvedCompanyIds.join(",")});`,
            {
                headers: {
                "Client-ID": process.env.CLIENT_ID,
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "text/plain"
                }
            }
        );
  
        companyResponse.data.forEach(ic => {
            const name = ic.company?.name;
            if (!name) return;
            if (ic.developer) developers.push(name);
            if (ic.publisher) publishers.push(name);
        });
    }
    
    const franchiseIds = new Set();
    if (game.franchise) franchiseIds.add(game.franchise);
    if (Array.isArray(game.franchises)) {
        game.franchises.forEach(id => franchiseIds.add(id));
    }
    let franchiseNames = [];
    if (franchiseIds.size > 0) {
        try {
            const franchiseQuery = await axios.post(
                "https://api.igdb.com/v4/franchises",
                `fields name; where id = (${[...franchiseIds].join(",")});`,
                {
                    headers: {
                        "Client-ID": process.env.CLIENT_ID,
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "text/plain"
                    }
                }
            );
            franchiseNames = franchiseQuery.data.map(f => f.name).filter(Boolean);
        } catch (err) {
            console.error("Failed to fetch franchise names:", err);
        }
    }

    const seriesIds = new Set();
    if (game.collection) seriesIds.add(game.collection);
    if (Array.isArray(game.collections)) {
        game.collections.forEach(id => seriesIds.add(id));
    }
    let seriesNames = [];
    if (seriesIds.size > 0) {
        try {
            const seriesQuery = await axios.post(
                "https://api.igdb.com/v4/collections",
                `fields name; where id = (${[...seriesIds].join(",")});`,
                {
                    headers: {
                        "Client-ID": process.env.CLIENT_ID,
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "text/plain"
                    }
                }
            );
            seriesNames = seriesQuery.data.map(s => s.name).filter(Boolean);
        } catch (err) {
            console.error("Failed to fetch series names:", err);
        }
    }

    //json of game details provided by IGDB api
    res.json({
        title,
        platform: platformName,
        region: regionName,
        releaseDate,
        publisher: [...new Set(publishers)],
        developer: [...new Set(developers)],
        franchise: franchiseNames,
        series: seriesNames
    });
  
    } catch (error) {
        console.error("Error fetching game details:", error);
        res.status(500).json({ error: "Failed to fetch game details" });
    }
});
//Uploads a custom cover image
app.post('/uploadCover', upload.single('cover'), (req, res) => {
    const gameID = req.body.id;

    if (!req.file || !gameID) {
        return res.status(400).send("Missing file or id");
    }

    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const filePath = path.join(coversDir, `${gameID}.jpg`);

    fs.writeFile(filePath, req.file.buffer, (err) => {
        if (err) {
            console.error("Error saving cover:", err);
            return res.status(500).send("Failed to save file");
        }
        console.log("Custom cover saved:", req.file.filename);
        res.send("Cover uploaded");
    });
});
//Reads gameData.json for saved game entries
app.get("/savedGames", (req, res) => {
    fs.readFile(gameDataFile, "utf8", (err,data) => {
        if (err) {
            return res.status(500).json({error: "Failed to read game entry"});
        }
        res.json(JSON.parse(data));
    });
});
//Saves new game entries to gameData.json
app.post("/savedGames", (req, res) => {
    const newGameData = req.body;
    if (newGameData.priority === undefined) newGameData.priority = "Normal";
    fs.readFile(gameDataFile, "utf8", async (err, data) => {
        if (err) {
            return res.status(500).json({error: "Failed to read game entry"});
        }
        let currentData = JSON.parse(data);
        let existingIDs = new Set(currentData.map (g => g.id));
        let finalID = newGameData.id;
        let counter = 1;
        while (existingIDs.has(finalID)) {
            finalID = `${newGameData.id}-${counter}`;
            counter++
        }
        if (existingIDs.has(newGameData.id)) {
            newGameData.id = finalID;
        }
        currentData.push(newGameData);
        const {id, coverUrl} = newGameData;
        const isLocalCover = coverUrl?.startsWith("http://localhost:5000/covers/");
        if (coverUrl && id && !isLocalCover) {
            const filePath = path.join(coversDir, `${id}.jpg`);
            if (!fs.existsSync(filePath)) {
                try {
                    await downloadImage(coverUrl, id);
                    console.log("Cover downloaded and saved:", id);
                } catch (err) {
                    console.error("Failed to download cover:", err);
                }
            } else {
                console.log("Cover already exists locally:", id);
            }
        }
        fs.writeFile(gameDataFile, JSON.stringify(currentData, null, 2), (err) => {
            if (err) {
                return res.status(500).json({error: "Failed to save game entry"});
            }
            res.status(200).json({message: "Game entry saved successfully"});
        });
    });
});
//Saves over existing entries when editing an existing entry
app.put("/savedGames", (req, res) => {
    const updatedGame = req.body;
    if (updatedGame.priority === undefined) updatedGame.priority = "Normal";
    fs.readFile(gameDataFile, "utf8", async (err, data) => {
        if (err) {
            return res.status(500).json({error: "Failed to read game entry"});
        }
        let currentData = JSON.parse(data);
        const gameIndex = currentData.findIndex(
            (game) => game.id === updatedGame.id
        );
        if (gameIndex === -1) {
            return res.status(404).json({error: "Game not found"});
        }
        const {id, coverUrl} = updatedGame;
        const isLocalCover = coverUrl?.startsWith("http://localhost:5000/covers/");
        if (coverUrl && id && !isLocalCover) {
            const filePath = path.join(coversDir, `${id}.jpg`);
            if (!fs.existsSync(filePath)) {
                try {
                    await downloadImage(coverUrl, id);
                    console.log("Cover downloaded and saved:", id);
                } catch (err) {
                    console.error("Failed to download cover:", err);
                }
            } else {
                console.log("Cover already exists locally:", id);
            }
        }
        currentData[gameIndex] = updatedGame;
        fs.writeFile(gameDataFile, JSON.stringify(currentData, null, 2), (err) => {
            if (err) {
                return res.status(500).json({error: "Failed to save updated game entry"});
            }
            res.status(200).json(updatedGame);
        });
    });
});
//Deletes a saved entry and its cover image
app.delete("/savedGames/:id", (req, res) => {
    const gameID = req.params.id;
    fs.readFile(gameDataFile, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({error: "Failed to read game entry"});
        }
        let currentData = JSON.parse(data);
        currentData = currentData.filter((game) => String(game.id) !== String(gameID));
        fs.writeFile(gameDataFile, JSON.stringify(currentData, null, 2), (err) => {
            if (err) {
                return res.status(500).json({error: "Failed to delete game entry"});
            }
            const deletedGame = JSON.parse(data).find((g) => String(g.id) === String(gameID));
            if (deletedGame?.id) {
                const filePath = path.join(coversDir, `${deletedGame.id}.jpg`);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
            res.status(200).json({message: "Game entry deleted successfully"});
        });
    });
});
//Defines the path for the sort config and defines the default config
const configPath = path.join(__dirname,'sortConfig.json')
const defaultConfig = {
    sortOption: "none",
    groupByPlatform: "none"
}
//Reads the sort configuration
app.get('/sortConfig',(req,res) => {
    if (!fs.existsSync(configPath)) {
        return res.json(defaultConfig);
    }
    fs.readFile(configPath, 'utf-8', (err,data) => {
        if (err) return res.status(500).json({error: 'Failed to read config'});
        try {
            const config = JSON.parse(data);
            res.json({
                sortOption: config.sortOption || 'none',
                groupBy: config.groupBy || 'none'
            });
        } catch (e) {
            res.json(defaultConfig);
        }
    });
});
//Saves a sort configuration
app.post('/sortConfig', (req,res) => {
    const {sortOption, groupBy} = req.body;
    const newConfig = {sortOption, groupBy};
    fs.writeFile(configPath, JSON.stringify(newConfig, null, 2), err => {
        if (err) return res.status(500).json({error: 'Failed to save config'});
        res.status(200).json({message:'Config saved'});
    });
});
//Express server starts
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});