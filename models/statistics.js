const SQ3 = require('./sql')

const statistics = {
    'player-average': {
        title: 'Player averages',
        description: 'Player match averages, ranked by average pins per game.',
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'playerName', label: 'Player', link: 'player' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'games', label: 'Games' },
            { key: 'averageScore', label: 'Average' },
            { key: 'highestScore', label: 'Highest game' },
            { key: 'totalPins', label: 'Total pins' }
        ],
        minimumGames: true,
        query: `
            SELECT playerId, playerName, teamId, teamName, COUNT(*) AS games,
                ROUND(AVG(totalScore), 2) AS averageScore,
                MAX(totalScore) AS highestScore, SUM(totalScore) AS totalPins
            FROM player_games
            GROUP BY playerId, playerName, teamId, teamName
            HAVING COUNT(*) >= ?
            ORDER BY averageScore DESC, games DESC, playerName ASC`
    },
    'player-alley-average': {
        title: 'Player averages at an alley',
        description: 'Compare player averages and highest game scores at a selected alley.',
        requiresAlley: true,
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'playerName', label: 'Player', link: 'player' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'games', label: 'Games at alley' },
            { key: 'averageScore', label: 'Average' },
            { key: 'highestScore', label: 'Highest game' }
        ],
        minimumGames: true,
        query: `
            SELECT playerId, playerName, teamId, teamName, COUNT(*) AS games,
                ROUND(AVG(totalScore), 2) AS averageScore, MAX(totalScore) AS highestScore
            FROM player_games
            GROUP BY playerId, playerName, teamId, teamName
            HAVING COUNT(*) >= ?
            ORDER BY averageScore DESC, games DESC, playerName ASC`
    },
    'player-highest-games': {
        title: 'Highest player game scores',
        description: 'Highest individual match totals, including opponent and venue.',
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'playerName', label: 'Player', link: 'player' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'totalScore', label: 'Score' },
            { key: 'bolters', label: 'Bolters' },
            { key: 'opponentName', label: 'Opponent' },
            { key: 'alleyName', label: 'Alley' },
            { key: 'matchDate', label: 'Date', date: true }
        ],
        query: `
            SELECT playerId, playerName, teamId, teamName, totalScore, bolters,
                opponentName, alleyName, matchDate
            FROM player_games
            ORDER BY totalScore DESC, matchDate DESC, playerName ASC`
    },
    'team-average': {
        title: 'Team averages',
        description: 'Team match averages with their highest and total pins.',
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'games', label: 'Games' },
            { key: 'averageScore', label: 'Average' },
            { key: 'highestScore', label: 'Highest score' },
            { key: 'totalPins', label: 'Total pins' }
        ],
        minimumGames: true,
        query: `
            SELECT teamId, teamName, COUNT(*) AS games,
                ROUND(AVG(totalScore), 2) AS averageScore,
                MAX(totalScore) AS highestScore, SUM(totalScore) AS totalPins
            FROM team_games
            GROUP BY teamId, teamName
            HAVING COUNT(*) >= ?
            ORDER BY averageScore DESC, games DESC, teamName ASC`
    },
    'team-home-away-average': {
        title: 'Team home and away averages',
        description: 'See how each team performs at home compared with away.',
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'homeGames', label: 'Home games' },
            { key: 'homeAverage', label: 'Home average' },
            { key: 'awayGames', label: 'Away games' },
            { key: 'awayAverage', label: 'Away average' },
            { key: 'difference', label: 'Home − away' }
        ],
        query: `
            SELECT teamId, teamName,
                SUM(CASE WHEN isHome = 1 THEN 1 ELSE 0 END) AS homeGames,
                ROUND(AVG(CASE WHEN isHome = 1 THEN totalScore END), 2) AS homeAverage,
                SUM(CASE WHEN isHome = 0 THEN 1 ELSE 0 END) AS awayGames,
                ROUND(AVG(CASE WHEN isHome = 0 THEN totalScore END), 2) AS awayAverage,
                ROUND(AVG(CASE WHEN isHome = 1 THEN totalScore END) -
                    AVG(CASE WHEN isHome = 0 THEN totalScore END), 2) AS difference
            FROM team_games
            GROUP BY teamId, teamName
            HAVING homeGames > 0 OR awayGames > 0
            ORDER BY difference DESC, teamName ASC`
    },
    'team-highest-scores': {
        title: 'Highest team scores',
        description: 'The biggest team totals recorded in a single fixture.',
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'totalScore', label: 'Score' },
            { key: 'opponentName', label: 'Opponent' },
            { key: 'alleyName', label: 'Alley' },
            { key: 'matchDate', label: 'Date', date: true }
        ],
        query: `
            SELECT teamId, teamName, totalScore, opponentName, alleyName, matchDate
            FROM team_games
            ORDER BY totalScore DESC, matchDate DESC, teamName ASC`
    },
    'alley-highest-team-scores': {
        title: 'Alley highest team scores',
        description: 'Largest team totals at each venue.',
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'alleyName', label: 'Alley' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'totalScore', label: 'Score' },
            { key: 'opponentName', label: 'Opponent' },
            { key: 'matchDate', label: 'Date', date: true }
        ],
        query: `
            SELECT alleyName, teamId, teamName, totalScore, opponentName, matchDate
            FROM team_games
            WHERE alleyId IS NOT NULL
            ORDER BY totalScore DESC, matchDate DESC, teamName ASC`
    },
    'alley-highest-player-scores': {
        title: 'Alley highest player scores',
        description: 'Largest individual player match totals at each venue.',
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'alleyName', label: 'Alley' },
            { key: 'playerName', label: 'Player', link: 'player' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'totalScore', label: 'Score' },
            { key: 'opponentName', label: 'Opponent' },
            { key: 'matchDate', label: 'Date', date: true }
        ],
        query: `
            SELECT alleyName, playerId, playerName, teamId, teamName, totalScore,
                opponentName, matchDate
            FROM player_games
            WHERE alleyId IS NOT NULL
            ORDER BY totalScore DESC, matchDate DESC, playerName ASC`
    },
    'highest-individual-hands': {
        title: 'Highest individual hand scores',
        description: 'The top single-hand scores in the selected season or alley.',
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'score', label: 'Score' },
            { key: 'playerName', label: 'Player', link: 'player' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'opponentName', label: 'Opponent' },
            { key: 'alleyName', label: 'Alley' },
            { key: 'handNumber', label: 'Hand' },
            { key: 'matchDate', label: 'Date', date: true }
        ],
        query: `
            SELECT playerId, playerName, teamId, teamName, score, opponentName,
                alleyName, handNumber, matchDate
            FROM score_rows
            WHERE playerId IS NOT NULL
            ORDER BY score DESC, matchDate DESC, playerName ASC`
    },
    'player-bolters': {
        title: 'Player bolter leaderboard',
        description: 'Players ranked by total bolters and bolters per game.',
        columns: [
            { key: 'rank', label: 'Rank' },
            { key: 'playerName', label: 'Player', link: 'player' },
            { key: 'teamName', label: 'Team', link: 'team' },
            { key: 'games', label: 'Games' },
            { key: 'bolters', label: 'Bolters' },
            { key: 'bolterAverage', label: 'Bolters per game' }
        ],
        query: `
            SELECT playerId, playerName, teamId, teamName, COUNT(*) AS games,
                SUM(bolters) AS bolters, ROUND(AVG(bolters), 2) AS bolterAverage
            FROM player_games
            GROUP BY playerId, playerName, teamId, teamName
            ORDER BY bolters DESC, bolterAverage DESC, playerName ASC`
    }
}

