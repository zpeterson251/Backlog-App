import React, {useState} from "react";
import {LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} from "recharts";
import "./Statistics.css";

//defines the possible game statuses
//groups each game by platform
const STATUSES = ["Backlog","Playing","Finished","Dropped"];

const groupByPlatform = (games) => {
    const grouped = {};
    games.forEach((game) => {
        const platform = game.platform || "Unknown";
        if (!grouped[platform]) grouped[platform] = [];
        grouped[platform].push(game);
    });
    return grouped;
};

const groupByFranchise = (games) => {
    const grouped = {};
    games.forEach((game) => {
        const franchises = Array.isArray(game.franchise) ? game.franchise : (game.franchise ? [game.franchise] : ["No Franchise"]);
        franchises.forEach((f) => {
            const key = f || "No Franchise";
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(game);
        });
    });
    return grouped;
};

const groupBySeries = (games) => {
    const grouped = {};
    games.forEach((game) => {
        const seriesList = Array.isArray(game.series) ? game.series : (game.series ? [game.series] : ["No Series"]);
        seriesList.forEach((s) => {
            const key = s || "No Series";
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(game);
        });
    });
    // only keep series with more than one game (per requirement)
    Object.keys(grouped).forEach((k) => {
        if (grouped[k].length <= 1) delete grouped[k];
    });
    return grouped;
};

//computes the stats for each status
const computeStatusStats = (games) => {
    const filteredGames = games.filter(g => g.status !== "Wishlist");
    const counts = {};
    STATUSES.forEach((status) => (counts[status] = 0));

    games.forEach((game) => {
        if (STATUSES.includes(game.status)) counts[game.status]++;
    });
    
    const total = filteredGames.length;
    const stats = STATUSES.map((status) => ({
        status,
        count: counts[status],
        percent: total ? Math.round((counts[status] / total) * 100) : 0,
    }));
    stats.unshift({status:"Total", count:total, percent:null});

    return stats;
};

//computes the rating stats
const computeRatingStats = (games) => {
    const ratings = games.filter((g) => g.status === "Finished" && !isNaN(Number(g.rating))).map((g) => Number(g.rating));

    if (ratings.length === 0) return null;

    ratings.sort((a,b) => a - b);

    const total = ratings.length;
    const sum = ratings.reduce((a,b) => a + b, 0);
    const avg = Math.round(sum/total);
    const median = ratings[Math.floor(total/2)];

    return {
        highest:ratings[ratings.length-1],
        lowest:ratings[0],
        median,
        average:avg,
    };
};

//removes the : from the play time data so that it can be calculated in total minutes
const parsePlayTime = (str) => {
    if (!str || !str.includes(":")) return null;
    const [h,m] = str.split(":").map(n => parseInt(n,10));
    if (isNaN(h) || isNaN(m)) return null;
    return h*60+m;
};

//reformats the play time to be in hours:minutes
const formatPlayTime = (mins) => {
    const h = Math.floor(mins/60);
    const m = mins%60;
    return `${h}:${String(m).padStart(2, "0")}`;
};

