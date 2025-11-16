const BANNED_RATING_IDS = new Set([12, 17, 22, 26, 33, 38, 39]);
const BANNED_WORDS = [
    "hentai",
    "porn",
    "sex",
    "sexy",
    "nude",
    "nudity",
    "erotic",
    "rape",
    "incest",
    "fetish",
    "lewd",
    "xxx",
    "ecchi",
    "orgy"
]
function filterSafeGames(games, safeSearchEnabled = true) {
    if (!safeSearchEnabled) return games;
    return games.filter(game => {
        const hasBannedRating = Array.isArray(game.age_ratings) && game.age_ratings.some(rating => BANNED_RATING_IDS.has(rating));
        const title = game.name || game.title || "";
        const titleLower = title.toLowerCase();
        const hasBannedWord = BANNED_WORDS.some(word => titleLower.includes(word));
        return !hasBannedRating && !hasBannedWord;
    });
}
module.exports = {
    filterSafeGames,
    BANNED_RATING_IDS,
    BANNED_WORDS
};