const scoreDataCtes = `
    WITH score_rows AS (
        SELECT S.fixtureId, S.teamId, S.playerId, S.handNumber,
            COALESCE(S.score, 0) AS score, COALESCE(S.bolters, 0) AS bolters,
            COALESCE(S.isFlopper, 0) AS isFlopper, COALESCE(S.isSquare, 0) AS isSquare,
            COALESCE(S.isChance, 0) AS isChance,
            F.matchDate, F.homeTeam, F.awayTeam,
            COALESCE(SeasonLink.seasonStartYear, CompetitionLink.seasonStartYear) AS seasonStartYear,
            Home.homeAlley AS alleyId, COALESCE(Alley.name, 'Unassigned alley') AS alleyName,
            Team.teamName,
            Player.firstName, Player.secondName,
            COALESCE(NULLIF(Player.alias, ''), trim(Player.firstName || ' ' || Player.secondName)) AS playerName,
            CASE WHEN S.teamId = F.homeTeam THEN Away.teamName ELSE Home.teamName END AS opponentName
        FROM Scorecards S
        INNER JOIN Fixtures F ON F.id = S.fixtureId
        LEFT JOIN Seasons SeasonLink ON SeasonLink.id = F.seasonId
        LEFT JOIN Competitions CompetitionLink ON CompetitionLink.id = F.competition
        LEFT JOIN Teams Team ON Team.id = S.teamId
        LEFT JOIN Players Player ON Player.id = S.playerId
        LEFT JOIN Teams Home ON Home.id = F.homeTeam
        LEFT JOIN Teams Away ON Away.id = F.awayTeam
        LEFT JOIN Alleys Alley ON Alley.id = Home.homeAlley
        WHERE F.status IN ('Provisional', 'Confirmed', 'Completed')
            AND (? IS NULL OR COALESCE(SeasonLink.seasonStartYear, CompetitionLink.seasonStartYear) = ?)
            AND (? IS NULL OR Home.homeAlley = ?)
    ),
    player_games AS (
        SELECT fixtureId, teamId, playerId, MAX(playerName) AS playerName,
            MAX(teamName) AS teamName, MAX(matchDate) AS matchDate,
            MAX(alleyId) AS alleyId, MAX(alleyName) AS alleyName,
            MAX(opponentName) AS opponentName,
            SUM(score) AS totalScore, SUM(bolters) AS bolters,
            SUM(isFlopper) AS floppers, SUM(isSquare) AS squares, SUM(isChance) AS chances
        FROM score_rows
        WHERE playerId IS NOT NULL
        GROUP BY fixtureId, teamId, playerId
    ),
    team_games AS (
        SELECT fixtureId, teamId, MAX(teamName) AS teamName,
            MAX(matchDate) AS matchDate, MAX(alleyId) AS alleyId,
            MAX(alleyName) AS alleyName, MAX(opponentName) AS opponentName,
            SUM(score) AS totalScore, MAX(CASE WHEN teamId = homeTeam THEN 1 ELSE 0 END) AS isHome
        FROM score_rows
        GROUP BY fixtureId, teamId
    )
`