//computes the play time stats
const computePlayTimeStats = (games) => {
    const durations = games.map(g => parsePlayTime(g.playTime)).filter(v => v !== null);

    if (durations.length === 0) return null;

    durations.sort((a,b) => a-b);

    const total = durations.reduce((a,b) => a+b,0);
    const avg = Math.floor(total/durations.length);

    return {
        total: formatPlayTime(total),
        shortest: formatPlayTime(durations[0]),
        longest: formatPlayTime(durations[durations.length-1]),
        average: formatPlayTime(avg),
    };
};
//computes stats on games finished per year
const computeFinishedPerYear = (games) => {
    const yearCounts = {};
    let minYear = Infinity, maxYear = -Infinity;

    games.forEach((game) => {
        if (game.finishedDate) {
            const year = new Date(game.finishedDate).getFullYear();

            if (!isNaN(year)) {
                yearCounts[year] = (yearCounts[year] || 0) + 1;
                minYear = Math.min(minYear, year);
                maxYear = Math.max(maxYear, year);
            }
        }
    });

    if (minYear === Infinity || maxYear === -Infinity) return [];
    const data = [];

    for (let y = minYear; y <= maxYear; y++) {
        data.push({year: y, count: yearCounts[y] || 0});
    }

    return data;
};
//gets the release year from the release date data using regular expressions
const getYear = (dateStr) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    return parseInt(dateStr.split('-')[0],10);
};
//computes the games released per year
const releasedPerYear = (games,dateField) => {
    const counts = {};

    games.forEach((game) => {
        const year = getYear(game[dateField]);
        if (!isNaN(year)) counts[year] = (counts[year] || 0) + 1;
    });

    const years = Object.keys(counts).map(Number);

    if (years.length === 0) return [];

    const min = Math.min(...years);
    const max = Math.max(...years);
    const data = [];

    for (let y = min; y <= max; y++) {
        data.push({year:y.toString(), count:counts[y] || 0});
    }

    return data;
};
//sets the max y axis to 2 above the maximum y value for clarity
const getMaxYAxis = (data) => {
    const max = Math.max(...data.map((d) => d.count));
    return max + 2;
};
//main function that runs the page
//gameData is imported from App.js
const Statistics = ({gameData}) => {
    const filteredGameData = gameData.filter(g => g.status !== "Wishlist");
    const [compactMode, setCompactMode] = useState(false);//handles compact mode
    const [selectedGroup, setSelectedGroup] = useState("");//handles the selected group for compact mode
    const [groupBy, setGroupBy] = useState("platform"); // "platform" | "series" | "franchise"

    // derive grouped data based on selected grouping
    const groupedData = (() => {
        if (groupBy === "series") return groupBySeries(filteredGameData);
        if (groupBy === "franchise") return groupByFranchise(filteredGameData);
        return groupByPlatform(filteredGameData);
    })();

    const groupNames = Object.keys(groupedData).sort().filter(k => groupedData[k].length > 0);

    const finishedPerYear = computeFinishedPerYear(filteredGameData);//games finished per year
    const maxCount = Math.max(...finishedPerYear.map(d => d.count), 0);//max y axis in the finished per year chart
    const releaseData = releasedPerYear(filteredGameData,'releaseDate');//holds the data for the release date field
    const releaseMaxY = releaseData.length > 0 ? getMaxYAxis(releaseData) : 2;//max y axis in the released per year chart

    const renderStatsTable = (label,games) => {
        const stats = computeStatusStats(games);//holds the status stats
        const ratingStats = computeRatingStats(games);//holds the rating stats
        const playTimeStats = computePlayTimeStats(games);//holds the play time stats

        //jsx for page
        return (
            <div key={label} className="stats-segment">
                <h3 style={{color:'#4aa8ff'}}>{label}</h3>
                <div className="table-group">
                    {/*status stats table*/}
                    <div className="stats-subsection">
                        <div className="subsection-label">Status</div>
                        <table className="stats-table">
                            <thead>
                                <tr>
                                    <th>Metric</th>
                                    <th>Count</th>
                                    <th>Percent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.map(({status,count,percent}) => (
                                    <tr key={status} className={status === "Total" ? "total-row" : ""}>
                                        <td>{status}</td>
                                        <td style={{textAlign:"center"}}>{count}</td>
                                        <td style={{textAlign:"center"}}>{percent === null ? "" : `${percent}%`}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/*play time stats table*/}
                    {playTimeStats && (
                        <div className="stats-subsection">
                            <div className="subsection-label">Play Time</div>
                            <table className="stats-table">
                                <thead>
                                    <tr>
                                        <th>Metric</th>
                                        <th>Time (h : m)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="total-row"><td>Total</td><td style={{textAlign:"center"}}>{playTimeStats.total}</td></tr>
                                    <tr><td>Longest</td><td style={{textAlign:"center"}}>{playTimeStats.longest}</td></tr>
                                    <tr><td>Shortest</td><td style={{textAlign:"center"}}>{playTimeStats.shortest}</td></tr>
                                    <tr><td>Average</td><td style={{textAlign:"center"}}>{playTimeStats.average}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                    {/*rating stats table*/}
                    {ratingStats && (
                        <div className="stats-subsection">
                            <div className="subsection-label">Ratings</div>
                            <table className="stats-table">
                                <thead>
                                    <tr>
                                        <th>Metric</th>
                                        <th>Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td>Highest</td><td style={{textAlign:"center"}}>{ratingStats.highest}</td></tr>
                                    <tr><td>Lowest</td><td style={{textAlign:"center"}}>{ratingStats.lowest}</td></tr>
                                    <tr><td>Median</td><td style={{textAlign:"center"}}>{ratingStats.median}</td></tr>
                                    <tr><td>Average</td><td style={{textAlign:"center"}}>{ratingStats.average}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div style={{padding:"20px"}}>
            <h2>Collection Statistics</h2>
            {/*games finished per year graph*/}
            {finishedPerYear.length > 0 && (
                <div style={{width:'100%',height:300,marginBottom:30}}>
                    <h3 style={{marginBottom:10,color:'#4aa8ff'}}>Games Finished Per Year</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={finishedPerYear} margin={{top:10,right:30,left:0,bottom:0}}>
                            <CartesianGrid strokeDasharray='3 3'/>
                            <XAxis dataKey='year' tick={{fill:'#fff'}}/>
                            <YAxis domain={[0,maxCount+2]} tick={{fill:'#fff'}}/>
                            <Tooltip/>
                            <Line type='monotone' dataKey='count' stroke='#4aa8ff' strokeWidth={2}/>
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
            {/*games released per year graph*/}
            {releaseData.length > 0 && (
                <div style={{width:'100%',height:300,marginBottom:30,marginTop:40}}>
                    <h3 style={{marginBottom:10,color:'#4aa8ff'}}>Games Released Per Year</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={releaseData} margin={{top:10,right:30,left:0,bottom:10}}>
                            <CartesianGrid strokeDasharray='3 3'/>
                            <XAxis dataKey='year' tick={{fill:'#fff'}}/>
                            <YAxis domain={[0,releaseMaxY]} tick={{fill:'#fff'}} allowDecimals={false}/>
                            <Tooltip/>
                            <Line type='monotone' dataKey='count' stroke='#4aa8ff' strokeWidth={2} dot={{r:3}} activeDot={{r:5}}/>
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* render "All" aggregate */}
            {renderStatsTable("All", filteredGameData)}
            <div style={{display:"flex", gap:16, alignItems:"center", marginBottom:12}}>
                <label style={{display:"flex", alignItems:"center", gap:8}}>
                    Group By:
                    <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value); setSelectedGroup(""); }}>
                        <option value="platform">Platform</option>
                        <option value="series">Series</option>
                        <option value="franchise">Franchise</option>
                    </select>
                </label>

                <label style={{display:"flex", alignItems:"center", gap:8}}>
                    <input type="checkbox" checked={compactMode} onChange={() => { setCompactMode(!compactMode); setSelectedGroup(""); }}/>
                    Compact Mode
                </label>
            </div>
            
            {/* grouped segments */}
            {!compactMode ? (
                groupNames.map((name) => renderStatsTable(name, groupedData[name]))
            ) : (
                <div className="compact-mode">
                    <label>
                        <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className='scrollable-select'>
                            <option value="">Select {groupBy === "platform" ? "Platform" : groupBy === "series" ? "Series" : "Franchise"}</option>
                            {groupNames.map((g) => (
                                <option key={g} value={g}>{g} ({groupedData[g].length})</option>
                            ))}
                        </select>
                    </label>
                    {selectedGroup && renderStatsTable(selectedGroup, groupedData[selectedGroup])}
                </div>
            )}
        </div>
    );
};

export default Statistics;