async function getSeasons() {
    return await SQ3.fetchAll(SQ3.db, `
        SELECT DISTINCT seasonStartYear AS year
        FROM (
            SELECT seasonStartYear FROM Seasons
            UNION ALL
            SELECT seasonStartYear FROM Competitions
        )
        WHERE seasonStartYear IS NOT NULL
        ORDER BY year DESC`)
}

async function getAlleys() {
    return await SQ3.fetchAll(SQ3.db, 'SELECT id, name FROM Alleys ORDER BY name ASC')
}

async function getStatisticResults(statisticId, filters) {
    const statistic = statistics[statisticId]
    if (!statistic) throw new Error('Unknown statistics category.')
    if (statistic.requiresAlley && !filters.alleyId) return []

    const minimumGames = statistic.minimumGames ? filters.minimumGames : null
    const results = await SQ3.fetchAll(SQ3.db,
        `${scoreDataCtes} ${statistic.query} LIMIT ?`,
        [
            filters.seasonYear,
            filters.seasonYear,
            filters.alleyId,
            filters.alleyId,
            ...(minimumGames ? [minimumGames] : []),
            filters.limit
        ])

    return results.map((row, index) => ({ ...row, rank: index + 1 }))
}

module.exports = {
    statistics,
    getSeasons,
    getAlleys,
    getStatisticResults
}
